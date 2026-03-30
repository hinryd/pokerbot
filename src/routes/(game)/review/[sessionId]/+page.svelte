<script lang="ts">
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';

	let { data }: PageProps = $props();

	const gradeColor = (g: number) =>
		g >= 75 ? 'text-emerald-400' : g >= 60 ? 'text-primary' : 'text-destructive';
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(2));
	const SUIT: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
	const parseCard = (code: string) => {
		const suit = code.slice(-1);
		const rank = code.slice(0, -1).replace('T', '10');
		return { rank, suit: SUIT[suit] ?? suit, red: suit === 'h' || suit === 'd' };
	};
	const outcomeLabel = (outcome: string | null) =>
		outcome === 'player_wins' ? 'You won' : outcome === 'bot_wins' ? 'Bot won' : 'Split pot';
</script>

<div class="flex flex-col lg:h-[calc(100vh-44px)] lg:flex-row lg:overflow-hidden">
	<!-- Session stats sidebar -->
	<aside
		class="flex shrink-0 flex-col overflow-auto border-b border-border lg:w-56 lg:border-r lg:border-b-0 xl:w-64"
	>
		<div class="border-b border-border p-5">
			<p class="mb-4 text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">
				Session review
			</p>
			<div class="mb-1">
				<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
					Overall grade
				</p>
				<p
					class="font-mono-nums text-4xl font-bold {data.averageGrade
						? gradeColor(Number(data.averageGrade))
						: 'text-muted-foreground'}"
				>
					{data.averageGrade ?? '—'}
				</p>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-px border-b border-border lg:grid-cols-1">
			{#each [{ label: 'Hands played', value: `${data.reviews.length}` }, { label: 'Starting stack', value: `${data.session.startingStack}` }, { label: 'Profile', value: data.session.difficulty }, { label: 'Status', value: data.session.status }] as stat (stat.label)}
				<div class="bg-card px-5 py-3">
					<p class="mb-0.5 text-[10px] tracking-widest text-muted-foreground uppercase">
						{stat.label}
					</p>
					<p class="text-xs font-semibold text-foreground">{stat.value}</p>
				</div>
			{/each}
		</div>

		<div class="hidden p-5 lg:block">
			<p class="text-[11px] leading-relaxed text-muted-foreground">
				Grades reflect decision quality, not chip outcome. The score penalises known leaks, not bad
				luck.
			</p>
		</div>

		<div class="mt-auto border-t border-border p-5">
			<Button href="/play" variant="outline" class="h-8 w-full text-[10px] tracking-wider"
				>New session</Button
			>
		</div>
	</aside>

	<!-- Hand reviews feed -->
	<div class="flex-1 lg:overflow-auto">
		{#if data.reviews.length}
			<div class="divide-y divide-border">
				{#each data.reviews as review (review.id)}
					<article class="p-6 md:p-8">
						<!-- Hand header -->
						<div class="mb-5 flex items-start justify-between gap-4">
							<div>
								<p class="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">
									Hand {review.handNumber}
								</p>
								<div class="flex items-baseline gap-3">
									<span class="font-mono-nums text-3xl font-bold {gradeColor(review.grade)}"
										>{review.grade}</span
									>
									<span class="text-xs text-muted-foreground">/ 100</span>
								</div>
							</div>
							<Badge variant="outline" class="text-[10px] tracking-widest uppercase"
								>{review.status}</Badge
							>
						</div>

						{#if review.handContext}
							<div class="mb-6 border border-border bg-card p-4">
								<div class="mb-3 flex items-center justify-between gap-3">
									<p class="text-[10px] tracking-widest text-primary uppercase">Hand context</p>
									<span class="text-[10px] text-muted-foreground uppercase"
										>{review.handContext.street} · {outcomeLabel(review.handContext.outcome)}</span
									>
								</div>
								<div class="grid gap-3 md:grid-cols-3">
									<div>
										<p class="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">
											Your hand
										</p>
										<div class="flex gap-2">
											{#each review.handContext.playerCards as code (code)}
												{@const c = parseCard(code)}
												<div
													class="flex h-14 w-10 flex-col items-center justify-center border border-border bg-background shadow-sm"
												>
													<span
														class="text-xs font-bold {c.red ? 'text-red-400' : 'text-foreground'}"
														>{c.rank}</span
													>
													<span
														class="text-[10px] {c.red ? 'text-red-400' : 'text-muted-foreground'}"
														>{c.suit}</span
													>
												</div>
											{/each}
										</div>
									</div>
									<div>
										<p class="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">
											Board
										</p>
										<div class="flex gap-2">
											{#if review.handContext.boardCards.length}
												{#each review.handContext.boardCards as code (code)}
													{@const c = parseCard(code)}
													<div
														class="flex h-14 w-10 flex-col items-center justify-center border border-border bg-background shadow-sm"
													>
														<span
															class="text-xs font-bold {c.red ? 'text-red-400' : 'text-foreground'}"
															>{c.rank}</span
														>
														<span
															class="text-[10px] {c.red ? 'text-red-400' : 'text-muted-foreground'}"
															>{c.suit}</span
														>
													</div>
												{/each}
											{:else}
												<p class="text-xs text-muted-foreground">Preflop only</p>
											{/if}
										</div>
									</div>
									<div>
										<p class="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">
											Bot hand
										</p>
										<div class="flex gap-2">
											{#each review.handContext.botCards as code (code)}
												{@const c = parseCard(code)}
												<div
													class="flex h-14 w-10 flex-col items-center justify-center border border-border bg-background shadow-sm"
												>
													<span
														class="text-xs font-bold {c.red ? 'text-red-400' : 'text-foreground'}"
														>{c.rank}</span
													>
													<span
														class="text-[10px] {c.red ? 'text-red-400' : 'text-muted-foreground'}"
														>{c.suit}</span
													>
												</div>
											{/each}
										</div>
									</div>
								</div>
							</div>
						{/if}

						<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{review.summary}</p>

						<!-- Strengths / Mistakes / Line -->
						<div class="mb-5 grid gap-px border border-border md:grid-cols-3">
							<div class="bg-card p-4">
								<p class="mb-3 text-[10px] tracking-widest text-emerald-400 uppercase">Strengths</p>
								<ul class="grid gap-1.5">
									{#each review.strengths as item, itemIndex (`strength-${itemIndex}`)}
										<li
											class="text-[11px] leading-relaxed text-muted-foreground before:text-emerald-400 before:content-['+_']"
										>
											{item}
										</li>
									{/each}
								</ul>
							</div>
							<div
								class="border-t border-border bg-card p-4 md:border-t-0 md:border-r md:border-l md:border-border"
							>
								<p class="mb-3 text-[10px] tracking-widest text-destructive uppercase">Mistakes</p>
								<ul class="grid gap-1.5">
									{#each review.mistakes as item, itemIndex (`mistake-${itemIndex}`)}
										<li
											class="text-[11px] leading-relaxed text-muted-foreground before:text-destructive before:content-['−_']"
										>
											{item}
										</li>
									{/each}
								</ul>
							</div>
							<div class="border-t border-border bg-card p-4 md:border-t-0">
								<p class="mb-3 text-[10px] tracking-widest text-primary uppercase">
									Recommended line
								</p>
								<ul class="grid gap-1.5">
									{#each review.recommendedLine as item, itemIndex (`line-${itemIndex}`)}
										<li
											class="text-[11px] leading-relaxed text-muted-foreground before:text-primary before:content-['→_']"
										>
											{item}
										</li>
									{/each}
								</ul>
							</div>
						</div>

						<!-- Thought process -->
						<div class="mb-5 border border-border bg-card p-4">
							<p class="mb-2 text-[10px] tracking-widest text-primary uppercase">
								Optimal thought process
							</p>
							<p class="text-[11px] leading-relaxed text-muted-foreground">
								{review.thoughtProcess}
							</p>
						</div>

						{#if review.opponentModel}
							<div class="mb-5 border border-border bg-card p-4">
								<div class="mb-3 flex items-center justify-between gap-3">
									<p class="text-[10px] tracking-widest text-primary uppercase">
										Opponent posterior
									</p>
									<span class="text-[10px] text-muted-foreground"
										>{review.opponentModel.observedDecisions} observed decisions</span
									>
								</div>
								<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground">
									{review.opponentModel.summary}
								</p>
								{#if review.opponentModel.tags.length}
									<div class="mb-3 flex flex-wrap gap-1.5">
										{#each review.opponentModel.tags as tag (tag)}
											<Badge variant="outline" class="text-[10px] uppercase">{tag}</Badge>
										{/each}
									</div>
								{/if}
								<div class="grid gap-px border border-border md:grid-cols-2 xl:grid-cols-5">
									{#each [{ label: 'Pressure fold', mean: review.opponentModel.foldToPressure.mean, confidence: review.opponentModel.foldToPressure.confidence }, { label: 'Pressure call', mean: review.opponentModel.callVsPressure.mean, confidence: review.opponentModel.callVsPressure.confidence }, { label: 'Pressure raise', mean: review.opponentModel.raiseVsPressure.mean, confidence: review.opponentModel.raiseVsPressure.confidence }, { label: 'Proactive agg', mean: review.opponentModel.proactiveAggression.mean, confidence: review.opponentModel.proactiveAggression.confidence }, { label: 'River bluff', mean: review.opponentModel.riverBluffing.mean, confidence: review.opponentModel.riverBluffing.confidence }] as stat (stat.label)}
										<div class="bg-background p-3">
											<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
												{stat.label}
											</p>
											<p class="font-mono-nums text-sm font-semibold text-foreground">
												{pct(stat.mean)}
											</p>
											<p class="text-[11px] text-muted-foreground">conf {pct(stat.confidence)}</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Decision breakdowns -->
						{#if review.decisionReviews.length}
							<div class="grid gap-px border border-border">
								{#each review.decisionReviews as d (`${d.street}-${d.actionIndex}`)}
									<div class="bg-card p-4">
										<div class="mb-2 flex items-center justify-between gap-3">
											<div class="flex items-center gap-2">
												<Badge variant="outline" class="text-[10px] uppercase">{d.street}</Badge>
												<span class="text-[11px] text-muted-foreground"
													>chose <strong class="text-foreground">{d.chosenAction}</strong> vs rec
													<strong class="text-foreground">{d.recommendedAction}</strong></span
												>
											</div>
											<span class="font-mono-nums shrink-0 text-sm font-bold {gradeColor(d.score)}"
												>{d.score}</span
											>
										</div>
										<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground">
											{d.rationale}
										</p>
										{#if d.evidence.length}
											<div class="grid gap-px md:grid-cols-2">
												{#each d.evidence as ev (ev.title)}
													<div class="border border-border bg-background p-3">
														<p
															class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase"
														>
															{ev.title}
														</p>
														<p
															class="text-[11px] leading-relaxed whitespace-pre-line text-muted-foreground"
														>
															{ev.detail}
														</p>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if review.botDecisions.length}
							<div class="mt-5 grid gap-px border border-border">
								{#each review.botDecisions as decision (`${decision.street}-${decision.actionIndex}`)}
									<div class="bg-card p-4">
										<div class="mb-3 flex items-center justify-between gap-3">
											<div class="flex items-center gap-2">
												<Badge variant="outline" class="text-[10px] uppercase">bot</Badge>
												<Badge variant="outline" class="text-[10px] uppercase"
													>{decision.street}</Badge
												>
												<span class="text-[11px] text-muted-foreground"
													>{decision.chosenAction}{decision.amount
														? ` ${fmt(decision.amount)}`
														: ''}</span
												>
											</div>
											<span class="text-[10px] text-muted-foreground"
												>{pct(decision.trace.confidence)} confidence</span
											>
										</div>
										<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground">
											{decision.trace.summary}
										</p>
										<div class="mb-3 grid gap-px border border-border md:grid-cols-2">
											<div class="bg-background p-3">
												<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
													Baseline
												</p>
												<p class="font-mono-nums text-sm font-semibold text-foreground">
													{decision.trace.baselineAction}
												</p>
											</div>
											<div class="bg-background p-3">
												<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
													Exploit budget
												</p>
												<p class="font-mono-nums text-sm font-semibold text-foreground">
													{fmt(decision.trace.debug.exploitUsed)} / {fmt(
														decision.trace.debug.exploitBudget
													)}
												</p>
											</div>
										</div>
										{#if decision.trace.exploitAdjustments.length}
											<div class="mb-3 grid gap-px border border-border">
												{#each decision.trace.exploitAdjustments as adjustment (`${adjustment.title}-${adjustment.targetAction}`)}
													<div class="bg-background p-3">
														<div class="mb-1 flex items-center justify-between gap-2">
															<p
																class="text-[10px] tracking-widest text-muted-foreground uppercase"
															>
																{adjustment.title}
															</p>
															<p class="font-mono-nums text-[10px] text-primary">
																{fmt(adjustment.delta)}
															</p>
														</div>
														<p class="text-[11px] leading-relaxed text-muted-foreground">
															{adjustment.detail}
														</p>
													</div>
												{/each}
											</div>
										{/if}
										<div class="grid gap-px border border-border md:grid-cols-2">
											{#each decision.trace.options as option (`${option.type}-${option.amount}`)}
												<div class="bg-background p-3">
													<div class="mb-1 flex items-center justify-between gap-2">
														<p class="text-[10px] tracking-widest text-muted-foreground uppercase">
															{option.type}{option.amount ? ` ${fmt(option.amount)}` : ''}
														</p>
														<p class="font-mono-nums text-[10px] text-foreground">
															{pct(option.probability)}
														</p>
													</div>
													<p class="text-[11px] text-muted-foreground">
														base {fmt(option.baselineUtility)} · adj {fmt(option.adjustedUtility)}
													</p>
												</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center p-10">
				<div class="max-w-xs text-center">
					<p class="mb-3 text-[10px] tracking-widest text-muted-foreground uppercase">
						No reviews yet
					</p>
					<p class="text-xs leading-relaxed text-muted-foreground">
						Complete hands in the training room to populate this report.
					</p>
					<Button href="/play" class="mt-6 h-8 text-xs tracking-wider">Go to training →</Button>
				</div>
			</div>
		{/if}
	</div>
</div>
