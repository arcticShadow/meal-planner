<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { app } from '$lib/state.svelte';

	let { children } = $props();

	const tabs = [
		{ href: resolve('/'), icon: 'calendar', label: 'Plan', match: /^\/$/ },
		{ href: resolve('/recipes'), icon: 'book', label: 'Recipes', match: /^\/recipes/ },
		{ href: resolve('/shopping'), icon: 'cart', label: 'Shop', match: /^\/shopping/ },
		{ href: resolve('/settings'), icon: 'gear', label: 'Settings', match: /^\/settings/ }
	];

	// resolve() prefixes the base path, which the regexes above do not expect.
	const path = $derived(page.url.pathname.replace(resolve('/').replace(/\/$/, ''), '') || '/');
	const outstanding = $derived(app.ready ? app.outstandingCount : 0);

	onMount(() => {
		app.load();
	});
</script>

<svelte:head>
	<title>Meal Planner</title>
	<meta
		name="description"
		content="Plan meals, build a consolidated shopping list, and keep your recipe library — entirely offline."
	/>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#1c1b18" media="(prefers-color-scheme: dark)" />
	<link rel="manifest" href={asset('/manifest.json')} />
	<link rel="icon" href={asset('/favicon.png')} />
	<link rel="apple-touch-icon" href={asset('/favicon.png')} />
	<meta name="apple-mobile-web-app-capable" content="yes" />
</svelte:head>

<div class="shell">
	<main>
		{@render children()}
	</main>

	<nav aria-label="Main">
		{#each tabs as tab (tab.href)}
			{@const active = tab.match.test(path)}
			<a href={tab.href} aria-current={active ? 'page' : undefined}>
				<span class="glyph">
					<Icon name={tab.icon} size={22} />
					{#if tab.icon === 'cart' && outstanding > 0}
						<span class="count num" aria-hidden="true"
							>{outstanding > 99 ? '99+' : outstanding}</span
						>
					{/if}
				</span>
				<span class="label">{tab.label}</span>
				{#if tab.icon === 'cart' && outstanding > 0}
					<span class="visually-hidden">{outstanding} items still to buy</span>
				{/if}
			</a>
		{/each}
	</nav>
</div>

<style>
	.shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		/* Clear the fixed tab bar plus the home indicator. */
		padding-bottom: calc(68px + env(safe-area-inset-bottom));
	}

	/*
	 * Bottom tabs on phones: this app is used one-handed while holding a
	 * trolley, and the bottom of the screen is the only part a thumb reaches
	 * comfortably. On a wider screen the same bar moves to the top, where a
	 * pointer expects navigation.
	 */
	nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 10;
		display: flex;
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		backdrop-filter: blur(12px);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
	}

	nav a {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 60px;
		padding: var(--s-2) 0;
		color: var(--text-faint);
		text-decoration: none;
		/* Navigation happens constantly; motion here would only add latency. */
	}

	nav a[aria-current='page'] {
		color: var(--accent);
	}

	.glyph {
		position: relative;
		display: grid;
		place-items: center;
	}

	.label {
		font-size: var(--t-xs);
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	/* The only number on the chrome, so it has to be unmissable without
	   stealing the accent colour from the active tab. */
	.count {
		position: absolute;
		top: -5px;
		left: 11px;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		background: var(--bad);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
	}

	@media (min-width: 768px) {
		.shell {
			padding-top: 64px;
		}

		main {
			padding-bottom: var(--s-6);
		}

		nav {
			inset: 0 0 auto 0;
			border-top: none;
			border-bottom: 1px solid var(--border);
			justify-content: center;
			gap: var(--s-2);
			padding: var(--s-2);
		}

		nav a {
			flex: none;
			flex-direction: row;
			gap: var(--s-2);
			min-height: var(--tap);
			padding: 0 var(--s-4);
			border-radius: var(--r-md);
		}

		nav a[aria-current='page'] {
			background: var(--accent-wash);
		}

		.label {
			font-size: var(--t-base);
		}

		.count {
			position: static;
			margin-left: var(--s-1);
		}
	}
</style>
