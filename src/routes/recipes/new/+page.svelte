<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { app } from '$lib/state.svelte';
	import type { Ingredient, Recipe, UnitId } from '$lib/types';
	import { UNITS } from '$lib/units';

	/**
	 * Create or edit a recipe by hand.
	 *
	 * One route for both, because the form is identical and the only
	 * difference is whether there is something to load first. `?edit=<id>`
	 * switches it into edit mode.
	 */
	const editId = $derived(page.url.searchParams.get('edit'));
	const editing = $derived(editId ? app.recipe(editId) : undefined);

	let name = $state('');
	let description = $state('');
	let category = $state('Dinner');
	let servings = $state(4);
	let defaultDuration = $state(2);
	let tagText = $state('');
	let rows = $state<{ amount: string; unit: UnitId | ''; name: string }[]>([
		{ amount: '', unit: '', name: '' }
	]);
	let methodText = $state('');
	let loadedFrom = $state<string | null>(null);
	let saving = $state(false);
	let error = $state('');

	// Fill the form once the library has loaded and we know what we are editing.
	$effect(() => {
		const recipe = editing;
		if (!recipe || loadedFrom === recipe.id) return;
		loadedFrom = recipe.id;
		name = recipe.name;
		description = recipe.description;
		category = recipe.category;
		servings = recipe.servings;
		defaultDuration = recipe.defaultDuration;
		tagText = recipe.tags.join(', ');
		rows = recipe.ingredients.length
			? recipe.ingredients.map((i) => ({
					amount: i.amount === null ? '' : String(i.amount),
					unit: i.unit ?? '',
					name: i.prep ? `${i.name}, ${i.prep}` : i.name
				}))
			: [{ amount: '', unit: '', name: '' }];
		methodText = recipe.instructions.map((s) => s.text).join('\n');
	});

	function addRow() {
		rows = [...rows, { amount: '', unit: '', name: '' }];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, i) => i !== index);
		if (!rows.length) addRow();
	}

	function toIngredients(): Ingredient[] {
		return rows
			.filter((r) => r.name.trim())
			.map((r) => {
				// Mirror the importer: prep after the first comma, so a
				// hand-typed "carrot, diced" consolidates with an imported one.
				const raw = r.name.trim();
				const comma = raw.indexOf(',');
				const base = comma === -1 ? raw : raw.slice(0, comma).trim();
				const prep = comma === -1 ? undefined : raw.slice(comma + 1).trim() || undefined;

				const parsed = r.amount.trim() ? Number(r.amount) : NaN;
				const amount = Number.isFinite(parsed) ? parsed : null;

				return {
					name: base,
					amount,
					// An amount with no unit chosen is a bare count.
					unit: amount === null ? null : ((r.unit || 'piece') as UnitId),
					...(prep ? { prep } : {}),
					...(amount === null ? { note: 'to taste' as const } : {})
				};
			});
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim()) {
			error = 'Give the recipe a name.';
			return;
		}
		const ingredients = toIngredients();
		if (!ingredients.length) {
			error = 'Add at least one ingredient.';
			return;
		}

		saving = true;
		error = '';
		try {
			const fields: Omit<Recipe, 'id'> = {
				name: name.trim(),
				description: description.trim(),
				category: category.trim() || 'Dinner',
				tags: tagText
					.split(',')
					.map((t) => t.trim().toLowerCase())
					.filter(Boolean),
				servings: Number(servings) || 4,
				defaultDuration: Number(defaultDuration) || 2,
				ingredients,
				instructions: methodText
					.split('\n')
					.map((line) => line.trim())
					.filter(Boolean)
					.map((text) => ({ text })),
				images: []
			};

			if (editing) {
				await app.updateRecipe(editing.id, { ...fields, needsReview: false });
				location.assign(resolve(`/recipes/${editing.id}`));
			} else {
				const created = await app.addRecipe(fields);
				location.assign(resolve(`/recipes/${created.id}`));
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save.';
			saving = false;
		}
	}
</script>

<header class="head">
	<a class="back" href={resolve(editing ? `/recipes/${editing.id}` : '/recipes')}>
		<Icon name="chevronLeft" size={18} />
		{editing ? 'Cancel' : 'Recipes'}
	</a>
	<h1>{editing ? 'Edit recipe' : 'New recipe'}</h1>
</header>

<form class="body" onsubmit={save}>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<div class="field">
		<label for="r-name">Name</label>
		<input id="r-name" class="input" bind:value={name} placeholder="Chicken curry" />
	</div>

	<div class="field">
		<label for="r-desc">Description</label>
		<textarea id="r-desc" class="input" rows="2" bind:value={description}></textarea>
	</div>

	<div class="trio">
		<div class="field">
			<label for="r-cat">Category</label>
			<input id="r-cat" class="input" bind:value={category} />
		</div>
		<div class="field">
			<label for="r-serves">Serves</label>
			<input
				id="r-serves"
				class="input num"
				type="number"
				inputmode="numeric"
				min="1"
				bind:value={servings}
			/>
		</div>
		<div class="field">
			<label for="r-days">Covers (days)</label>
			<input
				id="r-days"
				class="input num"
				type="number"
				inputmode="numeric"
				min="1"
				bind:value={defaultDuration}
			/>
		</div>
	</div>

	<div class="field">
		<label for="r-tags">Tags</label>
		<input id="r-tags" class="input" bind:value={tagText} placeholder="quick, one pot, chicken" />
		<p class="faint">Separated by commas.</p>
	</div>

	<fieldset>
		<legend>Ingredients</legend>
		<ul class="rows">
			{#each rows as row, i (i)}
				<li>
					<input
						class="input num amount"
						type="text"
						inputmode="decimal"
						placeholder="600"
						aria-label="Amount for ingredient {i + 1}"
						bind:value={row.amount}
					/>
					<select class="input unit" aria-label="Unit for ingredient {i + 1}" bind:value={row.unit}>
						<option value="">—</option>
						{#each Object.keys(UNITS) as unit (unit)}
							<option value={unit}>{unit}</option>
						{/each}
					</select>
					<input
						class="input"
						placeholder="chicken breast, diced"
						aria-label="Ingredient {i + 1}"
						bind:value={row.name}
					/>
					<button
						type="button"
						class="btn btn-ghost"
						onclick={() => removeRow(i)}
						aria-label="Remove ingredient {i + 1}"
					>
						<Icon name="x" size={16} />
					</button>
				</li>
			{/each}
		</ul>
		<button type="button" class="btn btn-quiet" onclick={addRow}>
			<Icon name="plus" size={16} /> Add ingredient
		</button>
		<p class="faint">
			Leave the amount blank for anything measured to taste. Anything after a comma in the name is
			treated as preparation, so “carrot, diced” still combines with other carrots on the shopping
			list.
		</p>
	</fieldset>

	<div class="field">
		<label for="r-method">Method</label>
		<textarea id="r-method" class="input" rows="10" bind:value={methodText}></textarea>
		<p class="faint">One step per line.</p>
	</div>

	<div class="row">
		<button type="submit" class="btn btn-primary btn-lg" disabled={saving}>
			{saving ? 'Saving…' : editing ? 'Save changes' : 'Create recipe'}
		</button>
	</div>
</form>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
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

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: 0 var(--s-4) var(--s-6);
	}

	.error {
		padding: var(--s-3);
		border-radius: var(--r-md);
		background: var(--bad-wash);
		color: var(--bad);
		font-size: var(--t-sm);
	}

	.trio {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--s-3);
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		margin: 0;
		padding: var(--s-4) 0 0;
		border: none;
		border-top: 1px solid var(--border);
	}

	legend {
		padding: 0;
		font-size: var(--t-lg);
		font-weight: 600;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	/* Amount and unit are narrow and fixed; the name takes what is left. The
	   delete button sits outside the grid flow so rows stay aligned. */
	.rows li {
		display: grid;
		grid-template-columns: 4.5rem 6rem 1fr auto;
		gap: var(--s-2);
		align-items: center;
	}

	.amount,
	.unit {
		padding-inline: var(--s-2);
	}

	textarea {
		resize: vertical;
		line-height: var(--lh-body);
	}

	@media (min-width: 560px) {
		.trio {
			grid-template-columns: 2fr 1fr 1fr;
		}
	}

	@media (min-width: 768px) {
		.head,
		.body {
			max-width: 760px;
			margin-inline: auto;
		}
	}
</style>
