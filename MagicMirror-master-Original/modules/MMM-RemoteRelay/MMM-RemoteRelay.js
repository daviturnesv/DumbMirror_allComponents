'use strict';

Module.register('MMM-RemoteRelay', {
  defaults: {
    relayUrl: 'http://localhost:8081',
    mirrorId: '',
    mirrorSecret: '',
    heartbeatInterval: 30000,
    autoAcknowledge: false,
    acknowledgementTimeout: 15000,
    forwardNotifications: [
      'SENSORDATA_REMOTE_UPDATE',
      'SENSORDATA_SUMMARY',
      'SENSORDATA_REPORT_BROADCAST',
      'AI_RESPONSE'
    ]
  },

  start() {
    this.connectionState = 'disconnected';
    this.statusMessage = null;
    this.pendingCommands = new Map();
    console.log('[MMM-RemoteRelay] module start config', {
      relayUrl: this.config?.relayUrl,
      mirrorIdLength: this.config?.mirrorId ? this.config.mirrorId.length : 0,
      mirrorSecretLength: this.config?.mirrorSecret ? this.config.mirrorSecret.length : 0
    });
    this.sendSocketNotification('REMOTE_RELAY_CONFIG', this.config);
  },

  getDom() {
    const wrapper = document.createElement('div');
    wrapper.className = 'small dimmed';

    const title = document.createElement('div');
    title.innerHTML = 'Remote Relay';
    wrapper.appendChild(title);

    const state = document.createElement('div');
    state.innerHTML = `Estado: ${this.connectionState}`;
    wrapper.appendChild(state);

    if (this.statusMessage) {
      const message = document.createElement('div');
      message.innerHTML = this.statusMessage;
      wrapper.appendChild(message);
    }

    return wrapper;
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case 'REMOTE_RELAY_STATE':
        this.connectionState = payload.state;
        this.statusMessage = payload.message || null;
        this.updateDom();
        break;
      case 'REMOTE_RELAY_EXECUTE_COMMAND':
        this.handleIncomingCommand(payload);
        break;
      case 'REMOTE_RELAY_COMMAND_ECHO':
        this.handleCommandEcho(payload);
        break;
    }
  },

  handleIncomingCommand({ commandId, notification, payload }) {
    console.log('[MMM-RemoteRelay] forwarding command', notification, payload);
    this.sendNotification(notification, payload);

    if (this.config.autoAcknowledge) {
      this.reportCommandResult({ commandId, success: true, data: null });
      return;
    }

    this.scheduleCommandTimeout(commandId);
  },

  handleCommandEcho(payload) {
    if (payload && payload.commandId && this.pendingCommands.has(payload.commandId)) {
      this.clearCommandTimeout(payload.commandId);
    }

    const successLabel = payload?.success ? 'sucesso' : 'falha';
    this.statusMessage = `Comando ${payload?.commandId || '?'}: ${successLabel}`;
    this.updateDom();
  },

  notificationReceived(notification, payload, sender) {
    if (notification === 'REMOTE_RELAY_COMMAND_RESULT' && payload?.commandId) {
      this.reportCommandResult(payload);
      return;
    }

    if (this._shouldForwardNotification(notification)) {
      this._forwardNotification(notification, payload, sender);
    }
  },

  scheduleCommandTimeout(commandId) {
    const timeout = Number(this.config.acknowledgementTimeout || 0);
    if (!timeout || timeout <= 0) {
      return;
    }
    this.clearCommandTimeout(commandId);
    const timer = setTimeout(() => {
      console.warn('[MMM-RemoteRelay] comando expirou aguardando confirmação', commandId);
      this.pendingCommands.delete(commandId);
      this.sendSocketNotification('REMOTE_RELAY_COMMAND_RESULT', {
        commandId,
        success: false,
        data: { reason: 'timeout' }
      });
    }, timeout);

    this.pendingCommands.set(commandId, timer);
  },

  clearCommandTimeout(commandId) {
    const timer = this.pendingCommands.get(commandId);
    if (timer) {
      clearTimeout(timer);
      this.pendingCommands.delete(commandId);
    }
  },

  reportCommandResult(payload) {
    this.clearCommandTimeout(payload.commandId);
    this.sendSocketNotification('REMOTE_RELAY_COMMAND_RESULT', payload);
  },

  _shouldForwardNotification(notification) {
    if (!notification) {
      return false;
    }
    const list = Array.isArray(this.config.forwardNotifications)
      ? this.config.forwardNotifications
      : this.defaults.forwardNotifications;
    if (Array.isArray(list) && list.length) {
      return list.includes(notification);
    }
    return false;
  },

  _forwardNotification(notification, payload, sender) {
    this.sendSocketNotification('REMOTE_RELAY_FORWARD', {
      notification,
      payload,
      sender: sender?.identifier || null,
      forwardedAt: Date.now()
    });
  }
});
