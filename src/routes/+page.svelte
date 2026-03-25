<script lang="ts">
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';

	let { data }: PageProps = $props();

	const stats = [
		{ label: 'Decision quality', value: '100%', sub: 'primary grading signal' },
		{ label: 'Hands analyzed', value: 'All', sub: 'every hand reviewed' },
		{ label: 'Bot style', value: 'Exploit', sub: 'adapts to your leaks' }
	];
</script>

<div
	class="mx-auto grid max-w-screen-xl gap-px border-b border-border px-4 py-10 lg:grid-cols-[1fr_380px]"
>
	<section class="border-r border-border p-8 md:p-12 lg:p-16">
		<p class="mb-6 text-[10px] font-semibold tracking-[0.35em] text-primary uppercase">
			Heads-up NL Texas Hold'em trainer
		</p>
		<h1
			class="mb-5 max-w-lg text-5xl leading-[1.05] font-bold tracking-tight text-foreground md:text-6xl"
		>
			Build a poker process that survives variance.
		</h1>
		<p class="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
			Private training room. Adaptive bot. Decision-quality grades. AI-assisted hand reviews. Every
			session becomes a coaching report.
		</p>
		<div class="mb-12 flex flex-wrap gap-2">
			<Button href="/play" size="lg" class="h-9 px-5 text-xs tracking-wider">Start a session</Button
			>
			{#if !data.user}
				<Button href="/login" variant="outline" size="lg" class="h-9 px-5 text-xs tracking-wider"
					>Sign in</Button
				>
			{/if}
		</div>

		<div class="grid grid-cols-3 gap-px border border-border">
			{#each stats as s (s.label)}
				<div class="bg-card p-4">
					<p class="font-mono-nums text-2xl font-bold text-primary">{s.value}</p>
					<p class="mt-1 text-[11px] text-muted-foreground">{s.label}</p>
					<p class="mt-0.5 text-[10px] text-muted-foreground/60">{s.sub}</p>
				</div>
			{/each}
		</div>
	</section>

	<aside class="flex flex-col gap-px">
		{#each [{ n: '01', title: 'Deterministic grades first', body: 'Scores and tags come from structured logic. No hallucinated praise.' }, { n: '02', title: 'Bot that adapts', body: 'Adjusts exploit speed and aggression based on your play patterns.' }, { n: '03', title: 'Reports that teach', body: 'Strengths, leaks, optimal lines — for every hand.' }] as item (item.n)}
			<div class="flex-1 border-b border-border bg-card p-6">
				<p class="mb-3 font-mono text-[10px] text-primary">{item.n}</p>
				<p class="mb-2 text-sm font-semibold text-foreground">{item.title}</p>
				<p class="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
			</div>
		{/each}
		<div class="flex-1 bg-card p-6">
			<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">Status</p>
			{#if data.user}
				<p class="text-sm font-semibold text-foreground">Signed in</p>
				<p class="mt-1 text-xs text-muted-foreground">{data.user.email}</p>
				<Button href="/play" class="mt-4 h-8 w-full text-xs">Open training room →</Button>
			{:else}
				<p class="text-sm font-semibold text-foreground">Not signed in</p>
				<p class="mt-1 text-xs text-muted-foreground">
					Sign in to save sessions and track progress.
				</p>
				<Button href="/login" class="mt-4 h-8 w-full text-xs">Sign in →</Button>
			{/if}
		</div>
	</aside>
</div>
