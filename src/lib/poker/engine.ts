import type { ActionOption, ActionType, HandState, Seat } from './types';
import { buildShuffledDeck, dealNewHand } from './deck';
import { determineWinner } from './evaluator';

export function buildActionOptions(state: HandState, actor: Seat): ActionOption[] {
	const actorBet = actor === 'player' ? state.playerBetThisStreet : state.botBetThisStreet;
	const actorStack = actor === 'player' ? state.playerStack : state.botStack;
	const toCall = state.currentBet - actorBet;

	if (toCall <= 0) {
		const minBet = state.bigBlind;
		const potBet = Math.max(minBet + 1, Math.round(state.pot * 0.66));
		if (actorStack < minBet) return [{ type: 'check', label: 'Check' }];
		const opts: ActionOption[] = [
			{ type: 'check', label: 'Check' },
			{ type: 'bet', label: `Bet ${minBet}`, amount: minBet }
		];
		if (potBet > minBet && actorStack >= potBet) {
			opts.push({ type: 'bet', label: `Bet ${potBet}`, amount: potBet });
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

	const minRaiseTo = state.currentBet * 2;
	const raiseAdd = minRaiseTo - actorBet;
	const canRaise = actorStack > callCost + state.bigBlind;

	const opts: ActionOption[] = [
		{ type: 'fold', label: 'Fold' },
		{ type: 'call', label: `Call ${callCost}`, amount: callCost }
	];

	if (canRaise && raiseAdd <= actorStack) {
		opts.push({ type: 'raise', label: `Raise to ${minRaiseTo}`, amount: raiseAdd });
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
		return ns;
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
		s.actionOptions = [];
		return s;
	}

	if (shouldRunoutToShowdown(s)) return runoutToShowdown(s);

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
		pot: bigBlind * 1.5,
		playerStack: dealer === 'player' ? playerStack - smallBlind : playerStack - bigBlind,
		botStack: dealer === 'bot' ? botStack - smallBlind : botStack - bigBlind,
		smallBlind,
		bigBlind,
		currentBet: bigBlind,
		playerBetThisStreet: dealer === 'player' ? smallBlind : bigBlind,
		botBetThisStreet: dealer === 'bot' ? smallBlind : bigBlind,
		actionsThisStreet: 0,
		handActions: [],
		outcome: null,
		actionOptions: []
	};

	s.actionOptions = buildActionOptions(s, dealer);
	return s;
}
