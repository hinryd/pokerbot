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
	handCounts: [12, 25, 50],
	startingStacks: [100, 150, 200],
	bigBlinds: [2, 5, 10]
} as const;

export const defaultSessionInput: SessionCreationInput = {
	totalHands: 25,
	difficulty: 'contender',
	startingStack: 100,
	bigBlind: 2,
	focus: 'balanced'
};

export const trainingFocusOptions = [
	{ value: 'balanced', label: 'Balanced growth', detail: 'Review every street with no extra weighting.' },
	{ value: 'preflop', label: 'Preflop discipline', detail: 'Emphasize opening, calling, and 3-bet quality.' },
	{ value: 'aggression', label: 'Pressure points', detail: 'Focus on betting, raising, and bluff selection.' },
	{ value: 'discipline', label: 'Loss control', detail: 'Focus on folds, bluff catches, and thin value restraint.' }
] as const;
