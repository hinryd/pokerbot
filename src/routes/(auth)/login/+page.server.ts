import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/play');
	return {};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const data = await event.request.formData();
		try {
			await auth.api.signInEmail({
				body: {
					email: data.get('email')?.toString() ?? '',
					password: data.get('password')?.toString() ?? ''
				}
			});
		} catch (e) {
			return fail(400, { message: e instanceof APIError ? e.message : 'Sign in failed' });
		}
		throw redirect(302, '/play');
	},
	signUpEmail: async (event) => {
		const data = await event.request.formData();
		try {
			await auth.api.signUpEmail({
				body: {
					email: data.get('email')?.toString() ?? '',
					password: data.get('password')?.toString() ?? '',
					name: data.get('name')?.toString() ?? ''
				}
			});
		} catch (e) {
			return fail(400, { message: e instanceof APIError ? e.message : 'Sign up failed' });
		}
		throw redirect(302, '/play');
	},
	signInSocial: async (event) => {
		const result = await auth.api.signInSocial({
			body: { provider: 'github', callbackURL: '/play' }
		});
		if (result.url) throw redirect(302, result.url);
		return fail(400, { message: 'GitHub sign-in failed' });
	}
};
