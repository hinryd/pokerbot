<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';

	let { data }: PageProps = $props();
	let botAdvanceForm = $state<HTMLFormElement | undefined>();

	const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
	const isLastHand = $derived(data.session.currentHandNumber >= data.session.totalHands);
	const progressPct = $derived(Math.round((data.reviewCount / data.session.totalHands) * 100));

	const outcome = $derived(data.currentHand?.state.outcome ?? null);
	const outcomeLabel = $derived(
		outcome === 'player_wins'
			? 'You win'
			: outcome === 'bot_wins'
				? 'Bot wins'
				: outcome === 'split'
					? 'Split pot'
					: null
	);

	const SUIT: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
	const parseCard = (code: string) => {
		const suit = code.slice(-1);
		const rank = code.slice(0, -1).replace('T', '10');
		return { rank, suit: SUIT[suit] ?? suit, red: suit === 'h' || suit === 'd' };
	};

	const actionClass = (type: string) =>
		type === 'fold'
			? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
			: type === 'raise' || type === 'bet' || type === 'all-in'
				? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
				: 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20';

	$effect(() => {
		if (!data.currentHand || data.currentHand.state.outcome !== null) return;
		if (data.currentHand.state.toAct !== 'bot') return;
		const timer = window.setTimeout(() => botAdvanceForm?.requestSubmit(), 1000);
		return () => window.clearTimeout(timer);
	});
</script>

<div class="flex flex-col lg:h-[calc(100vh-44px)] lg:flex-row lg:overflow-hidden">
	<!-- Poker table (main area) -->
	<div class="flex min-w-0 flex-1 flex-col border-b border-border lg:border-r lg:border-b-0">
		<!-- Session header bar -->
		<div class="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
			<span class="text-[10px] font-semibold tracking-widest text-primary uppercase"
				>{data.session.progressLabel}</span
			>
			<div class="h-3 w-px bg-border"></div>
			<span class="text-[10px] text-muted-foreground">{data.session.focus}</span>
			<div class="h-3 w-px bg-border"></div>
			<span class="text-[10px] text-muted-foreground">{data.session.difficulty}</span>
			<div class="flex-1"></div>
			<Button
				href={`/${data.session.id}`}
				variant="ghost"
				size="sm"
				class="h-6 text-[10px] text-muted-foreground">Full review</Button
			>
		</div>

		{#if data.currentHand}
			{@const state = data.currentHand.state}

			<!-- Table content -->
			<div class="flex flex-col lg:flex-1 lg:overflow-auto">
				<!-- Bot panel -->
				<div class="border-b border-border bg-card px-5 py-4">
					<div class="flex items-center justify-between gap-4">
						<div>
							<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
								Bot {state.dealer === 'bot' ? '· Dealer' : '· BB'}
							</p>
							<p class="font-mono-nums text-lg font-bold text-foreground">
								{fmt(state.botStack)}
								<span class="text-xs font-normal text-muted-foreground">chips</span>
							</p>
						</div>
						<div class="flex gap-2">
							{#each state.botCards as code (code)}
								{@const c = parseCard(code)}
								<div
									class="flex h-14 w-10 flex-col items-center justify-center border border-border bg-background {outcomeLabel
										? ''
										: 'opacity-40'}"
								>
									{#if outcomeLabel}
										<span
											class="text-base leading-none font-bold {c.red
												? 'text-red-400'
												: 'text-foreground'}">{c.rank}</span
										>
										<span class="text-xs {c.red ? 'text-red-400' : 'text-foreground'}"
											>{c.suit}</span
										>
									{:else}
										<span class="text-lg text-muted-foreground">?</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Board & pot -->
				<div
					class="flex flex-col items-center justify-center gap-5 bg-background px-4 py-8 lg:flex-1"
				>
					<!-- Street + pot -->
					<div class="flex items-center gap-4">
						<Badge variant="outline" class="text-[10px] tracking-widest uppercase"
							>{state.street}</Badge
						>
						<div class="text-center">
							<p class="text-[10px] tracking-widest text-muted-foreground uppercase">Pot</p>
							<p class="font-mono-nums text-3xl font-bold text-primary">{fmt(state.pot)}</p>
						</div>
						{#if outcomeLabel}
							<Badge
								class="text-[10px] tracking-widest uppercase {outcome === 'player_wins'
									? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
									: outcome === 'bot_wins'
										? 'border-destructive/30 bg-destructive/20 text-destructive'
										: 'bg-primary/20 text-primary'}">{outcomeLabel}</Badge
							>
						{/if}
					</div>

					<!-- Community cards -->
					<div class="flex min-h-16 items-center gap-2">
						{#if state.boardCards.length}
							{#each state.boardCards as code (code)}
								{@const c = parseCard(code)}
								<div
									class="flex h-16 w-12 flex-col items-center justify-center border border-border bg-card shadow-sm"
								>
									<span
										class="text-base leading-none font-bold {c.red
											? 'text-red-400'
											: 'text-foreground'}">{c.rank}</span
									>
									<span class="text-sm {c.red ? 'text-red-400' : 'text-foreground'}">{c.suit}</span>
								</div>
							{/each}
							{#each Array(5 - state.boardCards.length) as _, i (i)}
								<div
									class="flex h-16 w-12 items-center justify-center border border-dashed border-border"
								></div>
							{/each}
						{:else}
							<p class="text-[10px] tracking-widest text-muted-foreground uppercase">
								Preflop — no board yet
							</p>
						{/if}
					</div>
				</div>

				<!-- Player panel -->
				<div class="border-t border-border bg-card px-5 py-4">
					<div class="flex items-center justify-between gap-4">
						<div>
							<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
								You {state.dealer === 'player' ? '· Dealer' : '· BB'}
							</p>
							<p class="font-mono-nums text-lg font-bold text-foreground">
								{fmt(state.playerStack)}
								<span class="text-xs font-normal text-muted-foreground">chips</span>
							</p>
						</div>
						<div class="flex gap-2">
							{#each state.playerCards as code (code)}
								{@const c = parseCard(code)}
								<div
									class="flex h-14 w-10 flex-col items-center justify-center border border-primary/40 bg-primary/5"
								>
									<span
										class="text-base leading-none font-bold {c.red
											? 'text-red-400'
											: 'text-foreground'}">{c.rank}</span
									>
									<span class="text-sm {c.red ? 'text-red-400' : 'text-foreground'}">{c.suit}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Action bar -->
				<div class="shrink-0 border-t border-border bg-background px-4 py-3">
					{#if !outcomeLabel && state.toAct === 'player'}
						<div class="flex flex-wrap gap-2">
							{#each state.actionOptions as option (`${option.type}-${option.amount ?? 0}`)}
								<form
									method="POST"
									action="?/act"
									use:enhance
									data-sveltekit-noscroll
									class="min-w-24 flex-1"
								>
									<input type="hidden" name="type" value={option.type} />
									<input type="hidden" name="amount" value={option.amount ?? 0} />
									<button
										type="submit"
										class="w-full border px-3 py-2 text-xs font-semibold tracking-wider uppercase transition active:scale-95 {actionClass(
											option.type
										)}"
									>
										{option.label}
									</button>
								</form>
							{/each}
						</div>
					{:else if outcomeLabel}
						<div class="flex items-center gap-3">
							<span class="text-xs text-muted-foreground">Hand complete.</span>
							<form method="POST" action="?/nextHand" use:enhance data-sveltekit-noscroll>
								<button
									type="submit"
									class="border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold tracking-wider text-primary uppercase transition hover:bg-primary/20"
								>
									{isLastHand ? 'View session review →' : 'Next hand →'}
								</button>
							</form>
						</div>
					{:else}
						<form
							method="POST"
							action="?/bot"
							use:enhance
							data-sveltekit-noscroll
							bind:this={botAdvanceForm}
							class="hidden"
						></form>
						<p class="animate-pulse text-[10px] tracking-widest text-muted-foreground uppercase">
							Bot is thinking…
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Sidebar -->
	<aside class="flex shrink-0 flex-col overflow-auto lg:w-64 lg:overflow-auto xl:w-72">
		<!-- Progress -->
		<div class="border-b border-border p-4 lg:block">
			<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">
				Session progress
			</p>
			<div class="mb-2 flex items-end justify-between">
				<span class="font-mono-nums text-xl font-bold text-foreground"
					>{data.reviewCount}<span class="text-sm font-normal text-muted-foreground"
						>/{data.session.totalHands}</span
					></span
				>
				<span class="text-[10px] text-muted-foreground">{progressPct}%</span>
			</div>
			<Progress value={progressPct} class="h-0.5" />
		</div>

		<!-- Action log -->
		{#if data.currentHand?.state.handActions.length}
			<div class="hidden border-b border-border p-4 lg:block">
				<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">Action log</p>
				<div class="grid gap-1">
					{#each data.currentHand.state.handActions as action, i (`${action.street}-${i}`)}
						<div class="flex items-center justify-between gap-2 text-[11px]">
							<span class="text-muted-foreground">{action.street}</span>
							<span
								class="{action.actor === 'player'
									? 'text-primary'
									: 'text-muted-foreground'} font-medium">{action.actor}</span
							>
							<span class="text-foreground"
								>{action.type}{action.amount ? ` ${fmt(action.amount)}` : ''}</span
							>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Last hand review -->
		{#if data.currentReview}
			<div class="p-4 lg:flex-1">
				<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">
					Hand {data.currentReview.handNumber} review
				</p>
				<div class="mb-3 flex items-center gap-2">
					<span class="font-mono-nums text-2xl font-bold text-primary"
						>{data.currentReview.grade}</span
					>
					<span class="text-[10px] text-muted-foreground">/ 100</span>
				</div>
				<p class="mb-4 text-[11px] leading-relaxed text-muted-foreground">
					{data.currentReview.summary}
				</p>
				<Separator class="mb-4" />
				{#each data.currentReview.decisionReviews as dr (`${dr.street}-${dr.actionIndex}`)}
					<div class="mb-3">
						<div class="mb-1 flex items-center justify-between gap-2">
							<span class="text-[10px] tracking-widest text-muted-foreground uppercase"
								>{dr.street} · {dr.chosenAction}</span
							>
							<span
								class="font-mono-nums text-xs font-bold {dr.score >= 75
									? 'text-emerald-400'
									: dr.score >= 60
										? 'text-primary'
										: 'text-destructive'}">{dr.score}</span
							>
						</div>
						<p class="text-[11px] leading-relaxed text-muted-foreground">{dr.rationale}</p>
					</div>
				{/each}
			</div>
		{/if}
	</aside>
</div>
