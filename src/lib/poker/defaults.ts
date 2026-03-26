import type { DifficultyOption, SessionCreationInput } from './types';

export const difficultyOptions: DifficultyOption[] = [
	{
		value: 'fish',
		label: 'Fish',
		summary: 'Loose-passive with capped pressure.',
		adaptation: 'Overcalls, underfolds, and misses many thin value spots.'
	},
	{
		value: 'rec',
		label: 'Rec',
		summary: 'Inconsistent but reactive rec strategy.',
		adaptation: 'Mixes curiosity calls with occasional fear folds and uneven aggression.'
	},
	{
		value: 'amateur',
		label: 'Amateur',
		summary: 'Solid fundamentals, moderate exploit adaptation.',
		adaptation: 'Uses coherent ranges and pressure, but still leaves leaks in tough nodes.'
	},
	{
		value: 'pro',
		label: 'Pro',
		summary: 'Disciplined high-pressure strategy.',
		adaptation: 'Tracks your posteriors quickly and applies constrained exploits with precision.'
	}
];

export const sessionPresets = {
	startingStacks: [100, 150, 200],
	bigBlinds: [2, 5, 10]
} as const;

export const defaultSessionInput: SessionCreationInput = {
	difficulty: 'amateur',
	startingStack: 100,
	bigBlind: 2
};

const validDifficulties = new Set(difficultyOptions.map((option) => option.value));

export const normalizeDifficulty = (value: string | null | undefined): SessionCreationInput['difficulty'] => {
	if (!value) return defaultSessionInput.difficulty;
	if (validDifficulties.has(value as SessionCreationInput['difficulty'])) {
		return value as SessionCreationInput['difficulty'];
	}
	if (value === 'apprentice') return 'fish';
	if (value === 'contender') return 'amateur';
	if (value === 'shark') return 'pro';
	return defaultSessionInput.difficulty;
};
