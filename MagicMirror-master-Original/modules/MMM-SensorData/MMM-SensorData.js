/* global Module */
/**
 * MMM-SensorData
 * Front-end part of the module: receives sensor data via socket notifications
 * and renders it on the MagicMirror UI.
 */
Module.register("MMM-SensorData", {
  // Default module config.
  defaults: {
    mqttServer: "mqtt://localhost:1883", // e.g. mqtt://192.168.1.10:1883
    topic: "smartmirror/sensors",
    updateInterval: 0,
    showIcons: true,
    decimals: 1,
    loadingText: "A aguardar dados dos sensores...",
    motionTextOn: "Movimento Detectado",
    motionTextOff: "Nenhum Movimento",
    lightUnit: "lx",
    showStatus: true,
    statusText: {
      connecting: "Ligando MQTT...",
      connected: "MQTT OK",
  disconnected: "MQTT offline (verifique dependência mqtt)",
      inactive: "Sem dados recentes"
    },
    statusIcons: {
      connecting: "fa-plug",
      connected: "fa-check-circle",
      disconnected: "fa-exclamation-triangle",
      inactive: "fa-clock-o"
    },
    // Persistência
    enablePersistence: true,
    dbPath: "data/sensordata.db",
    retentionDays: 30,
  // persistenceBackend: 'auto' | 'sqlite' | 'json'
  // auto: tenta sqlite e cai para json; json: força JSON sem tentar sqlite; sqlite: tenta apenas sqlite (se falhar, sem persistência)
  persistenceBackend: 'auto',
  // Estatísticas / manutenção
  dbStatsIntervalMinutes: 60,
  // Downsampling (somente SQLite)
  downsample: false,
  downsampleIntervalMinutes: 5,
  downsampleKeepRawHours: 12,
  downsamplePurgeRaw: true,
  downsampleRunIntervalMinutes: 30,
    // Staleness / atividade
    staleAfterSeconds: 60,
    staleIndicatorText: "(desatualizado)",
    showLastUpdate: true,
    uiRefreshSeconds: 10,
    deviceInactivitySeconds: 120,
    // Histórico / gráficos
    historyMinutes: 180,
  showCharts: true,
  chartsStartHidden: true,
    chartHeight: 30,
    chartWidth: 160,
    chartLineColor: "#6cc070",
    chartFillColor: "rgba(108,192,112,0.25)",
    chartStrokeWidth: 1,
    chartDecimals: 1,
  chartRefreshSeconds: 120,
  // Simulação (gera dados se mqtt não disponível)
  simulateIfNoMqtt: true,
  // Exportação CSV
  exportButton: false,
  exportSinceMinutes: 1440, // 24h
  exportDir: 'data',
  // Novo modo incremental: em vez de gerar snapshot completo cria/apende em um único arquivo
  incrementalExport: false, // quando true ignora exportSinceMinutes e exporta apenas novas linhas (ts > último export)
  exportFileName: 'sensordata.csv',
  // Automação / integração sem toque
  autoExportIntervalMinutes: 0, // >0 para exportações periódicas
  broadcastSummary: false, // envia notificação SENSORDATA_SUMMARY a cada atualização
  // Relatórios
  reportButton: true, // mostra botão para relatório rápido (últimas 2h)
  showReportPanel: true, // mostra painel com estatísticas do último relatório
  reportPanelDurationMs: 10000, // tempo que o painel do relatório fica visível (0 = permanente)
  detailedReport: true, // mostra painel detalhado em linhas separadas/tabela
  reportGroupRowsMax: 12, // máximo de linhas de grupos (hora/dia) a mostrar
  logLevel: 'info', // níveis: 'silent' | 'error' | 'warn' | 'info' | 'debug'
  // Escala do painel de relatório (controlada por voz)
  reportScale: 1,
  reportScaleMin: 0.6,
  reportScaleMax: 2,
  reportScaleStep: 0.15,
  // Resumo IA via MMM-AIManager.
  aiSummaryEnabled: false,
  aiProvider: 'gemini',
  aiMaxTokens: 320,
  aiTemperature: 0.4,
  aiSystemPrompt: '',
  aiUseFallback: true
  },

  // Will hold the latest sensor payload.
  sensorData: null,
  loaded: false,
  connectionStatus: "connecting", // connecting | connected | disconnected
  lastUpdate: null,
  stale: false,
  _staleTimer: null,
  _uiRefreshTimer: null,
  _historyTimer: null,
  _history: null,
  _autoExportTimer: null,
  _chartsVisible: false,
  _exportInfoTimer: null,
  _reportHideTimer: null,
  _reportScale: 1,

  start() {
    // Enviar config ao backend
    this.sendSocketNotification("SENSORDATA_CONFIG", this.config);
  // Controle inicial de gráficos
  this._chartsVisible = this.config.chartsStartHidden ? false : !!this.config.showCharts;
    // Staleness
    this._staleTimer = setInterval(() => {
      if (!this.lastUpdate) return;
      const ageSec = (Date.now() - this.lastUpdate) / 1000;
      const shouldBeStale = ageSec >= this.config.staleAfterSeconds;
      if (shouldBeStale !== this.stale) {
        this.stale = shouldBeStale;
        this.updateDom();
      }
    }, 5000);
    // UI refresh
    this._uiRefreshTimer = setInterval(() => {
      if (this.loaded) this.updateDom();
    }, (this.config.uiRefreshSeconds || 10) * 1000);
  // Histórico (apenas se visível no início)
    if (this._chartsVisible) {
      this._initHistoryLoop();
    }

    // Se ativada simulação e MQTT não conecta, gerar dados sintéticos para teste visual.
    if (this.config.simulateIfNoMqtt) {
      this._simTimer = setInterval(() => {
        if (this.connectionStatus === 'connected' || this.sensorData) {
          return; // dados reais chegaram
        }
        const now = Date.now();
        // Gera curvas suaves pseudo-aleatórias
        const base = (n, amp, off) => off + Math.sin((now / 10000) + (n)) * amp + (Math.random() * amp * 0.2);
        const payload = {
          temperature: +(20 + base(0.3, 3, 0)).toFixed(1),
          humidity: +(50 + base(0.6, 10, 0)).toFixed(1),
          light: Math.max(0, Math.round(400 + base(0.9, 150, 0))),
          motion: Math.random() < 0.1
        };
        this.sensorData = payload;
        this.loaded = true;
        this.lastUpdate = now;
        this.updateDom();
      }, 4000);
    }
    this._exportPending = false;
    this._scheduleAutoExport();
  // Escala inicial
  this._reportScale = this.config.reportScale || 1;
    this._pendingAiSummary = null;
    this._aiWatchdogTimer = null;
  },

  getStyles() {
    return ["MMM-SensorData.css", "font-awesome.css"]; // font-awesome already bundled in MagicMirror (css/font-awesome.css)
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-SensorData";
    // aplica escala do relatório via CSS custom property
    if (this._reportScale && !isNaN(this._reportScale)) {
      wrapper.style.setProperty('--sd-report-scale', String(this._reportScale));
    }
    this._appendStatus(wrapper);
    if (this._shouldShowLoading()) return this._appendLoading(wrapper);
    if (!this.sensorData) return wrapper;
    this._appendSensorRows(wrapper);
    this._appendLastUpdate(wrapper);
    this._appendCharts(wrapper);
  this._appendExport(wrapper);
  this._appendReportPanel(wrapper);
    return wrapper;
  },

  _appendStatus(wrapper) {
    if (!this.config.showStatus) return;
    const statusRow = document.createElement("div");
    statusRow.className = `sensor-status status-${this.connectionStatus}`;
    const iconClass = this.config.statusIcons[this.connectionStatus] || "fa-info-circle";
    statusRow.innerHTML = `<span class="fa ${iconClass} status-icon"></span><span class="status-text">${this.config.statusText[this.connectionStatus] || this.connectionStatus}</span>`;
    wrapper.appendChild(statusRow);
  },

  _shouldShowLoading() {
    return (!this.loaded || !this.sensorData) && this.connectionStatus !== "connected";
  },

  _appendLoading(wrapper) {
    const loading = document.createElement("div");
    loading.className = "sensor-loading";
    loading.textContent = this.config.loadingText;
    wrapper.appendChild(loading);
    return wrapper;
  },

  _appendSensorRows(wrapper) {
    const { temperature, humidity, light, motion } = this.sensorData;
    if (typeof temperature !== 'undefined') {
      const row = this._buildRow('fa-thermometer-half', `${temperature.toFixed(this.config.decimals)}°C`);
      row.classList.add('sd-temp');
      if (typeof temperature === 'number') {
        if (temperature < 18) row.classList.add('sd-cold');
        else if (temperature >= 26) row.classList.add('sd-hot');
        else row.classList.add('sd-comfy');
      }
      wrapper.appendChild(row);
    }
    if (typeof humidity !== 'undefined') {
      const row = this._buildRow('fa-tint', `${humidity.toFixed(this.config.decimals)}%`);
      row.classList.add('sd-humidity');
      wrapper.appendChild(row);
    }
    if (typeof light !== 'undefined') {
      const row = this._buildRow('fa-lightbulb-o', `${light} ${this.config.lightUnit}`);
      row.classList.add('sd-light');
      wrapper.appendChild(row);
    }
    if (typeof motion !== 'undefined') {
      const row = this._buildRow('fa-running fa-person-walking', motion ? this.config.motionTextOn : this.config.motionTextOff);
      row.classList.add('sd-motion');
      if (motion) row.classList.add('motion-active');
      wrapper.appendChild(row);
    }
  },

  _appendLastUpdate(wrapper) {
    if (!this.config.showLastUpdate || !this.lastUpdate) return;
    const ageSec = Math.round((Date.now() - this.lastUpdate) / 1000);
    const since = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
    wrapper.appendChild(this._buildInfoRow(`Atualizado há ${since}${this.stale ? " " + this.config.staleIndicatorText : ""}`));
  },

  _appendCharts(wrapper) {
  if (!this._chartsVisible || !this._history) return;
    const chartsWrapper = document.createElement("div");
    chartsWrapper.className = "sensor-charts";
    const metrics = [
      { key: "temperature", label: "Temp (°C)" },
      { key: "humidity", label: "Hum (%)" },
      { key: "light", label: `Luz (${this.config.lightUnit})` }
    ];
    metrics.forEach(m => {
      const series = this._history.readings.map(r => (typeof r[m.key] === "number" ? r[m.key] : null)).filter(v => v !== null);
      if (!series.length) return;
      chartsWrapper.appendChild(this._drawMiniChart(series, m.label));
    });
    wrapper.appendChild(chartsWrapper);
  },

  _appendExport(wrapper) {
    if (!this.config.exportButton) return;
    const row = document.createElement('div');
    row.className = 'sensor-row info-row';
    const btn = document.createElement('button');
  const baseLabel = this.config.incrementalExport ? 'Export Append' : 'Export CSV';
  btn.textContent = this._exportPending ? 'Exportando...' : baseLabel;
    btn.disabled = !!this._exportPending;
    btn.style.fontSize = '11px';
    btn.style.cursor = 'pointer';
    btn.onclick = () => {
  this._triggerExport();
    };
    row.appendChild(btn);
  if (this._history?.rawStartTs) {
      const span = document.createElement('span');
      span.className = 'sensor-info';
      span.style.marginLeft = '8px';
      span.style.fontSize = '10px';
      span.textContent = 'Dados antigos agregados (< ' + new Date(this._history.rawStartTs).toLocaleTimeString() + ')';
      row.appendChild(span);
    }
    if (this._historyExportInfo) {
      const info = document.createElement('div');
      info.className = 'sensor-row info-row';
      const span2 = document.createElement('span');
      span2.className = 'sensor-info';
      span2.style.fontSize = '10px';
      span2.textContent = this._historyExportInfo;
      info.appendChild(span2);
      // Wrap both button row + info in a container for clarity
      const container = document.createElement('div');
      container.appendChild(row);
      container.appendChild(info);
      if (this.config.reportButton) {
        container.appendChild(this._buildReportButton());
      }
      wrapper.appendChild(container);
      return;
    }
    if (this.config.reportButton) {
      row.appendChild(this._buildReportButton());
    }
    wrapper.appendChild(row);
  },
  _buildReportButton() {
    const btn = document.createElement('button');
    btn.style.marginLeft = '6px';
    btn.style.fontSize = '11px';
    btn.textContent = this._reportPending ? 'Relatório...' : 'Relatório 2h';
    btn.disabled = !!this._reportPending;
    btn.onclick = () => this._requestReport({ range:{ minutes:120 }, groupBy:'hour' });
    return btn;
  },
  _appendReportPanel(wrapper) {
    if (!this.config.showReportPanel || !this._lastReport) return;
    const r = this._lastReport;
    // simple mode text stays, redesign only for detailedReport
    if (!this.config.detailedReport) {
      const box = document.createElement('div');
      box.className = 'sensor-row info-row sd-report-min';
      const genTs = new Date(r.generatedAt || Date.now()).toLocaleTimeString();
      const parts = [];
      const fmt = v => (v==null||isNaN(v)?'-':v.toFixed(1));
      if (r.stats?.temperature) parts.push(`T ${fmt(r.stats.temperature.avg)}°`);
      if (r.stats?.humidity) parts.push(`H ${fmt(r.stats.humidity.avg)}%`);
      if (r.stats?.light) parts.push(`L ${Math.round(r.stats.light.avg)}`);
      if (r.stats?.motion?.ratio!=null) parts.push(`Mov ${(r.stats.motion.ratio*100).toFixed(0)}%`);
      box.textContent = `${r.rangeLabel||'Relatório'} ${genTs} · ${parts.join('  |  ')}`;
      wrapper.appendChild(box);
      return;
    }
    const box = document.createElement('div');
    box.className = 'sensor-row info-row sd-report-panel';
    box.innerHTML = this._buildReportHTML(r);
    wrapper.appendChild(box);
  },
  _buildReportHTML(r) {
    const fmt = (v,d=1)=> (v==null||isNaN(v)?'-':Number(v).toFixed(d));
    const title = r.rangeLabel || 'Relatório';
    const tsStr = new Date(r.generatedAt || Date.now()).toLocaleTimeString();
    const counts = (r.aggregatedCount!=null)
      ? `${r.totalReadings} leituras · raw ${r.rawCount} · agg ${r.aggregatedCount}`
      : `${r.totalReadings||0} leituras`;
    const ds = r.downsamplingActive
      ? `downsampling ativo${r.lastDownsampleRun? ' · último '+ new Date(r.lastDownsampleRun).toLocaleTimeString():''}`
      : 'downsampling inativo';
    const metricCard = (label, key, unit, accentClass='') => {
      const s = r.stats?.[key];
      if (!s) return '';
      return `<div class="sd-card ${accentClass}"><div class="sd-card-label">${label}</div><div class="sd-card-main">${fmt(s.avg)}${unit||''}</div><div class="sd-card-sub"><span>min ${fmt(s.min)}</span><span>max ${fmt(s.max)}</span><span>med ${fmt(s.median)}</span></div></div>`;
    };
    const motionCard = (() => {
      const m = r.stats?.motion; if (!m) return '';
      const pct = m.ratio!=null ? (m.ratio*100).toFixed(0)+'%' : '-';
      return `<div class="sd-card sd-motion-card"><div class="sd-card-label">Mov</div><div class="sd-card-main">${pct}</div><div class="sd-card-sub"><span>${m.events||0} ev</span><span>${m.samples||0} am</span></div></div>`;
    })();
    let groups = '';
    if (Array.isArray(r.groups) && r.groups.length) {
      const maxRows = this.config.reportGroupRowsMax || 12;
      const shown = r.groups.slice(-maxRows);
      const more = r.groups.length - shown.length;
      const rows = shown.map(g => {
        const bt = new Date(g.bucketStart);
        const lab = (r.groupBy==='hour') ? (bt.getHours().toString().padStart(2,'0')+':00') : bt.toLocaleDateString();
        const st = g.stats || {};
        const t = st.temperature?.avg; const h = st.humidity?.avg; const l = st.light?.avg; const mv = st.motion?.ratio;
        const mp = mv!=null ? (mv*100).toFixed(0)+'%' : '-';
        return `<tr><td>${lab}</td><td>${fmt(t)}</td><td>${fmt(h)}</td><td>${l==null||isNaN(l)?'-':Math.round(l)}</td><td>${mp}</td></tr>`;
      }).join('');
      groups = `<div class="sd-groups"><table><thead><tr><th>${r.groupBy==='hour'?'Hora':'Dia'}</th><th>T</th><th>H</th><th>L</th><th>Mov</th></tr></thead><tbody>${rows}</tbody></table>${more>0?`<div class='sd-more'>+${more} mais</div>`:''}</div>`;
    }
    // AI summary area logic (placeholder / error / summary)
    let aiBlock = '';
    if (this.config.aiSummaryEnabled) {
      if (r.aiSummary) {
  const badges = [];
  if (r.fallback) badges.push('<span class="sd-badge sd-badge-fallback" title="Resumo heurístico local (falha IA)">LOCAL</span>');
  if (r.cached) badges.push('<span class="sd-badge sd-badge-cached" title="Resultado em cache">CACHE</span>');
  aiBlock = `<div class="sd-ai-summary">${badges.length?`<div class='sd-ai-badges'>${badges.join(' ')}</div>`:''}${this._escapeHtml(r.aiSummary)}</div>`;
      } else if (r.aiSummaryError) {
        const msg = r.aiSummaryError === 'no-api-key' ? 'Resumo IA: configure GEMINI_API_KEY.' : 'Resumo IA indisponível ('+this._escapeHtml(r.aiSummaryError)+')';
        aiBlock = `<div class="sd-ai-summary sd-ai-error">${msg}</div>`;
      } else if (!r._aiSummaryAttempted) {
        // enquanto backend gera
        aiBlock = `<div class="sd-ai-summary sd-ai-loading">Gerando resumo inteligente...</div>`;
      }
    }
    return `<div class="sd-report-head"><span class="sd-report-title">${title}</span><span class="sd-report-ts">${tsStr}</span></div>
      <div class="sd-report-meta"><span>${counts}</span><span class="sd-ds ${r.downsamplingActive?'on':'off'}">${ds}</span></div>
      <div class="sd-cards">${metricCard('Temp','temperature','°C','sd-temp-card')+metricCard('Hum','humidity','%','sd-hum-card')+metricCard('Luz','light','', 'sd-light-card')+motionCard}</div>
      ${groups}
      ${aiBlock}`;
  },
  _escapeHtml(str){
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  },

  _buildRow(iconClass, valueText) {
    const row = document.createElement("div");
    row.className = "sensor-row" + (this.stale ? " stale" : "");

    if (this.config.showIcons) {
      const icon = document.createElement("span");
      icon.className = `fa ${iconClass} sensor-icon`;
      row.appendChild(icon);
    }

    const value = document.createElement("span");
    value.className = "sensor-value";
    value.textContent = valueText;
    row.appendChild(value);

    return row;
  },

  _buildInfoRow(text) {
    const row = document.createElement("div");
    row.className = "sensor-row info-row" + (this.stale ? " stale" : "");
    const span = document.createElement("span");
    span.className = "sensor-info";
    span.textContent = text;
    row.appendChild(span);
    return row;
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case 'SENSORDATA_UPDATE':
        this._handleUpdate(payload); break;
      case 'SENSORDATA_STATUS':
        if (payload?.status) { this.connectionStatus = payload.status; this.updateDom(); }
        break;
      case 'SENSORDATA_HISTORY':
        this._history = payload; this.updateDom(); break;
      case 'SENSORDATA_EXPORT_DONE':
        this._handleExportDone(payload); break;
      case 'SENSORDATA_REPORT_READY':
        this._handleReportReady(payload); break;
    }
  },

  _handleUpdate(payload) {
    this.sensorData = payload;
    this.loaded = true;
    this.lastUpdate = Date.now();
    if (this.connectionStatus === 'connecting') this.connectionStatus = 'connected';
    if (this.stale) this.stale = false;
    this._maybeAppendLiveHistoryPoint(payload);
    if (this.config.broadcastSummary) {
      this.sendNotification('SENSORDATA_SUMMARY', {
        ts: this.lastUpdate,
        temperature: payload.temperature,
        humidity: payload.humidity,
        light: payload.light,
        motion: payload.motion
      });
    }
    this.updateDom();
  },

  _maybeAppendLiveHistoryPoint(payload) {
    const hist = this._history?.readings;
    if (!this._chartsVisible || !Array.isArray(hist)) {
      return;
    }
    const ts = this.lastUpdate;
    const last = hist[hist.length - 1];
    if (last && (ts - last.ts) <= 500 && (ts - last.ts) >= -500) {
      return; // duplicado
    }
    let motion = null;
    if (typeof payload.motion === 'boolean') {
      motion = payload.motion ? 1 : 0;
    } else if (typeof payload.motion === 'number') {
      motion = payload.motion;
    }
    hist.push({
      ts,
      temperature: (typeof payload.temperature === 'number') ? payload.temperature : null,
      humidity: (typeof payload.humidity === 'number') ? payload.humidity : null,
      light: (typeof payload.light === 'number') ? payload.light : null,
      motion
    });
    const cutoff = Date.now() - (this.config.historyMinutes || 60) * 60000;
    // Fast purge by shifting while first is old (typically few iterations)
    while (hist.length > 2 && hist[0].ts < cutoff) {
      hist.shift();
    }
  },

  _handleExportDone(payload) {
    this._exportPending = false;
    if (payload.success) {
      this._historyExportInfo = `Exportado ${payload.rows} linhas${payload.filePath ? ' -> ' + payload.filePath : ''}`;
    } else {
      this._historyExportInfo = 'Falha export: ' + payload.error;
    }
    if (this._exportInfoTimer) {
      clearTimeout(this._exportInfoTimer);
    }
    this._exportInfoTimer = setTimeout(() => {
      this._historyExportInfo = null;
      this.updateDom();
    }, 8000);
    this.updateDom();
  },

  _requestHistory() {
    this.sendSocketNotification("SENSORDATA_GET_HISTORY", { sinceMinutes: this.config.historyMinutes });
  },

  _drawMiniChart(series, label) {
    const w = this.config.chartWidth;
    const h = this.config.chartHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.className = "sensor-chart";
    const ctx = canvas.getContext("2d");
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const stepX = w / (series.length - 1 || 1);
    ctx.lineWidth = this.config.chartStrokeWidth;
    ctx.strokeStyle = this.config.chartLineColor;
    ctx.beginPath();
    series.forEach((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Optional fill
    if (this.config.chartFillColor) {
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = this.config.chartFillColor;
      ctx.fill();
    }
    const container = document.createElement("div");
    container.className = "sensor-chart-row";
    const lbl = document.createElement("div");
    lbl.className = "sensor-chart-label";
    const last = series[series.length - 1];
    lbl.textContent = `${label}: ${last.toFixed(this.config.chartDecimals)}`;
    container.appendChild(lbl);
    container.appendChild(canvas);
    return container;
  }
  ,
  _triggerExport() {
    if (this._exportPending) return;
    this._exportPending = true;
    this.updateDom();
    this.sendSocketNotification('SENSORDATA_EXPORT_CSV', { sinceMinutes: this.config.exportSinceMinutes });
  },
  _scheduleAutoExport() {
    if (this._autoExportTimer) clearInterval(this._autoExportTimer);
    const minutes = this.config.autoExportIntervalMinutes || 0;
    if (minutes > 0) {
      this._autoExportTimer = setInterval(() => this._triggerExport(), minutes * 60000);
    }
  },
  notificationReceived(notification, payload, sender) {
    switch (notification) {
      case 'SENSORDATA_EXPORT':
        this._triggerExport();
        break;
      case 'SENSORDATA_REFRESH_HISTORY':
        this._requestHistory();
        break;
      case 'SENSORDATA_COMMAND': {
        const action = typeof payload === 'string' ? payload : payload?.action;
        if (action === 'export') {
          this._triggerExport();
        } else if (action === 'refreshHistory') {
          this._requestHistory();
        } else if (action === 'report' || action === 'report2h') {
          this._requestReport({ range: { minutes: 120 }, groupBy: 'hour' });
        } else if (action === 'showCharts') {
          this._setChartsVisible(true);
        } else if (action === 'hideCharts') {
          this._setChartsVisible(false);
        } else if (action === 'reportDay') {
          this._requestReport({ range: 'today', groupBy: 'hour', rangeLabel: 'Hoje' });
        } else if (action === 'reportMonth') {
          this._requestReport({ range: 'month', groupBy: 'day', rangeLabel: 'Este mês' });
        } else if (action === 'hideReport') {
          this._hideReport();
        } else if (action === 'reportScaleUp') {
          this._adjustReportScale(+1);
        } else if (action === 'reportScaleDown') {
          this._adjustReportScale(-1);
        }
        break; }
      case 'AI_RESPONSE':
        this._handleAiResponse(payload);
        break;
    }
  }
  ,
  _adjustReportScale(dir){
    const step = this.config.reportScaleStep || 0.1;
    const min = this.config.reportScaleMin || 0.5;
    const max = this.config.reportScaleMax || 2;
    let v = (this._reportScale || 1) + (dir * step);
    if (v < min) v = min; if (v > max) v = max;
    if (Math.abs(v - this._reportScale) < 0.0001) return; // sem mudança
    this._reportScale = parseFloat(v.toFixed(3));
    this.updateDom();
  },
  _requestReport(opts) {
    if (this._reportPending) {
      return;
    }
    this._reportPending = true;
    this.updateDom();
    this.sendSocketNotification('SENSORDATA_REPORT_REQUEST', opts || { range: { minutes: 120 }, groupBy: 'hour' });
  },
  _handleReportReady(payload) {
    if (!payload?.success) {
      console.log('[MMM-SensorData] Falha relatório:', payload?.error);
      return;
    }
    console.log('[MMM-SensorData] Relatório pronto:', payload);
  // placeholder deve aparecer enquanto o backend gera (marcar como não tentado ainda)
  payload._aiSummaryAttempted = false;
  this._lastReport = payload;
    if (payload.aiSummaryFallback) {
      this._lastReport.aiSummaryFallback = payload.aiSummaryFallback;
    }
    if (!this._lastReport.generatedAt) this._lastReport.generatedAt = Date.now();
    this.sendNotification('SENSORDATA_REPORT_BROADCAST', payload);
    this._reportPending = false;
    this.updateDom();
    if (this.config.reportPanelDurationMs > 0) {
      if (this._reportHideTimer) clearTimeout(this._reportHideTimer);
      this._reportHideTimer = setTimeout(() => {
        this._lastReport = null;
        this.updateDom();
      }, this.config.reportPanelDurationMs);
    }
      this._triggerAiSummary(payload);
  },

    _triggerAiSummary(report) {
      if (!this.config.aiSummaryEnabled) {
        return;
      }

      if (this._aiWatchdogTimer) {
        clearTimeout(this._aiWatchdogTimer);
        this._aiWatchdogTimer = null;
      }

      if (!this._lastReport) {
        return;
      }

      if (report.aiSummaryError) {
        this._lastReport.aiSummaryError = report.aiSummaryError;
        this._lastReport._aiSummaryAttempted = true;
        this.updateDom();
        return;
      }

      const prompt = report.aiSummaryPrompt;
      if (!prompt) {
        this._lastReport.aiSummaryError = 'prompt-missing';
        this._lastReport._aiSummaryAttempted = true;
        this.updateDom();
        return;
      }

      const provider = (report.aiProvider || this.config.aiProvider || 'gemini').toLowerCase();
      const options = {};
      if (typeof this.config.aiMaxTokens === 'number' && this.config.aiMaxTokens > 0) {
        options.maxTokens = this.config.aiMaxTokens;
      }
      if (typeof this.config.aiTemperature === 'number' && !Number.isNaN(this.config.aiTemperature)) {
        options.temperature = this.config.aiTemperature;
      }

      const payload = {
        senderId: this.identifier,
        provider,
        prompt,
      };

      if (this.config.aiSystemPrompt) {
        payload.systemPrompt = this.config.aiSystemPrompt;
      }
      if (Object.keys(options).length) {
        payload.options = options;
      }

      this._pendingAiSummary = { from: report.from, to: report.to };
      this.sendNotification('GET_AI_RESPONSE', payload);

      this._aiWatchdogTimer = setTimeout(() => {
        if (!this._lastReport || !this._pendingAiSummary) {
          return;
        }
        this._lastReport.aiSummaryError = 'timeout';
        this._lastReport._aiSummaryAttempted = true;
        this._pendingAiSummary = null;
        this.updateDom();
      }, 20000);
    },

    _handleAiResponse(payload) {
      if (!payload || payload.senderId !== this.identifier) {
        return;
      }

      if (!this._lastReport) {
        return;
      }

      if (this._aiWatchdogTimer) {
        clearTimeout(this._aiWatchdogTimer);
        this._aiWatchdogTimer = null;
      }

      this._pendingAiSummary = null;

      if (payload.error) {
        this._lastReport.aiSummaryError = payload.error;
        if (this.config.aiUseFallback && this._lastReport.aiSummaryFallback) {
          this._lastReport.aiSummary = this._lastReport.aiSummaryFallback;
          this._lastReport.fallback = true;
        } else {
          this._lastReport.aiSummary = null;
        }
      } else {
        this._lastReport.aiSummary = payload.response || '';
        this._lastReport.aiSummaryError = null;
        this._lastReport.fallback = false;
      }

      this._lastReport._aiSummaryAttempted = true;
      this.updateDom();
    }
  ,
  _hideReport() {
    if (this._reportHideTimer) { clearTimeout(this._reportHideTimer); this._reportHideTimer = null; }
    if (this._lastReport) {
      this._lastReport = null;
      this.updateDom();
    }
  }
  ,
  _setChartsVisible(flag) {
    if (flag === this._chartsVisible) return;
    this._chartsVisible = flag;
    if (flag) {
      if (!this._history) this._requestHistory();
      this._initHistoryLoop();
    } else {
      if (this._historyTimer) { clearInterval(this._historyTimer); this._historyTimer = null; }
    }
    this.updateDom();
  },
  _initHistoryLoop() {
    if (this._historyTimer) return;
    this._requestHistory();
    this._historyTimer = setInterval(() => this._requestHistory(), (this.config.chartRefreshSeconds || 120) * 1000);
  }
});
