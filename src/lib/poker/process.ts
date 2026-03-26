import type { PlayerSessionProfile } from './analysis';
import type { ActionType, Difficulty, HandState, OpponentModelSnapshot } from './types';
import { applyAction, buildActionOptions, normalizeActionAmount } from './engine';
import { botDecide } from './bot';

export function advanceBotTurns(
	state: HandState,
	difficulty: Difficulty,
	profile?: PlayerSessionProfile,
	opponentSnapshot?: OpponentModelSnapshot | null
): HandState {
	if (state.outcome !== null || state.street === 'showdown' || state.toAct !== 'bot') {
		return {
			...state,
			actionOptions:
				state.outcome === null && state.street !== 'showdown' && state.toAct === 'player'
					? buildActionOptions(state, 'player')
					: []
		};
	}

	const move = botDecide(state, difficulty, profile, opponentSnapshot);
	const amount = normalizeActionAmount(state, 'bot', move.type, move.amount);
	if (amount === null) {
		return {
			...state,
			actionOptions: buildActionOptions(state, 'player')
		};
	}
	const s = applyAction(state, 'bot', move.type, amount, move.trace);

	if (s.outcome === null && s.street !== 'showdown' && s.toAct === 'player') {
		s.actionOptions = buildActionOptions(s, 'player');
	} else {
		s.actionOptions = [];
	}

	return s;
}

export function processPlayerAction(
	state: HandState,
	type: ActionType,
	amount: number,
	_difficulty: Difficulty
): HandState {
	const normalizedAmount = normalizeActionAmount(state, 'player', type, amount);
	if (normalizedAmount === null) {
		return {
			...state,
			actionOptions: buildActionOptions(state, 'player')
		};
	}
	return applyAction(state, 'player', type, normalizedAmount);
}
