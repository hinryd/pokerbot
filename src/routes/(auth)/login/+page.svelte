<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';

	let { form }: PageProps = $props();
	let mode = $state<'signin' | 'signup'>('signin');
</script>

<div class="flex min-h-[calc(100vh-44px)] items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="border border-border bg-card p-8">
			<div class="mb-6">
				<p class="mb-3 text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">
					Pokerbot
				</p>
				<h1 class="text-2xl font-bold tracking-tight text-foreground">
					{mode === 'signin' ? 'Welcome back' : 'Create account'}
				</h1>
				<p class="mt-1 text-xs text-muted-foreground">
					{mode === 'signin'
						? 'Sign in to access your sessions.'
						: 'Register to start tracking your play.'}
				</p>
			</div>

			{#if form?.message}
				<div
					class="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{form.message}
				</div>
			{/if}

			<form
				method="POST"
				action={mode === 'signin' ? '?/signInEmail' : '?/signUpEmail'}
				use:enhance
				class="grid gap-4"
			>
				{#if mode === 'signup'}
					<div class="grid gap-1.5">
						<Label for="name" class="text-[11px] tracking-wider text-muted-foreground uppercase"
							>Name</Label
						>
						<Input
							id="name"
							name="name"
							type="text"
							required
							placeholder="Your name"
							class="h-9 text-xs"
						/>
					</div>
				{/if}
				<div class="grid gap-1.5">
					<Label for="email" class="text-[11px] tracking-wider text-muted-foreground uppercase"
						>Email</Label
					>
					<Input
						id="email"
						name="email"
						type="email"
						required
						placeholder="you@example.com"
						class="h-9 text-xs"
					/>
				</div>
				<div class="grid gap-1.5">
					<Label for="password" class="text-[11px] tracking-wider text-muted-foreground uppercase"
						>Password</Label
					>
					<Input
						id="password"
						name="password"
						type="password"
						required
						placeholder="••••••••"
						class="h-9 text-xs"
					/>
				</div>
				<Button type="submit" class="mt-1 h-9 w-full text-xs tracking-wider">
					{mode === 'signin' ? 'Sign in' : 'Create account'}
				</Button>
			</form>

			<div class="my-5 flex items-center gap-3">
				<Separator class="flex-1" />
				<span class="text-[10px] tracking-widest text-muted-foreground uppercase">or</span>
				<Separator class="flex-1" />
			</div>

			<form method="POST" action="?/signInSocial" use:enhance>
				<Button type="submit" variant="outline" class="h-9 w-full text-xs tracking-wider">
					Continue with GitHub
				</Button>
			</form>

			<p class="mt-5 text-center text-[11px] text-muted-foreground">
				{mode === 'signin' ? 'No account?' : 'Have an account?'}
				<button
					onclick={() => (mode = mode === 'signin' ? 'signup' : 'signin')}
					class="ml-1 text-primary underline-offset-4 hover:underline"
				>
					{mode === 'signin' ? 'Sign up' : 'Sign in'}
				</button>
			</p>
		</div>
	</div>
</div>
