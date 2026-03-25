import type { ActionType, Difficulty, HandState } from './types';
import { applyAction, buildActionOptions } from './engine';
import { botDecide } from './bot';

export function advanceBotTurns(state: HandState, difficulty: Difficulty): HandState {
	if (state.outcome !== null || state.street === 'showdown' || state.toAct !== 'bot') {
		return {
			...state,
			actionOptions:
				state.outcome === null && state.street !== 'showdown' && state.toAct === 'player'
					? buildActionOptions(state, 'player')
					: []
		};
	}

	const move = botDecide(state, difficulty);
	const s = applyAction(state, 'bot', move.type, move.amount);

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
	return applyAction(state, 'player', type, amount);
}
