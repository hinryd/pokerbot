import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReviewBySession, getSessionById } from '$lib/server/training/queries';
import { normalizeDifficulty } from '$lib/poker/defaults';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const session = await getSessionById(params.sessionId, locals.user.id);
	if (!session) {
		throw error(404, 'Training session not found');
	}

	const reviews = await getReviewBySession(session.id);
	const averageGrade = reviews.length
		? Math.round(reviews.reduce((total, review) => total + review.grade, 0) / reviews.length)
		: null;

	return {
		session: {
			...session,
			difficulty: normalizeDifficulty(session.difficulty)
		},
		reviews,
		averageGrade
	};
};
