import { bestHandScore } from './evaluator';
import { applyAction } from './engine';
import {
	analyzeBlockers,
	buildSeed,
	buildWeightedRange,
	sampleHandVsRangeEquity,
	sampleRangeVsRangeEquity,
	summarizeRange,
	type BlockerSummary
} from './ranges';
import type { ActionType, CardCode, HandAction, HandState, Seat, Street } from './types';

const RANK_VALUE: Record<string, number> = {
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	'6': 6,
	'7': 7,
	'8': 8,
	'9': 9,
	T: 10,
	J: 11,
	Q: 12,
	K: 13,
	A: 14
};

export interface PlayerSessionProfile {
	preflopOpenRate: number;
	preflopAverageStrength: number;
	foldToPressureRate: number;
	callVsPressureRate: number;
	raiseVsPressureRate: number;
	aggressionRate: number;
	flopAggressionRate: number;
	turnAggressionRate: number;
	riverAggressionRate: number;
	riverBetRate: number;
	riverBluffRate: number;
	overfolds: boolean;
	callingStation: boolean;
	passive: boolean;
	underbluffsRiver: boolean;
}

export interface SpotAnalysis {
	strength: number;
	equity: number;
	rangeEquity: number;
	rangeAdvantage: number;
	nutAdvantage: number;
	drawStrength: number;
	toCall: number;
	potOdds: number;
	spr: number;
	inPosition: boolean;
	boardTexture: 'dry' | 'semi-wet' | 'wet';
	madeCategory:
		| 'high-card'
		| 'pair'
		| 'two-pair'
		| 'trips'
		| 'straight'
		| 'flush'
		| 'full-house'
		| 'quads'
		| 'straight-flush';
	topPair: boolean;
	overpair: boolean;
	opponentBluffShare: number;
	opponentValueShare: number;
	blockers: BlockerSummary;
	bluffable: boolean;
}

export interface HandTimelineEntry {
	before: HandState;
	action: HandAction;
	after: HandState;
	index: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aggressiveActions = new Set<ActionType>(['bet', 'raise', 'all-in']);

const cardRank = (card: CardCode) => RANK_VALUE[card[0]];
const cardSuit = (card: CardCode) => card[1];

const uniqueRanks = (cards: CardCode[]) => {
	const ranks = new Set(cards.map(cardRank));
	if (ranks.has(14)) ranks.add(1);
	return [...ranks].sort((a, b) => a - b);
};

const straightDrawStrength = (cards: CardCode[]) => {
	const ranks = new Set(uniqueRanks(cards));
	let best = 0;
	for (let start = 1; start <= 10; start++) {
		const window = [start, start + 1, start + 2, start + 3, start + 4];
		const present = window.filter((rank) => ranks.has(rank));
		if (present.length === 5) return 0;
		if (present.length === 4) {
			const missing = window.find((rank) => !ranks.has(rank));
			best = Math.max(best, missing === start || missing === start + 4 ? 0.22 : 0.14);
		}
	}
	return best;
};

const flushDrawStrength = (cards: CardCode[]) => {
	const suitCounts = new Map<string, number>();
	for (const card of cards) {
		const suit = cardSuit(card);
		suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
	}
	const maxSuit = Math.max(...suitCounts.values(), 0);
	return maxSuit >= 4 ? 0.24 : 0;
};

const boardTexture = (boardCards: CardCode[]): SpotAnalysis['boardTexture'] => {
	if (boardCards.length < 3) return 'dry';
	const suitCounts = new Map<string, number>();
	for (const card of boardCards) {
		const suit = cardSuit(card);
		suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
	}
	const maxSuit = Math.max(...suitCounts.values(), 0);
	const ranks = uniqueRanks(boardCards);
	let connected = 0;
	for (let i = 1; i < ranks.length; i++) {
		if (ranks[i]! - ranks[i - 1]! <= 2) connected += 1;
	}
	const paired = new Set(boardCards.map(cardRank)).size < boardCards.length;
	const wetScore = (maxSuit >= 3 ? 2 : 0) + connected + (paired ? 1 : 0);
	if (wetScore >= 4) return 'wet';
	if (wetScore >= 2) return 'semi-wet';
	return 'dry';
};

const preflopStrength = (cards: CardCode[], inPosition: boolean) => {
	const [first, second] = cards;
	const ranks = [cardRank(first), cardRank(second)].sort((a, b) => b - a);
	const suited = cardSuit(first) === cardSuit(second);
	const gap = Math.abs(ranks[0]! - ranks[1]!);
	const pair = ranks[0] === ranks[1];
	let score = 0.2;
	if (pair) score = 0.52 + ranks[0]! / 28;
	else {
		score += ranks[0]! / 28;
		score += ranks[1]! / 40;
		if (suited) score += 0.08;
		if (gap === 1) score += 0.07;
		if (gap === 2) score += 0.03;
		if (ranks[0] === 14) score += 0.08;
		if (ranks[0]! >= 12 && ranks[1]! >= 10) score += 0.06;
	}
	if (inPosition) score += 0.04;
	return clamp(score, 0.08, 0.98);
};

const categoryBase: Record<SpotAnalysis['madeCategory'], number> = {
	'high-card': 0.2,
	pair: 0.46,
	'two-pair': 0.7,
	trips: 0.8,
	straight: 0.87,
	flush: 0.9,
	'full-house': 0.96,
	quads: 0.985,
	'straight-flush': 0.995
};

const rangeBlueprints = {
	buttonOpen: '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,87s,76s,65s,54s,A2o+,K8o+,Q9o+,J9o+,T9o',
	bigBlindDefend: '22+,A2s+,K2s+,Q4s+,J6s+,T7s+,97s+,86s+,75s+,64s+,54s,A2o+,K5o+,Q8o+,J8o+,T8o+,98o',
	buttonDefendVs3Bet: '55+,A7s+,KTs+,QTs+,JTs,ATo+,KQo,A5s-A2s',
	threeBet: '77+,A9s+,KTs+,QTs+,JTs,AQo+,KQo,A5s-A2s',
	fourBet: 'QQ+,AKs,AKo,A5s-A4s',
	preflopBluffs: 'A5s-A2s,KTs-K8s,QTs-Q9s,JTs-T9s,98s',
	preflopTrap: 'QQ+,AKs,AKo',
	postflopValuePressure: '88+,ATs+,KQs,QJs,JTs,T9s,98s,AQo+,KQo',
	turnedPressure: '77+,A9s+,KTs+,QTs+,JTs,T9s,98s,87s,AJo+,KQo',
	postflopDrawPressure: 'A5s-A2s,KQs-KTs,QJs-QTs,JTs-T8s,97s,86s,75s,65s,54s',
	postflopBluffPressure: 'A5s-A2s,KJs-KTs,QTs+,J9s-T8s,97s,86s',
	postflopContinue: '55+,A8s+,KTs+,QTs+,JTs,T9s,98s,AJo+,KQo,A5s-A2s',
	trappedValue: 'TT+,ATs+,KQs,QJs,AQo+',
	riverShowdown: '22-99,A2s-A9s,K9s-K2s,Q9s-Q5s,J9s-J7s,T8s-T7s,98s-76s,A2o-A9o,KTo-K8o,QTo-Q9o'
} as const;

const otherSeat = (seat: Seat): Seat => (seat === 'player' ? 'bot' : 'player');

const lastAggressorOnStreet = (state: HandState, street: Street) =>
	[...state.handActions]
		.reverse()
		.find((action) => action.street === street && aggressiveActions.has(action.type))?.actor ?? null;

const inferRangeEntries = (state: HandState, actor: Seat) => {
	const actorBet = actor === 'player' ? state.playerBetThisStreet : state.botBetThisStreet;
	const toCall = Math.max(0, state.currentBet - actorBet);
	const inPosition = state.dealer === actor;
	if (state.street === 'preflop') {
		const preflopAggressor = lastAggressorOnStreet(state, 'preflop');
		if (!state.handActions.length) {
			return [{ notation: inPosition ? rangeBlueprints.buttonOpen : rangeBlueprints.bigBlindDefend, weight: 1 }];
		}
		if (preflopAggressor === actor) {
			if (state.currentBet >= state.bigBlind * 4) {
				return [
					{ notation: rangeBlueprints.fourBet, weight: 1 },
					{ notation: rangeBlueprints.preflopTrap, weight: 0.28 }
				];
			}
			return [
				{ notation: inPosition ? rangeBlueprints.buttonOpen : rangeBlueprints.threeBet, weight: 1 },
				{ notation: rangeBlueprints.preflopBluffs, weight: 0.32 }
			];
		}
		if (toCall > 0) {
			return [
				{ notation: inPosition ? rangeBlueprints.buttonDefendVs3Bet : rangeBlueprints.bigBlindDefend, weight: 1 },
				{ notation: rangeBlueprints.preflopTrap, weight: 0.14 }
			];
		}
		return [
			{ notation: rangeBlueprints.riverShowdown, weight: 0.9 },
			{ notation: rangeBlueprints.preflopTrap, weight: 0.12 }
		];
	}

	const currentStreetAggressor = lastAggressorOnStreet(state, state.street);
	const actorPreflopAggressor = lastAggressorOnStreet(state, 'preflop') === actor;
	if (currentStreetAggressor === actor) {
		return [
			{
				notation: actorPreflopAggressor
					? rangeBlueprints.postflopValuePressure
					: rangeBlueprints.turnedPressure,
				weight: 1
			},
			{
				notation:
					boardTexture(state.boardCards) === 'wet'
						? rangeBlueprints.postflopDrawPressure
						: rangeBlueprints.postflopBluffPressure,
				weight: 0.55
			}
		];
	}

	if (toCall > 0) {
		return [
			{ notation: rangeBlueprints.postflopContinue, weight: 1 },
			{ notation: rangeBlueprints.trappedValue, weight: 0.22 }
		];
	}

	if (state.street === 'river') {
		return [
			{ notation: rangeBlueprints.riverShowdown, weight: 1 },
			{ notation: rangeBlueprints.trappedValue, weight: 0.18 }
		];
	}

	return [
		{ notation: rangeBlueprints.riverShowdown, weight: 1 },
		{ notation: rangeBlueprints.trappedValue, weight: 0.18 }
	];
};

const madeHandCategory = (score: number): SpotAnalysis['madeCategory'] => {
	switch (Math.floor(score / 1e10)) {
		case 8:
			return 'straight-flush';
		case 7:
			return 'quads';
		case 6:
			return 'full-house';
		case 5:
			return 'flush';
		case 4:
			return 'straight';
		case 3:
			return 'trips';
		case 2:
			return 'two-pair';
		case 1:
			return 'pair';
		default:
			return 'high-card';
	}
};

export function analyzeSpot(state: HandState, actor: Seat): SpotAnalysis {
	const actorCards = actor === 'player' ? state.playerCards : state.botCards;
	const actorBet = actor === 'player' ? state.playerBetThisStreet : state.botBetThisStreet;
	const actorStack = actor === 'player' ? state.playerStack : state.botStack;
	const actorHole = [actorCards[0]!, actorCards[1]!] as [CardCode, CardCode];
	const toCall = Math.max(0, state.currentBet - actorBet);
	const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;
	const spr = state.pot > 0 ? actorStack / state.pot : actorStack;
	const inPosition = state.dealer === actor;
	const actorRange = buildWeightedRange(inferRangeEntries(state, actor), state.boardCards);
	const opponentRange = buildWeightedRange(inferRangeEntries(state, otherSeat(actor)), state.boardCards);
	const boardSeed = state.boardCards.join('');
	const handEquity = sampleHandVsRangeEquity({
		heroCards: actorHole,
		villainRange: opponentRange,
		boardCards: state.boardCards,
		seed: buildSeed([actor, boardSeed, actorHole.join(''), `${state.pot}`, `${state.currentBet}`])
	});
	const rangeEquity = sampleRangeVsRangeEquity({
		heroRange: actorRange,
		villainRange: opponentRange,
		boardCards: state.boardCards,
		seed: buildSeed([actor, boardSeed, `${state.handActions.length}`, `${state.street}`])
	});
	const actorSummary = summarizeRange(actorRange, state.boardCards);
	const opponentSummary = summarizeRange(opponentRange, state.boardCards);
	const actorValueShare =
		actorSummary.total > 0 ? (actorSummary.value + actorSummary.semiBluff * 0.45) / actorSummary.total : 0;
	const opponentValueShare =
		opponentSummary.total > 0
			? (opponentSummary.value + opponentSummary.semiBluff * 0.45) / opponentSummary.total
			: 0;
	const opponentBluffShare =
		opponentSummary.total > 0 ? opponentSummary.bluff / opponentSummary.total : 0;
	const blockers = analyzeBlockers(actorHole, opponentRange, state.boardCards);
	if (state.street === 'preflop') {
		const rawStrength = preflopStrength(actorCards, inPosition);
		const strength = clamp(
			rawStrength * 0.48 + handEquity.equity * 0.34 + rangeEquity.equity * 0.14 + blockers.blockerScore * 0.04,
			0.08,
			0.98
		);
		return {
			strength,
			equity: handEquity.equity,
			rangeEquity: rangeEquity.equity,
			rangeAdvantage: rangeEquity.equity - 0.5,
			nutAdvantage: actorValueShare - opponentValueShare,
			drawStrength: 0,
			toCall,
			potOdds,
			spr,
			inPosition,
			boardTexture: 'dry',
			madeCategory: actorCards[0]![0] === actorCards[1]![0] ? 'pair' : 'high-card',
			topPair: false,
			overpair: false,
			opponentBluffShare,
			opponentValueShare,
			blockers,
			bluffable: strength < 0.45 || blockers.blockerScore > 0.12
		};
	}
	const combined = [...actorCards, ...state.boardCards];
	const score = bestHandScore(combined);
	const madeCategory = madeHandCategory(score);
	const boardRanks = state.boardCards.map(cardRank).sort((a, b) => b - a);
	const holeRanks = actorCards.map(cardRank).sort((a, b) => b - a);
	const pocketPair = holeRanks[0] === holeRanks[1];
	const topPair =
		madeCategory !== 'high-card' &&
		madeCategory !== 'straight' &&
		madeCategory !== 'flush' &&
		madeCategory !== 'full-house' &&
		madeCategory !== 'quads' &&
		madeCategory !== 'straight-flush' &&
		holeRanks.includes(boardRanks[0]!);
	const overpair = pocketPair && holeRanks[0]! > (boardRanks[0] ?? 0);
	const drawStrength = Math.max(
		flushDrawStrength(combined) * (madeCategory === 'flush' ? 0 : 1),
		straightDrawStrength(combined) * (madeCategory === 'straight' ? 0 : 1)
	);
	let rawStrength = categoryBase[madeCategory];
	if (topPair) rawStrength += 0.08;
	if (overpair) rawStrength += 0.1;
	rawStrength += drawStrength * 0.55;
	if (inPosition) rawStrength += 0.02;
	const texture = boardTexture(state.boardCards);
	const strength = clamp(
		rawStrength * 0.42 + handEquity.equity * 0.44 + rangeEquity.equity * 0.1 + blockers.blockerScore * 0.04,
		0.08,
		0.995
	);
	return {
		strength,
		equity: handEquity.equity,
		rangeEquity: rangeEquity.equity,
		rangeAdvantage: rangeEquity.equity - 0.5,
		nutAdvantage: actorValueShare - opponentValueShare,
		drawStrength,
		toCall,
		potOdds,
		spr,
		inPosition,
		boardTexture: texture,
		madeCategory,
		topPair,
		overpair,
		opponentBluffShare,
		opponentValueShare,
		blockers,
		bluffable:
			((madeCategory === 'high-card' ||
				(madeCategory === 'pair' && !topPair && !overpair && drawStrength > 0)) &&
				(blockers.blockerScore > -0.16 || opponentBluffShare > 0.22))
	};
}

export function rebuildInitialState(finalState: HandState): HandState {
	const playerContribution = finalState.handActions
		.filter((action) => action.actor === 'player')
		.reduce((sum, action) => sum + action.amount, 0);
	const botContribution = finalState.handActions
		.filter((action) => action.actor === 'bot')
		.reduce((sum, action) => sum + action.amount, 0);
	const playerBlind = finalState.dealer === 'player' ? finalState.smallBlind : finalState.bigBlind;
	const botBlind = finalState.dealer === 'bot' ? finalState.smallBlind : finalState.bigBlind;
	const settledPlayerStack =
		finalState.outcome === 'player_wins'
			? finalState.playerStack - botContribution
			: finalState.outcome === 'bot_wins'
				? finalState.playerStack + playerContribution
				: finalState.playerStack - (botContribution - playerContribution) / 2;
	const settledBotStack =
		finalState.outcome === 'bot_wins'
			? finalState.botStack - playerContribution
			: finalState.outcome === 'player_wins'
				? finalState.botStack + botContribution
				: finalState.botStack - (playerContribution - botContribution) / 2;
	return {
		...finalState,
		street: 'preflop',
		toAct: finalState.dealer,
		boardCards: [],
		pot: playerBlind + botBlind,
		playerStack: settledPlayerStack - playerBlind,
		botStack: settledBotStack - botBlind,
		currentBet: Math.max(playerBlind, botBlind),
		playerBetThisStreet: playerBlind,
		botBetThisStreet: botBlind,
		actionsThisStreet: 0,
		handActions: [],
		outcome: null,
		actionOptions: []
	};
}

export function buildHandTimeline(finalState: HandState): HandTimelineEntry[] {
	let current = rebuildInitialState(finalState);
	const entries: HandTimelineEntry[] = [];
	finalState.handActions.forEach((action, index) => {
		const before = current;
		const after = applyAction(before, action.actor, action.type, action.amount);
		entries.push({ before, action, after, index });
		current = after;
	});
	return entries;
}

const emptyProfile = (): PlayerSessionProfile => ({
	preflopOpenRate: 0,
	preflopAverageStrength: 0,
	foldToPressureRate: 0,
	callVsPressureRate: 0,
	raiseVsPressureRate: 0,
	aggressionRate: 0,
	flopAggressionRate: 0,
	turnAggressionRate: 0,
	riverAggressionRate: 0,
	riverBetRate: 0,
	riverBluffRate: 0,
	overfolds: false,
	callingStation: false,
	passive: false,
	underbluffsRiver: false
});

export function analyzePlayerSessionProfile(states: HandState[]): PlayerSessionProfile {
	if (!states.length) return emptyProfile();
	let preflopOpportunities = 0;
	let preflopAggression = 0;
	let preflopStrengthTotal = 0;
	let facedPressure = 0;
	let foldedToPressure = 0;
	let calledPressure = 0;
	let raisedVsPressure = 0;
	let playerDecisions = 0;
	let aggressiveDecisions = 0;
	const streetOpportunities: Record<Street, number> = {
		preflop: 0,
		flop: 0,
		turn: 0,
		river: 0,
		showdown: 0
	};
	const streetAggression: Record<Street, number> = {
		preflop: 0,
		flop: 0,
		turn: 0,
		river: 0,
		showdown: 0
	};
	let riverBetOpportunities = 0;
	let riverAggression = 0;
	let riverBluffOpportunities = 0;
	let riverBluffs = 0;
	for (const state of states) {
		for (const entry of buildHandTimeline(state)) {
			if (entry.action.actor !== 'player') continue;
			playerDecisions += 1;
			streetOpportunities[entry.before.street] += 1;
			const spot = analyzeSpot(entry.before, 'player');
			const aggressive = aggressiveActions.has(entry.action.type);
			if (aggressive) {
				aggressiveDecisions += 1;
				streetAggression[entry.before.street] += 1;
			}
			if (entry.before.street === 'preflop') {
				preflopOpportunities += 1;
				preflopStrengthTotal += spot.strength;
				if (aggressive) preflopAggression += 1;
			}
			if (spot.toCall > 0) {
				facedPressure += 1;
				if (entry.action.type === 'fold') foldedToPressure += 1;
				else if (entry.action.type === 'call') calledPressure += 1;
				else if (aggressive) raisedVsPressure += 1;
			}
			if (entry.before.street === 'river' && spot.toCall <= 0) {
				riverBetOpportunities += 1;
				if (aggressive) riverAggression += 1;
				if (spot.bluffable) {
					riverBluffOpportunities += 1;
					if (aggressive) riverBluffs += 1;
				}
			}
		}
	}
	const aggressionRate = playerDecisions ? aggressiveDecisions / playerDecisions : 0;
	const foldToPressureRate = facedPressure ? foldedToPressure / facedPressure : 0;
	const callVsPressureRate = facedPressure ? calledPressure / facedPressure : 0;
	const raiseVsPressureRate = facedPressure ? raisedVsPressure / facedPressure : 0;
	const riverBetRate = riverBetOpportunities ? riverAggression / riverBetOpportunities : 0;
	const riverBluffRate = riverBluffOpportunities ? riverBluffs / riverBluffOpportunities : 0;
	return {
		preflopOpenRate: preflopOpportunities ? preflopAggression / preflopOpportunities : 0,
		preflopAverageStrength: preflopOpportunities ? preflopStrengthTotal / preflopOpportunities : 0,
		foldToPressureRate,
		callVsPressureRate,
		raiseVsPressureRate,
		aggressionRate,
		flopAggressionRate: streetOpportunities.flop ? streetAggression.flop / streetOpportunities.flop : 0,
		turnAggressionRate: streetOpportunities.turn ? streetAggression.turn / streetOpportunities.turn : 0,
		riverAggressionRate: streetOpportunities.river ? streetAggression.river / streetOpportunities.river : 0,
		riverBetRate,
		riverBluffRate,
		overfolds: facedPressure >= 3 && foldToPressureRate > 0.42,
		callingStation: facedPressure >= 3 && callVsPressureRate > 0.55 && foldToPressureRate < 0.25,
		passive: aggressionRate < 0.24,
		underbluffsRiver: riverBetOpportunities >= 2 && riverBetRate < 0.28
	};
}
