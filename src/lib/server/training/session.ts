import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { trainingSession, trainingHand } from '$lib/server/db/schema';
import type { Difficulty, Seat, SessionCreationInput } from '$lib/poker/types';
import { createNewHand } from '$lib/poker/engine';

const buildProgressLabel = (handNumber: number) => `Hand ${handNumber}`;

export const insertHand = async (
	sessionId: string,
	handNumber: number,
	dealer: Seat,
	playerStack: number,
	botStack: number,
	bigBlind: number,
	_difficulty: Difficulty
) => {
	const state = createNewHand(handNumber, dealer, playerStack, botStack, bigBlind);
	await db.insert(trainingHand).values({
		id: randomUUID(),
		sessionId,
		handNumber,
		status: state.outcome ? 'complete' : 'active',
		stateJson: JSON.stringify(state)
	});
	return state;
};

export const createTrainingSession = async (userId: string, input: SessionCreationInput) => {
	const sessionId = randomUUID();

	await db.insert(trainingSession).values({
		id: sessionId,
		userId,
		totalHands: 0,
		difficulty: input.difficulty as Difficulty,
		focus: 'all-decisions',
		startingStack: input.startingStack,
		bigBlind: input.bigBlind,
		status: 'active',
		currentHandNumber: 1,
		overallGrade: null,
		progressLabel: buildProgressLabel(1)
	});

	await insertHand(
		sessionId,
		1,
		'player',
		input.startingStack,
		input.startingStack,
		input.bigBlind,
		input.difficulty as Difficulty
	);

	return sessionId;
};
