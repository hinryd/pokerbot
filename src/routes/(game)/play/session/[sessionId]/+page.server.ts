import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { trainingHand, trainingSession } from '$lib/server/db/schema';
import { getCurrentHandForSession, getReviewBySession, getSessionById } from '$lib/server/training/queries';
import { insertHand } from '$lib/server/training/session';
import { saveHandReview } from '$lib/server/training/grading';
import { advanceBotTurns, processPlayerAction } from '$lib/poker/process';
import type { ActionType, Difficulty, Seat } from '$lib/poker/types';

const completeSession = async (sessionId: string) => {
	const reviews = await getReviewBySession(sessionId);
	const overallGrade = reviews.length
		? Math.round(reviews.reduce((s, r) => s + r.grade, 0) / reviews.length)
		: null;

	await db
		.update(trainingSession)
		.set({ status: 'complete', overallGrade, progressLabel: `Session complete` })
		.where(eq(trainingSession.id, sessionId));
};

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const session = await getSessionById(params.sessionId, locals.user.id);
	if (!session) throw error(404, 'Training session not found');

	if (session.status === 'complete') throw redirect(302, `/${session.id}`);

	const currentHand = await getCurrentHandForSession(session.id, session.currentHandNumber);
	const reviews = await getReviewBySession(session.id);
	const currentReview = reviews.find((r) => r.handNumber === session.currentHandNumber) ?? null;

	return { session, currentHand, currentReview, reviewCount: reviews.length };
};

export const actions: Actions = {
	act: async ({ params, request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');
		if (session.status === 'complete') throw redirect(302, `/${session.id}`);

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		if (!hand) return fail(400, { message: 'No active hand found' });
		if (hand.state.outcome !== null) return fail(400, { message: 'Hand is already complete' });

		const formData = await request.formData();
		const type = formData.get('type')?.toString() as ActionType | undefined;
		const amount = Number(formData.get('amount') ?? 0);

		if (!type) return fail(400, { message: 'Missing action type' });

		const newState = processPlayerAction(
			hand.state,
			type,
			amount,
			session.difficulty as Difficulty
		);

		await db
			.update(trainingHand)
			.set({ stateJson: JSON.stringify(newState), status: newState.outcome ? 'complete' : 'active' })
			.where(eq(trainingHand.id, hand.id));

		if (newState.outcome !== null) {
			await saveHandReview(session.id, newState);
		}

		throw redirect(303, `/play/session/${session.id}`);
	},
	bot: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');
		if (session.status === 'complete') throw redirect(302, `/${session.id}`);

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		if (!hand) return fail(400, { message: 'No active hand found' });
		if (hand.state.outcome !== null) throw redirect(303, `/play/session/${session.id}`);
		if (hand.state.toAct !== 'bot') throw redirect(303, `/play/session/${session.id}`);

		const newState = advanceBotTurns(hand.state, session.difficulty as Difficulty);

		await db
			.update(trainingHand)
			.set({ stateJson: JSON.stringify(newState), status: newState.outcome ? 'complete' : 'active' })
			.where(eq(trainingHand.id, hand.id));

		if (newState.outcome !== null) {
			await saveHandReview(session.id, newState);
		}

		throw redirect(303, `/play/session/${session.id}`);
	},
	nextHand: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const session = await getSessionById(params.sessionId, locals.user.id);
		if (!session) throw error(404, 'Session not found');

		const hand = await getCurrentHandForSession(session.id, session.currentHandNumber);
		if (!hand) return fail(400, { message: 'No completed hand found' });
		if (hand.state.outcome === null) return fail(400, { message: 'Hand is not complete yet' });

		const isLastHand = session.currentHandNumber >= session.totalHands;
		if (isLastHand) {
			await completeSession(session.id);
			throw redirect(303, `/${session.id}`);
		}

		const nextHandNumber = session.currentHandNumber + 1;
		const nextDealer: Seat = session.currentHandNumber % 2 === 0 ? 'player' : 'bot';

		await insertHand(
			session.id,
			nextHandNumber,
			nextDealer,
			session.startingStack,
			session.startingStack,
			session.bigBlind,
			session.difficulty as Difficulty
		);

		await db
			.update(trainingSession)
			.set({
				currentHandNumber: nextHandNumber,
				progressLabel: `Hand ${nextHandNumber} of ${session.totalHands}`
			})
			.where(eq(trainingSession.id, session.id));

		throw redirect(303, `/play/session/${session.id}`);
	}
};
