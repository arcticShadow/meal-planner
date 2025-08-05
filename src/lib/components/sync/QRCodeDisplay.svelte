<script lang="ts">
	import { onMount } from 'svelte';
	
	// Props
	export let data: string;
	export let size: number = 200;
	export let title: string = 'QR Code';

	// Component state
	let canvas: HTMLCanvasElement;
	let qrCodeDataURL: string = '';
	let loading = true;
	let error = '';

	// Generate QR code when component mounts or data changes
	$: if (data && canvas) {
		generateQRCode();
	}

	async function generateQRCode() {
		try {
			loading = true;
			error = '';

			// Dynamic import to avoid SSR issues
			const QRCode = await import('qrcode');
			
			// Generate QR code as data URL
			qrCodeDataURL = await QRCode.toDataURL(data, {
				width: size,
				margin: 1,
				color: {
					dark: '#2c3e50',
					light: '#ffffff'
				},
				errorCorrectionLevel: 'M'
			});

			loading = false;
		} catch (err) {
			console.error('Failed to generate QR code:', err);
			error = 'Failed to generate QR code';
			loading = false;
		}
	}

	onMount(() => {
		if (data) {
			generateQRCode();
		}
	});

	function downloadQRCode() {
		if (!qrCodeDataURL) return;

		const link = document.createElement('a');
		link.download = 'menu-planner-connection-qr.png';
		link.href = qrCodeDataURL;
		link.click();
	}
</script>

<div class="qr-code-container">
	{#if loading}
		<div class="qr-placeholder" style="width: {size}px; height: {size}px;">
			<div class="loading-spinner"></div>
			<p>Generating QR code...</p>
		</div>
	{:else if error}
		<div class="qr-error" style="width: {size}px; height: {size}px;">
			<p>❌ {error}</p>
		</div>
	{:else if qrCodeDataURL}
		<div class="qr-code">
			<h4>{title}</h4>
			<div class="qr-image-container">
				<img 
					src={qrCodeDataURL} 
					alt="QR Code for connection"
					width={size}
					height={size}
					class="qr-image"
				/>
			</div>
			<div class="qr-actions">
				<button 
					type="button" 
					class="button button-outline" 
					on:click={downloadQRCode}
				>
					Download QR Code
				</button>
			</div>
			<p class="qr-instructions">
				Scan this QR code with another device to connect and start collaborating.
			</p>
		</div>
	{/if}
</div>

<!-- Hidden canvas for QR generation -->
<canvas bind:this={canvas} style="display: none;"></canvas>

<style>
	.qr-code-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		background: #f8f9fa;
		border-radius: 8px;
		border: 1px solid #e1e1e1;
		margin: 2rem 0;
	}

	.qr-code h4 {
		margin-bottom: 1.5rem;
		color: #2c3e50;
		text-align: center;
	}

	.qr-image-container {
		background: white;
		padding: 1rem;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		margin-bottom: 1.5rem;
	}

	.qr-image {
		display: block;
		border-radius: 4px;
	}

	.qr-actions {
		margin-bottom: 1rem;
	}

	.qr-instructions {
		text-align: center;
		color: #606c76;
		font-size: 1.3rem;
		line-height: 1.5;
		max-width: 300px;
		margin: 0;
	}

	.qr-placeholder,
	.qr-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #f8f9fa;
		border: 2px dashed #e1e1e1;
		border-radius: 8px;
		color: #606c76;
		text-align: center;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #e1e1e1;
		border-top: 4px solid #9b4dca;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.qr-error {
		color: #e74c3c;
	}

	/* Responsive adjustments */
	@media (max-width: 40rem) {
		.qr-code-container {
			padding: 1.5rem;
			margin: 1rem 0;
		}

		.qr-image-container {
			padding: 0.5rem;
		}

		.qr-instructions {
			font-size: 1.2rem;
		}
	}
</style>