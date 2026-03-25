import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { decisionReview, handReview } from '$lib/server/db/schema';
import {
	analyzePlayerSessionProfile,
	analyzeSpot,
	buildHandTimeline,
	type PlayerSessionProfile
} from '$lib/poker/analysis';
import type { HandAction, HandState } from '$lib/poker/types';

const potOdds = (toCall: number, pot: number) => toCall / (pot + toCall);

function scoreDecision(
	action: HandAction,
	before: HandState,
	profile: PlayerSessionProfile
): {
	score: number;
	severity: 'info' | 'warning' | 'critical';
	rationale: string;
	recommended: string;
	evidence: { title: string; detail: string }[];
} {
	const spot = analyzeSpot(before, 'player');
	const aggressive = action.type === 'bet' || action.type === 'raise' || action.type === 'all-in';
	const continueStrength =
		spot.equity * 0.56 +
		spot.strength * 0.18 +
		spot.drawStrength * 0.12 +
		Math.max(0, spot.rangeAdvantage) * 0.14;
	const valueHand =
		spot.equity >= 0.64 || spot.overpair || spot.topPair || spot.nutAdvantage > 0.08;
	const pressureHand =
		spot.equity >= 0.56 || spot.drawStrength >= 0.18 || spot.rangeAdvantage > 0.04;
	const bluffWindow =
		spot.bluffable &&
		(spot.boardTexture !== 'wet' || spot.inPosition || spot.blockers.blockerScore > 0.08);
	let score = 72;
	let severity: 'info' | 'warning' | 'critical' = 'info';
	let rationale = 'The action fits the incentives of the spot.';
	let recommended: string = action.type;

	if (before.street === 'preflop') {
		if (spot.inPosition) {
			if ((spot.rangeEquity >= 0.53 || spot.blockers.blockerScore > 0.1) && !aggressive) {
				score -= 18;
				severity = 'warning';
				rationale = 'Heads-up button play should attack when your hand performs well versus the defending range or carries strong blocker removal.';
				recommended = 'raise';
			} else if (spot.rangeEquity < 0.45 && spot.blockers.blockerScore < 0.02 && aggressive) {
				score -= 12;
				severity = 'warning';
				rationale = 'This open leans too loose: the hand underperforms against the defending range and lacks enough blocker leverage.';
				recommended = 'fold';
			}
		} else if (spot.toCall > 0) {
			if (action.type === 'fold' && (spot.equity > spot.potOdds + 0.06 || spot.rangeEquity > 0.5)) {
				score -= 20;
				severity = 'critical';
				rationale = 'This hand retains enough direct equity against the opening range to continue. Folding here overconcedes the blind battle.';
				recommended = 'call';
			} else if (aggressive && spot.rangeEquity < 0.47 && spot.blockers.blockerScore < 0.08) {
				score -= 10;
				severity = 'warning';
				rationale = 'This 3-bet candidate lacks either enough performance versus the opening range or enough blocker pressure to justify aggression.';
				recommended = 'call';
			}
		}
	} else if (spot.toCall > 0) {
		if (action.type === 'fold') {
			if (continueStrength >= spot.potOdds + 0.08) {
				score -= 24;
				severity = 'critical';
				rationale = `You folded despite having enough equity and pot odds to continue. The spot required defending more often.`;
				recommended = pressureHand ? 'call' : 'raise';
			} else {
				score += 10;
				rationale = 'The fold respects the price you were being laid and avoids continuing against a range that still contains too much value.';
				recommended = 'fold';
			}
		} else if (action.type === 'call') {
			if (valueHand) {
				score -= 11;
				severity = 'warning';
				rationale = 'Calling is too passive with a hand that holds enough equity and nut share to push value or deny realization.';
				recommended = 'raise';
			} else if (continueStrength < spot.potOdds - 0.04) {
				score -= 18;
				severity = 'warning';
				rationale = 'The call is too loose relative to your direct price, your range position, and the opponent value share.';
				recommended = 'fold';
			} else {
				score += 4;
				rationale = 'The call keeps bluffs in while meeting the price of continuing and preserving the weaker parts of villain range.';
				recommended = 'call';
			}
		} else if (aggressive) {
			if (valueHand || (bluffWindow && (profile.overfolds || spot.blockers.blockerScore > 0.08))) {
				score += 10;
				rationale = valueHand
					? 'Applying pressure with a strong range advantage hand builds the pot and denies equity.'
					: 'The raise leverages blocker removal and fold equity well against a range that still contains bluffs.';
				recommended = action.type;
			} else {
				score -= 10;
				severity = 'warning';
				rationale = 'This aggressive response lacks enough range edge, blocker support, or opponent overfold incentive.';
				recommended = continueStrength >= spot.potOdds ? 'call' : 'fold';
			}
		}
	} else {
		if (action.type === 'check') {
			if (valueHand) {
				score -= 14;
				severity = 'warning';
				rationale = 'Checking misses a clear value/protection spot when your hand carries enough equity and nut share against a wide heads-up range.';
				recommended = 'bet';
			} else if (before.street === 'river' && profile.underbluffsRiver && bluffWindow) {
				score -= 16;
				severity = 'warning';
				rationale = 'You are passing too many river bluff opportunities. This check continues an underbluffing pattern despite acceptable blocker properties.';
				recommended = 'bet';
			}
		} else if (aggressive) {
			if (valueHand || bluffWindow) {
				score += 9;
				rationale = valueHand
					? 'Betting is preferred here because strong hands should punish wide ranges and charge draws.'
					: 'The bet is a credible pressure line backed by blocker coverage and prevents the opponent from realizing equity for free.';
				recommended = action.type;
			} else {
				score -= 10;
				severity = 'warning';
				rationale = 'This stab fires too often without enough showdown weakness, blocker support, or board leverage.';
				recommended = 'check';
			}
		}
	}

	if (before.street === 'river' && aggressive && !valueHand && !bluffWindow) {
		score -= 10;
		severity = severity === 'critical' ? 'critical' : 'warning';
		rationale = 'River aggression should be more selective. This line risks overbluffing a poor candidate.';
		recommended = 'check';
	}

	if (before.street === 'river' && action.type === 'check' && bluffWindow && profile.underbluffsRiver) {
		score -= 8;
		severity = severity === 'critical' ? 'critical' : 'warning';
		rationale = 'You are likely underbluffing river spots that should contain some pressure hands.';
		recommended = 'bet';
	}

	const evidence = [
		{ title: 'Pot odds', detail: spot.toCall > 0 ? `${Math.round(spot.potOdds * 100)}% equity required to continue.` : 'No call required.' },
		{ title: 'Position', detail: spot.inPosition ? 'You are in position and can apply pressure more profitably.' : 'You are out of position, so passivity is punished faster.' },
		{ title: 'Equity', detail: `Hand equity ${Math.round(spot.equity * 100)}%, range equity ${Math.round(spot.rangeEquity * 100)}%, range edge ${Math.round(spot.rangeAdvantage * 100)}.` },
		{ title: 'Composition', detail: `Opponent range is weighted to ${Math.round(spot.opponentValueShare * 100)}% value and ${Math.round(spot.opponentBluffShare * 100)}% bluffs.` },
		{ title: 'Blockers', detail: `Blocker score ${Math.round(spot.blockers.blockerScore * 100)} with ${spot.blockers.valueBlocked.toFixed(1)} value combos and ${spot.blockers.bluffBlocked.toFixed(1)} bluff combos removed.` },
		{ title: 'Hand strength', detail: `${spot.madeCategory} with spot strength ${Math.round(spot.strength * 100)} and draw strength ${Math.round(spot.drawStrength * 100)}.` },
		{ title: 'Session pattern', detail: profile.passive ? 'Your session is trending passive, so missed aggression matters more.' : profile.overfolds ? 'Your session is trending toward overfolding under pressure.' : profile.underbluffsRiver ? 'Your session is trending toward river underbluffing.' : 'No major exploit trend was detected from prior hands.' }
	];

	return {
		score: Math.round(Math.max(35, Math.min(96, score))),
		severity,
		rationale,
		recommended,
		evidence
	};
}

export const saveHandReview = async (sessionId: string, state: HandState, priorStates: HandState[] = []) => {
	const timeline = buildHandTimeline(state).filter((entry) => entry.action.actor === 'player');
	if (!timeline.length) return;
	const profile = analyzePlayerSessionProfile([...priorStates, state]);
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

	const summary = `${outcomeLabel} Your line showed ${avgScore >= 78 ? 'strong' : avgScore >= 62 ? 'mixed' : 'weak'} decision quality across ${timeline.length} decision${timeline.length !== 1 ? 's' : ''}. Preflop aggression was ${Math.round(profile.preflopOpenRate * 100)}%, flop aggression ${Math.round(profile.flopAggressionRate * 100)}%, and river bluff pressure ${Math.round(profile.riverBluffRate * 100)}%.`;

	const reviewId = randomUUID();
	await db.insert(handReview).values({
		id: reviewId,
		sessionId,
		handNumber: state.handNumber,
		grade: avgScore,
		summary,
		strengthsJson: JSON.stringify(strengths.length ? [...strengths, ...sessionFindings.filter((item) => !item.includes('low') && !item.includes('underbluffing') && !item.includes('not opening enough') && !item.includes('very wide'))] : ['You created some useful pressure points in the hand.']),
		mistakesJson: JSON.stringify(mistakes.length ? [...mistakes, ...sessionFindings.filter((item) => item.includes('low') || item.includes('underbluffing') || item.includes('not opening enough') || item.includes('very wide'))] : ['No major strategic leak stood out in this hand.']),
		recommendedLineJson: JSON.stringify(
			decisions.map((d) => `${d.action.street}: ${d.action.type} → consider ${d.recommended}`)
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

function buildThoughtProcess(state: HandState, grade: number, profile: PlayerSessionProfile): string {
	const inPosition = state.dealer === 'player';
	const posLabel = inPosition ? 'in position' : 'out of position';

	if (grade >= 80) {
		return `You approached this hand well. Playing ${posLabel}, you combined pot control with timely aggression and avoided the passive patterns that weaken heads-up ranges. Keep tracking whether your river pressure stays high enough to prevent obvious folds.`;
	}
	if (grade >= 65) {
		return `Playing ${posLabel}, your line had some solid ideas but missed pressure in key places. Start each street by asking whether your hand wants value, protection, or a bluff candidate. Your current session aggression profile is ${Math.round(profile.aggressionRate * 100)}%, which suggests there is still EV in leaning forward more often.`;
	}
	return `Playing ${posLabel}, several decisions gave away too much initiative. In heads-up poker, overfolding and underbluffing compound quickly. Use pot odds when defending, and when checked to, identify which hands can bet for value and which can credibly bluff instead of defaulting to passivity.`;
}
