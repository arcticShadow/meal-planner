<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import favicon from '$lib/assets/favicon.svg';
	import ConnectionStatus from '$lib/components/sync/ConnectionStatus.svelte';

	let { children } = $props();

	// Navigation items
	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/recipes', label: 'Recipes' },
		{ href: '/planning', label: 'Meal Planning' },
		{ href: '/shopping', label: 'Shopping List' },
		{ href: '/settings', label: 'Settings' }
	];

	// Check if current route is active
	function isActive(href: string): boolean {
		if (href === '/') {
			return $page.url.pathname === '/';
		}
		return $page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<title>Menu Planner - Offline Meal Planning & Recipe Management</title>
	<meta name="description" content="Offline meal planning and recipe management application. Plan meals, manage recipes, and generate shopping lists without internet connection." />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="theme-color" content="#33c3f0" />
	
	<!-- PWA Manifest -->
	<link rel="manifest" href="/manifest.json" />
	
	<!-- Icons -->
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" href="/favicon.png" />
	
	<!-- Fonts -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<div class="app">
	<!-- Navigation -->
	<nav class="nav">
		<div class="container">
			<div class="nav-content">
				<ul class="nav-links">
					{#each navItems as item}
						<li>
							<a
								href={item.href}
								class:active={isActive(item.href)}
								data-sveltekit-preload-data="hover"
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
				<div class="nav-sync">
					<ConnectionStatus compact={true} showDetails={false} />
				</div>
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<main class="container">
		{@render children?.()}
	</main>

	<!-- Footer -->
	<footer class="container" style="margin-top: 4rem; padding: 2rem 0; border-top: 0.1rem solid #e1e1e1; text-align: center; color: #9b9b9b;">
		<p>Menu Planner - Offline Meal Planning & Recipe Management</p>
		<p style="font-size: 1.2rem; margin-bottom: 0;">
			Works completely offline • Your data stays on your device
		</p>
	</footer>
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
	}

	.nav-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
	}

	.nav-links {
		display: flex;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.nav-sync {
		display: flex;
		align-items: center;
		padding: 0.5rem;
	}

	/* Ensure navigation links have proper spacing on mobile */
	@media (max-width: 40rem) {
		.nav-content {
			flex-direction: column;
			gap: 1rem;
		}

		.nav-links {
			flex-direction: column;
			align-items: center;
		}
		
		:global(.nav li) {
			margin: 0.5rem 0;
		}

		.nav-sync {
			order: -1;
		}
	}
</style>
