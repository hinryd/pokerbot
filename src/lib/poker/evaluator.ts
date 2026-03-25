import type { CardCode, CardRank, HandOutcome } from './types';
import { cardRanks } from './types';

const RANK_VAL: Record<CardRank, number> = Object.fromEntries(
	cardRanks.map((r, i) => [r, i + 2])
) as Record<CardRank, number>;

const rankVal = (card: CardCode) => RANK_VAL[card[0] as CardRank];
const suitOf = (card: CardCode) => card[1];

function combos5(cards: CardCode[]): CardCode[][] {
	const result: CardCode[][] = [];
	const n = cards.length;
	for (let a = 0; a < n - 4; a++)
		for (let b = a + 1; b < n - 3; b++)
			for (let c = b + 1; c < n - 2; c++)
				for (let d = c + 1; d < n - 1; d++)
					for (let e = d + 1; e < n; e++)
						result.push([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
	return result;
}

function encode(cat: number, vals: number[]): number {
	return cat * 1e10 + vals.reduce((s, v, i) => s + v * Math.pow(15, 4 - i), 0);
}

function scoreHand(cards: CardCode[]): number {
	const ranks = cards.map(rankVal).sort((a, b) => b - a);
	const suits = cards.map(suitOf);
	const isFlush = suits.every((s) => s === suits[0]);
	const isNormal = ranks[0]! - ranks[4]! === 4 && new Set(ranks).size === 5;
	const isWheel =
		ranks[0] === 14 &&
		ranks[1] === 5 &&
		ranks[2] === 4 &&
		ranks[3] === 3 &&
		ranks[4] === 2;
	const isStraight = isNormal || isWheel;
	const strHigh = isWheel ? 5 : ranks[0]!;

	const freq = new Map<number, number>();
	for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1);
	const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
	const topCount = groups[0]![1];
	const secondCount = groups[1]?.[1] ?? 0;

	if (isFlush && isStraight) return encode(8, [strHigh]);
	if (topCount === 4) return encode(7, [groups[0]![0], groups[1]![0]]);
	if (topCount === 3 && secondCount === 2) return encode(6, [groups[0]![0], groups[1]![0]]);
	if (isFlush) return encode(5, ranks);
	if (isStraight) return encode(4, [strHigh]);
	if (topCount === 3) return encode(3, [groups[0]![0], groups[1]![0], groups[2]![0]]);
	if (topCount === 2 && secondCount === 2)
		return encode(2, [groups[0]![0], groups[1]![0], groups[2]![0]]);
	if (topCount === 2) return encode(1, [groups[0]![0], ...ranks.filter((r) => r !== groups[0]![0])]);
	return encode(0, ranks);
}

export function bestHandScore(cards: CardCode[]): number {
	if (cards.length <= 5) return scoreHand(cards);
	return Math.max(...combos5(cards).map(scoreHand));
}

export function determineWinner(
	playerCards: CardCode[],
	botCards: CardCode[],
	boardCards: CardCode[]
): HandOutcome {
	const p = bestHandScore([...playerCards, ...boardCards]);
	const b = bestHandScore([...botCards, ...boardCards]);
	return p > b ? 'player_wins' : b > p ? 'bot_wins' : 'split';
}
