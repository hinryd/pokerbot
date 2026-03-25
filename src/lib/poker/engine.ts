import type { ActionOption, ActionType, HandState, Seat } from './types';
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

function getMinRaiseTo(state: HandState, actor: Seat) {
	const actorBet = getActorBet(state, actor);
	const lastRaiseSize = Math.max(state.bigBlind, state.currentBet - actorBet);
	return state.currentBet + lastRaiseSize;
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

	if (toCall <= 0) {
		const minBet = state.bigBlind;
		if (actorStack < minBet) return [{ type: 'check', label: 'Check' }];
		const opts: ActionOption[] = [
			{ type: 'check', label: 'Check' },
			{
				type: 'bet',
				label: actorStack > minBet ? `Bet ${minBet}-${actorStack}` : `Bet ${minBet}`,
				amount: minBet,
				minAmount: minBet,
				maxAmount: actorStack
			}
		];
		if (actorStack > minBet) {
			opts.push({ type: 'all-in', label: `All-in ${actorStack}`, amount: actorStack });
		}
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
	const canRaise = actorStack > callCost + state.bigBlind;
	const maxRaiseAdd = actorStack;

	const opts: ActionOption[] = [
		{ type: 'fold', label: 'Fold' },
		{ type: 'call', label: `Call ${callCost}`, amount: callCost }
	];

	if (canRaise && raiseAdd <= actorStack) {
		opts.push({
			type: 'raise',
			label: `Raise to ${minRaiseTo}-${actorBet + maxRaiseAdd}`,
			amount: raiseAdd,
			minAmount: raiseAdd,
			maxAmount: maxRaiseAdd
		});
	}

	if (actorStack > callCost) {
		opts.push({ type: 'all-in', label: `All-in ${actorStack}`, amount: actorStack });
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

export function applyAction(state: HandState, actor: Seat, type: ActionType, amount: number): HandState {
	const s: HandState = {
		...state,
		handActions: [...state.handActions, { street: state.street, actor, type, amount }],
		actionsThisStreet: state.actionsThisStreet + 1
	};

	if (actor === 'player') {
		s.playerStack = state.playerStack - amount;
		s.playerBetThisStreet = state.playerBetThisStreet + amount;
	} else {
		s.botStack = state.botStack - amount;
		s.botBetThisStreet = state.botBetThisStreet + amount;
	}
	s.pot = state.pot + amount;

	if (type === 'bet' || type === 'raise' || type === 'all-in') {
		s.currentBet = actor === 'player' ? s.playerBetThisStreet : s.botBetThisStreet;
	}

	if (type === 'fold') {
		s.outcome = actor === 'player' ? 'bot_wins' : 'player_wins';
		return settleHandOutcome(s);
	}

	if (shouldRunoutToShowdown(s)) return settleHandOutcome(runoutToShowdown(s));

	if (isStreetComplete(s)) return advanceStreet(s);

	s.toAct = actor === 'player' ? 'bot' : 'player';
	s.actionOptions = buildActionOptions(s, s.toAct);
	return s;
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
		playerBetThisStreet: 0,
		botBetThisStreet: 0,
		actionsThisStreet: 0,
		handActions: [],
		outcome: null,
		actionOptions: []
	};

	const playerBlind = dealer === 'player' ? Math.min(playerStack, smallBlind) : Math.min(playerStack, bigBlind);
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
