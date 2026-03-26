import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	defaultSessionInput,
	difficultyOptions,
	normalizeDifficulty,
	sessionPresets
} from '$lib/poker/defaults';
import { createTrainingSession } from '$lib/server/training/session';
import { getRecentSessions } from '$lib/server/training/queries';
import type { Difficulty, SessionCreationInput } from '$lib/poker/types';

const parsePositiveInt = (value: FormDataEntryValue | null, fallback: number) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseInput = (formData: FormData): SessionCreationInput => ({
	difficulty: normalizeDifficulty(formData.get('difficulty')?.toString()) as Difficulty,
	startingStack: parsePositiveInt(formData.get('startingStack'), defaultSessionInput.startingStack),
	bigBlind: parsePositiveInt(formData.get('bigBlind'), defaultSessionInput.bigBlind)
});

export const load: PageServerLoad = async ({ locals }) => ({
	user: locals.user ?? null,
	defaultSessionInput,
	difficultyOptions,
	sessionPresets,
	recentSessions: locals.user ? await getRecentSessions(locals.user.id) : []
});

export const actions: Actions = {
	start: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(303, '/login');
		}

		const formData = await request.formData();
		const input = parseInput(formData);

		if (input.bigBlind >= input.startingStack) {
			return fail(400, {
				message: 'Big blind must stay below the starting stack.'
			});
		}

		const sessionId = await createTrainingSession(locals.user.id, input);
		throw redirect(303, `/play/session/${sessionId}`);
	}
};
