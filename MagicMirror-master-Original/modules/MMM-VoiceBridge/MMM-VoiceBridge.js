/* global Module */
/**
 * MMM-VoiceBridge
 * Bridge module que lê comandos de um servidor Python (stdout ou websocket futuramente)
 * e dispara notificações para outros módulos.
 */
Module.register("MMM-VoiceBridge", {
  defaults: {
    commandFile: "voice_cmd.txt", // arquivo onde Python escreve a frase reconhecida
    watchInterval: 1000,
    hotword: "espelho", // opcional: exige hotword no início
    stripHotword: true,
    fuzzy: true,
    fuzzyThreshold: 0.78,
    assistant: {
      captureEnabled: true,
      startPhrases: ["iniciar pergunta", "tem uma pergunta", "iniciar pergunta gemini"],
      confirmPhrases: ["confirmar pergunta", "pode enviar pergunta", "envia pergunta"],
      cancelPhrases: ["cancelar pergunta", "esquece pergunta", "não enviar pergunta"],
      requireHotwordDuringCapture: false,
      provider: "gemini",
      systemPrompt: "Você é o assistente do espelho inteligente. Responda em português, de forma breve e objetiva.",
      maxTokens: 320,
      temperature: 0.6,
      broadcastNotification: null,
    },
    showLastPhrase: true, // exibe a última frase reconhecida
    showBaseStatus: true, // exibe linha fixa "VoiceBridge ativo"
    commands: {
      "exportar dados": { notification: "SENSORDATA_EXPORT" },
      "atualizar sensores": { notification: "SENSORDATA_REFRESH_HISTORY" },
      "mostrar resumo": { notification: "SENSORDATA_COMMAND", payload: { action: "summary" } },
      // Câmera: aumentar/reduzir e modos
      "aumentar câmera": { notification: "LOCALCAMERA_SIZE", payload: { delta: 0.15 } },
      "diminuir câmera": { notification: "LOCALCAMERA_SIZE", payload: { delta: -0.15 } },
      "aproximar câmera": { notification: "LOCALCAMERA_ZOOM", payload: { delta: 0.2 } },
      "afastar câmera": { notification: "LOCALCAMERA_ZOOM", payload: { delta: -0.2 } },
      // Comando especial solicitado
      "câmera máximo": { notification: "LOCALCAMERA_MAXIMIZE" },
      "camera máximo": { notification: "LOCALCAMERA_MAXIMIZE" },
      "camera camera máximo": { notification: "LOCALCAMERA_MAXIMIZE" },
      "câmera câmera máximo": { notification: "LOCALCAMERA_MAXIMIZE" },
      "câmera tela cheia": { notification: "LOCALCAMERA_MAXIMIZE" },
      "câmera normal": { notification: "LOCALCAMERA_RESTORE" },
      "restaurar câmera": { notification: "LOCALCAMERA_RESTORE" }
    }
  },

  start() {
    this._lastContent = "";
    this._filePath = this.file(this.config.commandFile);
    this._lastPhrase = null; // frase após remoção de hotword
    this._lastRaw = null; // frase original crua
    this._lastMatched = null; // chave de comando que foi usada (ou null)
    this._lastScore = null; // score fuzzy se aplicável
    this._assistantMode = null; // controle de captura para assistente
    this._assistantBuffer = [];
    this._assistantLastQuestion = null;
    this._assistantResponse = null;
    this._assistantError = null;
    this._assistantPending = false;
    this._assistantProvider = null;
    this._schedule();
  },

  _schedule() {
    this._timer = setInterval(() => this._poll(), this.config.watchInterval);
  },

  notificationReceived(notification, payload) {
    if (notification === "AI_RESPONSE") {
      this._handleAiResponse(payload);
    }
  },

  _poll() {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", this._filePath + "?t=" + Date.now(), true);
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        const txt = xhr.responseText.trim();
        if (txt && txt !== this._lastContent) {
          this._lastContent = txt;
          this._handleCommand(txt);
        }
      }
    };
    xhr.send();
  },

  _handleAiResponse(payload) {
    if (!payload || payload.senderId !== this.identifier) {
      return;
    }

    this._assistantPending = false;
    this._assistantProvider = payload.provider || this._assistantProvider;

    if (payload.error) {
      this._assistantError = payload.error;
      this._assistantResponse = null;
    } else {
      this._assistantResponse = payload.response || "";
      this._assistantError = null;
    }

    this.updateDom(0);
  },

  _handleCommand(raw) {
    if (!raw) return;
    let phrase = raw.toLowerCase();
    const hot = this.config.hotword && this.config.hotword.toLowerCase();

    if (hot && this._shouldRequireHotword()) {
      if (!phrase.startsWith(hot)) return;
      if (this.config.stripHotword) {
        phrase = phrase.slice(hot.length).trim();
      }
    } else if (hot && phrase.startsWith(hot) && this.config.stripHotword) {
      phrase = phrase.slice(hot.length).trim();
    }

    phrase = phrase.trim();
    if (!phrase) return;

    this._lastRaw = raw;
    this._lastPhrase = phrase;
    this._lastMatched = null;
    this._lastScore = null;

    if (this._assistantMode) {
      this._handleAssistantCapture(raw, phrase);
      return;
    }

    if (this._maybeStartAssistant(phrase)) {
      this._lastMatched = "assistant:start";
      this.updateDom(0);
      return;
    }

    if (this.config.commands[phrase]) {
      this._lastMatched = phrase;
      this._emit(this.config.commands[phrase]);
      this.updateDom(0);
      return;
    }

    if (this.config.fuzzy) {
      const keys = Object.keys(this.config.commands);
      let best = null;
      let score = 0;
      for (const key of keys) {
        const s = this._similarity(key, phrase);
        if (s > score) {
          score = s;
          best = key;
        }
      }
      if (best && score >= this.config.fuzzyThreshold) {
        this._lastMatched = best;
        this._lastScore = score;
        this._emit(this.config.commands[best]);
      }
      this.updateDom(0);
      return;
    }

    this.updateDom(0);
  },

  _handleAssistantCapture(raw, phrase) {
    if (this._matchesAssistant(phrase, "confirm")) {
      this._confirmAssistantQuestion();
      return;
    }

    if (this._matchesAssistant(phrase, "cancel")) {
      this._assistantMode = null;
      this._assistantBuffer = [];
      this._lastMatched = "assistant:cancel";
      this._assistantPending = false;
      this.updateDom(0);
      return;
    }

    this._assistantBuffer.push({ raw, phrase });
    this._lastMatched = "assistant:capture";
    this.updateDom(0);
  },

  _confirmAssistantQuestion() {
    const fragments = this._assistantBuffer.map((part) => part.phrase);
    const question = fragments.join(" ").trim();
    const assistant = this.config.assistant || {};
    this._assistantMode = null;
    this._assistantBuffer = [];
    this._lastMatched = "assistant:confirm";

    if (!question) {
      this._assistantLastQuestion = null;
      this._assistantResponse = null;
      this._assistantError = "Pergunta vazia.";
      this._assistantPending = false;
      this.updateDom(0);
      return;
    }

    const provider = (assistant.provider || this.config.defaultProvider || "gemini")
      .toString()
      .trim()
      .toLowerCase();

    const payload = {
      senderId: this.identifier,
      provider,
      prompt: question,
    };

    const options = {};
    if (typeof assistant.maxTokens === "number" && assistant.maxTokens > 0) {
      options.maxTokens = assistant.maxTokens;
    }
    if (typeof assistant.temperature === "number" && !Number.isNaN(assistant.temperature)) {
      options.temperature = assistant.temperature;
    }
    if (Object.keys(options).length) {
      payload.options = options;
    }
    if (assistant.systemPrompt) {
      payload.systemPrompt = assistant.systemPrompt;
    }

    this._assistantLastQuestion = question;
    this._assistantResponse = null;
    this._assistantError = null;
    this._assistantPending = true;
    this._assistantProvider = provider;

    this.sendNotification("GET_AI_RESPONSE", payload);

    if (assistant.broadcastNotification) {
      this.sendNotification(assistant.broadcastNotification, {
        question,
        provider,
      });
    }

    this.updateDom(0);
  },

  _maybeStartAssistant(phrase) {
    const assistant = this.config.assistant;
    if (!assistant?.captureEnabled) {
      return false;
    }
    if (!this._matchesAssistant(phrase, "start")) {
      return false;
    }
    this._assistantMode = "capture";
    this._assistantBuffer = [];
    return true;
  },

  _matchesAssistant(phrase, type) {
    const assistant = this.config.assistant;
    if (!assistant) return false;
    let pool = [];
    if (type === "start") pool = assistant.startPhrases || [];
    else if (type === "confirm") pool = assistant.confirmPhrases || [];
    else if (type === "cancel") pool = assistant.cancelPhrases || [];
    else return false;
    if (typeof pool === "string") pool = [pool];
    return pool.some((item) => item && phrase === item.toLowerCase());
  },

  _shouldRequireHotword() {
  const hot = this.config.hotword?.toLowerCase();
    if (!hot) return false;
    if (!this._assistantMode) return true;
    const assistant = this.config.assistant;
    return assistant ? Boolean(assistant.requireHotwordDuringCapture) : true;
  },

  _similarity(a, b) {
    // simples ratio baseado em comprimento do longest common subsequence aproximado
    const dist = this._lev(a, b);
    const maxLen = Math.max(a.length, b.length) || 1;
    return 1 - dist / maxLen;
  },

  _lev(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  },

  _emit(cmd) {
    this.sendNotification(cmd.notification, cmd.payload || null);
  },

  getDom() {
    const w = document.createElement("div");
    w.className = "mmm-voicebridge";
    if (this.config.showBaseStatus) {
      const base = document.createElement("div");
      base.className = "vb-base";
      base.textContent = "VoiceBridge ativo (Python)";
      w.appendChild(base);
    }
    if (this.config.showLastPhrase && this._lastPhrase) {
      const line = document.createElement("div");
      line.className = "vb-last";
      let txt = `Último: "${this._lastPhrase}"`;
      if (this._lastMatched) {
        if (this._lastMatched === this._lastPhrase) {
          txt += " → comando";
        } else if (typeof this._lastMatched === "string" && this._lastMatched.startsWith("assistant")) {
          txt += " → assistente";
        } else {
          const pct = this._lastScore ? Math.round(this._lastScore * 100) : null;
          txt += ` → ${this._lastMatched}`;
          if (pct) {
            txt += ` (${pct}%)`;
          }
        }
      } else {
        txt += " (sem ação)";
      }
      line.textContent = txt;
      w.appendChild(line);
    }

    this._appendAssistantCapture(w);
    this._appendAssistantResult(w);
    return w;
  },

  _appendAssistantCapture(wrapper) {
    if (!this._assistantMode) {
      return;
    }

    const cap = document.createElement("div");
    cap.className = "vb-assistant vb-assistant-capture";
    if (this._assistantBuffer.length) {
      const question = this._assistantBuffer.map((part) => part.phrase).join(" ");
      cap.textContent = `Pergunta: ${question}`;
    } else {
      cap.textContent = "Assistente ouvindo...";
    }
    wrapper.appendChild(cap);
  },

  _appendAssistantResult(wrapper) {
    if (!this.config.assistant?.captureEnabled) {
      return;
    }

    const hasQuestion = Boolean(this._assistantLastQuestion);
    const hasStatus = this._assistantPending || this._assistantError || this._assistantResponse;
    if (!hasQuestion && !hasStatus) {
      return;
    }

    const block = document.createElement("div");
    block.className = "vb-assistant vb-assistant-result";

    if (hasQuestion) {
      const question = document.createElement("div");
      question.className = "vb-assistant-question";
      const providerLabel = this._assistantProvider ? ` [${this._assistantProvider}]` : "";
      question.textContent = `Pergunta${providerLabel}: ${this._assistantLastQuestion}`;
      block.appendChild(question);
    }

    const status = document.createElement("div");
    status.className = "vb-assistant-status";

    if (this._assistantPending) {
      status.textContent = "Consultando assistente...";
    } else if (this._assistantError) {
      status.classList.add("vb-assistant-error");
      status.textContent = `Erro: ${this._assistantError}`;
    } else if (this._assistantResponse) {
      status.classList.add("vb-assistant-response");
      status.textContent = this._assistantResponse;
    } else {
      status.textContent = "Nenhuma resposta disponível.";
    }

    block.appendChild(status);
    wrapper.appendChild(block);
  },
});
