<script lang="ts">
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';

	let { data, form }: PageProps = $props();
</script>

<div
	class="mx-auto grid min-h-[calc(100vh-44px)] w-full max-w-6xl gap-px px-4 py-6 md:px-8 md:py-8 lg:grid-cols-[360px_1fr] lg:px-12"
>
	<aside class="border-r border-border p-6 md:p-8">
		<p class="mb-2 text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">Profile</p>
		<h1 class="mb-5 text-2xl font-bold tracking-tight text-foreground">Account settings</h1>

		{#if data.updated}
			<div
				class="mb-4 border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
			>
				Profile updated.
			</div>
		{/if}

		{#if form?.message}
			<div
				class="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
			>
				{form.message}
			</div>
		{/if}

		<form
			method="POST"
			action="?/updateProfile"
			class="grid gap-4 border border-border bg-card p-4"
		>
			<label class="grid gap-2">
				<span class="text-[10px] tracking-widest text-muted-foreground uppercase">Name</span>
				<input
					type="text"
					name="name"
					value={data.user.name}
					class="h-9 border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
					required
				/>
			</label>

			<label class="grid gap-2">
				<span class="text-[10px] tracking-widest text-muted-foreground uppercase">Email</span>
				<input
					type="email"
					name="email"
					value={data.user.email}
					class="h-9 border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
					required
				/>
			</label>

			<Button type="submit" class="h-9 text-xs tracking-wider">Save changes</Button>
		</form>
	</aside>

	<div class="p-6 md:p-8">
		<div class="mb-6 flex flex-wrap items-center gap-2">
			<p class="text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">Poker profile</p>
			{#each data.pokerProfile.tags as tag (tag)}
				<Badge variant="outline" class="text-[10px] uppercase">{tag}</Badge>
			{/each}
		</div>

		<div class="mb-6 grid gap-px border border-border md:grid-cols-4">
			{#each [{ label: 'Sessions', value: data.pokerProfile.totalSessions }, { label: 'Completed', value: data.pokerProfile.completedSessions }, { label: 'Reviewed hands', value: data.pokerProfile.reviewedHands }, { label: 'Avg grade', value: data.pokerProfile.averageGrade ?? '—' }] as stat (stat.label)}
				<div class="bg-card p-4">
					<p class="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">
						{stat.label}
					</p>
					<p class="font-mono-nums text-2xl font-bold text-foreground">{stat.value}</p>
				</div>
			{/each}
		</div>

		<div class="mb-6 grid gap-px border border-border md:grid-cols-2">
			<div class="bg-card p-4">
				<p class="mb-3 text-[10px] tracking-widest text-emerald-400 uppercase">Strengths</p>
				<ul class="grid gap-1.5">
					{#each data.pokerProfile.strengths as item (item)}
						<li
							class="text-[11px] leading-relaxed text-muted-foreground before:text-emerald-400 before:content-['+_']"
						>
							{item}
						</li>
					{/each}
				</ul>
			</div>
			<div class="border-t border-border bg-card p-4 md:border-t-0 md:border-l md:border-border">
				<p class="mb-3 text-[10px] tracking-widest text-destructive uppercase">Weaknesses</p>
				<ul class="grid gap-1.5">
					{#each data.pokerProfile.weaknesses as item (item)}
						<li
							class="text-[11px] leading-relaxed text-muted-foreground before:text-destructive before:content-['−_']"
						>
							{item}
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="border border-border bg-card p-4">
			<p class="mb-3 text-[10px] tracking-widest text-primary uppercase">Tendencies</p>
			<ul class="grid gap-2">
				{#each data.pokerProfile.tendencies as item (item)}
					<li class="text-[11px] leading-relaxed text-muted-foreground">{item}</li>
				{/each}
			</ul>
		</div>
	</div>
</div>
