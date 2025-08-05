<script lang="ts">
	import SyncManager from '$lib/components/sync/SyncManager.svelte';
	import DataManagement from '$lib/components/sync/DataManagement.svelte';
</script>

<svelte:head>
	<title>Settings - Menu Planner</title>
</svelte:head>

<div class="container">
	<header>
		<h1>Settings</h1>
		<p>Manage your data and collaboration settings</p>
	</header>

	<main>
		<!-- Collaboration Section -->
		<section class="settings-section">
			<SyncManager />
		</section>

		<!-- Data Management Section -->
		<section class="settings-section">
			<DataManagement />
		</section>
	</main>
</div>

<style>
	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 3rem;
	}

	header h1 {
		margin-bottom: 1rem;
		color: #9b4dca;
	}

	header p {
		color: #606c76;
		font-size: 1.1rem;
	}

	.settings-section {
		margin-bottom: 4rem;
		padding: 2rem;
		border: 1px solid #e1e1e1;
		border-radius: 8px;
		background: #f8f9fa;
	}

	.settings-section:last-child {
		margin-bottom: 0;
	}

	@media (max-width: 40rem) {
		.container {
			padding: 1rem;
		}
		
		.settings-section {
			padding: 1rem;
			margin-bottom: 2rem;
		}
	}
</style>