import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { decisionReview, handReview } from '$lib/server/db/schema';
import type { HandAction, HandState } from '$lib/poker/types';

const potOdds = (toCall: number, pot: number) => toCall / (pot + toCall);

function scoreDecision(action: HandAction, prevPot: number, prevBet: number, prevActorBet: number): {
	score: number;
	severity: 'info' | 'warning' | 'critical';
	rationale: string;
	recommended: string;
} {
	const { type, amount } = action;
	const toCall = prevBet - prevActorBet;
	const odds = toCall > 0 ? potOdds(toCall, prevPot) : 0;

	if (type === 'raise' || type === 'bet') {
		return {
			score: 85,
			severity: 'info',
			rationale: 'Aggressive action applies pressure and builds the pot with strong hands.',
			recommended: type
		};
	}

	if (type === 'all-in') {
		return {
			score: 78,
			severity: 'info',
			rationale: 'All-in commits fully. Correct when the hand has clear equity advantage.',
			recommended: 'all-in'
		};
	}

	if (type === 'call') {
		const passivityPenalty = toCall > 0 && amount > 0 ? 10 : 0;
		return {
			score: Math.max(55, 78 - passivityPenalty),
			severity: passivityPenalty > 0 ? 'warning' : 'info',
			rationale:
				passivityPenalty > 0
					? 'Calling is passive. Raising often extracts more value and protects equity.'
					: 'Calling keeps the pot manageable with marginal holdings.',
			recommended: 'raise'
		};
	}

	if (type === 'fold') {
		if (odds < 0.25) {
			return {
				score: 82,
				severity: 'info',
				rationale: 'Folding is correct here — pot odds do not justify continuing without strong equity.',
				recommended: 'fold'
			};
		}
		return {
			score: 52,
			severity: 'critical',
			rationale: `Folding at ${Math.round(odds * 100)}% pot odds surrenders chips. A call or re-raise retains more equity.`,
			recommended: 'call'
		};
	}

	if (type === 'check') {
		return {
			score: 68,
			severity: 'warning',
			rationale: 'Checking misses a chance to build the pot or deny equity. Consider betting with value hands.',
			recommended: 'bet'
		};
	}

	return { score: 70, severity: 'info', rationale: 'Reasonable action given the spot.', recommended: type };
}

export const saveHandReview = async (sessionId: string, state: HandState) => {
	const playerActions = state.handActions.filter((a) => a.actor === 'player');
	if (!playerActions.length) return;

	let runningPot = state.bigBlind * 1.5;
	let runningBet = state.bigBlind;
	let runningActorBet = state.smallBlind;

	const decisions = playerActions.map((action, i) => {
		const result = scoreDecision(action, runningPot, runningBet, runningActorBet);
		runningPot += action.amount;
		if (action.type === 'bet' || action.type === 'raise' || action.type === 'all-in') {
			runningBet = runningActorBet + action.amount;
		}
		runningActorBet += action.amount;
		return { action, index: i, ...result };
	});

	const avgScore = Math.round(decisions.reduce((s, d) => s + d.score, 0) / decisions.length);
	const mistakes = decisions.filter((d) => d.severity !== 'info').map((d) => d.rationale);
	const strengths = decisions.filter((d) => d.severity === 'info').map((d) => d.rationale);

	const outcomeLabel =
		state.outcome === 'player_wins'
			? 'You won this hand.'
			: state.outcome === 'bot_wins'
				? 'Bot won this hand.'
				: 'The hand was split.';

	const summary = `${outcomeLabel} Your line showed ${avgScore >= 75 ? 'strong' : avgScore >= 60 ? 'decent' : 'weak'} decision quality across ${playerActions.length} decision${playerActions.length !== 1 ? 's' : ''}.`;

	const reviewId = randomUUID();
	await db.insert(handReview).values({
		id: reviewId,
		sessionId,
		handNumber: state.handNumber,
		grade: avgScore,
		summary,
		strengthsJson: JSON.stringify(strengths.length ? strengths : ['You stayed in the hand and gained table information.']),
		mistakesJson: JSON.stringify(mistakes.length ? mistakes : ['No critical mistakes were identified.']),
		recommendedLineJson: JSON.stringify(
			decisions.map((d) => `${d.action.street}: ${d.action.type} → consider ${d.recommended}`)
		),
		thoughtProcess: buildThoughtProcess(state, avgScore),
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
			evidenceJson: JSON.stringify([
				{ title: 'Pot size', detail: `Pot was ${Math.round(runningPot)} at decision time.` },
				{
					title: 'Position',
					detail:
						state.dealer === 'player'
							? 'You are in position (button/SB). Prefer aggression to extract value.'
							: 'You are out of position (BB). Aggression denies free cards.'
				}
			])
		}))
	);

	return reviewId;
};

function buildThoughtProcess(state: HandState, grade: number): string {
	const inPosition = state.dealer === 'player';
	const posLabel = inPosition ? 'in position' : 'out of position';

	if (grade >= 80) {
		return `You approached this hand well. Playing ${posLabel}, the key is maintaining pressure while managing the stack-to-pot ratio. Your line told a consistent story across streets.`;
	}
	if (grade >= 65) {
		return `Playing ${posLabel}, there were moments where adding more pressure would have improved the expected outcome. Start each street by asking: can I deny equity here or extract value?`;
	}
	return `Playing ${posLabel}, several passive decisions reduced your edge. In heads-up, aggression compounds — each check or flat call surrenders fold equity and invites the opponent to realize their full equity cheaply.`;
}
