<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import {
		addDays,
		dayOfMonth,
		describeDate,
		monthShort,
		startOfWeek,
		today,
		weekdayShort
	} from '$lib/dates';
	import { planUrl } from '$lib/share';
	import { app } from '$lib/state.svelte';
	import type { Recipe } from '$lib/types';

	// Two weeks from the start of this week: long enough to plan ahead,
	// short enough to stay a single glance.
	let weekStart = $state(startOfWeek(today()));
	const days = $derived(Array.from({ length: 14 }, (_, i) => addDays(weekStart, i)));

	let picking = $state<string | null>(null);
	let search = $state('');
	let shareState = $state<'idle' | 'working' | 'done'>('idle');

	const plannedInView = $derived(
		app.meals.filter((m) => m.date >= days[0] && m.date <= days[days.length - 1])
	);

	/**
	 * Share the visible fortnight as a link.
	 *
	 * The payload sits in the URL fragment, so it never reaches a server —
	 * which is what lets two people share a plan while the app stays static
	 * and backend-free.
	 */
	async function sharePlan() {
		if (!plannedInView.length) return;
		shareState = 'working';
		try {
			const base = `${location.origin}${resolve('/share')}`;
			const url = await planUrl(base, $state.snapshot(plannedInView), $state.snapshot(app.recipes));

			if (navigator.share) {
				await navigator.share({ title: 'Meal plan', url });
			} else {
				await navigator.clipboard.writeText(url);
			}
			shareState = 'done';
			setTimeout(() => (shareState = 'idle'), 2000);
		} catch {
			// A cancelled share sheet is not an error worth reporting.
			shareState = 'idle';
		}
	}

	const matches = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const pool = app.recipes;
		if (!q) return pool.slice(0, 40);
		return pool
			.filter((r) => r.name.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q)))
			.slice(0, 40);
	});

	async function schedule(recipe: Recipe) {
		if (!picking) return;
		await app.addMeal(recipe.id, picking);
		picking = null;
		search = '';
	}
</script>

<header class="head">
	<div class="spread">
		<h1>Plan</h1>
		<button
			class="btn btn-ghost"
			onclick={sharePlan}
			disabled={!plannedInView.length || shareState === 'working'}
		>
			<Icon name={shareState === 'done' ? 'check' : 'share'} size={18} />
			<span class="share-label">{shareState === 'done' ? 'Copied' : 'Share'}</span>
		</button>
	</div>

	<div class="spread">
		<button
			class="btn btn-ghost"
			onclick={() => (weekStart = addDays(weekStart, -7))}
			aria-label="Previous week"><Icon name="chevronLeft" /></button
		>
		<button class="btn btn-quiet" onclick={() => (weekStart = startOfWeek(today()))}>Today</button>
		<button
			class="btn btn-ghost"
			onclick={() => (weekStart = addDays(weekStart, 7))}
			aria-label="Next week"><Icon name="chevronRight" /></button
		>
	</div>
</header>

{#if !app.ready}
	<p class="empty">Loading your plan…</p>
{:else if !app.recipes.length}
	<div class="empty">
		<Icon name="book" size={32} />
		<h2>No recipes yet</h2>
		<p class="measure">
			Import a recipe pack or add one by hand, then you can start planning meals and building a
			shopping list.
		</p>
		<a class="btn btn-primary btn-lg" href={resolve('/settings')}>Import recipes</a>
	</div>
{:else}
	<ol class="days">
		{#each days as date (date)}
			{@const meals = app.mealsOn(date)}
			{@const isToday = date === today()}
			<li class:today={isToday}>
				<div class="date">
					<span class="dow">{weekdayShort(date)}</span>
					<span class="dom num">{dayOfMonth(date)}</span>
					{#if dayOfMonth(date) === 1 || date === days[0]}
						<span class="mon">{monthShort(date)}</span>
					{/if}
				</div>

				<div class="slot">
					{#each meals as meal (meal.id)}
						{@const recipe = app.recipe(meal.recipeId)}
						{#if recipe}
							{@const isCarryOver = meal.date !== date}
							<div class="meal" class:carry={isCarryOver}>
								<a href={resolve(`/recipes/${recipe.id}`)} class="meal-name">{recipe.name}</a>
								{#if isCarryOver}
									<span class="faint">leftovers</span>
								{:else}
									{#if meal.duration > 1}
										<span class="faint">{meal.duration} days</span>
									{/if}
									<button
										class="btn btn-ghost remove"
										onclick={() => app.removeMeal(meal.id)}
										aria-label="Remove {recipe.name} from {describeDate(date)}"
									>
										<Icon name="x" size={16} />
									</button>
								{/if}
							</div>
						{/if}
					{/each}

					<button class="add" onclick={() => (picking = date)}>
						<Icon name="plus" size={16} />
						<span class="visually-hidden">Add a meal on {describeDate(date)}</span>
					</button>
				</div>
			</li>
		{/each}
	</ol>
{/if}

<Sheet open={picking !== null} title={picking ? `Add a meal — ${describeDate(picking)}` : ''}>
	<div class="stack">
		<div class="search">
			<Icon name="search" size={18} />
			<input
				class="input"
				type="search"
				placeholder="Search recipes"
				bind:value={search}
				autocomplete="off"
			/>
		</div>

		{#if !matches.length}
			<p class="muted">No recipes match “{search}”.</p>
		{:else}
			<ul class="picker">
				{#each matches as recipe (recipe.id)}
					<li>
						<button onclick={() => schedule(recipe)}>
							<span class="pick-name">{recipe.name}</span>
							<span class="faint">{recipe.defaultDuration} days · {recipe.category}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Sheet>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-4) var(--s-4) var(--s-3);
	}

	.share-label {
		font-size: var(--t-sm);
	}

	.days {
		list-style: none;
		margin: 0;
		padding: 0 var(--s-4) var(--s-5);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.days li {
		display: flex;
		gap: var(--s-3);
		padding: var(--s-3) 0;
		border-top: 1px solid var(--border);
	}

	/* Today is marked with a rule and weight rather than a fill: the accent
	   colour is reserved for things you can act on. */
	.days li.today .dom {
		color: var(--accent);
		font-weight: 700;
	}

	.days li.today {
		border-top-color: var(--accent);
	}

	.date {
		flex: none;
		width: 44px;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.1;
		padding-top: 2px;
	}

	.dow {
		font-size: var(--t-xs);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.dom {
		font-size: var(--t-xl);
		font-weight: 600;
	}

	.mon {
		font-size: var(--t-xs);
		color: var(--text-faint);
		text-transform: uppercase;
	}

	.slot {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2);
		min-height: var(--tap);
		/* Without this a long recipe name sets the flex basis and pushes the
		   whole row past the viewport instead of ellipsising. */
		min-width: 0;
	}

	.meal {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		min-width: 0;
		max-width: 100%;
	}

	/* A day covered by yesterday's cooking is real information — it is why
	   that day looks free but is not — so it is shown, just recessed. */
	.meal.carry {
		background: transparent;
		border-style: dashed;
		color: var(--text-muted);
	}

	.meal-name {
		color: inherit;
		text-decoration: none;
		font-weight: 500;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove {
		min-height: 32px;
		color: var(--text-faint);
	}

	.add {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--r-md);
		background: transparent;
		color: var(--text-faint);
		cursor: pointer;
		transition: transform var(--d-instant) var(--ease-out);
	}

	.add:active {
		transform: scale(0.94);
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		color: var(--text-faint);
	}

	.picker {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.picker button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		min-height: var(--tap-lg);
		padding: var(--s-2) var(--s-1);
		background: none;
		border: none;
		border-bottom: 1px solid var(--border);
		text-align: left;
		cursor: pointer;
	}

	.pick-name {
		font-weight: 500;
	}

	@media (min-width: 768px) {
		.head,
		.days {
			max-width: 760px;
			margin-inline: auto;
		}
	}
</style>
