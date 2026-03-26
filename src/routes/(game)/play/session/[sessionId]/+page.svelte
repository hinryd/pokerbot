<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import { Slider } from '$lib/components/ui/slider';
	import * as Sheet from '$lib/components/ui/sheet';

	let { data }: PageProps = $props();
	let botAdvanceForm = $state<HTMLFormElement | undefined>();
	let sidebarOpen = $state(true);
	let mobileInfoOpen = $state(false);
	let sizingPanelOpen = $state(false);
	let sizedActionValue = $state<number[]>([0]);
	let actionSubmitting = $state(false);

	type EnhanceSubmitInput = { cancel: () => void };
	type EnhanceSubmitResult = { update: () => Promise<void> };
	const enhanceLockedSubmit = ({ cancel }: EnhanceSubmitInput) => {
		if (actionSubmitting) {
			cancel();
			return;
		}
		actionSubmitting = true;
		return async ({ update }: EnhanceSubmitResult) => {
			await update();
			actionSubmitting = false;
		};
	};

	const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const totalChips = $derived(
		data.currentHand
			? data.currentHand.state.playerStack + data.currentHand.state.botStack
			: data.session.startingStack * 2
	);
	const playerStackPct = $derived(
		totalChips > 0 && data.currentHand
			? Math.round((data.currentHand.state.playerStack / totalChips) * 100)
			: 50
	);

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
	const isBusted = $derived(
		data.currentHand
			? data.currentHand.state.outcome !== null &&
					(data.currentHand.state.playerStack <= 0 || data.currentHand.state.botStack <= 0)
			: false
	);
	const actionTypeLabel = (type: string) => (type === 'bet' ? 'Bet' : 'Raise');
	const sizingOption = $derived(
		data.currentHand?.state.actionOptions.find(
			(option) => option.type === 'bet' || option.type === 'raise'
		) ?? null
	);
	const sizingMin = $derived(sizingOption?.minAmount ?? sizingOption?.amount ?? 0);
	const sizingMax = $derived(sizingOption?.maxAmount ?? sizingOption?.amount ?? sizingMin);
	const selectedSizingAmount = $derived(sizedActionValue[0] ?? sizingMin);
	const sizingAtMax = $derived(sizingOption !== null && selectedSizingAmount >= sizingMax);
	const sizingActionLabel = $derived(
		sizingOption ? (sizingAtMax ? 'All-in' : actionTypeLabel(sizingOption.type)) : ''
	);
	const sizingPanelLabel = $derived(
		sizingOption ? (sizingAtMax ? 'All-in' : `${actionTypeLabel(sizingOption.type)} sizing`) : ''
	);
	const liveOpponentModel = $derived(
		data.currentHand?.state.opponentModel ?? data.opponentModel ?? null
	);
	const lastBotDecision = $derived(data.currentHand?.state.lastBotDecision ?? null);

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

	$effect(() => {
		if (!sizingOption) {
			sizedActionValue = [0];
			return;
		}
		const minAmount = sizingMin;
		const maxAmount = sizingMax;
		const current = sizedActionValue[0] ?? minAmount;
		const next = Math.min(Math.max(current, minAmount), maxAmount);
		if (sizedActionValue.length !== 1 || sizedActionValue[0] !== next) {
			sizedActionValue = [next];
		}
	});

	$effect(() => {
		if (
			!data.currentHand ||
			data.currentHand.state.outcome !== null ||
			data.currentHand.state.toAct !== 'player'
		) {
			sizingPanelOpen = false;
		}
	});
</script>

{#snippet infoPanel()}
	<!-- Progress -->
	<div class="border-b border-border p-4">
		<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">Match state</p>
		<div class="mb-2 flex items-end justify-between">
			<span class="font-mono-nums text-xl font-bold text-foreground"
				>{data.currentHand
					? fmt(data.currentHand.state.playerStack)
					: fmt(data.session.startingStack)}<span class="text-sm font-normal text-muted-foreground"
					>/ {data.currentHand
						? fmt(data.currentHand.state.botStack)
						: fmt(data.session.startingStack)}</span
				></span
			>
			<span class="text-[10px] text-muted-foreground">{playerStackPct}% hero</span>
		</div>
		<Progress value={playerStackPct} class="h-0.5" />
		<p class="mt-3 text-[11px] leading-relaxed text-muted-foreground">
			{data.reviewCount} completed hand{data.reviewCount !== 1 ? 's' : ''} graded so far.
		</p>
	</div>
	{#if data.currentReview}
		<div class="p-4">
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
	{#if liveOpponentModel}
		<div class="border-t border-border p-4">
			<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">
				Opponent posterior
			</p>
			<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground">
				{liveOpponentModel.summary}
			</p>
			{#if liveOpponentModel.tags.length}
				<div class="mb-3 flex flex-wrap gap-1.5">
					{#each liveOpponentModel.tags as tag (tag)}
						<Badge variant="outline" class="text-[10px] uppercase">{tag}</Badge>
					{/each}
				</div>
			{/if}
			<div class="grid gap-px border border-border">
				{#each [{ label: 'Pressure fold', mean: liveOpponentModel.foldToPressure.mean, confidence: liveOpponentModel.foldToPressure.confidence }, { label: 'Pressure call', mean: liveOpponentModel.callVsPressure.mean, confidence: liveOpponentModel.callVsPressure.confidence }, { label: 'Pressure raise', mean: liveOpponentModel.raiseVsPressure.mean, confidence: liveOpponentModel.raiseVsPressure.confidence }, { label: 'Proactive agg', mean: liveOpponentModel.proactiveAggression.mean, confidence: liveOpponentModel.proactiveAggression.confidence }, { label: 'River bluff', mean: liveOpponentModel.riverBluffing.mean, confidence: liveOpponentModel.riverBluffing.confidence }] as stat (stat.label)}
					<div class="grid grid-cols-[1fr_auto] gap-2 bg-card p-3">
						<div>
							<p class="text-[10px] tracking-widest text-muted-foreground uppercase">
								{stat.label}
							</p>
							<p class="text-[11px] text-muted-foreground">conf {pct(stat.confidence)}</p>
						</div>
						<p class="font-mono-nums text-sm font-semibold text-foreground">{pct(stat.mean)}</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}
	{#if lastBotDecision}
		<div class="border-t border-border p-4">
			<div class="mb-3 flex items-center justify-between gap-2">
				<p class="text-[10px] tracking-widest text-muted-foreground uppercase">Bot trace</p>
				<Badge variant="outline" class="text-[10px] uppercase">{lastBotDecision.layer}</Badge>
			</div>
			<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground">
				{lastBotDecision.summary}
			</p>
			<div class="mb-3 grid gap-px border border-border">
				<div class="grid grid-cols-2 gap-px">
					<div class="bg-card p-3">
						<p class="text-[10px] tracking-widest text-muted-foreground uppercase">Chosen</p>
						<p class="font-mono-nums text-sm font-semibold text-foreground">
							{lastBotDecision.chosenAction}
							{lastBotDecision.chosenAmount ? ` ${fmt(lastBotDecision.chosenAmount)}` : ''}
						</p>
					</div>
					<div class="bg-card p-3">
						<p class="text-[10px] tracking-widest text-muted-foreground uppercase">Baseline</p>
						<p class="font-mono-nums text-sm font-semibold text-foreground">
							{lastBotDecision.baselineAction}
						</p>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-px">
					<div class="bg-card p-3">
						<p class="text-[10px] tracking-widest text-muted-foreground uppercase">Confidence</p>
						<p class="font-mono-nums text-sm font-semibold text-foreground">
							{pct(lastBotDecision.confidence)}
						</p>
					</div>
					<div class="bg-card p-3">
						<p class="text-[10px] tracking-widest text-muted-foreground uppercase">Exploit use</p>
						<p class="font-mono-nums text-sm font-semibold text-foreground">
							{fmt(lastBotDecision.debug.exploitUsed)} / {fmt(lastBotDecision.debug.exploitBudget)}
						</p>
					</div>
				</div>
			</div>
			{#if lastBotDecision.exploitAdjustments.length}
				<div class="mb-3 grid gap-px border border-border">
					{#each lastBotDecision.exploitAdjustments as adjustment (`${adjustment.title}-${adjustment.targetAction}`)}
						<div class="bg-card p-3">
							<div class="mb-1 flex items-center justify-between gap-2">
								<p class="text-[10px] tracking-widest text-muted-foreground uppercase">
									{adjustment.title}
								</p>
								<p class="font-mono-nums text-[10px] text-primary">{fmt(adjustment.delta)}</p>
							</div>
							<p class="text-[11px] leading-relaxed text-muted-foreground">{adjustment.detail}</p>
						</div>
					{/each}
				</div>
			{/if}
			<div class="grid gap-px border border-border">
				{#each lastBotDecision.options as option (`${option.type}-${option.amount}`)}
					<div class="grid grid-cols-[1fr_auto] gap-2 bg-card p-3">
						<div>
							<p class="text-[10px] tracking-widest text-muted-foreground uppercase">
								{option.type}{option.amount ? ` ${fmt(option.amount)}` : ''}
							</p>
							<p class="text-[11px] text-muted-foreground">
								base {fmt(option.baselineUtility)} · adj {fmt(option.adjustedUtility)}
							</p>
						</div>
						<p class="font-mono-nums text-sm font-semibold text-foreground">
							{pct(option.probability)}
						</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/snippet}

<div class="flex h-[calc(100dvh-44px)] flex-col overflow-hidden lg:flex-row">
	<!-- Poker table (main area) -->
	<div class="flex min-w-0 flex-1 flex-col border-b border-border lg:border-r lg:border-b-0">
		<!-- Session header bar -->
		<div class="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
			<span class="text-[10px] font-semibold tracking-widest text-primary uppercase"
				>{data.session.progressLabel}</span
			>
			<div class="h-3 w-px bg-border"></div>
			<span class="text-[10px] text-muted-foreground">{data.session.difficulty}</span>
			<div class="flex-1"></div>
			<form method="POST" action="?/end" use:enhance data-sveltekit-noscroll>
				<button
					type="submit"
					class="h-6 border border-destructive/30 px-2 text-[10px] tracking-widest text-destructive uppercase transition-colors hover:bg-destructive/10"
				>
					End session
				</button>
			</form>
			<button
				onclick={() => (sidebarOpen = !sidebarOpen)}
				class="ml-1 hidden h-6 border border-border px-2 text-[10px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground lg:inline-flex lg:items-center"
				>{sidebarOpen ? 'Hide info' : 'Info'}</button
			>
		</div>

		{#if data.currentHand}
			{@const state = data.currentHand.state}

			<!-- Table content -->
			<div class="flex flex-1 flex-col overflow-auto">
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
				<div class="flex flex-1 flex-col items-center justify-center gap-5 bg-background px-4 py-8">
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

					<!-- Action log pills -->
					{#if state.handActions.length}
						<div class="flex flex-wrap justify-center gap-1.5 px-4">
							{#each state.handActions as action, i (`${action.street}-${i}`)}
								<span
									class="font-mono-nums border px-2 py-0.5 text-[10px] tracking-wide
									{action.actor === 'player'
										? 'border-primary/30 bg-primary/5 text-primary'
										: 'border-border bg-card text-muted-foreground'}"
								>
									{action.actor === 'player' ? 'You' : 'Bot'}
									{action.type}{action.amount ? ` ${fmt(action.amount)}` : ''}
								</span>
							{/each}
						</div>
					{/if}
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
						<div class="grid gap-3">
							<div class="flex flex-wrap gap-2">
								{#each state.actionOptions.filter((option) => option.type !== 'bet' && option.type !== 'raise' && (option.type !== 'all-in' || !sizingOption)) as option (`${option.type}-${option.amount ?? 0}`)}
									<form
										method="POST"
										action="?/act"
										use:enhance={enhanceLockedSubmit}
										data-sveltekit-noscroll
										class="min-w-24 flex-1"
									>
										<input type="hidden" name="type" value={option.type} />
										<input type="hidden" name="amount" value={option.amount ?? 0} />
										<button
											type="submit"
											disabled={actionSubmitting}
											class="w-full border px-3 py-2 text-xs font-semibold tracking-wider uppercase transition active:scale-95 {actionClass(
												option.type
											)}"
										>
											{option.label}
										</button>
									</form>
								{/each}
								{#if sizingOption}
									<button
										type="button"
										disabled={actionSubmitting}
										onclick={() => (sizingPanelOpen = !sizingPanelOpen)}
										class="min-w-24 flex-1 border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold tracking-wider text-emerald-300 uppercase transition hover:bg-emerald-500/20 active:scale-95"
									>
										{sizingActionLabel}
									</button>
								{/if}
							</div>
							{#if sizingOption && sizingPanelOpen}
								<form
									method="POST"
									action="?/act"
									use:enhance={enhanceLockedSubmit}
									data-sveltekit-noscroll
									class="border border-border bg-card p-3"
								>
									<input type="hidden" name="type" value={sizingOption.type} />
									<input type="hidden" name="amount" value={sizedActionValue[0] ?? sizingMin} />
									<div
										class="mb-2 flex items-center justify-between gap-3 text-[10px] tracking-widest uppercase"
									>
										<span class="text-muted-foreground">{sizingPanelLabel}</span>
										<span class="font-mono-nums text-primary">{fmt(selectedSizingAmount)}</span>
									</div>
									<Slider
										bind:value={sizedActionValue}
										type="multiple"
										min={sizingMin}
										max={sizingMax}
										step={1}
										class="mb-3"
									/>
									<div
										class="mb-3 flex items-center justify-between text-[10px] text-muted-foreground"
									>
										<span>{fmt(sizingMin)}</span>
										<span>{fmt(sizingMax)}</span>
									</div>
									<button
										type="submit"
										disabled={actionSubmitting}
										class="w-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold tracking-wider text-emerald-300 uppercase transition hover:bg-emerald-500/20 active:scale-95"
									>
										{sizingActionLabel}
										{fmt(selectedSizingAmount)}
									</button>
								</form>
							{/if}
						</div>
					{:else if outcomeLabel}
						<div class="flex items-center gap-3">
							<span class="text-xs text-muted-foreground">Hand complete.</span>
							<form
								method="POST"
								action={isBusted ? '?/end' : '?/nextHand'}
								use:enhance
								data-sveltekit-noscroll
							>
								<button
									type="submit"
									class="border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold tracking-wider text-primary uppercase transition hover:bg-primary/20"
								>
									{isBusted ? 'End session' : 'Next hand →'}
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

	<!-- Desktop info sidebar -->
	{#if sidebarOpen}
		<aside
			class="hidden shrink-0 flex-col overflow-y-auto border-l border-border lg:flex lg:w-64 xl:w-72"
		>
			{@render infoPanel()}
		</aside>
	{/if}
</div>

<!-- Mobile info drawer -->
<Sheet.Root bind:open={mobileInfoOpen}>
	<Sheet.Content side="right" class="w-80 overflow-y-auto p-0">
		<Sheet.Header class="sr-only">
			<Sheet.Title>Session info</Sheet.Title>
			<Sheet.Description>Match state and last hand review</Sheet.Description>
		</Sheet.Header>
		{@render infoPanel()}
	</Sheet.Content>
</Sheet.Root>

<!-- Mobile info FAB -->
<button
	onclick={() => (mobileInfoOpen = true)}
	class="fixed right-4 bottom-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/90 text-[10px] font-semibold text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground lg:hidden"
	aria-label="Session info"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg
	>
</button>
