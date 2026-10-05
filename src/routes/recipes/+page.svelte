<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeImage from '$lib/components/RecipeImage.svelte';
	import { app } from '$lib/state.svelte';

	let search = $state('');
	let activeTags = $state<string[]>([]);

	/*
	 * The library carries 300+ free-text tags, most used once. Offering all of
	 * them as filters would be noise, so only tags that actually divide the
	 * library are shown.
	 */
	const tagOptions = $derived.by(() => {
		// Plain Map on purpose: this is a scratch tally inside a derived
		// computation, not reactive state that anything observes.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const counts = new Map<string, number>();
		for (const recipe of app.recipes) {
			for (const tag of recipe.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
		return [...counts.entries()]
			.filter(([, n]) => n >= 5)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([tag]) => tag);
	});

	const results = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return app.recipes.filter((recipe) => {
			if (activeTags.length && !activeTags.every((t) => recipe.tags.includes(t))) return false;
			if (!q) return true;
			return (
				recipe.name.toLowerCase().includes(q) ||
				recipe.description.toLowerCase().includes(q) ||
				recipe.tags.some((t) => t.includes(q)) ||
				recipe.ingredients.some((i) => i.name.toLowerCase().includes(q))
			);
		});
	});

	function toggleTag(tag: string) {
		activeTags = activeTags.includes(tag)
			? activeTags.filter((t) => t !== tag)
			: [...activeTags, tag];
	}
</script>

<header class="head">
	<div class="spread">
		<h1>Recipes</h1>
		<div class="row">
			<span class="faint num">{results.length}</span>
			<a class="btn btn-quiet" href={resolve('/recipes/new')}>
				<Icon name="plus" size={16} /> New
			</a>
		</div>
	</div>

	<div class="search">
		<Icon name="search" size={18} />
		<input
			class="input"
			type="search"
			placeholder="Search name, tag or ingredient"
			bind:value={search}
			autocomplete="off"
		/>
	</div>

	{#if tagOptions.length}
		<div class="scroller tags">
			{#each tagOptions as tag (tag)}
				<button class="chip" aria-pressed={activeTags.includes(tag)} onclick={() => toggleTag(tag)}>
					{tag}
				</button>
			{/each}
		</div>
	{/if}
</header>

{#if !app.ready}
	<p class="empty">Loading…</p>
{:else if !app.recipes.length}
	<div class="empty">
		<Icon name="book" size={32} />
		<h2>Your library is empty</h2>
		<p class="measure">Import a pack of recipes, or add one by hand.</p>
		<div class="row">
			<a class="btn btn-primary btn-lg" href={resolve('/settings')}>Import recipes</a>
			<a class="btn btn-quiet btn-lg" href={resolve('/recipes/new')}>Add one</a>
		</div>
	</div>
{:else if !results.length}
	<div class="empty">
		<p>Nothing matches that.</p>
		<button
			class="btn btn-quiet"
			onclick={() => {
				search = '';
				activeTags = [];
			}}>Clear filters</button
		>
	</div>
{:else}
	<ul class="grid">
		{#each results as recipe (recipe.id)}
			<li>
				<a class="card tile" href={resolve(`/recipes/${recipe.id}`)}>
					<RecipeImage images={recipe.images} alt="" />
					<div class="body">
						<div class="spread">
							<h2>{recipe.name}</h2>
							{#if recipe.needsReview}
								<span class="badge badge-warn">
									<Icon name="alert" size={12} /> check
								</span>
							{/if}
						</div>
						{#if recipe.description}
							<p class="faint desc">{recipe.description}</p>
						{/if}
						<p class="faint meta num">
							{recipe.ingredients.length} ingredients · {recipe.instructions.length} steps · serves {recipe.servings}
						</p>
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		padding: var(--s-4);
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		color: var(--text-faint);
	}

	.tags {
		margin: 0 calc(-1 * var(--s-4));
		padding: 0 var(--s-4);
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0 var(--s-4) var(--s-5);
		display: grid;
		gap: var(--s-3);
	}

	.tile {
		display: flex;
		flex-direction: column;
		color: inherit;
		text-decoration: none;
		overflow: hidden;
		transition: transform var(--d-instant) var(--ease-out);
	}

	.tile .body {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-4);
		flex: 1;
	}

	.tile:active {
		transform: scale(0.99);
	}

	.tile h2 {
		font-size: var(--t-lg);
	}

	/* Descriptions vary from a line to a paragraph; clamping keeps the grid
	   scannable without hiding the name or the counts. */
	.desc {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.meta {
		margin-top: auto;
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		}
	}

	@media (min-width: 768px) {
		.head,
		.grid {
			max-width: 1000px;
			margin-inline: auto;
		}
	}
</style>
