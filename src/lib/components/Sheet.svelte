<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		children,
		footer
	}: { open?: boolean; title: string; children: Snippet; footer?: Snippet } = $props();

	let dialog = $state<HTMLDialogElement>();

	// showModal() gives focus trapping, inertness and Escape for free.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} oncancel={() => (open = false)}>
	<!-- Clicking the backdrop dismisses; the panel stops the click bubbling. -->
	<button type="button" class="backdrop" aria-label="Close" onclick={() => (open = false)}></button>

	<div class="panel">
		<header>
			<h2>{title}</h2>
			<button type="button" class="btn btn-ghost" onclick={() => (open = false)}>
				<Icon name="x" label="Close" />
			</button>
		</header>

		<div class="body">
			{@render children()}
		</div>

		{#if footer}
			<footer>{@render footer()}</footer>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		margin: 0;
		padding: 0;
		border: none;
		background: none;
		max-width: 100vw;
		max-height: 100dvh;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	dialog::backdrop {
		background: oklch(0.2 0.01 75 / 0.45);
	}

	.backdrop {
		position: fixed;
		inset: 0;
		border: none;
		background: transparent;
		cursor: default;
	}

	/*
	 * Sheets are an occasional interaction, so they get real motion: entering
	 * from the edge they are anchored to makes where they came from obvious,
	 * and the same path in reverse on dismiss keeps it reversible.
	 */
	.panel {
		position: fixed;
		inset: auto 0 0 0;
		display: flex;
		flex-direction: column;
		max-height: 88dvh;
		background: var(--surface);
		border-radius: var(--r-lg) var(--r-lg) 0 0;
		box-shadow: var(--shadow-sheet);
		padding-bottom: env(safe-area-inset-bottom);
		animation: rise var(--d-sheet) var(--ease-drawer);
	}

	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-4);
		border-bottom: 1px solid var(--border);
	}

	header h2 {
		font-size: var(--t-lg);
	}

	.body {
		flex: 1;
		overflow-y: auto;
		padding: var(--s-4);
		-webkit-overflow-scrolling: touch;
	}

	footer {
		display: flex;
		gap: var(--s-3);
		padding: var(--s-4);
		border-top: 1px solid var(--border);
	}

	footer > :global(*) {
		flex: 1;
	}

	@media (min-width: 768px) {
		.panel {
			inset: 50% auto auto 50%;
			transform: translate(-50%, -50%);
			width: min(560px, calc(100vw - 2rem));
			max-height: 80dvh;
			border-radius: var(--r-lg);
			animation: appear var(--d-sheet) var(--ease-out);
		}

		/* Centred dialogs are exempt from growing out of their trigger: there
		   is no edge for them to belong to. */
		@keyframes appear {
			from {
				transform: translate(-50%, -50%) scale(0.97);
				opacity: 0;
			}
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel {
			animation: none;
		}
	}
</style>
