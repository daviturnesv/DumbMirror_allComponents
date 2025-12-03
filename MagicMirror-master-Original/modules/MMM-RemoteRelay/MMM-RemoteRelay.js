'use strict';

Module.register('MMM-RemoteRelay', {
  defaults: {
    relayUrl: 'http://localhost:8081',
    mirrorId: '',
    mirrorSecret: '',
    heartbeatInterval: 30000,
    autoAcknowledge: false,
    acknowledgementTimeout: 15000,
    ttsAutoArm: {
      enabled: false,
      notifications: [],
      timeoutMs: 20000,
      payloadFlag: null
    },
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
    this._maybeAutoArmTts(notification, payload, commandId);
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
  },

  _maybeAutoArmTts(notification, payload, commandId) {
    const autoArm = this.config?.ttsAutoArm;
    if (!autoArm || autoArm.enabled === false) {
      return;
    }

    if (this._isTtsCommand(notification)) {
      return;
    }

    const notifications = Array.isArray(autoArm.notifications) ? autoArm.notifications : [];
    const payloadFlag = typeof autoArm.payloadFlag === 'string' && autoArm.payloadFlag.length ? autoArm.payloadFlag : null;
    const matchesNotification = notifications.length ? notifications.includes(notification) : false;
    const matchesPayloadFlag = payloadFlag ? Boolean(payload?.[payloadFlag]) : false;

    if (!matchesNotification && !matchesPayloadFlag) {
      return;
    }

    const timeoutMs = Number.isFinite(autoArm.timeoutMs) ? autoArm.timeoutMs : this.defaults.ttsAutoArm.timeoutMs;
    this.sendNotification('MIRROR_TTS_ENABLE', {
      source: 'remote-relay',
      reason: 'auto-arm',
      commandId,
      notification,
      timeoutMs
    });
  },

  _isTtsCommand(notification) {
    return notification === 'MIRROR_TTS_ENABLE' || notification === 'MIRROR_TTS_DISABLE' || notification === 'MIRROR_TTS_TOGGLE' || notification === 'MIRROR_TTS_FORCE' || notification === 'MIRROR_TTS_REQUEST';
  }
});
