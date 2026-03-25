import { bestHandScore } from './evaluator';
import { cardRanks, cardSuits } from './types';
import type { CardCode } from './types';

export type HoleCombo = [CardCode, CardCode];

export interface WeightedCombo {
	cards: HoleCombo;
	weight: number;
	label: string;
}

export interface ComboCategorySummary {
	total: number;
	value: number;
	semiBluff: number;
	bluff: number;
}

export interface BlockerSummary {
	valueBlocked: number;
	semiBluffBlocked: number;
	bluffBlocked: number;
	blockerScore: number;
}

export interface EquitySample {
	equity: number;
	winRate: number;
	tieRate: number;
	samples: number;
}

const RANK_VALUE: Record<string, number> = Object.fromEntries(
	cardRanks.map((rank, index) => [rank, index + 2])
) as Record<string, number>;

const fullDeck: CardCode[] = cardSuits.flatMap((suit) =>
	cardRanks.map((rank) => `${rank}${suit}` as CardCode)
);

const notationCache = new Map<string, string[]>();

const cardRank = (card: CardCode) => RANK_VALUE[card[0]];
const cardSuit = (card: CardCode) => card[1];
const comboKey = (cards: HoleCombo) => [...cards].sort().join('');
const hasDeadCard = (cards: HoleCombo, deadCards: Set<CardCode>) =>
	deadCards.has(cards[0]) || deadCards.has(cards[1]);
const overlaps = (first: HoleCombo, second: HoleCombo) =>
	first[0] === second[0] || first[0] === second[1] || first[1] === second[0] || first[1] === second[1];

function mulberry32(seed: number) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let n = Math.imul(t ^ (t >>> 15), t | 1);
		n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
		return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
	};
}

export function buildSeed(parts: string[]) {
	let seed = 2166136261;
	for (const part of parts) {
		for (let index = 0; index < part.length; index += 1) {
			seed ^= part.charCodeAt(index);
			seed = Math.imul(seed, 16777619);
		}
	}
	return seed >>> 0;
}

function rankWindow(from: string, to: string) {
	const start = cardRanks.indexOf(from as (typeof cardRanks)[number]);
	const end = cardRanks.indexOf(to as (typeof cardRanks)[number]);
	if (start === -1 || end === -1) return [];
	const step = start <= end ? 1 : -1;
	const values: string[] = [];
	for (let index = start; index !== end + step; index += step) {
		values.push(cardRanks[index]!);
	}
	return values;
}

function expandPair(rank: string) {
	const combos: string[] = [];
	for (let first = 0; first < cardSuits.length - 1; first += 1) {
		for (let second = first + 1; second < cardSuits.length; second += 1) {
			combos.push(`${rank}${cardSuits[first]}${rank}${cardSuits[second]}`);
		}
	}
	return combos;
}

function expandNonPair(firstRank: string, secondRank: string, suitedness: 's' | 'o' | '') {
	const combos: string[] = [];
	if (suitedness !== 'o') {
		for (const suit of cardSuits) {
			combos.push(`${firstRank}${suit}${secondRank}${suit}`);
		}
	}
	if (suitedness !== 's') {
		for (const firstSuit of cardSuits) {
			for (const secondSuit of cardSuits) {
				if (firstSuit === secondSuit) continue;
				combos.push(`${firstRank}${firstSuit}${secondRank}${secondSuit}`);
			}
		}
	}
	return combos;
}

function normalizeClass(firstRank: string, secondRank: string, suitedness: 's' | 'o' | '') {
	if (cardRank(`${firstRank}s` as CardCode) >= cardRank(`${secondRank}s` as CardCode)) {
		return `${firstRank}${secondRank}${suitedness}`;
	}
	return `${secondRank}${firstRank}${suitedness}`;
}

function expandClass(label: string) {
	if (/^[2-9TJQKA][shdc][2-9TJQKA][shdc]$/.test(label)) {
		return [label];
	}
	if (/^([2-9TJQKA])\1$/.test(label)) {
		return expandPair(label[0]!);
	}
	const match = label.match(/^([2-9TJQKA])([2-9TJQKA])(s|o)?$/);
	if (!match) return [];
	const [, firstRank, secondRank, suitedness = ''] = match;
	if (firstRank === secondRank) return expandPair(firstRank);
	return expandNonPair(firstRank, secondRank, suitedness as 's' | 'o' | '');
}

function expandPlus(token: string) {
	const pair = token.match(/^([2-9TJQKA])\1\+$/);
	if (pair) {
		return rankWindow(pair[1]!, 'A').flatMap((rank) => [normalizeClass(rank, rank, '')]);
	}
	const match = token.match(/^([2-9TJQKA])([2-9TJQKA])(s|o)?\+$/);
	if (!match) return [];
	const [, firstRank, secondRank, suitedness = ''] = match;
	const firstIndex = cardRanks.indexOf(firstRank as (typeof cardRanks)[number]);
	const secondIndex = cardRanks.indexOf(secondRank as (typeof cardRanks)[number]);
	if (firstIndex === -1 || secondIndex === -1) return [];
	const labels: string[] = [];
	for (let index = secondIndex; index < firstIndex; index += 1) {
		labels.push(normalizeClass(firstRank, cardRanks[index]!, suitedness as 's' | 'o' | ''));
	}
	return labels;
}

function expandDash(token: string) {
	const pair = token.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/);
	if (pair) {
		return rankWindow(pair[1]!, pair[2]!).map((rank) => normalizeClass(rank, rank, ''));
	}
	const match = token.match(/^([2-9TJQKA])([2-9TJQKA])(s|o)?-([2-9TJQKA])([2-9TJQKA])(s|o)?$/);
	if (!match) return [];
	const [, firstRank, secondRank, suitedness = '', endFirstRank, endSecondRank, endSuitedness = ''] = match;
	if (suitedness !== endSuitedness) return [];
	if (firstRank === endFirstRank) {
		return rankWindow(secondRank, endSecondRank).map((rank) =>
			normalizeClass(firstRank, rank, suitedness as 's' | 'o' | '')
		);
	}
	const startFirstIndex = cardRanks.indexOf(firstRank as (typeof cardRanks)[number]);
	const startSecondIndex = cardRanks.indexOf(secondRank as (typeof cardRanks)[number]);
	const endFirstIndex = cardRanks.indexOf(endFirstRank as (typeof cardRanks)[number]);
	const endSecondIndex = cardRanks.indexOf(endSecondRank as (typeof cardRanks)[number]);
	if (
		startFirstIndex === -1 ||
		startSecondIndex === -1 ||
		endFirstIndex === -1 ||
		endSecondIndex === -1 ||
		startFirstIndex - startSecondIndex !== endFirstIndex - endSecondIndex
	) {
		return [];
	}
	const labels: string[] = [];
	const step = startFirstIndex <= endFirstIndex ? 1 : -1;
	for (
		let firstIndex = startFirstIndex, secondIndex = startSecondIndex;
		firstIndex !== endFirstIndex + step;
		firstIndex += step, secondIndex += step
	) {
		labels.push(
			normalizeClass(cardRanks[firstIndex]!, cardRanks[secondIndex]!, suitedness as 's' | 'o' | '')
		);
	}
	return labels;
}

function expandToken(token: string) {
	const trimmed = token.trim();
	if (!trimmed) return [];
	const cached = notationCache.get(trimmed);
	if (cached) return cached;
	let classes: string[];
	if (trimmed.includes('-')) classes = expandDash(trimmed);
	else if (trimmed.endsWith('+')) classes = expandPlus(trimmed);
	else classes = [trimmed];
	const combos = [...new Set(classes.flatMap(expandClass))];
	notationCache.set(trimmed, combos);
	return combos;
}

export function buildWeightedRange(
	entries: Array<{ notation: string; weight: number }>,
	deadCards: CardCode[] = []
) {
	const dead = new Set(deadCards);
	const combined = new Map<string, WeightedCombo>();
	for (const entry of entries) {
		const tokens = entry.notation.split(',').map((token) => token.trim()).filter(Boolean);
		for (const token of tokens) {
			for (const combo of expandToken(token)) {
				const cards = [combo.slice(0, 2), combo.slice(2, 4)] as HoleCombo;
				if (hasDeadCard(cards, dead)) continue;
				const key = comboKey(cards);
				const existing = combined.get(key);
				if (existing) {
					existing.weight += entry.weight;
					continue;
				}
				combined.set(key, {
					cards,
					weight: entry.weight,
					label: token
				});
			}
		}
	}
	return [...combined.values()].filter((combo) => combo.weight > 0);
}

export function filterRangeByDeadCards(range: WeightedCombo[], deadCards: CardCode[]) {
	const dead = new Set(deadCards);
	return range.filter((combo) => !hasDeadCard(combo.cards, dead));
}

function straightDrawValue(cards: CardCode[]) {
	const ranks = new Set(cards.map(cardRank));
	if (ranks.has(14)) ranks.add(1);
	let best = 0;
	for (let start = 1; start <= 10; start += 1) {
		const window = [start, start + 1, start + 2, start + 3, start + 4];
		const present = window.filter((rank) => ranks.has(rank)).length;
		if (present === 4) best = Math.max(best, 0.18);
		if (present === 3) best = Math.max(best, 0.08);
	}
	return best;
}

function flushDrawValue(cards: CardCode[]) {
	const suitCounts = new Map<string, number>();
	for (const card of cards) {
		const suit = cardSuit(card);
		suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
	}
	const maxSuit = Math.max(...suitCounts.values(), 0);
	if (maxSuit >= 4) return 0.22;
	if (maxSuit === 3) return 0.08;
	return 0;
}

function preflopComboStrength(cards: HoleCombo) {
	const ranks = cards.map(cardRank).sort((a, b) => b - a);
	const suited = cardSuit(cards[0]) === cardSuit(cards[1]);
	const gap = Math.abs(ranks[0]! - ranks[1]!);
	if (ranks[0] === ranks[1]) return 0.48 + ranks[0]! / 28;
	let score = 0.18 + ranks[0]! / 28 + ranks[1]! / 42;
	if (suited) score += 0.08;
	if (gap === 1) score += 0.06;
	if (gap === 2) score += 0.03;
	if (ranks[0] === 14) score += 0.06;
	return score;
}

function pairState(cards: HoleCombo, boardCards: CardCode[]) {
	const combined = [...cards, ...boardCards];
	const boardRanks = boardCards.map(cardRank).sort((a, b) => b - a);
	const holeRanks = cards.map(cardRank).sort((a, b) => b - a);
	const score = bestHandScore(combined);
	const category = Math.floor(score / 1e10);
	const topPair = category === 1 && boardRanks.length > 0 && holeRanks.includes(boardRanks[0]!);
	const overpair = holeRanks[0] === holeRanks[1] && holeRanks[0]! > (boardRanks[0] ?? 0);
	const drawStrength = Math.max(flushDrawValue(combined), straightDrawValue(combined));
	return { category, topPair, overpair, drawStrength };
}

function classifyCombo(cards: HoleCombo, boardCards: CardCode[]) {
	if (boardCards.length < 3) {
		const strength = preflopComboStrength(cards);
		if (strength >= 0.64) return 'value';
		if (strength >= 0.42) return 'semiBluff';
		return 'bluff';
	}
	const { category, topPair, overpair, drawStrength } = pairState(cards, boardCards);
	if (category >= 2 || overpair || topPair) return 'value';
	if (drawStrength >= 0.16) return 'semiBluff';
	if (category === 1 && drawStrength >= 0.08) return 'semiBluff';
	return 'bluff';
}

export function summarizeRange(range: WeightedCombo[], boardCards: CardCode[]): ComboCategorySummary {
	return range.reduce<ComboCategorySummary>(
		(summary, combo) => {
			summary.total += combo.weight;
			const bucket = classifyCombo(combo.cards, boardCards);
			if (bucket === 'value') summary.value += combo.weight;
			else if (bucket === 'semiBluff') summary.semiBluff += combo.weight;
			else summary.bluff += combo.weight;
			return summary;
		},
		{ total: 0, value: 0, semiBluff: 0, bluff: 0 }
	);
}

export function analyzeBlockers(heroCards: HoleCombo, range: WeightedCombo[], boardCards: CardCode[]): BlockerSummary {
	const baseline = summarizeRange(filterRangeByDeadCards(range, boardCards), boardCards);
	const filtered = summarizeRange(filterRangeByDeadCards(range, [...boardCards, ...heroCards]), boardCards);
	const valueBlocked = baseline.value - filtered.value;
	const semiBluffBlocked = baseline.semiBluff - filtered.semiBluff;
	const bluffBlocked = baseline.bluff - filtered.bluff;
	return {
		valueBlocked,
		semiBluffBlocked,
		bluffBlocked,
		blockerScore:
			(valueBlocked - bluffBlocked) /
			Math.max(1, valueBlocked + semiBluffBlocked + bluffBlocked)
	};
}

function pickWeighted(range: WeightedCombo[], random: () => number) {
	const total = range.reduce((sum, combo) => sum + combo.weight, 0);
	if (total <= 0) return null;
	let target = random() * total;
	for (const combo of range) {
		target -= combo.weight;
		if (target <= 0) return combo;
	}
	return range.at(-1) ?? null;
}

function completeBoard(boardCards: CardCode[], deadCards: CardCode[], random: () => number) {
	const dead = new Set(deadCards);
	const available = fullDeck.filter((card) => !dead.has(card));
	const nextBoard = [...boardCards];
	while (nextBoard.length < 5 && available.length) {
		const index = Math.floor(random() * available.length);
		nextBoard.push(available.splice(index, 1)[0]!);
	}
	return nextBoard;
}

export function sampleHandVsRangeEquity(args: {
	heroCards: HoleCombo;
	villainRange: WeightedCombo[];
	boardCards: CardCode[];
	seed: number;
	trials?: number;
}): EquitySample {
	const { heroCards, villainRange, boardCards, seed, trials = 180 } = args;
	const availableRange = filterRangeByDeadCards(villainRange, [...boardCards, ...heroCards]);
	if (!availableRange.length) {
		return { equity: 0.5, winRate: 0, tieRate: 1, samples: 0 };
	}
	const random = mulberry32(seed);
	let wins = 0;
	let ties = 0;
	for (let trial = 0; trial < trials; trial += 1) {
		const villain = pickWeighted(availableRange, random);
		if (!villain) break;
		const runout = completeBoard(boardCards, [...boardCards, ...heroCards, ...villain.cards], random);
		const heroScore = bestHandScore([...heroCards, ...runout]);
		const villainScore = bestHandScore([...villain.cards, ...runout]);
		if (heroScore > villainScore) wins += 1;
		else if (heroScore === villainScore) ties += 1;
	}
	const samples = trials;
	return {
		equity: samples ? (wins + ties * 0.5) / samples : 0.5,
		winRate: samples ? wins / samples : 0,
		tieRate: samples ? ties / samples : 0,
		samples
	};
}

export function sampleRangeVsRangeEquity(args: {
	heroRange: WeightedCombo[];
	villainRange: WeightedCombo[];
	boardCards: CardCode[];
	seed: number;
	trials?: number;
}): EquitySample {
	const { heroRange, villainRange, boardCards, seed, trials = 220 } = args;
	const liveHeroRange = filterRangeByDeadCards(heroRange, boardCards);
	const liveVillainRange = filterRangeByDeadCards(villainRange, boardCards);
	if (!liveHeroRange.length || !liveVillainRange.length) {
		return { equity: 0.5, winRate: 0, tieRate: 1, samples: 0 };
	}
	const random = mulberry32(seed);
	let wins = 0;
	let ties = 0;
	let samples = 0;
	for (let trial = 0; trial < trials; trial += 1) {
		const hero = pickWeighted(liveHeroRange, random);
		if (!hero) continue;
		let villain: WeightedCombo | null = null;
		for (let attempt = 0; attempt < 12; attempt += 1) {
			const candidate = pickWeighted(liveVillainRange, random);
			if (candidate && !overlaps(hero.cards, candidate.cards)) {
				villain = candidate;
				break;
			}
		}
		if (!villain) continue;
		const runout = completeBoard(boardCards, [...boardCards, ...hero.cards, ...villain.cards], random);
		const heroScore = bestHandScore([...hero.cards, ...runout]);
		const villainScore = bestHandScore([...villain.cards, ...runout]);
		samples += 1;
		if (heroScore > villainScore) wins += 1;
		else if (heroScore === villainScore) ties += 1;
	}
	return {
		equity: samples ? (wins + ties * 0.5) / samples : 0.5,
		winRate: samples ? wins / samples : 0,
		tieRate: samples ? ties / samples : 0,
		samples
	};
}
