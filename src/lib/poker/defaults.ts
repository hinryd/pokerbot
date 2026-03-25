import type { DifficultyOption, SessionCreationInput } from './types';

export const difficultyOptions: DifficultyOption[] = [
	{
		value: 'apprentice',
		label: 'Apprentice',
		summary: 'Forgiving lines with slow adaptation.',
		adaptation: 'Punishes repeated leaks gently.'
	},
	{
		value: 'contender',
		label: 'Contender',
		summary: 'Practical pressure with steady exploit adjustment.',
		adaptation: 'Tracks your habits and leans into them mid-session.'
	},
	{
		value: 'shark',
		label: 'Shark',
		summary: 'Sharper ranges, cleaner sizings, faster punishment.',
		adaptation: 'Finds repeated mistakes quickly and attacks them.'
	}
];

export const sessionPresets = {
	startingStacks: [100, 150, 200],
	bigBlinds: [2, 5, 10]
} as const;

export const defaultSessionInput: SessionCreationInput = {
	difficulty: 'contender',
	startingStack: 100,
	bigBlind: 2
};
