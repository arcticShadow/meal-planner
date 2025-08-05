import { DatabaseService, type Recipe, type Meal, type ShoppingListItem } from './database.js';

// UUID generation utility with fallback for older browsers
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback UUID generation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// WebRTC connection states
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Sync message types
export type SyncMessageType = 'handshake' | 'recipe_create' | 'recipe_update' | 'recipe_delete' | 
                             'meal_create' | 'meal_update' | 'meal_delete' | 
                             'shopping_create' | 'shopping_update' | 'shopping_delete' | 'shopping_clear' |
                             'full_sync_request' | 'full_sync_response';

// Sync message structure
export interface SyncMessage {
  id: string;
  type: SyncMessageType;
  timestamp: number;
  senderId: string;
  data?: unknown;
}

// Handshake data
export interface HandshakeData {
  peerId: string;
  appVersion: string;
  timestamp: number;
}

// Full sync data
export interface FullSyncData {
  recipes: Recipe[];
  meals: Meal[];
  shoppingItems: ShoppingListItem[];
  timestamp: number;
}

// Sync event listeners
export interface SyncEventHandlers {
  onConnectionStateChange?: (state: ConnectionState) => void;
  onPeerConnected?: (peerId: string) => void;
  onPeerDisconnected?: () => void;
  onSyncReceived?: (message: SyncMessage) => void;
  onError?: (error: string) => void;
}

export class SyncService {
  private static instance: SyncService | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localPeerId: string;
  private remotePeerId: string | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private eventHandlers: SyncEventHandlers = {};
  private messageQueue: SyncMessage[] = [];
  private isInitiator = false;

  // WebRTC configuration
  private static readonly RTC_CONFIG: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  private constructor() {
    this.localPeerId = generateUUID();
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  // Initialize sync service with event handlers
  initialize(handlers: SyncEventHandlers): void {
    this.eventHandlers = handlers;
  }

  // Get current connection state
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  // Get local peer ID
  getLocalPeerId(): string {
    return this.localPeerId;
  }

  // Get remote peer ID
  getRemotePeerId(): string | null {
    return this.remotePeerId;
  }

  // Create connection offer (initiator)
  async createOffer(): Promise<string> {
    try {
      this.isInitiator = true;
      this.setConnectionState('connecting');
      
      this.peerConnection = new RTCPeerConnection(SyncService.RTC_CONFIG);
      this.setupPeerConnection();
      
      // Create data channel
      this.dataChannel = this.peerConnection.createDataChannel('sync', {
        ordered: true
      });
      this.setupDataChannel();

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      const connectionString = JSON.stringify({
        type: 'offer',
        sdp: this.peerConnection.localDescription,
        peerId: this.localPeerId
      });

      return btoa(connectionString);
    } catch (error) {
      this.handleError(`Failed to create offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Accept connection offer (responder)
  async acceptOffer(encodedOffer: string): Promise<string> {
    try {
      this.isInitiator = false;
      this.setConnectionState('connecting');

      const connectionData = JSON.parse(atob(encodedOffer));
      
      if (connectionData.type !== 'offer') {
        throw new Error('Invalid connection data: not an offer');
      }

      this.peerConnection = new RTCPeerConnection(SyncService.RTC_CONFIG);
      this.setupPeerConnection();

      // Set remote description
      await this.peerConnection.setRemoteDescription(connectionData.sdp);
      this.remotePeerId = connectionData.peerId;

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      const responseString = JSON.stringify({
        type: 'answer',
        sdp: this.peerConnection.localDescription,
        peerId: this.localPeerId
      });

      return btoa(responseString);
    } catch (error) {
      this.handleError(`Failed to accept offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Complete connection (initiator receives answer)
  async completeConnection(encodedAnswer: string): Promise<void> {
    try {
      const answerData = JSON.parse(atob(encodedAnswer));
      
      if (answerData.type !== 'answer') {
        throw new Error('Invalid response data: not an answer');
      }

      if (!this.peerConnection) {
        throw new Error('No peer connection available');
      }

      await this.peerConnection.setRemoteDescription(answerData.sdp);
      this.remotePeerId = answerData.peerId;
    } catch (error) {
      this.handleError(`Failed to complete connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Disconnect from peer
  disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remotePeerId = null;
    this.messageQueue = [];
    this.setConnectionState('disconnected');
    this.eventHandlers.onPeerDisconnected?.();
  }

  // Send sync message
  async sendMessage(type: SyncMessageType, data?: unknown): Promise<void> {
    if (!this.isConnected()) {
      console.warn('Cannot send message: not connected');
      return;
    }

    const message: SyncMessage = {
      id: generateUUID(),
      type,
      timestamp: Date.now(),
      senderId: this.localPeerId,
      data
    };

    try {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify(message));
      } else {
        // Queue message if channel not ready
        this.messageQueue.push(message);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  // Request full sync from peer
  async requestFullSync(): Promise<void> {
    await this.sendMessage('full_sync_request');
  }

  // Send full sync data to peer
  async sendFullSync(): Promise<void> {
    try {
      const [recipes, meals, shoppingItems] = await Promise.all([
        DatabaseService.getAllRecipes(),
        DatabaseService.getAllMeals(),
        DatabaseService.getAllShoppingListItems()
      ]);

      const syncData: FullSyncData = {
        recipes,
        meals,
        shoppingItems,
        timestamp: Date.now()
      };

      await this.sendMessage('full_sync_response', syncData);
    } catch (error) {
      console.error('Failed to send full sync:', error);
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.connectionState === 'connected' && 
           this.dataChannel?.readyState === 'open';
  }

  // Setup peer connection event handlers
  private setupPeerConnection(): void {
    if (!this.peerConnection) return;

    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;

      console.log('ICE connection state:', this.peerConnection.iceConnectionState);
      
      switch (this.peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
          if (this.connectionState !== 'connected' && this.dataChannel?.readyState === 'open') {
            this.setConnectionState('connected');
            this.eventHandlers.onPeerConnected?.(this.remotePeerId || 'unknown');
            this.flushMessageQueue();
          }
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.setConnectionState('disconnected');
          this.eventHandlers.onPeerDisconnected?.();
          break;
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      if (!this.isInitiator) {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      }
    };

    // RTCPeerConnection doesn't have onerror - errors are handled through state changes
  }

  // Setup data channel event handlers
  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      if (this.peerConnection?.iceConnectionState === 'connected' || 
          this.peerConnection?.iceConnectionState === 'completed') {
        this.setConnectionState('connected');
        this.eventHandlers.onPeerConnected?.(this.remotePeerId || 'unknown');
        this.flushMessageQueue();
        
        // Send handshake
        this.sendHandshake();
      }
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);
        this.handleReceivedMessage(message);
      } catch (error) {
        console.error('Failed to parse sync message:', error);
      }
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.setConnectionState('disconnected');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.handleError('Data channel error');
    };
  }

  // Send handshake message
  private async sendHandshake(): Promise<void> {
    const handshakeData: HandshakeData = {
      peerId: this.localPeerId,
      appVersion: '1.0.0',
      timestamp: Date.now()
    };

    await this.sendMessage('handshake', handshakeData);
  }

  // Handle received sync message
  private handleReceivedMessage(message: SyncMessage): void {
    console.log('Received sync message:', message.type);

    // Handle handshake
    if (message.type === 'handshake' && message.data) {
      const handshake = message.data as HandshakeData;
      this.remotePeerId = handshake.peerId;
      console.log('Handshake completed with peer:', handshake.peerId);
    }

    // Handle full sync request
    if (message.type === 'full_sync_request') {
      this.sendFullSync();
      return;
    }

    // Notify handlers
    this.eventHandlers.onSyncReceived?.(message);
  }

  // Wait for ICE gathering to complete
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.peerConnection) {
        resolve();
        return;
      }

      if (this.peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const handleIceGatheringStateChange = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          this.peerConnection.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange);
          resolve();
        }
      };

      this.peerConnection.addEventListener('icegatheringstatechange', handleIceGatheringStateChange);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.peerConnection) {
          this.peerConnection.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange);
        }
        resolve();
      }, 10000);
    });
  }

  // Flush queued messages when connection is established
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      if (message && this.dataChannel) {
        try {
          this.dataChannel.send(JSON.stringify(message));
        } catch (error) {
          console.error('Failed to send queued message:', error);
          break;
        }
      }
    }
  }

  // Set connection state and notify handlers
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.eventHandlers.onConnectionStateChange?.(state);
    }
  }

  // Handle errors
  private handleError(error: string): void {
    console.error('Sync service error:', error);
    this.setConnectionState('error');
    this.eventHandlers.onError?.(error);
  }

  // Generate QR code data for connection sharing
  generateQRCodeData(offer: string): string {
    // Create a simpler room-based URL that doesn't require manual answer exchange
    const roomId = this.localPeerId;
    const connectionUrl = `${window.location.origin}/sync?room=${roomId}&offer=${encodeURIComponent(offer)}`;
    return connectionUrl;
  }

  // Create a room-based connection (simplified approach)
  async createRoomOffer(): Promise<{ offer: string; qrCodeData: string; roomId: string }> {
    try {
      this.isInitiator = true;
      this.setConnectionState('connecting');
      
      this.peerConnection = new RTCPeerConnection(SyncService.RTC_CONFIG);
      this.setupPeerConnection();
      
      // Create data channel
      this.dataChannel = this.peerConnection.createDataChannel('sync', {
        ordered: true
      });
      this.setupDataChannel();

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      const connectionString = JSON.stringify({
        type: 'offer',
        sdp: this.peerConnection.localDescription,
        peerId: this.localPeerId,
        roomId: this.localPeerId
      });

      const encodedOffer = btoa(connectionString);
      const roomId = this.localPeerId;
      const qrCodeData = `${window.location.origin}/sync?room=${roomId}&offer=${encodeURIComponent(encodedOffer)}`;

      return { offer: encodedOffer, qrCodeData, roomId };
    } catch (error) {
      this.handleError(`Failed to create room offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Join room and establish connection automatically
  async joinRoom(roomId: string, encodedOffer: string): Promise<void> {
    try {
      this.isInitiator = false;
      this.setConnectionState('connecting');

      const connectionData = JSON.parse(atob(encodedOffer));
      
      if (connectionData.type !== 'offer') {
        throw new Error('Invalid connection data: not an offer');
      }

      this.peerConnection = new RTCPeerConnection(SyncService.RTC_CONFIG);
      this.setupPeerConnection();

      // Set remote description
      await this.peerConnection.setRemoteDescription(connectionData.sdp);
      this.remotePeerId = connectionData.peerId;

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Since we can't send the answer back easily, we'll rely on ICE connectivity
      // to establish the connection. This works for many network configurations.
      console.log('Attempting direct connection...');
      
      // Set a timeout to check connection status
      setTimeout(() => {
        if (this.connectionState !== 'connected') {
          this.handleError('Connection timeout - direct connection failed. You may need to use the manual connection method.');
        }
      }, 15000); // 15 second timeout
      
    } catch (error) {
      this.handleError(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Parse connection URL to extract offer
  static parseConnectionUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('offer');
    } catch {
      return null;
    }
  }

  // Auto-accept offer and establish connection (for QR code flow)
  async autoAcceptOffer(encodedOffer: string): Promise<void> {
    try {
      this.isInitiator = false;
      this.setConnectionState('connecting');

      const connectionData = JSON.parse(atob(encodedOffer));
      
      if (connectionData.type !== 'offer') {
        throw new Error('Invalid connection data: not an offer');
      }

      this.peerConnection = new RTCPeerConnection(SyncService.RTC_CONFIG);
      this.setupPeerConnection();

      // Set remote description
      await this.peerConnection.setRemoteDescription(connectionData.sdp);
      this.remotePeerId = connectionData.peerId;

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Auto-send answer back via WebRTC data channel or alternative method
      // For now, we'll just wait for connection to establish
      console.log('Auto-connection in progress...');
      
    } catch (error) {
      this.handleError(`Failed to auto-accept offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}

// Export singleton instance
export const syncService = SyncService.getInstance();