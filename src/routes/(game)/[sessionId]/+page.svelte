<script lang="ts">
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';

	let { data }: PageProps = $props();

	const progressPct = $derived(
		data.session.totalHands > 0
			? Math.round((data.reviews.length / data.session.totalHands) * 100)
			: 0
	);

	const gradeColor = (g: number) =>
		g >= 75 ? 'text-emerald-400' : g >= 60 ? 'text-primary' : 'text-destructive';
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
			{#each [{ label: 'Hands', value: `${data.reviews.length}/${data.session.totalHands}` }, { label: 'Focus', value: data.session.focus }, { label: 'Difficulty', value: data.session.difficulty }, { label: 'Status', value: data.session.status }] as stat (stat.label)}
				<div class="bg-card px-5 py-3">
					<p class="mb-0.5 text-[10px] tracking-widest text-muted-foreground uppercase">
						{stat.label}
					</p>
					<p class="text-xs font-semibold text-foreground">{stat.value}</p>
				</div>
			{/each}
		</div>

		<div class="border-b border-border p-5">
			<div class="mb-2 flex justify-between text-[10px] text-muted-foreground">
				<span>Completion</span>
				<span>{progressPct}%</span>
			</div>
			<Progress value={progressPct} class="h-0.5" />
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

						<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{review.summary}</p>

						<!-- Strengths / Mistakes / Line -->
						<div class="mb-5 grid gap-px border border-border md:grid-cols-3">
							<div class="bg-card p-4">
								<p class="mb-3 text-[10px] tracking-widest text-emerald-400 uppercase">Strengths</p>
								<ul class="grid gap-1.5">
									{#each review.strengths as item (item)}
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
									{#each review.mistakes as item (item)}
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
									{#each review.recommendedLine as item (item)}
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
														<p class="text-[11px] leading-relaxed text-muted-foreground">
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
