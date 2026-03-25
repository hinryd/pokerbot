import type { ActionType, Difficulty, HandState } from './types';
import { buildActionOptions } from './engine';

const CONFIG: Record<Difficulty, { aggression: number; foldFreq: number; raiseFreq: number }> = {
	apprentice: { aggression: 0.35, foldFreq: 0.35, raiseFreq: 0.2 },
	contender: { aggression: 0.52, foldFreq: 0.22, raiseFreq: 0.38 },
	shark: { aggression: 0.68, foldFreq: 0.12, raiseFreq: 0.55 }
};

export function botDecide(state: HandState, difficulty: Difficulty): { type: ActionType; amount: number } {
	const cfg = CONFIG[difficulty];
	const toCall = state.currentBet - state.botBetThisStreet;
	const rand = Math.random();

	if (toCall <= 0) {
		if (rand < cfg.aggression) {
			const sizing = Math.max(
				state.bigBlind,
				Math.round(state.pot * (0.45 + rand * 0.55))
			);
			const amount = Math.min(sizing, state.botStack);
			if (amount >= state.bigBlind) return { type: 'bet', amount };
		}
		return { type: 'check', amount: 0 };
	}

	const potOdds = toCall / (state.pot + toCall);
	const callCost = Math.min(toCall, state.botStack);
	const isAllIn = callCost >= state.botStack;

	if (isAllIn) {
		return rand < cfg.foldFreq + potOdds * 0.3
			? { type: 'fold', amount: 0 }
			: { type: 'all-in', amount: callCost };
	}

	if (rand < cfg.foldFreq && potOdds > 0.3) {
		return { type: 'fold', amount: 0 };
	}

	const opts = buildActionOptions(state, 'bot');
	const raiseOpt = opts.find((o) => o.type === 'raise');
	if (rand > 1 - cfg.raiseFreq && raiseOpt?.amount) {
		return { type: 'raise', amount: raiseOpt.amount };
	}

	return { type: 'call', amount: callCost };
}
