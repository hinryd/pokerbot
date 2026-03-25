<script lang="ts">
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';

	let { data, form }: PageProps = $props();
</script>

{#if !data.user}
	<div class="flex min-h-[calc(100vh-44px)] items-center justify-center p-4">
		<div class="w-full max-w-sm border border-border bg-card p-10 text-center">
			<p class="mb-4 text-[10px] tracking-widest text-primary uppercase">Protected</p>
			<h1 class="mb-3 text-xl font-bold text-foreground">Sign in to train</h1>
			<p class="mb-6 text-xs text-muted-foreground">Sessions are saved to your account.</p>
			<Button href="/login" class="h-9 w-full text-xs tracking-wider">Go to sign in</Button>
		</div>
	</div>
{:else}
	<div
		class="mx-auto grid min-h-[calc(100vh-44px)] max-w-screen-xl gap-px lg:grid-cols-[1fr_320px]"
	>
		<div class="border-r border-border p-6 md:p-8">
			<div class="mb-6 flex items-start justify-between">
				<div>
					<p class="mb-2 text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">
						New session
					</p>
					<h1 class="text-2xl font-bold tracking-tight text-foreground">
						Configure training block
					</h1>
				</div>
				<span class="border border-border px-2 py-1 text-[11px] text-muted-foreground"
					>{data.user.email}</span
				>
			</div>

			{#if form?.message}
				<div
					class="mb-5 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{form.message}
				</div>
			{/if}

			<form method="POST" action="?/start" class="grid gap-7">
				<div>
					<p
						class="mb-3 text-[10px] font-semibold tracking-[0.3em] text-muted-foreground uppercase"
					>
						Table config
					</p>
					<div class="grid gap-px border border-border md:grid-cols-3">
						<label class="cursor-pointer bg-card p-4">
							<span class="mb-2 block text-[10px] tracking-widest text-muted-foreground uppercase"
								>Hands</span
							>
							<select
								name="totalHands"
								class="w-full cursor-pointer bg-transparent text-sm font-semibold text-foreground outline-none"
							>
								{#each data.sessionPresets.handCounts as value (value)}
									<option
										{value}
										selected={value === data.defaultSessionInput.totalHands}
										class="bg-card">{value} hands</option
									>
								{/each}
							</select>
						</label>
						<label
							class="cursor-pointer border-t border-border bg-card p-4 md:border-t-0 md:border-r md:border-l md:border-border"
						>
							<span class="mb-2 block text-[10px] tracking-widest text-muted-foreground uppercase"
								>Starting stack</span
							>
							<select
								name="startingStack"
								class="w-full cursor-pointer bg-transparent text-sm font-semibold text-foreground outline-none"
							>
								{#each data.sessionPresets.startingStacks as value (value)}
									<option
										{value}
										selected={value === data.defaultSessionInput.startingStack}
										class="bg-card">{value} bb</option
									>
								{/each}
							</select>
						</label>
						<label class="cursor-pointer border-t border-border bg-card p-4 md:border-t-0">
							<span class="mb-2 block text-[10px] tracking-widest text-muted-foreground uppercase"
								>Big blind</span
							>
							<select
								name="bigBlind"
								class="w-full cursor-pointer bg-transparent text-sm font-semibold text-foreground outline-none"
							>
								{#each data.sessionPresets.bigBlinds as value (value)}
									<option
										{value}
										selected={value === data.defaultSessionInput.bigBlind}
										class="bg-card">{value} chips</option
									>
								{/each}
							</select>
						</label>
					</div>
				</div>

				<div>
					<p
						class="mb-3 text-[10px] font-semibold tracking-[0.3em] text-muted-foreground uppercase"
					>
						Bot difficulty
					</p>
					<div class="grid gap-px border border-border">
						{#each data.difficultyOptions as option (option.value)}
							<label
								class="relative cursor-pointer bg-card p-4 transition-colors has-[:checked]:border-l-2 has-[:checked]:border-l-primary has-[:checked]:bg-primary/5"
							>
								<input
									class="sr-only"
									type="radio"
									name="difficulty"
									value={option.value}
									checked={option.value === data.defaultSessionInput.difficulty}
								/>
								<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<p class="text-xs font-semibold text-foreground">{option.label}</p>
										<p class="mt-0.5 text-[11px] text-muted-foreground">{option.adaptation}</p>
									</div>
									<span
										class="self-start border border-border px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground"
										>{option.summary}</span
									>
								</div>
							</label>
						{/each}
					</div>
				</div>

				<div>
					<p
						class="mb-3 text-[10px] font-semibold tracking-[0.3em] text-muted-foreground uppercase"
					>
						Training focus
					</p>
					<div class="grid gap-px border border-border md:grid-cols-2">
						{#each data.trainingFocusOptions as focus (focus.value)}
							<label
								class="cursor-pointer bg-card p-4 transition-colors has-[:checked]:border-l-2 has-[:checked]:border-l-primary has-[:checked]:bg-primary/5"
							>
								<input
									class="sr-only"
									type="radio"
									name="focus"
									value={focus.value}
									checked={focus.value === data.defaultSessionInput.focus}
								/>
								<p class="mb-1 text-xs font-semibold text-foreground">{focus.label}</p>
								<p class="text-[11px] leading-relaxed text-muted-foreground">{focus.detail}</p>
							</label>
						{/each}
					</div>
				</div>

				<div>
					<Button type="submit" class="h-9 px-6 text-xs tracking-wider">Start session →</Button>
				</div>
			</form>
		</div>

		<aside class="flex flex-col">
			<div class="border-b border-border p-5">
				<p class="mb-4 text-[10px] font-semibold tracking-[0.3em] text-muted-foreground uppercase">
					Recent sessions
				</p>
				{#if data.recentSessions.length}
					<div class="grid gap-px">
						{#each data.recentSessions as session (session.id)}
							<a
								href={`/${session.id}`}
								class="group flex items-center justify-between gap-3 bg-card p-3 transition-colors hover:bg-accent"
							>
								<div class="min-w-0">
									<p class="mb-1 text-[10px] text-muted-foreground">
										{session.difficulty} · {session.focus}
									</p>
									<p class="truncate text-xs font-medium text-foreground">
										{session.progressLabel}
									</p>
								</div>
								<div class="shrink-0 text-right">
									<p class="text-[10px] text-muted-foreground">Grade</p>
									<p class="font-mono-nums text-sm font-bold text-primary">
										{session.overallGrade ?? '—'}
									</p>
								</div>
							</a>
						{/each}
					</div>
				{:else}
					<p
						class="border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
					>
						No sessions yet.
					</p>
				{/if}
			</div>
		</aside>
	</div>
{/if}
