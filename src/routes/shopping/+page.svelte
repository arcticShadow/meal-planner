<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { addDays, describeDate, today } from '$lib/dates';
	import { shoppingListText } from '$lib/share';
	import { app } from '$lib/state.svelte';
	import type { ShoppingLine, UnitId } from '$lib/types';
	import { formatQuantity, UNITS } from '$lib/units';

	const RANGES = [
		{ label: 'This week', days: 6 },
		{ label: 'Two weeks', days: 13 },
		{ label: 'A month', days: 29 }
	];
	let rangeDays = $state(13);
	$effect(() => {
		app.from = today();
		app.to = addDays(today(), rangeDays);
	});

	const lines = $derived(app.shoppingList);
	const remaining = $derived(lines.filter((l) => !l.checked));
	const done = $derived(lines.filter((l) => l.checked));

	let expanded = $state<string | null>(null);
	let addingExtra = $state(false);
	let extraName = $state('');
	let extraAmount = $state('');
	let extraUnit = $state<UnitId | ''>('');
	let copied = $state(false);

	function quantityOf(line: ShoppingLine): string {
		if (line.totals.length) {
			return line.totals.map((t) => formatQuantity(t.amount, t.unit)).join(' + ');
		}
		return line.unquantified.join(', ');
	}

	async function addExtra(event: SubmitEvent) {
		event.preventDefault();
		if (!extraName.trim()) return;
		const amount = extraAmount.trim() ? Number(extraAmount) : null;
		await app.addExtra(extraName, Number.isFinite(amount) ? amount : null, extraUnit || null);
		extraName = '';
		extraAmount = '';
		extraUnit = '';
		addingExtra = false;
	}

	async function copyList() {
		const text = shoppingListText(lines, formatQuantity as never);
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<header class="head">
	<div class="spread">
		<h1>Shop</h1>
		<button class="btn btn-quiet" onclick={copyList} disabled={!remaining.length}>
			<Icon name={copied ? 'check' : 'copy'} size={18} />
			{copied ? 'Copied' : 'Copy'}
		</button>
	</div>

	<div class="scroller ranges">
		{#each RANGES as range (range.days)}
			<button
				class="chip"
				aria-pressed={rangeDays === range.days}
				onclick={() => (rangeDays = range.days)}
			>
				{range.label}
			</button>
		{/each}
	</div>

	{#if lines.length}
		<p class="faint">
			{remaining.length} to buy{done.length ? ` · ${done.length} in the trolley` : ''}
		</p>
	{/if}
</header>

{#if !app.ready}
	<p class="empty">Loading…</p>
{:else if !lines.length}
	<div class="empty">
		<Icon name="cart" size={32} />
		<h2>Nothing to buy</h2>
		<p class="measure">Plan some meals and their ingredients will collect here, combined.</p>
	</div>
{:else}
	<ul class="list">
		{#each lines as line (line.key)}
			<li class:checked={line.checked}>
				<div class="line">
					<!--
						The whole row is the hit target. Ticking happens dozens of
						times per shop, often one-handed, so it must not require
						aiming at a small box.
					-->
					<button
						class="tick"
						role="checkbox"
						aria-checked={line.checked}
						onclick={() => app.toggleChecked(line.key)}
					>
						<span class="box">
							{#if line.checked}<Icon name="check" size={15} />{/if}
						</span>
						<span class="text">
							<span class="qty num">{quantityOf(line)}</span>
							<span class="name">{line.name}</span>
						</span>
					</button>

					{#if line.sources.length > 1}
						<button
							class="btn btn-ghost expand"
							aria-expanded={expanded === line.key}
							onclick={() => (expanded = expanded === line.key ? null : line.key)}
						>
							<span class="num">{line.sources.length}</span>
							<Icon name="chevronDown" size={16} />
							<span class="visually-hidden">Show what makes up {line.name}</span>
						</button>
					{/if}
				</div>

				<!--
					The breakdown is the reason this list is worth building: 1.2kg
					of chicken only helps if you can see it is 600g for Monday and
					600g for Wednesday, and drop one of them.
				-->
				{#if expanded === line.key}
					<ul class="breakdown">
						{#each line.sources as source, i (i)}
							<li>
								<span class="num b-qty">
									{formatQuantity(source.amount, source.unit) || source.note || '—'}
								</span>
								<span class="b-meal">
									{source.recipeName}
									{#if source.prep}<span class="faint"> · {source.prep}</span>{/if}
								</span>
								<span class="faint b-date">
									{source.date ? describeDate(source.date) : 'by hand'}
								</span>
								{#if source.mealId}
									<button
										class="btn btn-ghost"
										onclick={() => app.toggleIngredient(source.mealId!, line.name)}
										title="Already have this — drop it from {source.recipeName}"
									>
										<Icon name="x" size={14} />
										<span class="visually-hidden">
											Drop {line.name} from {source.recipeName}
										</span>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="actions">
		<button class="btn btn-quiet" onclick={() => (addingExtra = true)}>
			<Icon name="plus" size={18} /> Add an item
		</button>
		{#if done.length}
			<button class="btn btn-ghost muted" onclick={() => app.clearChecked()}>
				Clear {done.length} ticked
			</button>
		{/if}
	</div>
{/if}

<Sheet bind:open={addingExtra} title="Add an item">
	<form id="extra-form" class="stack" onsubmit={addExtra}>
		<div class="field">
			<label for="x-name">Item</label>
			<input id="x-name" class="input" bind:value={extraName} placeholder="Dishwasher tablets" />
		</div>
		<div class="row">
			<div class="field" style="flex:1">
				<label for="x-amount">Amount</label>
				<input
					id="x-amount"
					class="input num"
					type="number"
					inputmode="decimal"
					step="any"
					min="0"
					bind:value={extraAmount}
				/>
			</div>
			<div class="field" style="flex:1">
				<label for="x-unit">Unit</label>
				<select id="x-unit" class="input" bind:value={extraUnit}>
					<option value="">—</option>
					{#each Object.keys(UNITS) as unit (unit)}
						<option value={unit}>{unit}</option>
					{/each}
				</select>
			</div>
		</div>
	</form>
	{#snippet footer()}
		<button type="submit" form="extra-form" class="btn btn-primary">Add</button>
	{/snippet}
</Sheet>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		padding: var(--s-4);
	}

	.ranges {
		margin: 0 calc(-1 * var(--s-4));
		padding: 0 var(--s-4);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0 var(--s-4);
	}

	.list > li {
		border-top: 1px solid var(--border);
	}

	.line {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.tick {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		min-height: var(--tap-lg);
		padding: var(--s-2) 0;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		color: inherit;
	}

	.box {
		flex: none;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 2px solid var(--border-strong);
		border-radius: var(--r-sm);
		color: #fff;
		/* Dozens of these per shop: motion must be short enough to feel
		   instantaneous, or a quick pass down an aisle turns into a wait. */
		transition:
			background-color var(--d-instant) var(--ease-out),
			border-color var(--d-instant) var(--ease-out);
	}

	.checked .box {
		background: var(--done);
		border-color: var(--done);
	}

	.text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-2);
		min-width: 0;
	}

	.qty {
		font-weight: 600;
		font-feature-settings: 'tnum';
	}

	.name {
		color: var(--text-muted);
	}

	/* Struck through as well as faded: colour alone should never be the only
	   thing carrying a state. */
	.checked .text {
		text-decoration: line-through;
		opacity: 0.5;
		transition: opacity var(--d-instant) var(--ease-out);
	}

	.expand {
		color: var(--text-faint);
		font-size: var(--t-sm);
		gap: var(--s-1);
	}

	.expand[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}

	.breakdown {
		list-style: none;
		margin: 0 0 var(--s-3);
		padding: var(--s-2) var(--s-3);
		background: var(--surface-sunk);
		border-radius: var(--r-md);
		font-size: var(--t-sm);
	}

	.breakdown li {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1) 0;
	}

	.b-qty {
		font-weight: 600;
		min-width: 4.5ch;
	}

	.b-meal {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.b-date {
		white-space: nowrap;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
		padding: var(--s-4);
	}

	@media (min-width: 768px) {
		.head,
		.list,
		.actions {
			max-width: 760px;
			margin-inline: auto;
		}
	}
</style>
