Module.register("MMM-TTSBridge", {
  defaults: {
    autoDisableOnSpeak: true,
    armTimeoutMs: 15000,
    stateBroadcast: true,
    debug: false
  },

  start() {
    this.ttsEnabled = false;
    this._armTimer = null;
    this.sendLog("iniciado");
  },

  notificationReceived(notification, payload, sender) {
    const safePayload = payload == null ? {} : payload;
    switch (notification) {
      case "MIRROR_TTS_ENABLE":
        this.enable(safePayload.timeoutMs);
        break;
      case "MIRROR_TTS_DISABLE":
        this.disable("manual");
        break;
      case "MIRROR_TTS_TOGGLE":
        this.ttsEnabled ? this.disable("toggle") : this.enable(safePayload.timeoutMs);
        break;
      case "MIRROR_TTS_STATE_REQUEST":
        this.broadcastState();
        break;
      case "MIRROR_TTS_REQUEST":
        this.handleRequest(safePayload, sender, false);
        break;
      case "MIRROR_TTS_FORCE":
        this.handleRequest(safePayload, sender, true);
        break;
    }
  },

  enable(timeoutMs) {
    this.ttsEnabled = true;
    this.scheduleAutoDisable(timeoutMs);
    this.sendLog("modo voz habilitado");
    this.broadcastState();
  },

  disable(reason = "auto") {
    if (!this.ttsEnabled && !this._armTimer) {
      return;
    }
    this.ttsEnabled = false;
    if (this._armTimer) {
      clearTimeout(this._armTimer);
      this._armTimer = null;
    }
    this.sendLog(`modo voz desabilitado (${reason})`);
    this.broadcastState();
  },

  scheduleAutoDisable(timeoutMs) {
    if (this._armTimer) {
      clearTimeout(this._armTimer);
      this._armTimer = null;
    }
    const ms = Number.isFinite(timeoutMs) ? timeoutMs : this.config.armTimeoutMs;
    if (ms > 0) {
      this._armTimer = setTimeout(() => {
        this.disable("timeout");
      }, ms);
    }
  },

  handleRequest(payload, sender, force) {
    const normalized = this.normalizePayload(payload, sender);
    if (!normalized) {
      return;
    }

    if (!force && !this.ttsEnabled) {
      this.sendLog("ignorado - tts desabilitado");
      return;
    }

    this.sendLog(`falando (${normalized.content.length} chars)`);
    this.sendNotification("TTS_SAY", normalized);

    if (!force && this.config.autoDisableOnSpeak) {
      this.disable("spoke");
    }
  },

  normalizePayload(payload, sender) {
    if (!payload) {
      return null;
    }

    if (typeof payload === "string") {
      return { content: payload };
    }

    const content = this.extractContent(payload);
    if (content) {
      return {
        content,
        languageCode: payload.languageCode || "pt-BR",
        voiceName: payload.voiceName,
        ssmlGender: payload.ssmlGender,
        metadata: {
          source: payload.source || sender?.name || sender?.identifier || null,
          type: payload.type || null
        }
      };
    }

    return null;
  },

  extractContent(payload) {
    const candidates = [payload.content, payload.text, payload.message];
    for (const entry of candidates) {
      if (typeof entry === "string" && entry.trim().length) {
        return entry.trim();
      }
    }
    return null;
  },

  broadcastState() {
    if (!this.config.stateBroadcast) {
      return;
    }
    this.sendNotification("MIRROR_TTS_STATE", {
      enabled: this.ttsEnabled,
      armedUntil: this.ttsEnabled && this._armTimer ? Date.now() : null
    });
  },

  sendLog(message) {
    if (this.config.debug && typeof console !== "undefined") {
      console.log(`[MMM-TTSBridge] ${message}`);
    }
  }
});
