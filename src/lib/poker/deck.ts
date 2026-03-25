import type { CardCode } from './types';
import { cardRanks, cardSuits } from './types';

export const buildShuffledDeck = (): CardCode[] => {
	const deck: CardCode[] = [];
	for (const suit of cardSuits) {
		for (const rank of cardRanks) {
			deck.push(`${rank}${suit}` as CardCode);
		}
	}
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j]!, deck[i]!];
	}
	return deck;
};

export const dealNewHand = (deck: CardCode[]) => {
	let i = 0;
	const playerCards: [CardCode, CardCode] = [deck[i++]!, deck[i++]!];
	const botCards: [CardCode, CardCode] = [deck[i++]!, deck[i++]!];
	const allBoardCards: [CardCode, CardCode, CardCode, CardCode, CardCode] = [
		deck[i++]!,
		deck[i++]!,
		deck[i++]!,
		deck[i++]!,
		deck[i++]!
	];
	return { playerCards, botCards, allBoardCards };
};
