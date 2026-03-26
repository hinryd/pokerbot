<script lang="ts">
	import { Button } from '$lib/components/ui/button';
</script>

<div
	class="mx-auto flex min-h-[calc(100vh-44px)] w-full max-w-4xl flex-col px-4 py-6 md:px-8 md:py-8 lg:px-12"
>
	<div class="mb-8">
		<p class="mb-2 text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">Pricing</p>
		<h1 class="mb-3 text-3xl font-bold tracking-tight text-foreground">Simple plans</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">
			Choose the plan that fits your training pace. Both plans use the same deterministic review
			core.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="border border-border bg-card p-6">
			<p class="mb-2 text-[10px] tracking-widest text-muted-foreground uppercase">Free</p>
			<p class="mb-4 text-3xl font-bold text-foreground">$0</p>
			<ul class="mb-6 grid gap-2 text-sm text-muted-foreground">
				<li>• Heads-up training sessions</li>
				<li>• Deterministic hand and decision grading</li>
				<li>• Session review page with full decision context</li>
			</ul>
			<Button href="/play" class="h-9 w-full text-xs tracking-wider">Start free</Button>
		</div>

		<div class="border border-primary/40 bg-primary/5 p-6">
			<p class="mb-2 text-[10px] tracking-widest text-primary uppercase">Plus</p>
			<p class="mb-4 text-3xl font-bold text-foreground">
				$10<span class="text-sm text-muted-foreground">/mo</span>
			</p>
			<ul class="mb-6 grid gap-2 text-sm text-muted-foreground">
				<li>• Everything in Free</li>
				<li>• Priority access to upcoming advanced bot profiles</li>
				<li>• Early access to deeper profiling and review tools</li>
			</ul>
			<Button href="/play" variant="outline" class="h-9 w-full text-xs tracking-wider">
				Choose plus
			</Button>
		</div>
	</div>
</div>
