<script lang="ts">
	import { asset } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { app } from '$lib/state.svelte';
	import type { Backup, RecipePack } from '$lib/types';

	/**
	 * Packs the app knows about. The library ships empty on purpose — a meal
	 * planner that arrives pre-filled with someone else's recipes is somebody
	 * else's app — so this is an offer, never an automatic load.
	 */
	const BUILT_IN = [
		{
			id: 'my-food-bag',
			name: 'My Food Bag archive',
			detail: '227 recipes from scanned recipe cards',
			url: asset('/packs/my-food-bag.json')
		}
	];

	let busy = $state('');
	let message = $state<{ kind: 'ok' | 'bad'; text: string } | null>(null);
	let confirmingErase = $state(false);
	let theme = $state<'system' | 'light' | 'dark'>('system');

	$effect(() => {
		const stored = localStorage.getItem('theme');
		if (stored === 'light' || stored === 'dark') theme = stored;
	});

	function applyTheme(next: 'system' | 'light' | 'dark') {
		theme = next;
		if (next === 'system') {
			document.documentElement.removeAttribute('data-theme');
			localStorage.removeItem('theme');
		} else {
			document.documentElement.setAttribute('data-theme', next);
			localStorage.setItem('theme', next);
		}
	}

	function report(kind: 'ok' | 'bad', text: string) {
		message = { kind, text };
		setTimeout(() => (message = null), 5000);
	}

	async function importBuiltIn(pack: (typeof BUILT_IN)[number]) {
		busy = pack.id;
		try {
			const response = await fetch(pack.url);
			if (!response.ok) throw new Error(`Could not fetch the pack (${response.status})`);
			const data = (await response.json()) as RecipePack;
			const { added, skipped } = await app.importPack(data);
			report(
				'ok',
				skipped
					? `Added ${added} recipes. ${skipped} were already in your library.`
					: `Added ${added} recipes.`
			);
		} catch (error) {
			report('bad', error instanceof Error ? error.message : 'Import failed');
		} finally {
			busy = '';
		}
	}

	async function importFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		busy = 'file';
		try {
			const data = JSON.parse(await file.text());
			// One picker for both shapes: a pack adds recipes, a backup
			// replaces everything. Telling them apart beats making the user
			// remember which button to press.
			if (Array.isArray(data.meals) && Array.isArray(data.recipes)) {
				await app.restore(data as Backup);
				report('ok', `Restored ${data.recipes.length} recipes and ${data.meals.length} meals.`);
			} else if (Array.isArray(data.recipes)) {
				const { added, skipped } = await app.importPack(data as RecipePack);
				report('ok', `Added ${added} recipes.${skipped ? ` ${skipped} already present.` : ''}`);
			} else {
				throw new Error('That file is not a recipe pack or a backup');
			}
		} catch (error) {
			report('bad', error instanceof Error ? error.message : 'Import failed');
		} finally {
			busy = '';
			input.value = '';
		}
	}

	function exportBackup() {
		const blob = new Blob([JSON.stringify(app.backup(), null, '\t')], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `meal-planner-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<header class="head"><h1>Settings</h1></header>

{#if message}
	<p class="message" class:bad={message.kind === 'bad'} role="status">{message.text}</p>
{/if}

<section class="block">
	<h2>Recipe packs</h2>
	<p class="faint measure">
		Your library starts empty. Import a pack to fill it — importing again later only adds what you
		do not already have, so it will not duplicate or overwrite your edits.
	</p>

	<ul class="rows">
		{#each BUILT_IN as pack (pack.id)}
			<li>
				<div>
					<p class="row-title">{pack.name}</p>
					<p class="faint">{pack.detail}</p>
				</div>
				<button
					class="btn btn-primary"
					disabled={busy === pack.id}
					onclick={() => importBuiltIn(pack)}
				>
					{busy === pack.id ? 'Importing…' : 'Import'}
				</button>
			</li>
		{/each}
		<li>
			<div>
				<p class="row-title">From a file</p>
				<p class="faint">A recipe pack or a backup you exported earlier</p>
			</div>
			<label class="btn btn-quiet">
				{busy === 'file' ? 'Reading…' : 'Choose file'}
				<input type="file" accept="application/json,.json" onchange={importFile} hidden />
			</label>
		</li>
	</ul>
</section>

<section class="block">
	<h2>Your data</h2>
	<p class="faint measure">
		Everything lives in this browser and never leaves it. Export a backup before clearing site data
		or moving to a new device.
	</p>

	<ul class="rows">
		<li>
			<div>
				<p class="row-title">Export a backup</p>
				<p class="faint num">
					{app.recipes.length} recipes · {app.meals.length} planned meals
				</p>
			</div>
			<button class="btn btn-quiet" onclick={exportBackup}>
				<Icon name="download" size={16} /> Export
			</button>
		</li>
		<li>
			<div>
				<p class="row-title">Erase everything</p>
				<p class="faint">Recipes, plans and the shopping list</p>
			</div>
			<button class="btn btn-danger" onclick={() => (confirmingErase = true)}>Erase</button>
		</li>
	</ul>
</section>

<section class="block">
	<h2>Appearance</h2>
	<div class="scroller">
		{#each ['system', 'light', 'dark'] as const as option (option)}
			<button class="chip" aria-pressed={theme === option} onclick={() => applyTheme(option)}>
				{option}
			</button>
		{/each}
	</div>
</section>

<section class="block">
	<h2>About</h2>
	<p class="faint measure">
		Works entirely offline — install it to your home screen and it keeps working with no connection.
		Plans are shared by link rather than by syncing, so nothing is ever uploaded.
	</p>
</section>

<Sheet bind:open={confirmingErase} title="Erase everything?">
	<p class="measure">
		This deletes all {app.recipes.length} recipes, {app.meals.length} planned meals and your shopping
		list from this browser. It cannot be undone — export a backup first if you might want it back.
	</p>
	{#snippet footer()}
		<button class="btn btn-quiet" onclick={() => (confirmingErase = false)}>Cancel</button>
		<button
			class="btn btn-danger"
			onclick={async () => {
				await app.eraseAll();
				confirmingErase = false;
				report('ok', 'Everything erased.');
			}}>Erase</button
		>
	{/snippet}
</Sheet>

<style>
	.head {
		padding: var(--s-4);
	}

	.block {
		padding: 0 var(--s-4) var(--s-5);
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.rows li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		padding: var(--s-3) 0;
		border-top: 1px solid var(--border);
	}

	.row-title {
		font-weight: 500;
	}

	.message {
		margin: 0 var(--s-4) var(--s-4);
		padding: var(--s-3);
		border-radius: var(--r-md);
		background: var(--done-wash);
		color: var(--done);
		font-size: var(--t-sm);
	}

	.message.bad {
		background: var(--bad-wash);
		color: var(--bad);
	}

	/* A file input styled as a button still needs to look pressable. */
	label.btn {
		cursor: pointer;
	}

	@media (min-width: 768px) {
		.head,
		.block,
		.message {
			max-width: 760px;
			margin-inline: auto;
		}
	}
</style>
