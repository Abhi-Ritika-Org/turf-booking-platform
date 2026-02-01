/**
 * Socket.IO Service for Real-Time Session Management
 * Handles connection, disconnection, and FORCE_LOGOUT events
 */

import { io, Socket } from 'socket.io-client';

interface SocketServiceConfig {
  url?: string;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
}

class SocketService {
  private socket: Socket | null = null;
  private config: SocketServiceConfig;
  private forceLogoutCallback: (() => void) | null = null;

  constructor(config: SocketServiceConfig = {}) {
    this.config = {
      url: config.url || window.location.origin,
      reconnection: config.reconnection !== false,
      reconnectionDelay: config.reconnectionDelay || 1000,
      reconnectionDelayMax: config.reconnectionDelayMax || 5000,
      reconnectionAttempts: config.reconnectionAttempts || 5,
      ...config,
    };
  }

  /**
   * Connect to Socket.IO server using JWT token
   * @param token - JWT access token (from Redux state)
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!token) {
          reject(new Error('No access token provided. Please log in first.'));
          return;
        }

        this.socket = io(this.config.url || window.location.origin, {
          auth: {
            token: token,
          },
          reconnection: this.config.reconnection,
          reconnectionDelay: this.config.reconnectionDelay,
          reconnectionDelayMax: this.config.reconnectionDelayMax,
          reconnectionAttempts: this.config.reconnectionAttempts,
        });

        // Handle connection success
        this.socket.on('connect', () => {
          console.log('Socket connected:', this.socket?.id);
          resolve();
        });

        // Handle connection error
        this.socket.on('connect_error', (error: any) => {
          console.error('Socket connection error:', error);
          reject(error);
        });

        // Handle FORCE_LOGOUT event
        this.socket.on('FORCE_LOGOUT', (data: any) => {
          console.warn('FORCE_LOGOUT received:', data);
          this.handleForceLogout();
        });

        // Handle disconnect
        this.socket.on('disconnect', (reason: string) => {
          console.log('Socket disconnected:', reason);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('Socket disconnected');
    }
  }

  /**
   * Register callback for FORCE_LOGOUT event
   */
  onForceLogout(callback: () => void): void {
    this.forceLogoutCallback = callback;
  }

  /**
   * Handle FORCE_LOGOUT event
   * - Disconnect socket
   * - Call registered callback to clear Redux state and redirect
   */
  private handleForceLogout(): void {
    console.log('Handling force logout...');
    
    // Disconnect socket
    this.disconnect();
    
    // Call registered callback (Redux dispatch + navigation handled by caller)
    if (this.forceLogoutCallback) {
      this.forceLogoutCallback();
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | null {
    return this.socket?.id || null;
  }

  /**
   * Emit ping event (keep-alive)
   */
  ping(): void {
    if (this.socket) {
      this.socket.emit('ping', (response: any) => {
        console.log('Ping response:', response);
      });
    }
  }
}

// Export singleton instance
export const socketService = new SocketService();

export default SocketService;
