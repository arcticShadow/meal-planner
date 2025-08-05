<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import SyncManager from '$lib/components/sync/SyncManager.svelte';
	import { syncStore } from '$lib/stores/sync.js';

	let connectionOffer = '';
	let roomId = '';
	let autoJoining = false;
	let connectionAnswer = '';
	let showAnswer = false;
	let showFallback = false;
	let error = '';
	let connectionTimeout: ReturnType<typeof setTimeout>;

	onMount(() => {
		// Check if there's a room and offer in the URL
		const urlRoomId = $page.url.searchParams.get('room');
		const offer = $page.url.searchParams.get('offer');
		
		if (urlRoomId && offer) {
			roomId = urlRoomId;
			connectionOffer = offer;
			autoJoining = true;
			
			// Try automatic room joining
			syncStore.joinRoom(roomId, offer).catch(err => {
				clearTimeout(connectionTimeout);
				error = err instanceof Error ? err.message : 'Failed to join room';
				autoJoining = false;
				showFallback = true;
			});
			
			// Set a timeout to show fallback option if connection doesn't establish
			connectionTimeout = setTimeout(() => {
				if (autoJoining) {
					autoJoining = false;
					showFallback = true;
				}
			}, 10000); // 10 second timeout
			
			// Check connection status
			const unsubscribe = syncStore.subscribe(store => {
				if (store.connectionState === 'connected') {
					clearTimeout(connectionTimeout);
					autoJoining = false;
					// Redirect to settings on successful connection
					setTimeout(() => goto('/settings'), 1500);
				} else if (store.connectionState === 'error') {
					clearTimeout(connectionTimeout);
					autoJoining = false;
					showFallback = true;
				}
			});
			
			// Return cleanup function
			return () => {
				unsubscribe();
				clearTimeout(connectionTimeout);
			};
		} else if (offer) {
			// Fallback to manual connection for older URLs
			connectionOffer = offer;
			showFallback = true;
		}
	});

	// Fallback to manual connection method
	async function tryManualConnection() {
		try {
			const answer = await syncStore.acceptOffer(connectionOffer);
			connectionAnswer = answer;
			showFallback = false;
			showAnswer = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create connection response';
		}
	}

	async function copyAnswer() {
		try {
			await navigator.clipboard.writeText(connectionAnswer);
			// Show copied feedback briefly
			const button = document.querySelector('.copy-answer-btn') as HTMLButtonElement;
			if (button) {
				const originalText = button.textContent;
				button.textContent = 'Copied!';
				setTimeout(() => {
					button.textContent = originalText;
				}, 2000);
			}
		} catch (err) {
			error = 'Failed to copy to clipboard';
		}
	}

	function goToSettings() {
		goto('/settings');
	}
</script>

<svelte:head>
	<title>Join Collaboration - Menu Planner</title>
</svelte:head>

<div class="container">
	{#if autoJoining}
		<div class="joining-container">
			<div class="alert">
				<h2>🔗 Joining Collaboration Session</h2>
				<p>Attempting automatic connection to room {roomId}...</p>
				<div class="loading-spinner"></div>
				<p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">
					This may take a few seconds. If it doesn't work, we'll show you alternative connection options.
				</p>
			</div>
		</div>
	{:else if showFallback}
		<div class="fallback-container">
			<div class="alert alert-warning">
				<h2>⚡ Alternative Connection Method</h2>
				<p>Automatic connection didn't work. You can try the manual connection method below:</p>
				
				<div class="button-group">
					<button
						type="button"
						class="button"
						on:click={tryManualConnection}
					>
						Create Manual Connection
					</button>
					<button
						type="button"
						class="button button-outline"
						on:click={() => goto('/settings')}
					>
						Go to Settings
					</button>
				</div>
				
				<div class="info-box">
					<h4>Why didn't automatic connection work?</h4>
					<p>Direct peer-to-peer connections can be blocked by network firewalls or NAT configurations. The manual method provides an alternative way to establish the connection.</p>
				</div>
			</div>
		</div>
	{:else if showAnswer}
		<div class="answer-container">
			<div class="alert alert-success">
				<h2>✅ Connection Response Ready</h2>
				<p>Your connection response has been generated. Please share it with the person who invited you:</p>
				
				<div class="answer-section">
					<textarea
						readonly
						value={connectionAnswer}
						rows="4"
						class="answer-text"
					></textarea>
					<div class="button-group">
						<button
							type="button"
							class="button copy-answer-btn"
							on:click={copyAnswer}
						>
							Copy Response
						</button>
						<button
							type="button"
							class="button"
							on:click={goToSettings}
						>
							Continue to Settings
						</button>
					</div>
				</div>
				
				<div class="instructions">
					<h4>Share Your Response:</h4>
					<p>Send the connection response above to the person who shared the QR code. They need to paste it into their "Connection Response" field to complete the connection.</p>
					
					<h4>Alternative: Try Direct Connection</h4>
					<p>You can also go to Settings and monitor the connection status. The connection may establish automatically if both browsers support direct peer-to-peer connections.</p>
				</div>
			</div>
		</div>
	{:else if error}
		<div class="error-container">
			<div class="alert alert-error">
				<h2>⚠ Connection Failed</h2>
				<p><strong>Error:</strong> {error}</p>
				<div class="button-group">
					<button type="button" class="button" on:click={() => goto('/settings')}>
						Go to Settings
					</button>
					<button type="button" class="button button-outline" on:click={() => goto('/')}>
						Go to Home
					</button>
				</div>
			</div>
		</div>
	{:else if connectionOffer}
		<div class="manual-join-container">
			<div class="alert">
				<h2>🤝 Join Collaboration</h2>
				<p>A connection offer was detected. You can manually join the collaboration session below.</p>
			</div>
			<SyncManager />
		</div>
	{:else}
		<div class="no-offer-container">
			<div class="alert alert-error">
				<h2>❌ No Connection Data Found</h2>
				<p>This page is meant to be accessed through a shared collaboration link.</p>
				<p>If you want to start or join a collaboration session, please visit the Settings page.</p>
				<div class="button-group">
					<button type="button" class="button" on:click={() => goto('/settings')}>
						Go to Settings
					</button>
					<button type="button" class="button button-outline" on:click={() => goto('/')}>
						Go to Home
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem;
		min-height: 50vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.joining-container,
	.error-container,
	.manual-join-container,
	.no-offer-container {
		width: 100%;
		text-align: center;
	}

	.alert {
		padding: 2rem;
		border-radius: 8px;
		margin-bottom: 2rem;
		border: 1px solid #e1e1e1;
		background: #f8f9fa;
	}

	.alert h2 {
		margin-bottom: 1rem;
		color: #9b4dca;
		font-size: 1.5rem;
	}

	.alert p {
		margin-bottom: 1rem;
		color: #606c76;
		font-size: 1.1rem;
	}

	.alert-error {
		background: #f8d7da;
		border-color: #f5c6cb;
		color: #721c24;
	}

	.alert-error h2 {
		color: #721c24;
	}

	.button-group {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 2rem;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #e1e1e1;
		border-top: 4px solid #9b4dca;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 2rem auto;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	@media (max-width: 40rem) {
		.container {
			padding: 1rem;
		}

		.button-group {
			flex-direction: column;
		}

		.alert {
			padding: 1.5rem;
		}

		.alert h2 {
			font-size: 1.3rem;
		}
	}

	.alert-success {
		background: #d4edda;
		border-color: #c3e6cb;
		color: #155724;
	}

	.alert-success h2 {
		color: #155724;
	}

	.answer-section {
		margin: 2rem 0;
	}

	.answer-text {
		width: 100%;
		font-family: monospace;
		font-size: 0.9em;
		padding: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: white;
		resize: none;
		margin-bottom: 1rem;
	}

	.instructions {
		text-align: left;
		margin-top: 2rem;
		padding: 1.5rem;
		background: #f8f9fa;
		border-radius: 4px;
		border: 1px solid #e1e1e1;
	}

	.instructions h4 {
		margin-bottom: 1rem;
		color: #495057;
	}

	.instructions ol {
		margin: 0;
		padding-left: 1.5rem;
	}

	.instructions li {
		margin-bottom: 0.5rem;
		color: #495057;
	}
</style>