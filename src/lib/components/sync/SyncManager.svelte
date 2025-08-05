<script lang="ts">
	import { syncStore, connectionStatus } from '../../stores/sync.js';
	import { onMount } from 'svelte';
	import QRCodeDisplay from './QRCodeDisplay.svelte';

	// Component state
	let showQRCode = false;
	let shareableLink = '';
	let connectionInput = '';
	let connectionAnswer = '';
	let showConnectionInput = false;
	let copying = false;
	let error = '';

	// Store subscriptions
	$: status = $connectionStatus;
	$: store = $syncStore;

	// Reset state when disconnected
	$: if (status.displayState === 'disconnected') {
		showQRCode = false;
		shareableLink = '';
		connectionInput = '';
		connectionAnswer = '';
		showConnectionInput = false;
		error = '';
	}

	// Handle creating a new connection (become host)
	async function createConnection() {
		try {
			error = '';
			const result = await syncStore.createOffer();
			shareableLink = result.qrCodeData;
			showQRCode = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create connection';
		}
	}

	// Handle joining an existing connection
	function showJoinDialog() {
		showConnectionInput = true;
		connectionInput = '';
		error = '';
	}

	// Handle joining with connection string
	async function joinConnection() {
		if (!connectionInput.trim()) {
			error = 'Please enter a connection string';
			return;
		}

		try {
			error = '';
			
			// Check if it's a URL or direct connection string
			let connectionString = connectionInput.trim();
			if (connectionString.startsWith('http')) {
				// Extract offer from URL
				const url = new URL(connectionString);
				const offer = url.searchParams.get('offer');
				if (!offer) {
					throw new Error('Invalid connection URL');
				}
				connectionString = offer;
			}

			connectionAnswer = await syncStore.acceptOffer(connectionString);
			showConnectionInput = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join connection';
		}
	}

	// Handle completing connection (for host)
	async function completeConnection() {
		if (!connectionAnswer.trim()) {
			error = 'Please enter the connection response';
			return;
		}

		try {
			error = '';
			await syncStore.completeConnection(connectionAnswer.trim());
			showQRCode = false;
			connectionAnswer = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to complete connection';
		}
	}

	// Copy to clipboard
	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copying = true;
			setTimeout(() => copying = false, 2000);
		} catch (err) {
			error = 'Failed to copy to clipboard';
		}
	}

	// Disconnect from peer
	function disconnect() {
		syncStore.disconnect();
	}

	// Request manual sync
	async function requestSync() {
		try {
			error = '';
			await syncStore.requestFullSync();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to request sync';
		}
	}

	// Clear error
	function clearError() {
		error = '';
		syncStore.clearError();
	}

	// Auto-clear errors after 5 seconds
	$: if (error) {
		setTimeout(() => {
			if (error) error = '';
		}, 5000);
	}

	onMount(() => {
		// Clear any existing errors when component mounts
		syncStore.clearError();
	});
</script>

<div class="sync-manager">
	<header>
		<h3>Collaboration Sync</h3>
		<p>Share meal planning and recipes with others in real-time</p>
	</header>

	<!-- Connection Status -->
	{#if status.isConnected}
		<div class="alert alert-success">
			<strong>✓ Connected</strong> to peer {status.remotePeerId || 'Unknown'}
			{#if store.lastSyncTime}
				<br><small>Last sync: {new Date(store.lastSyncTime).toLocaleTimeString()}</small>
			{/if}
		</div>
	{:else if status.isConnecting}
		<div class="alert">
			<strong>⏳ Connecting...</strong> Establishing peer connection
		</div>
	{:else if status.hasError}
		<div class="alert alert-error">
			<strong>⚠ Connection Error</strong> Check your internet connection
		</div>
	{:else}
		<div class="alert">
			<strong>🔗 Ready to Connect</strong> Choose an option below to start collaborating
		</div>
	{/if}

	<!-- Error Display -->
	{#if error || store.error}
		<div class="alert alert-error" style="margin-top: 1rem;">
			<strong>Error:</strong> {error || store.error}
			<button type="button" class="button-link" on:click={clearError} style="margin-left: 1rem;">
				Dismiss
			</button>
		</div>
	{/if}

	<!-- Connection Actions -->
	{#if status.isConnected}
		<div class="connection-actions">
			<div class="row">
				<div class="column">
					<button 
						type="button" 
						class="button" 
						on:click={requestSync}
						disabled={store.syncInProgress}
					>
						{store.syncInProgress ? 'Syncing...' : 'Manual Sync'}
					</button>
				</div>
				<div class="column">
					<button type="button" class="button button-outline" on:click={disconnect}>
						Disconnect
					</button>
				</div>
			</div>
		</div>
	{:else if showQRCode}
		<!-- Host: Show shareable link and QR code -->
		<div class="connection-setup">
			<h4>Share Connection</h4>
			<p>Share this link or QR code with the person you want to collaborate with:</p>
			
			<!-- QR Code Display -->
			{#if shareableLink}
				<div class="qr-code-section">
					<QRCodeDisplay
						data={shareableLink}
						size={400}
						title="Scan to Connect"
					/>
				</div>
			{/if}
			
			<!-- Shareable Link -->
			<div class="input-group">
				<label for="shareable-link">Connection Link:</label>
				<input
					id="shareable-link"
					type="text"
					readonly
					value={shareableLink}
					class="u-full-width"
					style="font-family: monospace; font-size: 0.9em;"
				/>
				<button
					type="button"
					class="button"
					on:click={() => copyToClipboard(shareableLink)}
					disabled={copying}
				>
					{copying ? 'Copied!' : 'Copy Link'}
				</button>
			</div>

			<p style="margin-top: 2rem;"><strong>Waiting for connection response...</strong></p>
			<p>The other person should scan the QR code or visit the link above, then send you their response code.</p>

			<div class="input-group" style="margin-top: 1rem;">
				<label for="connection-answer">Connection Response:</label>
				<textarea 
					id="connection-answer"
					bind:value={connectionAnswer}
					placeholder="Paste the connection response here..."
					rows="3"
					class="u-full-width"
				></textarea>
				<div class="button-group">
					<button 
						type="button" 
						class="button" 
						on:click={completeConnection}
						disabled={!connectionAnswer.trim() || status.isConnecting}
					>
						{status.isConnecting ? 'Connecting...' : 'Complete Connection'}
					</button>
					<button type="button" class="button button-outline" on:click={() => showQRCode = false}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{:else if showConnectionInput}
		<!-- Guest: Input connection string -->
		<div class="connection-setup">
			<h4>Join Collaboration</h4>
			<p>Paste the connection link or code shared with you:</p>
			
			<div class="input-group">
				<label for="connection-input">Connection Link or Code:</label>
				<textarea 
					id="connection-input"
					bind:value={connectionInput}
					placeholder="Paste connection link or code here..."
					rows="3"
					class="u-full-width"
				></textarea>
				<div class="button-group">
					<button 
						type="button" 
						class="button" 
						on:click={joinConnection}
						disabled={!connectionInput.trim() || status.isConnecting}
					>
						{status.isConnecting ? 'Connecting...' : 'Join'}
					</button>
					<button type="button" class="button button-outline" on:click={() => showConnectionInput = false}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Initial state: Choose connection type -->
		<div class="connection-options">
			<div class="row">
				<div class="column">
					<div class="card">
						<h4>Start New Session</h4>
						<p>Create a new collaboration session and invite others to join.</p>
						<button 
							type="button" 
							class="button u-full-width" 
							on:click={createConnection}
							disabled={status.isConnecting}
						>
							Create Session
						</button>
					</div>
				</div>
				<div class="column">
					<div class="card">
						<h4>Join Existing Session</h4>
						<p>Join a collaboration session using a shared link or code.</p>
						<button 
							type="button" 
							class="button button-outline u-full-width" 
							on:click={showJoinDialog}
							disabled={status.isConnecting}
						>
							Join Session
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Connection Info -->
	{#if status.localPeerId}
		<div class="connection-info">
			<details>
				<summary>Connection Details</summary>
				<dl>
					<dt>Your ID:</dt>
					<dd><code>{status.localPeerId}</code></dd>
					{#if status.remotePeerId}
						<dt>Peer ID:</dt>
						<dd><code>{status.remotePeerId}</code></dd>
					{/if}
					<dt>Status:</dt>
					<dd class="status-{status.displayState}">{status.displayState}</dd>
					{#if store.isHost}
						<dt>Role:</dt>
						<dd>Host</dd>
					{/if}
				</dl>
			</details>
		</div>
	{/if}
</div>

<style>
	.sync-manager {
		max-width: 600px;
		margin: 0 auto;
	}

	.connection-options .card {
		padding: 2rem;
		border: 1px solid #e1e1e1;
		border-radius: 4px;
		text-align: center;
		height: 100%;
		box-sizing: border-box;
	}

	.connection-options .card h4 {
		margin-bottom: 1rem;
		color: #9b4dca;
	}

	.connection-options .card p {
		margin-bottom: 2rem;
		color: #606c76;
	}

	.connection-setup {
		background: #f8f9fa;
		padding: 2rem;
		border-radius: 4px;
		border: 1px solid #e1e1e1;
	}

	.connection-setup h4 {
		margin-bottom: 1rem;
		color: #9b4dca;
	}

	.qr-code-section {
		text-align: center;
		margin: 2rem 0;
		padding: 2rem;
		background: white;
		border-radius: 8px;
		border: 1px solid #e1e1e1;
		overflow-x: auto;
	}

	/* Ensure QR code is responsive */
	.qr-code-section :global(canvas) {
		max-width: 100%;
		height: auto;
	}

	.input-group {
		margin-bottom: 1rem;
	}

	.input-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 600;
	}

	.button-group {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}

	.button-group .button {
		flex: 1;
	}

	.connection-actions {
		margin: 2rem 0;
	}

	.connection-info {
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid #e1e1e1;
	}

	.connection-info summary {
		cursor: pointer;
		color: #606c76;
		margin-bottom: 1rem;
	}

	.connection-info dl {
		margin: 0;
	}

	.connection-info dt {
		font-weight: 600;
		margin-top: 1rem;
		margin-bottom: 0.5rem;
	}

	.connection-info dd {
		margin: 0 0 0.5rem 0;
		font-family: monospace;
		font-size: 0.9em;
		word-break: break-all;
	}

	.connection-info .status-connected {
		color: #27ae60;
		font-weight: 600;
	}

	.connection-info .status-connecting {
		color: #f39c12;
		font-weight: 600;
	}

	.connection-info .status-disconnected {
		color: #606c76;
		font-weight: 600;
	}

	.connection-info .status-error {
		color: #e74c3c;
		font-weight: 600;
	}

	.button-link {
		background: none;
		border: none;
		color: #9b4dca;
		text-decoration: underline;
		cursor: pointer;
		font-size: inherit;
		padding: 0;
	}

	.button-link:hover {
		color: #8e44ad;
	}

	.alert {
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 2rem;
		border: 1px solid #e1e1e1;
		background: #f8f9fa;
	}

	.alert-success {
		background: #d4edda;
		border-color: #c3e6cb;
		color: #155724;
	}

	.alert-error {
		background: #f8d7da;
		border-color: #f5c6cb;
		color: #721c24;
	}

	@media (max-width: 40rem) {
		.button-group {
			flex-direction: column;
		}
		
		.connection-options .row {
			flex-direction: column;
		}
		
		.connection-options .column {
			margin-bottom: 2rem;
		}

		.qr-code-section {
			padding: 1rem;
			margin: 1rem 0;
		}
	}
</style>