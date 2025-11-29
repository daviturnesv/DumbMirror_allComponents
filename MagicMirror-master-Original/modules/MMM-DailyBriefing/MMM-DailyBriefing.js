/* global Module */

Module.register("MMM-DailyBriefing", {
  defaults: {
    provider: "gemini",
    title: "Resumo diário",
    maxEvents: 5,
    refreshInterval: 60 * 60 * 1000,
    showPlaceholders: true,
    eventLookaheadHours: 24,
    eventPastHours: 2,
    onlySameDayEvents: true,
    aiMaxTokens: 360,
    aiTemperature: 0.3,
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
    this._weatherSnapshot = null;
    this._pendingContext = null;
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
      case "WEATHER_UPDATED":
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
        this._pendingContext = null;
        this._broadcastClear();
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
    const snapshot = this._selectWeatherSnapshot(payload);
    if (!snapshot) {
      return;
    }

    const fingerprint = this._fingerprint(snapshot);
    if (fingerprint && fingerprint === this._weatherFingerprint) {
      return;
    }
    this.weatherData = payload;
    this._weatherFingerprint = fingerprint;
    this._weatherSnapshot = snapshot;
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
      this._broadcastSummary(payload);
    } else {
      this.errorText = null;
      this.briefingText = payload.response || "";
      this._broadcastSummary(payload);
    }

    this._pendingContext = null;
    this.updateDom();
  },

  _maybeGenerate() {
    if (this.isLoading) {
      return;
    }

    const hasWeather = !!this.weatherData;
    const hasCalendar = !!this.calendarData;

    if (!hasWeather && !hasCalendar) {
      return;
    }

    const weatherChanged = hasWeather && this._weatherFingerprint !== this._lastWeatherUsed;
    const calendarChanged = hasCalendar && this._calendarFingerprint !== this._lastCalendarUsed;

    if (!weatherChanged && !calendarChanged) {
      return;
    }

    if (Date.now() - this._lastBriefingAt < this.config.refreshInterval) {
      return;
    }

    this.generateBriefing();
  },

  generateBriefing() {
    const context = this._buildPrompt();
    if (!context) {
      this.isLoading = false;
      this.errorText = "Sem dados de clima ou agenda disponíveis para gerar o resumo.";
      this.briefingText = null;
      this._pendingContext = null;
      this._broadcastSummary({ error: this.errorText });
      this.updateDom();
      return;
    }

    this.isLoading = true;
    this.errorText = null;
    this.briefingText = null;
    this._lastWeatherUsed = this._weatherFingerprint;
    this._lastCalendarUsed = this._calendarFingerprint;
    this._pendingContext = {
      weatherSummary: context.weatherSummary,
      eventSummary: context.eventSummary,
      eventsUsed: context.eventsUsed,
      generatedAt: Date.now(),
    };
    this.updateDom();

    const maxTokens = Number.isFinite(this.config.aiMaxTokens) ? this.config.aiMaxTokens : 360;
    const temperature = Number.isFinite(this.config.aiTemperature) ? this.config.aiTemperature : 0.3;

    this.sendNotification("GET_AI_RESPONSE", {
      provider: (this.config.provider || "gemini").toLowerCase(),
      prompt: context.prompt,
      senderId: this.identifier,
      systemPrompt: this.config.systemPrompt,
      options: { maxTokens, temperature },
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
    const { description: eventsSummary, events } = this._prepareEventSummary(this.calendarData);

    if (!weatherSummary && !eventsSummary) {
      return null;
    }

    const agendaBlock = eventsSummary || "Sem compromissos registrados para hoje. Apenas informe que a agenda está livre.";

    const rules = [
      "Responda exclusivamente em português do Brasil.",
      "Use exatamente dois parágrafos curtos (2 ou 3 frases cada), sem títulos, listas ou marcadores.",
      "Comece mencionando o clima atual, usando as informações fornecidas.",
      "No segundo parágrafo, comente sobre a agenda do dia. Se não houver compromissos, diga explicitamente que não há eventos agendados.",
      "Inclua no máximo uma recomendação prática relacionada ao clima ou aos compromissos mencionados, somente se fizer sentido.",
      "Não invente fatos, feriados, locais ou horários que não estejam na entrada.",
      "Comece diretamente com o texto; não crie cabeçalhos nem dê nomes ao resumo.",
    ].join("\n");

    const prompt = [
      `Data local: ${dateLabel}.`,
      weatherSummary
        ? `Dados meteorológicos atuais: ${weatherSummary}`
        : "Sem dados meteorológicos confiáveis disponíveis.",
      `Agenda de hoje:\n${agendaBlock}`,
      "Instruções:",
      rules,
    ]
      .filter(Boolean)
      .join("\n\n");

    return { prompt, weatherSummary, eventSummary: agendaBlock, eventsUsed: events };
  },

  _formatWeather(data) {
    if (!data || typeof data !== "object") {
      return "";
    }

    const current = this._selectWeatherSnapshot(data);
    if (!current || typeof current !== "object") {
      return "";
    }

    const temperature =
      current.temp ??
      current.temperature ??
      current.temp_c ??
      current.tempF ??
      current.temperatureC ??
      current.temperatureValue;
    const feelsLike =
      current.feels_like ??
      current.feelsLike ??
      current.feelsLikeTemp ??
      current.apparent_temperature ??
      current.apparentTemperature;
    const summary =
      current.summary ||
      current.weather ||
      current.description ||
      this._mapWeatherType(current.weatherType);
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

  _selectWeatherSnapshot(data) {
    if (!data || typeof data !== "object") {
      return null;
    }
    if (data.currentWeather) {
      return data.currentWeather;
    }
    if (data?.data?.current) {
      return data.data.current;
    }
    if (data.current) {
      return data.current;
    }
    if (Array.isArray(data.hourlyArray) && data.hourlyArray.length) {
      return data.hourlyArray[0];
    }
    return data;
  },

  _mapWeatherType(type) {
    if (!type) {
      return "";
    }
    const lookup = {
      clear: "céu limpo",
      cloudy: "nublado",
      rain: "chuva",
      rainy: "chuva",
      snow: "neve",
      storm: "tempestade",
      thunderstorm: "tempestade",
      drizzle: "garoa",
      mist: "nevoeiro",
      fog: "neblina",
      sunny: "ensolarado",
      partlycloudy: "parcialmente nublado",
      partlyclouded: "parcialmente nublado",
      overcast: "encoberto",
      windy: "ventoso"
    };

  const normalized = String(type).toLowerCase().replaceAll(/[^a-z]/g, "");
    return lookup[normalized] || String(type);
  },

  _prepareEventSummary(payload) {
    let list = [];
    if (Array.isArray(payload)) {
      list = payload;
    } else if (Array.isArray(payload?.events)) {
      list = payload.events;
    }

    const filtered = this._filterEvents(list);
    if (!filtered.length) {
      return { description: "", events: [] };
    }

    const now = new Date();
    const lines = filtered.slice(0, this.config.maxEvents).map((event) => this._formatEventLine(event, now));
    const description = lines.map((line) => `- ${line}`).join("\n");

    return { description, events: filtered.slice(0, this.config.maxEvents) };
  },

  _filterEvents(events) {
    if (!Array.isArray(events) || !events.length) {
      return [];
    }

    const now = new Date();
    const lookaheadMs = Math.max(0, Number(this.config.eventLookaheadHours || 0)) * 60 * 60 * 1000;
    const pastMs = Math.max(0, Number(this.config.eventPastHours || 0)) * 60 * 60 * 1000;

    return events.filter((event) => {
      const start = this._parseEventStart(event);
      if (!start) {
        return false;
      }

      event._dailyBriefingStart = start;

      if (this.config.onlySameDayEvents && !this._isSameDay(start, now)) {
        return false;
      }

      const diff = start.getTime() - now.getTime();
      if (lookaheadMs > 0 && diff > lookaheadMs) {
        return false;
      }
      if (pastMs > 0 && diff < -pastMs) {
        return false;
      }
      return true;
    });
  },

  _parseEventStart(event) {
    if (!event || typeof event !== "object") {
      return null;
    }

    if (event._dailyBriefingStart instanceof Date && !Number.isNaN(event._dailyBriefingStart.getTime())) {
      return event._dailyBriefingStart;
    }

    const sources = [
      event.startDate,
      event.startDateTime,
      event.start,
      event.startMoment,
    ];

    for (const value of sources) {
      if (!value) {
        continue;
      }
      if (typeof value === "number") {
        return new Date(value);
      }
      if (typeof value === "string") {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          const fromNumeric = new Date(numeric);
          if (!Number.isNaN(fromNumeric.getTime())) {
            return fromNumeric;
          }
        }
        const fromString = new Date(value);
        if (!Number.isNaN(fromString.getTime())) {
          return fromString;
        }
        continue;
      }
      if (typeof value === "object") {
        if (typeof value.valueOf === "function") {
          const fromValue = new Date(value.valueOf());
          if (!Number.isNaN(fromValue.getTime())) {
            return fromValue;
          }
        }
        if (typeof value.toDate === "function") {
          const fromDate = value.toDate();
          if (fromDate instanceof Date && !Number.isNaN(fromDate.getTime())) {
            return fromDate;
          }
        }
      }
    }

    return null;
  },

  _formatEventLine(event, now) {
    const title = event?.title || event?.summary || "Compromisso";
    const start = this._parseEventStart(event);
    if (!start) {
      return `${title} (horário indefinido)`;
    }

    if (this._isAllDayEvent(event)) {
      return `${title} (dia inteiro)`;
    }

    if (this._isSameDay(start, now)) {
      const formatter = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${title} (${formatter.format(start)})`;
    }

    const formatter = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${title} (${formatter.format(start)})`;
  },

  _isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  },

  _isAllDayEvent(event) {
    if (event && typeof event === "object") {
      if (event.fullDayEvent === true || event.isFullDay === true || event.allDay === true) {
        return true;
      }
      if (typeof event.startTime === "boolean" && event.startTime === false) {
        return true;
      }
    }
    return false;
  },

  _broadcastClear() {
    this.sendNotification("SENSORDATA_SUMMARY", {
      ts: Date.now(),
      source: "MMM-DailyBriefing",
      senderId: this.identifier,
      provider: null,
      requestId: null,
      type: "dailyBriefing:cleared",
      text: null,
      error: null,
      weatherSummary: null,
      agendaSummary: null,
      events: [],
    });
  },

  _broadcastSummary(payload) {
    const ts = Date.now();
    const context = this._pendingContext || {};
    const summaryPayload = {
      ts,
      source: "MMM-DailyBriefing",
      senderId: this.identifier,
      provider: payload?.provider || null,
      requestId: payload?.requestId || null,
      type: payload?.error ? "dailyBriefing:error" : "dailyBriefing",
      text: payload?.error ? null : (this.briefingText || null),
      error: payload?.error || null,
      weatherSummary: context.weatherSummary || null,
      agendaSummary: context.eventSummary || null,
      events: Array.isArray(context.eventsUsed)
        ? context.eventsUsed
            .slice(0, this.config.maxEvents)
            .map((event) => this._summarizeEventForRelay(event))
            .filter(Boolean)
        : [],
    };

    this.sendNotification("SENSORDATA_SUMMARY", summaryPayload);
  },

  _summarizeEventForRelay(event) {
    if (!event || typeof event !== "object") {
      return null;
    }
    const start = this._parseEventStart(event);
    return {
      title: event.title || event.summary || null,
      calendarName: event.calendarName || event.calendarNameOverride || null,
      allDay: this._isAllDayEvent(event),
      startISO: start instanceof Date && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
    };
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
