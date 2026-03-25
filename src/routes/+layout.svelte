<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { Button } from '$lib/components/ui/button';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Pokerbot</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<header
		class="fixed inset-x-0 top-0 z-50 flex h-11 items-center gap-0 border-b border-border bg-background/95 px-4 backdrop-blur-sm"
	>
		<a
			href="/"
			class="mr-6 flex items-center gap-2 text-xs font-semibold tracking-widest text-foreground uppercase"
		>
			<span class="inline-block h-1.5 w-1.5 bg-primary"></span>
			Pokerbot
		</a>
		<div class="mr-4 h-4 w-px bg-border"></div>
		<Button
			href="/play"
			variant="ghost"
			size="sm"
			class="text-muted-foreground hover:text-foreground">Training</Button
		>
		<div class="flex-1"></div>
		{#if data.user}
			<span class="mr-3 hidden text-[11px] text-muted-foreground sm:block">{data.user.email}</span>
			<form method="POST" action="/signout">
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-destructive">Sign out</Button
				>
			</form>
		{:else}
			<Button href="/login" size="sm">Sign in</Button>
		{/if}
	</header>

	<main class="mt-11 flex-1">
		{@render children()}
	</main>
</div>
