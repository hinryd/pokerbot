import type {
	ActionOption,
	ActionType,
	BotDecisionTrace,
	HandAction,
	HandState,
	Seat
} from './types';
import { buildShuffledDeck, dealNewHand } from './deck';
import { determineWinner } from './evaluator';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function settleHandOutcome(state: HandState): HandState {
	if (state.outcome === null) return state;
	if (state.pot === 0) return state;

	if (state.outcome === 'player_wins') {
		return {
			...state,
			playerStack: state.playerStack + state.pot,
			pot: 0,
			actionOptions: []
		};
	}

	if (state.outcome === 'bot_wins') {
		return {
			...state,
			botStack: state.botStack + state.pot,
			pot: 0,
			actionOptions: []
		};
	}

	return {
		...state,
		playerStack: state.playerStack + state.pot / 2,
		botStack: state.botStack + state.pot / 2,
		pot: 0,
		actionOptions: []
	};
}

function getActorBet(state: HandState, actor: Seat) {
	return actor === 'player' ? state.playerBetThisStreet : state.botBetThisStreet;
}

function getActorStack(state: HandState, actor: Seat) {
	return actor === 'player' ? state.playerStack : state.botStack;
}

function getMinRaiseTo(state: HandState, _actor: Seat) {
	return state.currentBet + state.lastFullRaiseSize;
}

function getStreetReplayState(state: HandState, street: HandState['street']) {
	if (street === 'preflop') {
		const playerBlind = state.dealer === 'player' ? state.smallBlind : state.bigBlind;
		const botBlind = state.dealer === 'bot' ? state.smallBlind : state.bigBlind;
		return {
			currentBet: Math.max(playerBlind, botBlind),
			lastFullRaiseSize: state.bigBlind,
			playerBetThisStreet: playerBlind,
			botBetThisStreet: botBlind
		};
	}

	return {
		currentBet: 0,
		lastFullRaiseSize: state.bigBlind,
		playerBetThisStreet: 0,
		botBetThisStreet: 0
	};
}

export function deriveLastFullRaiseSize(state: HandState) {
	if (!state.handActions.length) return state.bigBlind;

	let currentStreet: HandState['street'] = 'preflop';
	let replay = getStreetReplayState(state, currentStreet);

	for (const action of state.handActions) {
		if (action.street !== currentStreet) {
			currentStreet = action.street;
			replay = getStreetReplayState(state, currentStreet);
		}

		const actorBetBefore =
			action.actor === 'player' ? replay.playerBetThisStreet : replay.botBetThisStreet;
		const actorBetAfter = actorBetBefore + action.amount;

		if (action.actor === 'player') {
			replay.playerBetThisStreet = actorBetAfter;
		} else {
			replay.botBetThisStreet = actorBetAfter;
		}

		if (action.type === 'bet') {
			replay.currentBet = actorBetAfter;
			replay.lastFullRaiseSize = Math.max(state.bigBlind, actorBetAfter);
			continue;
		}

		if (action.type === 'raise') {
			replay.lastFullRaiseSize = actorBetAfter - replay.currentBet;
			replay.currentBet = actorBetAfter;
			continue;
		}

		if (action.type !== 'all-in') continue;

		if (replay.currentBet <= 0) {
			replay.currentBet = actorBetAfter;
			replay.lastFullRaiseSize = Math.max(state.bigBlind, actorBetAfter);
			continue;
		}

		if (actorBetAfter <= replay.currentBet) continue;

		const raiseSize = actorBetAfter - replay.currentBet;
		replay.currentBet = actorBetAfter;
		if (raiseSize >= replay.lastFullRaiseSize) {
			replay.lastFullRaiseSize = raiseSize;
		}
	}

	return replay.lastFullRaiseSize;
}

export function getActionOption(state: HandState, actor: Seat, type: ActionType) {
	return buildActionOptions(state, actor).find((option) => option.type === type) ?? null;
}

export function normalizeActionAmount(
	state: HandState,
	actor: Seat,
	type: ActionType,
	rawAmount: number
) {
	const option = getActionOption(state, actor, type);
	if (!option) return null;
	if (type === 'check' || type === 'fold') return 0;
	if (type === 'call' || type === 'all-in') return option.amount ?? 0;
	if (type === 'bet' || type === 'raise') {
		const minAmount = option.minAmount ?? option.amount ?? 0;
		const maxAmount = option.maxAmount ?? option.amount ?? minAmount;
		return clamp(Math.round(rawAmount || minAmount), minAmount, maxAmount);
	}
	return option.amount ?? 0;
}

export function buildActionOptions(state: HandState, actor: Seat): ActionOption[] {
	const actorBet = getActorBet(state, actor);
	const actorStack = getActorStack(state, actor);
	const toCall = state.currentBet - actorBet;
	const lastStreetAction = [...state.handActions]
		.reverse()
		.find((action) => action.street === state.street);
	const raisingLockedByAllIn =
		lastStreetAction?.type === 'all-in' &&
		actorBet > 0 &&
		state.currentBet > actorBet &&
		state.currentBet - actorBet < state.lastFullRaiseSize;
	const addAllInOption = (options: ActionOption[]) => {
		if (!options.some((option) => option.type === 'all-in')) {
			options.push({ type: 'all-in', label: `All-in ${actorStack}`, amount: actorStack });
		}
	};

	if (toCall <= 0) {
		const minBet = state.bigBlind;
		if (actorStack < minBet) {
			return actorStack > 0
				? [
						{ type: 'check', label: 'Check' },
						{ type: 'all-in', label: `All-in ${actorStack}`, amount: actorStack }
					]
				: [{ type: 'check', label: 'Check' }];
		}
		const opts: ActionOption[] = [{ type: 'check', label: 'Check' }];
		if (actorStack === minBet) {
			addAllInOption(opts);
			return opts;
		}
		opts.push({
			type: 'bet',
			label: `Bet ${minBet}-${actorStack}`,
			amount: minBet,
			minAmount: minBet,
			maxAmount: actorStack
		});
		addAllInOption(opts);
		return opts;
	}

	const callCost = Math.min(toCall, actorStack);
	if (callCost >= actorStack) {
		return [
			{ type: 'fold', label: 'Fold' },
			{ type: 'all-in', label: `All-in ${callCost}`, amount: callCost }
		];
	}

	const minRaiseTo = getMinRaiseTo(state, actor);
	const raiseAdd = minRaiseTo - actorBet;
	const maxRaiseAdd = actorStack;

	const opts: ActionOption[] = [
		{ type: 'fold', label: 'Fold' },
		{ type: 'call', label: `Call ${callCost}`, amount: callCost }
	];

	if (!raisingLockedByAllIn && raiseAdd <= actorStack) {
		if (raiseAdd === actorStack) {
			addAllInOption(opts);
		} else {
			opts.push({
				type: 'raise',
				label: `Raise to ${minRaiseTo}-${actorBet + maxRaiseAdd}`,
				amount: raiseAdd,
				minAmount: raiseAdd,
				maxAmount: maxRaiseAdd
			});
		}
	}

	if (actorStack > callCost) {
		addAllInOption(opts);
	}

	return opts;
}

function isStreetComplete(s: HandState): boolean {
	return s.playerBetThisStreet === s.botBetThisStreet && s.actionsThisStreet >= 2;
}

function shouldRunoutToShowdown(s: HandState): boolean {
	return (
		s.outcome === null &&
		(s.playerStack === 0 || s.botStack === 0) &&
		s.playerBetThisStreet === s.botBetThisStreet
	);
}

function advanceStreet(s: HandState): HandState {
	const ns: HandState = {
		...s,
		actionsThisStreet: 0,
		currentBet: 0,
		lastFullRaiseSize: s.bigBlind,
		playerBetThisStreet: 0,
		botBetThisStreet: 0,
		actionOptions: []
	};

	if (s.street === 'preflop') {
		ns.street = 'flop';
		ns.boardCards = s.allBoardCards.slice(0, 3);
	} else if (s.street === 'flop') {
		ns.street = 'turn';
		ns.boardCards = s.allBoardCards.slice(0, 4);
	} else if (s.street === 'turn') {
		ns.street = 'river';
		ns.boardCards = s.allBoardCards.slice(0, 5);
	} else {
		ns.street = 'showdown';
		ns.boardCards = s.allBoardCards.slice();
		ns.outcome = determineWinner(
			s.playerCards as [string, string] & typeof s.playerCards,
			s.botCards as [string, string] & typeof s.botCards,
			s.allBoardCards
		);
		return settleHandOutcome(ns);
	}

	ns.toAct = s.dealer === 'player' ? 'bot' : 'player';
	ns.actionOptions = buildActionOptions(ns, ns.toAct);
	return ns;
}

function runoutToShowdown(state: HandState): HandState {
	let s = state;
	while (s.outcome === null && s.street !== 'showdown') {
		s = advanceStreet(s);
	}
	return s;
}

export function applyResolvedAction(state: HandState, action: HandAction): HandState {
	const nextTrace = action.actor === 'bot' ? (action.decisionTrace ?? null) : state.lastBotDecision;
	const nextHistory =
		action.actor === 'bot' && action.decisionTrace
			? [...state.botDecisionHistory, action.decisionTrace]
			: state.botDecisionHistory;
	const s: HandState = {
		...state,
		handActions: [...state.handActions, action],
		lastBotDecision: nextTrace,
		botDecisionHistory: nextHistory,
		opponentModel: state.opponentModel,
		actionsThisStreet: state.actionsThisStreet + 1
	};
	const actorBetBefore = getActorBet(state, action.actor);
	const actorBetAfter = actorBetBefore + action.amount;
	const previousCurrentBet = state.currentBet;
	const previousLastFullRaiseSize = state.lastFullRaiseSize;

	if (action.actor === 'player') {
		s.playerStack = state.playerStack - action.amount;
		s.playerBetThisStreet = state.playerBetThisStreet + action.amount;
	} else {
		s.botStack = state.botStack - action.amount;
		s.botBetThisStreet = state.botBetThisStreet + action.amount;
	}
	s.pot = state.pot + action.amount;

	if (action.type === 'bet') {
		s.currentBet = actorBetAfter;
		s.lastFullRaiseSize = Math.max(state.bigBlind, actorBetAfter);
	} else if (action.type === 'raise') {
		s.currentBet = actorBetAfter;
		s.lastFullRaiseSize = actorBetAfter - previousCurrentBet;
	} else if (action.type === 'all-in') {
		if (previousCurrentBet <= 0) {
			s.currentBet = actorBetAfter;
			s.lastFullRaiseSize = Math.max(state.bigBlind, actorBetAfter);
		} else if (actorBetAfter > previousCurrentBet) {
			const raiseSize = actorBetAfter - previousCurrentBet;
			s.currentBet = actorBetAfter;
			if (raiseSize >= previousLastFullRaiseSize) {
				s.lastFullRaiseSize = raiseSize;
			}
		}
	}

	if (action.type === 'fold') {
		s.outcome = action.actor === 'player' ? 'bot_wins' : 'player_wins';
		return settleHandOutcome(s);
	}

	if (action.type === 'all-in' && previousCurrentBet > 0 && actorBetAfter < previousCurrentBet) {
		return settleHandOutcome(runoutToShowdown(s));
	}

	if (shouldRunoutToShowdown(s)) return settleHandOutcome(runoutToShowdown(s));

	if (isStreetComplete(s)) return advanceStreet(s);

	s.toAct = action.actor === 'player' ? 'bot' : 'player';
	s.actionOptions = buildActionOptions(s, s.toAct);
	return s;
}

export function applyAction(
	state: HandState,
	actor: Seat,
	type: ActionType,
	amount: number,
	decisionTrace?: BotDecisionTrace
): HandState {
	return applyResolvedAction(state, {
		street: state.street,
		actor,
		type,
		amount,
		decisionTrace
	});
}

export function createNewHand(
	handNumber: number,
	dealer: Seat,
	playerStack: number,
	botStack: number,
	bigBlind: number
): HandState {
	const deck = buildShuffledDeck();
	const { playerCards, botCards, allBoardCards } = dealNewHand(deck);
	const smallBlind = bigBlind / 2;

	const s: HandState = {
		handNumber,
		dealer,
		toAct: dealer,
		street: 'preflop',
		playerCards,
		botCards,
		boardCards: [],
		allBoardCards,
		pot: 0,
		playerStack,
		botStack,
		smallBlind,
		bigBlind,
		currentBet: 0,
		lastFullRaiseSize: bigBlind,
		playerBetThisStreet: 0,
		botBetThisStreet: 0,
		actionsThisStreet: 0,
		handActions: [],
		lastBotDecision: null,
		botDecisionHistory: [],
		opponentModel: null,
		outcome: null,
		actionOptions: []
	};

	const playerBlind =
		dealer === 'player' ? Math.min(playerStack, smallBlind) : Math.min(playerStack, bigBlind);
	const botBlind = dealer === 'bot' ? Math.min(botStack, smallBlind) : Math.min(botStack, bigBlind);

	s.playerStack -= playerBlind;
	s.botStack -= botBlind;
	s.playerBetThisStreet = playerBlind;
	s.botBetThisStreet = botBlind;
	s.currentBet = Math.max(playerBlind, botBlind);
	s.pot = playerBlind + botBlind;

	s.actionOptions = buildActionOptions(s, dealer);
	if (shouldRunoutToShowdown(s)) {
		return runoutToShowdown(s);
	}
	return s;
}
