import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';
import { getPokerProfileSnapshot } from '$lib/server/training/queries';

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	return {
		user: locals.user,
		updated: url.searchParams.get('updated') === '1',
		pokerProfile: await getPokerProfileSnapshot(locals.user.id)
	};
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(302, '/login');
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';

		if (name.length < 2) {
			return fail(400, { message: 'Name must be at least 2 characters.' });
		}

		if (!isValidEmail(email)) {
			return fail(400, { message: 'Please enter a valid email address.' });
		}

		try {
			await db
				.update(user)
				.set({ name, email, updatedAt: new Date() })
				.where(eq(user.id, locals.user.id));
		} catch (error) {
			if (`${error}`.includes('UNIQUE constraint failed: user.email')) {
				return fail(400, { message: 'That email is already in use.' });
			}
			return fail(500, { message: 'Unable to update profile right now.' });
		}

		throw redirect(303, '/profile?updated=1');
	}
};
