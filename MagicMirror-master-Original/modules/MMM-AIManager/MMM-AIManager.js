/* global Module */

Module.register("MMM-AIManager", {
  defaults: {
    defaultProvider: "gemini",
    requestTimeout: 30000,
    showStatus: false,
  },

  start() {
    this._requests = new Map();
    this._status = "Pronto";
  },

  getStyles() {
    if (!this.config.showStatus) {
      return [];
    }
    return [this.file("MMM-AIManager.css")];
  },

  notificationReceived(notification, payload, sender) {
    if (notification !== "GET_AI_RESPONSE") {
      return;
    }

    const normalized = this._normalizePayload(payload, sender);
    if (!normalized) {
      return;
    }

    this._forwardRequest(normalized);
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "AI_RESPONSE" || !payload) {
      return;
    }

    this._finalizeRequest(payload);
    this.sendNotification("AI_RESPONSE", payload);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-ai-manager";

    if (!this.config.showStatus) {
      wrapper.style.display = "none";
      return wrapper;
    }

    const label = document.createElement("div");
    label.className = "ai-manager-status";
    label.textContent = this._status;
    wrapper.appendChild(label);

    return wrapper;
  },

  _normalizePayload(payload = {}, sender) {
    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const provider = (payload.provider || this.config.defaultProvider || "gemini").toString().trim();
    const senderId = payload.senderId || sender?.identifier || this.identifier;

    if (!prompt) {
      return null;
    }
    if (!provider) {
      return null;
    }

    const requestId = Date.now() + Math.floor(Math.random() * 1000000);

    return {
      ...payload,
      prompt,
      provider: provider.toLowerCase(),
      senderId,
      requestId,
    };
  },

  _forwardRequest(request) {
    const { requestId, senderId, provider, prompt, ...rest } = request;

    const timer = setTimeout(() => {
      this._requests.delete(requestId);
      this.sendNotification("AI_RESPONSE", {
        requestId,
        senderId,
        provider,
        error: "Tempo limite ao consultar o provedor de IA.",
      });
      this._updateStatus("Tempo limite ao consultar o provedor de IA.");
    }, this.config.requestTimeout);

    this._requests.set(requestId, { senderId, timer });
    this._updateStatus(`Consultando ${provider}`);

    this.sendSocketNotification("GET_AI_RESPONSE", {
      requestId,
      senderId,
      provider,
      prompt,
      ...rest,
    });
  },

  _finalizeRequest(payload) {
    if (payload.requestId && this._requests.has(payload.requestId)) {
      const entry = this._requests.get(payload.requestId);
      clearTimeout(entry.timer);
      this._requests.delete(payload.requestId);
    }

    if (payload.error) {
      this._updateStatus(`Erro (${payload.provider || "desconhecido"})`);
    } else {
      this._updateStatus(`Resposta de ${payload.provider || "desconhecido"}`);
    }
  },

  _updateStatus(message) {
    this._status = message;
    if (this.config.showStatus) {
      this.updateDom(0);
    }
  },
});
