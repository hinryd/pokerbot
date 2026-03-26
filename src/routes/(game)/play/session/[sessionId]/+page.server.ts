import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { trainingHand, trainingSession } from '$lib/server/db/schema';
import {
	getCurrentHandForSession,
	getHandStatesForSession,
	getReviewBySession,
	getSessionById
} from '$lib/server/training/queries';
import { insertHand } from '$lib/server/training/session';
import { saveHandReview } from '$lib/server/training/grading';
import { analyzePlayerSessionProfile } from '$lib/poker/analysis';
import { analyzeOpponentModel } from '$lib/poker/opponent-model';
import { normalizeDifficulty } from '$lib/poker/defaults';
import { advanceBotTurns, processPlayerAction } from '$lib/poker/process';
import type { ActionType, Difficulty, Seat } from '$lib/poker/types';

const isBusted = (stack: number) => stack <= 0;

const shouldEndAfterHand = (playerStack: number, botStack: number) =>
	isBusted(playerStack) || isBusted(botStack);

const completeSession = async (sessionId: string, progressLabel = 'Session complete') => {
	const reviews = await getReviewBySession(sessionId);
	const overallGrade = reviews.length
		? Math.round(reviews.reduce((s, r) => s + r.grade, 0) / reviews.length)
		: null;

	await db
		.update(trainingSession)
		.set({ status: 'complete', overallGrade, progressLabel })
		.where(eq(trainingSession.id, sessionId));
};

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const session = await getSessionById(params.sessionId, locals.user.id);
	if (!session) throw error(404, 'Training session not found');

	if (session.status === 'complete') throw redirect(302, `/review/${session.id}`);

	const currentHand = await getCurrentHandForSession(session.id, session.currentHandNumber);
	const profile = normalizeDifficulty(session.difficulty);
	const priorHandStates = (
		await getHandStatesForSession(session.id, session.currentHandNumber - 1)
	).map((entry) => entry.state);
	const reviews = await getReviewBySession(session.id);
	const currentReview = reviews.at(-1) ?? null;
	const opponentModel = currentHand
		? (currentHand.state.opponentModel ??
			analyzeOpponentModel([...priorHandStates, currentHand.state]))
		: analyzeOpponentModel(priorHandStates);

	return {
		session: {
			...session,
			difficulty: profile
		},
		currentHand,
		currentReview,
		reviewCount: reviews.length,
		playerProfile: analyzePlayerSessionProfile(priorHandStates),
		opponentModel
	};
};

export const actions: Actions = {
	act: async ({ params, request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');
		if (session.status === 'complete') throw redirect(302, `/review/${session.id}`);
		const difficulty = normalizeDifficulty(session.difficulty) as Difficulty;

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		if (!hand) return fail(400, { message: 'No active hand found' });
		if (hand.state.outcome !== null) return fail(400, { message: 'Hand is already complete' });

		const formData = await request.formData();
		const type = formData.get('type')?.toString() as ActionType | undefined;
		const amount = Number(formData.get('amount') ?? 0);
		const priorHandStates = (
			await getHandStatesForSession(session.id, session.currentHandNumber - 1)
		).map((entry) => entry.state);

		if (!type) return fail(400, { message: 'Missing action type' });

		const newState = processPlayerAction(hand.state, type, amount, difficulty);
		newState.opponentModel = analyzeOpponentModel([...priorHandStates, newState]);

		const updated = await db
			.update(trainingHand)
			.set({
				stateJson: JSON.stringify(newState),
				status: newState.outcome ? 'complete' : 'active'
			})
			.where(and(eq(trainingHand.id, hand.id), eq(trainingHand.stateJson, hand.stateJson)))
			.returning({ id: trainingHand.id });

		if (!updated.length) {
			throw redirect(303, `/play/session/${session.id}`);
		}

		if (newState.outcome !== null) {
			await saveHandReview(session.id, newState, priorHandStates);
		}

		throw redirect(303, `/play/session/${session.id}`);
	},
	bot: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');
		if (session.status === 'complete') throw redirect(302, `/review/${session.id}`);
		const difficulty = normalizeDifficulty(session.difficulty) as Difficulty;

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		if (!hand) return fail(400, { message: 'No active hand found' });
		if (hand.state.outcome !== null) throw redirect(303, `/play/session/${session.id}`);
		if (hand.state.toAct !== 'bot') throw redirect(303, `/play/session/${session.id}`);
		const priorHandStates = (
			await getHandStatesForSession(session.id, session.currentHandNumber - 1)
		).map((entry) => entry.state);
		const profile = analyzePlayerSessionProfile(priorHandStates);
		const opponentModel = analyzeOpponentModel([...priorHandStates, hand.state]);

		const newState = advanceBotTurns(hand.state, difficulty, profile, opponentModel);
		newState.opponentModel = opponentModel;

		const updated = await db
			.update(trainingHand)
			.set({
				stateJson: JSON.stringify(newState),
				status: newState.outcome ? 'complete' : 'active'
			})
			.where(and(eq(trainingHand.id, hand.id), eq(trainingHand.stateJson, hand.stateJson)))
			.returning({ id: trainingHand.id });

		if (!updated.length) {
			throw redirect(303, `/play/session/${session.id}`);
		}

		if (newState.outcome !== null) {
			await saveHandReview(session.id, newState, priorHandStates);
		}

		throw redirect(303, `/play/session/${session.id}`);
	},
	end: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');
		if (session.status === 'complete') throw redirect(302, `/review/${session.id}`);

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		const progressLabel =
			hand &&
			hand.state.outcome !== null &&
			shouldEndAfterHand(hand.state.playerStack, hand.state.botStack)
				? isBusted(hand.state.playerStack)
					? 'Session complete · You busted'
					: 'Session complete · Bot busted'
				: 'Session ended by player';

		await completeSession(session.id, progressLabel);
		throw redirect(303, `/review/${session.id}`);
	},
	nextHand: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		if (!hand) return fail(400, { message: 'No completed hand found' });
		if (hand.state.outcome === null) return fail(400, { message: 'Hand is not complete yet' });

		if (shouldEndAfterHand(hand.state.playerStack, hand.state.botStack)) {
			const progressLabel = isBusted(hand.state.playerStack)
				? 'Session complete · You busted'
				: 'Session complete · Bot busted';
			await completeSession(session.id, progressLabel);
			throw redirect(303, `/review/${session.id}`);
		}

		const nextHandNumber = session.currentHandNumber + 1;
		const nextDealer: Seat = session.currentHandNumber % 2 === 0 ? 'player' : 'bot';

		await insertHand(
			session.id,
			nextHandNumber,
			nextDealer,
			hand.state.playerStack,
			hand.state.botStack,
			session.bigBlind,
			normalizeDifficulty(session.difficulty) as Difficulty
		);

		await db
			.update(trainingSession)
			.set({
				currentHandNumber: nextHandNumber,
				progressLabel: `Hand ${nextHandNumber}`
			})
			.where(eq(trainingSession.id, session.id));

		throw redirect(303, `/play/session/${session.id}`);
	}
};
