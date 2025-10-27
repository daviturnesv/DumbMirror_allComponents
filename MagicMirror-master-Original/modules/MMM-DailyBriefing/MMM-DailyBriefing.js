/* global Module */

Module.register("MMM-DailyBriefing", {
  defaults: {
    provider: "gemini",
    title: "Resumo diário",
    maxEvents: 5,
    refreshInterval: 60 * 60 * 1000,
    showPlaceholders: true,
    systemPrompt:
      "Você é o assistente de um espelho inteligente residencial. Produza resumos positivos e objetivos em português do Brasil.",
  },

  start() {
    this.weatherData = null;
    this.calendarData = null;
    this.briefingText = null;
    this.errorText = null;
    this.isLoading = false;
    this._weatherFingerprint = null;
    this._calendarFingerprint = null;
    this._lastBriefingAt = 0;
    this._lastWeatherUsed = null;
    this._lastCalendarUsed = null;
  },

  getStyles() {
    return [this.file("MMM-DailyBriefing.css")];
  },

  notificationReceived(notification, payload, sender) {
    if (!notification) {
      return;
    }

    switch (notification) {
      case "CURRENTWEATHER_DATA":
        this._storeWeather(payload);
        break;
      case "CALENDAR_EVENTS":
        this._storeCalendar(payload);
        break;
      case "AI_RESPONSE":
        this._handleAIResponse(payload);
        break;
      case "DAILYBRIEFING_REFRESH":
        this.generateBriefing();
        break;
      case "DAILYBRIEFING_CLEAR":
        this.briefingText = null;
        this.errorText = null;
        this.isLoading = false;
        this.updateDom();
        break;
      default:
        break;
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-dailybriefing";

    const titleText = this.data?.header || this.config.title;
    if (titleText) {
      const header = document.createElement("div");
  header.className = "dailybriefing-title";
      header.textContent = titleText;
      wrapper.appendChild(header);
    }

    const body = document.createElement("div");
    body.className = "dailybriefing-body";

    if (this.isLoading) {
      body.textContent = "A gerar resumo...";
    } else if (this.errorText) {
      body.classList.add("dailybriefing-error");
      body.textContent = this.errorText;
    } else if (this.briefingText) {
      const segments = this.briefingText.split(/\n+/);
      for (const segment of segments) {
        const text = segment.trim();
        if (!text) {
          continue;
        }
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        body.appendChild(paragraph);
      }
      if (!body.childNodes.length) {
        body.textContent = this.briefingText;
      }
    } else if (this.config.showPlaceholders) {
      body.textContent = "Aguardando dados de clima e calendário...";
    }

    wrapper.appendChild(body);
    return wrapper;
  },

  _storeWeather(payload) {
    const fingerprint = this._fingerprint(payload);
    if (fingerprint && fingerprint === this._weatherFingerprint) {
      return;
    }
    this.weatherData = payload;
    this._weatherFingerprint = fingerprint;
    this._maybeGenerate();
  },

  _storeCalendar(payload) {
    const fingerprint = this._fingerprint(payload);
    if (fingerprint && fingerprint === this._calendarFingerprint) {
      return;
    }
    this.calendarData = payload;
    this._calendarFingerprint = fingerprint;
    this._maybeGenerate();
  },

  _handleAIResponse(payload) {
    if (!payload || payload.senderId !== this.identifier) {
      return;
    }

    this.isLoading = false;
    this._lastBriefingAt = Date.now();

    if (payload.error) {
      this.errorText = payload.error;
      this.briefingText = null;
    } else {
      this.errorText = null;
      this.briefingText = payload.response || "";
    }

    this.updateDom();
  },

  _maybeGenerate() {
    if (this.isLoading) {
      return;
    }

    if (!this.weatherData || !this.calendarData) {
      return;
    }

    const weatherChanged = this._weatherFingerprint !== this._lastWeatherUsed;
    const calendarChanged = this._calendarFingerprint !== this._lastCalendarUsed;

    if (!weatherChanged && !calendarChanged) {
      return;
    }

    if (Date.now() - this._lastBriefingAt < this.config.refreshInterval) {
      return;
    }

    this.generateBriefing();
  },

  generateBriefing() {
    const prompt = this._buildPrompt();
    if (!prompt) {
      return;
    }

    this.isLoading = true;
    this.errorText = null;
    this.briefingText = null;
    this._lastWeatherUsed = this._weatherFingerprint;
    this._lastCalendarUsed = this._calendarFingerprint;
    this.updateDom();

    this.sendNotification("GET_AI_RESPONSE", {
      provider: (this.config.provider || "gemini").toLowerCase(),
      prompt,
      senderId: this.identifier,
      systemPrompt: this.config.systemPrompt,
      options: { maxTokens: 600 },
    });
  },

  _buildPrompt() {
    const now = new Date();
    const dateLabel = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const weatherSummary = this._formatWeather(this.weatherData);
    const eventsSummary = this._formatEvents(this.calendarData);

    if (!weatherSummary && !eventsSummary) {
      return null;
    }

    return [
      `Hoje é ${dateLabel}.`,
      weatherSummary || "Sem dados meteorológicos no momento.",
      eventsSummary || "Sem compromissos na agenda.",
      "Monte um resumo diário acolhedor com até três parágrafos curtos. Inclua recomendações úteis quando fizer sentido.",
    ]
      .filter(Boolean)
      .join("\n\n");
  },

  _formatWeather(data) {
    if (!data || typeof data !== "object") {
      return "";
    }

    const current = data?.data?.current || data?.current || data;
    if (!current || typeof current !== "object") {
      return "";
    }

    const temperature = current.temp ?? current.temperature ?? current.temp_c ?? current.tempF;
    const feelsLike = current.feels_like ?? current.feelsLike ?? current.apparent_temperature;
    const summary = current.summary || current.weather || current.description;
    const humidity = current.humidity;

    const pieces = [];
    if (summary) {
      pieces.push(`Condição atual: ${summary}`);
    }
    if (Number.isFinite(temperature)) {
      pieces.push(`Temperatura: ${Math.round(temperature)}°C`);
    }
    if (Number.isFinite(feelsLike)) {
      pieces.push(`Sensação térmica: ${Math.round(feelsLike)}°C`);
    }
    if (Number.isFinite(humidity)) {
      pieces.push(`Humidade: ${Math.round(humidity)}%`);
    }

    if (!pieces.length && typeof current === "object") {
      const fallback = current?.condition || current?.weatherDesc || "";
      if (fallback) {
        pieces.push(`Clima: ${fallback}`);
      }
    }

    if (!pieces.length) {
      return "";
    }

    return `${pieces.join(". ")}.`;
  },

  _formatEvents(payload) {
    let list = [];
    if (Array.isArray(payload)) {
      list = payload;
    } else if (Array.isArray(payload?.events)) {
      list = payload.events;
    }

    if (!list.length) {
      return "";
    }

    const formatter = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

    const mapped = list.slice(0, this.config.maxEvents).map((event) => {
      const title = event?.title || event?.summary || "Compromisso";
      const start = event?.startDate || event?.startDateTime || event?.start || event?.startMoment;
      let startLabel = "sem horário";
      if (start) {
        const date = new Date(start);
        if (Number.isNaN(date.getTime())) {
          startLabel = String(start);
        } else {
          startLabel = formatter.format(date);
        }
      }
      return `${title} (${startLabel})`;
    });

    return `Próximos compromissos: ${mapped.join(", ")}.`;
  },

  _fingerprint(data) {
    if (data == null) {
      return null;
    }
    try {
      return JSON.stringify(data);
    } catch (error) {
      if (typeof console !== "undefined" && console?.warn) {
        console.warn("[MMM-DailyBriefing] Falha ao serializar dados:", error);
      }
      return String(Date.now());
    }
  },
});
