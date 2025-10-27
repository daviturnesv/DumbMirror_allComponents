/* global Module */

const NodeHelper = require('node_helper');
const Log = require('logger');
const ioClient = require('socket.io-client');

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.socket = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.authFailed = false;
  },

  stop() {
    this.cleanupConnection();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === 'REMOTE_RELAY_CONFIG') {
      this.config = payload;
      this.authFailed = false;
      this.initializeConnection();
    } else if (notification === 'REMOTE_RELAY_COMMAND_RESULT') {
      if (this.socket && payload && payload.commandId) {
        this.socket.emit('command-result', {
          commandId: payload.commandId,
          success: payload.success,
          data: payload.data || null
        });
      }
    }
  },

  initializeConnection() {
    if (!this.config || !this.config.relayUrl || !this.config.mirrorId || !this.config.mirrorSecret) {
      this.updateClientState('configuration-error', 'Missing relayUrl, mirrorId or mirrorSecret');
      return;
    }
    this.cleanupConnection();
    this.connectToRelay();
  },

  connectToRelay() {
    const { relayUrl } = this.config;
    Log.log(`[MMM-RemoteRelay] Connecting to relay ${relayUrl}`);

    this.socket = ioClient(`${relayUrl.replace(/\/$/, '')}/mirror`, {
      transports: ['websocket'],
      reconnection: false
    });

    this.socket.on('connect', () => {
      Log.log('[MMM-RemoteRelay] Connected, authenticating...');
      this.reconnectAttempts = 0;
      this.updateClientState('connecting', 'Authenticating with relay');
      this.socket.emit('authenticate', {
        mirrorId: this.config.mirrorId,
        secret: this.config.mirrorSecret
      });
    });

    this.socket.on('auth-success', () => {
      Log.log('[MMM-RemoteRelay] Authenticated');
      this.updateClientState('connected', 'Connected to relay');
      this.beginHeartbeat();
    });

    this.socket.on('auth-error', (error) => {
      Log.error('[MMM-RemoteRelay] Authentication failed', error);
      this.updateClientState('auth-error', error?.error || 'Authentication failed');
      this.authFailed = true;
      this.scheduleReconnect();
    });

    this.socket.on('execute-command', (command) => {
      Log.log('[MMM-RemoteRelay] Received command', command);
      this.sendSocketNotification('REMOTE_RELAY_EXECUTE_COMMAND', command);
    });

    this.socket.on('command-result', (payload) => {
      Log.log('[MMM-RemoteRelay] Command result echoed', payload);
      this.sendSocketNotification('REMOTE_RELAY_COMMAND_ECHO', payload);
    });

    this.socket.on('disconnect', (reason) => {
      Log.warn(`[MMM-RemoteRelay] Disconnected: ${reason}`);
      this.updateClientState('disconnected', `Disconnected: ${reason}`);
      this.cleanupConnection();
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      Log.error('[MMM-RemoteRelay] Connection error', error.message);
      this.updateClientState('error', `Connection error: ${error.message}`);
      this.cleanupConnection();
      this.scheduleReconnect();
    });
  },

  beginHeartbeat() {
    this.clearHeartbeat();
    const interval = Number(this.config.heartbeatInterval || 30000);
    if (!this.socket) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('heartbeat');
      }
    }, interval);
  },

  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  },

  scheduleReconnect() {
    if (this.reconnectTimer || this.authFailed) return;
    const attempt = this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, attempt), 60000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initializeConnection();
    }, delay);
  },

  cleanupConnection() {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      if (this.socket.connected) {
        this.socket.disconnect();
      }
      this.socket = null;
    }
  },

  updateClientState(state, message) {
    this.sendSocketNotification('REMOTE_RELAY_STATE', { state, message });
  }
});
