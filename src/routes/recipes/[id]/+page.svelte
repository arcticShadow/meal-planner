<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeImage from '$lib/components/RecipeImage.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { addDays, describeDate, today } from '$lib/dates';
	import { app } from '$lib/state.svelte';
	import { formatQuantity } from '$lib/units';

	const recipe = $derived(app.recipe(page.params.id ?? ''));

	let scheduling = $state(false);
	let chosenDate = $state(today());
	let duration = $state(2);
	let renaming = $state(false);
	let newName = $state('');
	let confirmingDelete = $state(false);
	let showingCard = $state(false);

	// Steps arrive flat with a heading on the first of each section; regroup
	// them so a section reads as one block while cooking.
	const sections = $derived.by(() => {
		if (!recipe) return [];
		const out: { heading: string | null; steps: string[] }[] = [];
		for (const step of recipe.instructions) {
			if (step.heading || !out.length) out.push({ heading: step.heading ?? null, steps: [] });
			out[out.length - 1].steps.push(step.text);
		}
		return out;
	});

	const upcoming = $derived(
		recipe ? app.meals.filter((m) => m.recipeId === recipe.id && m.date >= today()) : []
	);

	function openScheduler() {
		chosenDate = app.nextFreeDate();
		duration = recipe?.defaultDuration ?? 2;
		scheduling = true;
	}

	async function confirmSchedule() {
		if (!recipe) return;
		await app.addMeal(recipe.id, chosenDate, duration);
		scheduling = false;
	}

	async function rename() {
		if (!recipe || !newName.trim()) return;
		await app.updateRecipe(recipe.id, { name: newName.trim(), needsReview: false });
		renaming = false;
	}
</script>

{#if !app.ready}
	<p class="empty">Loading…</p>
{:else if !recipe}
	<div class="empty">
		<h2>Recipe not found</h2>
		<a class="btn btn-quiet" href={resolve('/recipes')}>Back to recipes</a>
	</div>
{:else}
	<article>
		{#if recipe.images?.hero}
			<RecipeImage images={recipe.images} variant="hero" alt={recipe.name} eager />
		{/if}

		<header class="head">
			<a class="back" href={resolve('/recipes')}>
				<Icon name="chevronLeft" size={18} /> Recipes
			</a>

			<h1>{recipe.name}</h1>

			{#if recipe.needsReview}
				<!--
					This recipe's title could not be read off the scan, so the
					name above was inferred from its ingredients. Say so plainly
					rather than presenting a guess as fact.
				-->
				<div class="notice">
					<Icon name="alert" size={16} />
					<p>
						The title on this scan could not be read, so this name was guessed from the ingredients.
						<button
							class="link"
							onclick={() => {
								newName = recipe.name;
								renaming = true;
							}}
						>
							Set the real name
						</button>
					</p>
				</div>
			{/if}

			{#if recipe.description}
				<p class="muted measure">{recipe.description}</p>
			{/if}

			<p class="faint num">
				Serves {recipe.servings} · covers {recipe.defaultDuration} days · {recipe.category}
			</p>

			{#if recipe.tags.length}
				<div class="scroller tags">
					{#each recipe.tags.slice(0, 12) as tag (tag)}
						<span class="chip" aria-disabled="true">{tag}</span>
					{/each}
				</div>
			{/if}

			<div class="row">
				<button class="btn btn-primary btn-lg" onclick={openScheduler}>
					<Icon name="plus" size={18} /> Plan this
				</button>
			</div>

			{#if upcoming.length}
				<p class="faint">
					Planned for {upcoming.map((m) => describeDate(m.date)).join(', ')}
				</p>
			{/if}
		</header>

		<section class="block">
			<h2>Ingredients</h2>
			<ul class="ingredients">
				{#each recipe.ingredients as ingredient, i (i)}
					<li>
						<span class="qty num">
							{formatQuantity(ingredient.amount, ingredient.unit) || ''}
						</span>
						<span>
							<!-- Kept on one line: a newline here renders as a space, which
							     puts a gap before the comma ("carrot , grated"). -->
							{ingredient.name}{#if ingredient.prep}<span class="faint">, {ingredient.prep}</span
								>{/if}
							{#if ingredient.amount === null && ingredient.note}
								<span class="faint"> — {ingredient.note}</span>
							{/if}
							{#if ingredient.approx}<span class="faint"> (approx)</span>{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="block">
			<h2>Method</h2>
			{#each sections as section, i (i)}
				{#if section.heading}
					<h3 class="section-head">{section.heading}</h3>
				{/if}
				<ol class="steps measure">
					{#each section.steps as step, j (j)}
						<li>{step}</li>
					{/each}
				</ol>
			{/each}
		</section>

		{#if recipe.images?.card}
			<section class="block">
				<!--
					The printed card, behind a toggle. It is the authority when an
					extraction looks wrong, which matters most for the recipes
					flagged above — but it is also a 100KB image that most visits
					have no need to load.
				-->
				<button
					class="btn btn-quiet"
					aria-expanded={showingCard}
					onclick={() => (showingCard = !showingCard)}
				>
					{showingCard ? 'Hide' : 'Show'} the original card
				</button>
				{#if showingCard}
					<RecipeImage
						images={recipe.images}
						variant="card"
						alt="Scan of the printed recipe card"
					/>
				{/if}
			</section>
		{/if}

		<section class="block danger">
			<a class="btn btn-quiet" href={resolve(`/recipes/new?edit=${recipe.id}`)}>Edit recipe</a>
			<button class="btn btn-danger" onclick={() => (confirmingDelete = true)}>
				<Icon name="trash" size={16} /> Delete recipe
			</button>
		</section>
	</article>

	<Sheet bind:open={scheduling} title="Plan {recipe.name}">
		<div class="stack">
			<div class="field">
				<label for="when">Day</label>
				<input id="when" class="input" type="date" bind:value={chosenDate} />
				<p class="faint">{describeDate(chosenDate)}</p>
			</div>
			<div class="field">
				<label for="days">Covers</label>
				<div class="scroller">
					{#each [1, 2, 3, 4] as n (n)}
						<button class="chip" aria-pressed={duration === n} onclick={() => (duration = n)}>
							{n}
							{n === 1 ? 'day' : 'days'}
						</button>
					{/each}
				</div>
				<p class="faint">
					Through to {describeDate(addDays(chosenDate, duration - 1))}
				</p>
			</div>
		</div>
		{#snippet footer()}
			<button class="btn btn-primary" onclick={confirmSchedule}>Add to plan</button>
		{/snippet}
	</Sheet>

	<Sheet bind:open={renaming} title="Name this recipe">
		<div class="field">
			<label for="rename">Name</label>
			<input id="rename" class="input" bind:value={newName} />
		</div>
		{#snippet footer()}
			<button class="btn btn-primary" onclick={rename}>Save</button>
		{/snippet}
	</Sheet>

	<Sheet bind:open={confirmingDelete} title="Delete {recipe.name}?">
		<p class="measure">
			This removes the recipe and any planned meals using it. It cannot be undone.
		</p>
		{#snippet footer()}
			<button class="btn btn-quiet" onclick={() => (confirmingDelete = false)}>Keep</button>
			<button
				class="btn btn-danger"
				onclick={async () => {
					await app.deleteRecipe(recipe.id);
					location.assign(resolve('/recipes'));
				}}>Delete</button
			>
		{/snippet}
	</Sheet>
{/if}

<style>
	article {
		padding-bottom: var(--s-5);
	}

	/* The hero is full-bleed on a phone but should not stretch across a wide
	   screen, where it would dwarf the text it belongs to. */
	article > :global(img.hero) {
		max-height: 42vh;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		padding: var(--s-4);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		margin-left: calc(-1 * var(--s-1));
		color: var(--text-muted);
		text-decoration: none;
		font-size: var(--t-sm);
		min-height: var(--tap);
	}

	.notice {
		display: flex;
		gap: var(--s-2);
		padding: var(--s-3);
		background: var(--warn-wash);
		color: var(--warn);
		border-radius: var(--r-md);
		font-size: var(--t-sm);
	}

	.link {
		background: none;
		border: none;
		padding: 0;
		color: inherit;
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}

	.tags {
		margin: 0 calc(-1 * var(--s-4));
		padding: 0 var(--s-4);
	}

	.block {
		padding: var(--s-5) var(--s-4) 0;
	}

	.block h2 {
		margin-bottom: var(--s-3);
	}

	.ingredients {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.ingredients li {
		display: grid;
		grid-template-columns: minmax(5.5ch, auto) 1fr;
		gap: var(--s-3);
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.qty {
		font-weight: 600;
		text-align: right;
	}

	.section-head {
		margin: var(--s-4) 0 var(--s-2);
		font-size: var(--t-sm);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}

	/* Numbers run continuously across sections, so a cook can say "I'm on
	   step 9" rather than "step 3 of the third bit". */
	.steps {
		margin: 0;
		padding-left: 1.4em;
		counter-reset: none;
	}

	.steps li {
		padding: var(--s-2) 0;
		line-height: var(--lh-body);
	}

	.steps li::marker {
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.danger {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-top: var(--s-6);
	}

	@media (min-width: 768px) {
		.head,
		.block {
			max-width: 760px;
			margin-inline: auto;
		}

		article > :global(img.hero) {
			max-width: 760px;
			margin-inline: auto;
			border-radius: var(--r-lg);
			margin-top: var(--s-4);
		}
	}
</style>
