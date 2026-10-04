<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { describeDate } from '$lib/dates';
	import { decodePlan, type SharedPlan } from '$lib/share';
	import { app } from '$lib/state.svelte';

	let plan = $state<SharedPlan | null>(null);
	let error = $state('');
	let applied = $state<{ meals: number; recipes: number } | null>(null);
	let working = $state(false);

	onMount(async () => {
		// The payload rides in the fragment, which is never sent to the server.
		const payload = location.hash.slice(1);
		if (!payload) {
			error = 'This link has no plan attached.';
			return;
		}
		try {
			plan = await decodePlan(payload);
		} catch (e) {
			error = e instanceof Error ? e.message : 'This link could not be read.';
		}
	});

	const newRecipes = $derived.by(() => {
		if (!plan) return [];
		const have = new Set(app.recipes.map((r) => r.id));
		return plan.recipes.filter((r) => !have.has(r.id));
	});

	async function accept() {
		if (!plan) return;
		working = true;
		try {
			// Recipes first, so no meal is ever left pointing at nothing.
			await app.importPack({ version: 1, name: 'Shared plan', recipes: plan.recipes });
			for (const m of plan.meals) {
				await app.addMeal(m.r, m.d, m.n);
				if (m.x?.length) {
					const added = app.meals[app.meals.length - 1];
					await app.updateMeal(added.id, { excluded: m.x });
				}
			}
			applied = { meals: plan.meals.length, recipes: newRecipes.length };
		} finally {
			working = false;
		}
	}
</script>

<header class="head"><h1>Shared plan</h1></header>

{#if error}
	<div class="empty">
		<Icon name="alert" size={32} />
		<p class="measure">{error}</p>
		<a class="btn btn-quiet" href={resolve('/')}>Go to my plan</a>
	</div>
{:else if applied}
	<div class="empty">
		<Icon name="check" size={32} />
		<h2>Added to your plan</h2>
		<p class="measure">
			{applied.meals} meals{applied.recipes ? ` and ${applied.recipes} new recipes` : ''} are now yours.
			Your shopping list has been updated.
		</p>
		<a class="btn btn-primary btn-lg" href={resolve('/shopping')}>See the shopping list</a>
	</div>
{:else if !plan}
	<p class="empty">Reading the link…</p>
{:else}
	<section class="block">
		<p class="measure muted">
			{plan.by ? `${plan.by} shared` : 'Someone shared'} a plan of {plan.meals.length} meals. Nothing
			is added until you accept.
		</p>

		<ul class="rows">
			{#each plan.meals as meal, i (i)}
				{@const recipe = plan.recipes.find((r) => r.id === meal.r)}
				<li>
					<span class="when faint">{describeDate(meal.d)}</span>
					<span class="what">{recipe?.name ?? 'Unknown recipe'}</span>
					{#if meal.n > 1}<span class="faint num">{meal.n}d</span>{/if}
				</li>
			{/each}
		</ul>

		<p class="faint measure">
			{newRecipes.length} of these recipes are new to your library; the rest you already have.
		</p>

		<div class="row">
			<button class="btn btn-primary btn-lg" onclick={accept} disabled={working}>
				{working ? 'Adding…' : 'Add to my plan'}
			</button>
			<a class="btn btn-quiet" href={resolve('/')}>No thanks</a>
		</div>
	</section>
{/if}

<style>
	.head {
		padding: var(--s-4);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: 0 var(--s-4) var(--s-5);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.rows li {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		padding: var(--s-2) 0;
		border-top: 1px solid var(--border);
	}

	.when {
		flex: none;
		width: 7em;
	}

	.what {
		flex: 1;
		font-weight: 500;
	}

	@media (min-width: 768px) {
		.head,
		.block {
			max-width: 760px;
			margin-inline: auto;
		}
	}
</style>
