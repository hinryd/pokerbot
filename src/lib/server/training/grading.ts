import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { decisionReview, handReview } from '$lib/server/db/schema';
import {
	analyzePlayerSessionProfile,
	analyzeSpot,
	buildHandTimeline,
	type PlayerSessionProfile
} from '$lib/poker/analysis';
import { buildActionOptions } from '$lib/poker/engine';
import type { ActionOption, ActionType, HandAction, HandState } from '$lib/poker/types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aggressiveActions = new Set<ActionType>(['bet', 'raise', 'all-in']);

type OptionVariant = 'base' | 'small' | 'medium' | 'big';
type OpponentRead = 'underbluffing' | 'overbluffing' | 'balanced';

interface OptionCandidate {
	type: ActionType;
	amount: number;
	label: string;
	variant: OptionVariant;
}

interface EvaluatedOption extends OptionCandidate {
	utility: number;
	foldEquityNeed: number | null;
	foldEquityEstimate: number | null;
	intent: 'value' | 'bluff' | 'deny-equity' | 'realize' | 'pot-control';
	note: string;
}

function inferOpponentRead(spot: ReturnType<typeof analyzeSpot>): OpponentRead {
	const delta = spot.opponentValueShare - spot.opponentBluffShare;
	if (delta > 0.2) return 'underbluffing';
	if (delta < 0.02) return 'overbluffing';
	return 'balanced';
}

function showdownValueScore(spot: ReturnType<typeof analyzeSpot>) {
	return clamp(
		spot.strength * 0.86 +
			spot.equity * 0.62 +
			(spot.topPair || spot.overpair ? 0.16 : 0) -
			spot.drawStrength * 0.2,
		0,
		1
	);
}

function expandOptionCandidates(options: ActionOption[]): OptionCandidate[] {
	const candidates: OptionCandidate[] = [];
	const seen = new Set<string>();
	const pushCandidate = (candidate: OptionCandidate) => {
		const key = `${candidate.type}:${candidate.amount}`;
		if (seen.has(key)) return;
		seen.add(key);
		candidates.push(candidate);
	};

	for (const option of options) {
		if (option.type !== 'bet' && option.type !== 'raise') {
			pushCandidate({
				type: option.type,
				amount: option.amount ?? 0,
				label: option.label,
				variant: 'base'
			});
			continue;
		}

		const minAmount = option.minAmount ?? option.amount ?? 0;
		const maxAmount = option.maxAmount ?? option.amount ?? minAmount;
		if (maxAmount <= minAmount) {
			pushCandidate({
				type: option.type,
				amount: minAmount,
				label: `${option.type} ${minAmount}`,
				variant: 'base'
			});
			continue;
		}

		const mediumAmount = Math.round((minAmount + maxAmount) / 2);
		const sizePoints: Array<{ amount: number; variant: OptionVariant; label: string }> = [
			{ amount: minAmount, variant: 'small', label: `${option.type} small ${minAmount}` }
		];
		if (mediumAmount !== minAmount && mediumAmount !== maxAmount) {
			sizePoints.push({
				amount: mediumAmount,
				variant: 'medium',
				label: `${option.type} medium ${mediumAmount}`
			});
		}
		sizePoints.push({
			amount: maxAmount,
			variant: 'big',
			label: `${option.type} big ${maxAmount}`
		});

		for (const sizePoint of sizePoints) {
			pushCandidate({
				type: option.type,
				amount: sizePoint.amount,
				label: sizePoint.label,
				variant: sizePoint.variant
			});
		}
	}

	return candidates;
}

function evaluateCandidate(
	candidate: OptionCandidate,
	before: HandState,
	spot: ReturnType<typeof analyzeSpot>,
	opponentRead: OpponentRead
): EvaluatedOption {
	const effectiveStackBb =
		Math.min(
			before.playerStack + before.playerBetThisStreet,
			before.botStack + before.botBetThisStreet
		) / before.bigBlind;
	const continueStrength =
		spot.equity * 0.54 +
		spot.strength * 0.18 +
		spot.drawStrength * 0.14 +
		Math.max(0, spot.rangeAdvantage) * 0.08 +
		Math.max(0, spot.nutAdvantage) * 0.06;
	const valuePressure =
		spot.equity * 1.6 +
		spot.strength * 0.68 +
		Math.max(0, spot.nutAdvantage) * 1.28 +
		(spot.overpair || spot.topPair ? 0.2 : 0);
	const bluffWindow =
		spot.bluffable &&
		(spot.boardTexture !== 'wet' || spot.inPosition || spot.blockers.blockerScore > 0.08);
	const bluffPressure =
		(bluffWindow ? 0.82 : -0.36) +
		Math.max(0, spot.blockers.blockerScore) * 1.4 +
		Math.max(0, spot.rangeAdvantage) * 1.16 +
		spot.opponentBluffShare * 0.24 -
		spot.opponentValueShare * 0.5;
	const showdownValue = showdownValueScore(spot);
	const failedDrawBluffWindow =
		before.street === 'river' &&
		spot.boardTexture !== 'dry' &&
		spot.madeCategory === 'high-card' &&
		spot.blockers.blockerScore > 0.05;

	if (candidate.type === 'fold') {
		const utility =
			(spot.potOdds - continueStrength) * 2.8 +
			(opponentRead === 'underbluffing' ? 0.12 : opponentRead === 'overbluffing' ? -0.14 : 0);
		return {
			...candidate,
			utility,
			foldEquityNeed: null,
			foldEquityEstimate: null,
			intent: 'pot-control',
			note:
				utility > 0
					? 'Folding avoids negative-EV continuation versus a value-heavy region.'
					: 'Fold gives up too much when your hand still realizes enough equity.'
		};
	}

	if (candidate.type === 'check') {
		const utility =
			showdownValue * 1.2 -
			Math.max(0, valuePressure - 1.1) * 0.4 -
			(failedDrawBluffWindow ? 0.09 : 0);
		return {
			...candidate,
			utility,
			foldEquityNeed: null,
			foldEquityEstimate: null,
			intent: 'pot-control',
			note:
				utility > 0
					? 'Check preserves showdown value and controls pot growth.'
					: 'Check misses pressure where betting gains value/protection.'
		};
	}

	if (candidate.type === 'call') {
		const utility =
			continueStrength * 1.56 -
			spot.potOdds * 1.34 +
			showdownValue * 0.42 +
			(opponentRead === 'overbluffing' ? 0.08 : opponentRead === 'underbluffing' ? -0.08 : 0);
		return {
			...candidate,
			utility,
			foldEquityNeed: null,
			foldEquityEstimate: null,
			intent: 'realize',
			note:
				utility > 0
					? `Call realizes equity at a required threshold near ${Math.round(spot.potOdds * 100)}%.`
					: 'Call under-realizes equity versus the current price and range pressure.'
		};
	}

	const risk = Math.max(1, candidate.amount);
	const foldEquityNeed = risk / (before.pot + risk);
	const leverage = risk / (before.pot + risk);
	const foldEquityEstimate = clamp(
		0.28 +
			Math.max(0, spot.rangeAdvantage) * 0.35 +
			Math.max(0, spot.blockers.blockerScore) * 0.22 +
			(spot.boardTexture === 'dry' ? 0.06 : spot.boardTexture === 'wet' ? -0.04 : 0) +
			(opponentRead === 'underbluffing' ? 0.06 : opponentRead === 'overbluffing' ? -0.05 : 0) +
			leverage * 0.24,
		0.05,
		0.92
	);
	const valueIntent =
		showdownValue >= 0.58 || spot.topPair || spot.overpair || spot.nutAdvantage > 0.08;
	const bluffIntent = !valueIntent && (bluffWindow || failedDrawBluffWindow);
	let utility = valueIntent
		? valuePressure + showdownValue * 0.22
		: bluffPressure + (foldEquityEstimate - foldEquityNeed) * 1.5;
	let note = valueIntent
		? 'Aggression extracts value and denies realization.'
		: 'Aggression functions as a bluff candidate with fold-equity requirements.';
	let intent: EvaluatedOption['intent'] = valueIntent
		? 'value'
		: bluffIntent
			? 'bluff'
			: 'deny-equity';

	if (candidate.variant === 'small') {
		utility += valueIntent ? 0.08 : foldEquityEstimate > foldEquityNeed + 0.08 ? 0.06 : -0.04;
		note = valueIntent
			? 'Small sizing can already achieve thin value and keep dominated calls in.'
			: foldEquityEstimate > foldEquityNeed + 0.08
				? 'Small sizing already produces enough fold pressure; bigger is not mandatory.'
				: 'Small sizing likely fails to generate enough folds for a profitable bluff.';
	}

	if (candidate.variant === 'medium') {
		utility += 0.04;
		note = valueIntent
			? 'Medium sizing balances value extraction and deny-equity pressure.'
			: 'Medium sizing improves fold pressure while preserving better risk/reward than max size.';
	}

	if (candidate.variant === 'big') {
		const bigWorks = foldEquityEstimate >= foldEquityNeed || showdownValue >= 0.68;
		utility += bigWorks ? 0.08 : -0.08;
		note = bigWorks
			? 'Big sizing is justified by fold pressure or strong value leverage.'
			: 'Big sizing risks over-investing without enough fold equity or value edge.';
	}

	if (candidate.type === 'all-in') {
		if (before.street === 'preflop') {
			const premiumPreflop =
				spot.rangeEquity >= 0.63 || (spot.rangeEquity >= 0.58 && spot.blockers.blockerScore > 0.1);
			const shortStackJam =
				effectiveStackBb <= 14 && (spot.rangeEquity >= 0.52 || spot.blockers.blockerScore > 0.08);
			if (shortStackJam || (premiumPreflop && effectiveStackBb <= 22)) {
				utility += 0.12;
				note =
					effectiveStackBb <= 14
						? 'Preflop all-in is viable at this stack depth with enough equity/blocker support.'
						: 'Preflop all-in is acceptable here because stack depth is lower and hand quality is premium.';
			} else {
				const deepPenalty = clamp((effectiveStackBb - 14) * 0.11, 0.35, 7.5);
				const weakHandPenalty = spot.rangeEquity < 0.55 ? 0.55 : 0;
				utility -= deepPenalty + weakHandPenalty;
				note =
					'Preflop all-in is over-leveraged at this depth for this hand class; normal raise/call lines should dominate.';
			}
		} else {
			const jamGood =
				showdownValue >= 0.66 || (spot.spr < 1.8 && foldEquityEstimate >= foldEquityNeed);
			utility += jamGood ? 0.16 : -0.2;
			note = jamGood
				? 'All-in leverages stack depth correctly with enough value or fold pressure.'
				: 'All-in over-leverages this node; better EV likely exists with smaller sizing.';
		}
	}

	if (before.street === 'preflop' && candidate.type === 'raise') {
		utility += candidate.variant === 'small' || candidate.variant === 'medium' ? 0.12 : 0.04;
		note =
			candidate.variant === 'small' || candidate.variant === 'medium'
				? 'Preflop raise sizing is preferred over open-jamming in deeper-stack nodes.'
				: 'Larger preflop raise can work, but still usually outperforms unnecessary all-in leverage.';
	}

	return {
		...candidate,
		utility,
		foldEquityNeed,
		foldEquityEstimate,
		intent,
		note
	};
}

function scoreDecision(
	action: HandAction,
	before: HandState,
	profile: PlayerSessionProfile
): {
	score: number;
	severity: 'info' | 'warning' | 'critical';
	rationale: string;
	recommended: ActionType;
	recommendedLabel: string;
	evidence: { title: string; detail: string }[];
} {
	const spot = analyzeSpot(before, 'player');
	const opponentRead = inferOpponentRead(spot);
	const options = buildActionOptions(before, 'player');
	const candidates = expandOptionCandidates(options);
	const evaluated = candidates.map((candidate) =>
		evaluateCandidate(candidate, before, spot, opponentRead)
	);
	const ranked = [...evaluated].sort((a, b) => b.utility - a.utility);
	const best = ranked[0]!;
	const chosen =
		evaluated
			.filter((candidate) => candidate.type === action.type)
			.sort((a, b) => Math.abs(a.amount - action.amount) - Math.abs(b.amount - action.amount))[0] ??
		best;

	const utilityGap = best.utility - chosen.utility;
	const indifferenceBand = 0.08;
	const effectiveGap = Math.max(0, utilityGap - indifferenceBand);
	const score = Math.round(clamp(95 - effectiveGap * 96, 35, 97));
	const severity: 'info' | 'warning' | 'critical' =
		effectiveGap > 0.4 ? 'critical' : effectiveGap > 0.16 ? 'warning' : 'info';

	const showdownValue = showdownValueScore(spot);
	const showdownLabel =
		showdownValue >= 0.68
			? 'strong showdown value'
			: showdownValue >= 0.5
				? 'medium showdown value'
				: 'low showdown value';
	const boardDynamics =
		spot.boardTexture === 'wet'
			? 'highly dynamic board with many turn/river shifts'
			: spot.boardTexture === 'semi-wet'
				? 'semi-dynamic board where protection still matters'
				: 'dry board with fewer strong draw transitions';

	const aggressiveCandidates = ranked.filter((candidate) => aggressiveActions.has(candidate.type));
	const bestAggressive = aggressiveCandidates[0] ?? null;
	const smallestAggressive =
		aggressiveCandidates.length > 1
			? [...aggressiveCandidates].sort((a, b) => a.amount - b.amount)[0]!
			: (aggressiveCandidates[0] ?? null);

	const optionMatrix = ranked
		.map((candidate) => {
			const utilityPct = Math.round(clamp((candidate.utility + 0.2) / 2.4, 0, 1) * 100);
			const feDetail =
				candidate.foldEquityEstimate !== null && candidate.foldEquityNeed !== null
					? ` | FE est ${Math.round(candidate.foldEquityEstimate * 100)}% vs need ${Math.round(candidate.foldEquityNeed * 100)}%`
					: '';
			return `• ${candidate.label}: ${utilityPct}/100 (${candidate.intent})${feDetail}. ${candidate.note}`;
		})
		.join('\n');

	const rationale =
		severity === 'info'
			? utilityGap <= indifferenceBand
				? `Your line is in the same EV band as the top option. ${chosen.label} is strategically acceptable in this node.`
				: `Your line was close to the top-EV process option. ${chosen.label} tracked the hand dynamics well in this node.`
			: `The strongest process line was ${best.label}, while you chose ${chosen.label}. The gap came from how this node prices equity realization, fold pressure, and sizing intent.`;

	const evidence = [
		{
			title: 'Option matrix (all legal actions)',
			detail: optionMatrix
		},
		{
			title: 'Opponent bluff/value read',
			detail: `Range composition projects ${Math.round(spot.opponentValueShare * 100)}% value and ${Math.round(spot.opponentBluffShare * 100)}% bluffs, so this node reads ${opponentRead}.`
		},
		{
			title: 'Showdown value and hand role',
			detail: `${showdownLabel} with ${spot.madeCategory}; equity ${Math.round(spot.equity * 100)}%, range equity ${Math.round(spot.rangeEquity * 100)}%, draw strength ${Math.round(spot.drawStrength * 100)}%.`
		},
		{
			title: 'Call vs fold equity threshold',
			detail:
				spot.toCall > 0
					? `Continuing requires about ${Math.round(spot.potOdds * 100)}% equity. Compare this to your realization score and the opponent bluff/value read before auto-calling or overfolding.`
					: 'No call price this street, so the key question is value/protection/bluff objective before choosing check or bet.'
		},
		{
			title: 'Board dynamics and bluff conversion',
			detail: `This is a ${boardDynamics}. Blocker score ${Math.round(spot.blockers.blockerScore * 100)} and texture should decide whether failed draws can be credibly turned into bluffs.`
		},
		{
			title: 'Sizing objective',
			detail: bestAggressive
				? smallestAggressive && bestAggressive.amount !== smallestAggressive.amount
					? `Best pressure size was ${bestAggressive.label}. Smallest line (${smallestAggressive.label}) ${smallestAggressive.utility >= bestAggressive.utility - 0.08 ? 'already achieves most of the goal, so over-betting is optional' : 'does not fully achieve the fold/value objective, so more leverage is justified'}.`
					: `Primary sizing recommendation is ${bestAggressive.label}; size should match whether you target thin value, denial, or fold leverage.`
				: 'Aggressive sizing was not the highest-EV path in this node; realize or control lines scored better.'
		}
	];

	return {
		score,
		severity,
		rationale,
		recommended: best.type,
		recommendedLabel: best.label,
		evidence
	};
}

export const saveHandReview = async (
	sessionId: string,
	state: HandState,
	priorStates: HandState[] = []
) => {
	const timeline = buildHandTimeline(state).filter((entry) => entry.action.actor === 'player');
	if (!timeline.length) return;
	const profile = analyzePlayerSessionProfile(priorStates);
	const decisions = timeline.map((entry) => ({
		action: entry.action,
		index: entry.index,
		...scoreDecision(entry.action, entry.before, profile)
	}));

	const avgScore = Math.round(decisions.reduce((s, d) => s + d.score, 0) / decisions.length);
	const mistakes = decisions.filter((d) => d.severity !== 'info').map((d) => d.rationale);
	const strengths = decisions.filter((d) => d.severity === 'info').map((d) => d.rationale);
	const sessionFindings = [
		profile.preflopOpenRate > 0.7
			? 'Your preflop opening rate is very wide. Tighten the bottom of your button range.'
			: profile.preflopOpenRate < 0.4
				? 'You are not opening enough preflop in heads-up spots. The button should attack wider.'
				: 'Your preflop opening frequency is within a reasonable heads-up band.',
		profile.flopAggressionRate < 0.28
			? 'Your flop aggression is low. You are allowing too many free cards against a wide range.'
			: 'Your flop aggression is putting pressure on capped ranges.',
		profile.underbluffsRiver
			? 'You are underbluffing rivers across the session, which makes later-street folds too easy for the bot.'
			: 'Your river pressure is balanced enough to keep bluff-catchers uncomfortable.'
	];

	const outcomeLabel =
		state.outcome === 'player_wins'
			? 'You won this hand.'
			: state.outcome === 'bot_wins'
				? 'Bot won this hand.'
				: 'The hand was split.';

	const summary = `Decision process quality was ${avgScore >= 78 ? 'strong' : avgScore >= 62 ? 'mixed' : 'weak'} across ${timeline.length} decision${timeline.length !== 1 ? 's' : ''}. Preflop aggression ${Math.round(profile.preflopOpenRate * 100)}%, flop aggression ${Math.round(profile.flopAggressionRate * 100)}%, river bluff pressure ${Math.round(profile.riverBluffRate * 100)}%. ${outcomeLabel} This grade is process-first and not result-first.`;

	const reviewId = randomUUID();
	await db.insert(handReview).values({
		id: reviewId,
		sessionId,
		handNumber: state.handNumber,
		grade: avgScore,
		summary,
		strengthsJson: JSON.stringify(
			strengths.length
				? [
						...strengths,
						...sessionFindings.filter(
							(item) =>
								!item.includes('low') &&
								!item.includes('underbluffing') &&
								!item.includes('not opening enough') &&
								!item.includes('very wide')
						)
					]
				: ['You created some useful pressure points in the hand.']
		),
		mistakesJson: JSON.stringify(
			mistakes.length
				? [
						...mistakes,
						...sessionFindings.filter(
							(item) =>
								item.includes('low') ||
								item.includes('underbluffing') ||
								item.includes('not opening enough') ||
								item.includes('very wide')
						)
					]
				: ['No major strategic leak stood out in this hand.']
		),
		recommendedLineJson: JSON.stringify(
			decisions.map((d) => `${d.action.street}: ${d.action.type} → consider ${d.recommendedLabel}`)
		),
		thoughtProcess: buildThoughtProcess(state, avgScore, profile),
		status: 'ready'
	});

	await db.insert(decisionReview).values(
		decisions.map((d) => ({
			id: randomUUID(),
			handReviewId: reviewId,
			actionIndex: d.index,
			street: d.action.street,
			actor: 'player',
			chosenAction: d.action.type,
			recommendedAction: d.recommended,
			score: d.score,
			severity: d.severity,
			rationale: d.rationale,
			evidenceJson: JSON.stringify(d.evidence)
		}))
	);

	return reviewId;
};

function buildThoughtProcess(
	state: HandState,
	grade: number,
	profile: PlayerSessionProfile
): string {
	const inPosition = state.dealer === 'player';
	const posLabel = inPosition ? 'in position' : 'out of position';

	if (grade >= 80) {
		return `Strong process this hand. Playing ${posLabel}, you compared multiple legal options, matched sizing to your objective, and kept your line coherent with board and range dynamics. Keep using node-by-node option ranking instead of result-based shortcuts.`;
	}
	if (grade >= 65) {
		return `Process quality was mixed. Playing ${posLabel}, some decisions were reasonable, but better EV existed after comparing all legal options and sizing paths. On each street, explicitly decide whether the hand is value, realization, deny-equity, or bluff and choose size accordingly.`;
	}
	return `Process leaked too much EV this hand. Playing ${posLabel}, key nodes were resolved too quickly without full option comparison. In heads-up play, consistently evaluate fold/call/raise/check options, required equity, and sizing intent before acting—this matters more than whether the pot happened to be won.`;
}
