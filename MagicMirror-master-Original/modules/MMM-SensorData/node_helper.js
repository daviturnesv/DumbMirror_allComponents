/*
 * node_helper.js for MMM-SensorData
 * Handles MQTT connection, persistence (SQLite) and history requests.
 */
/*
 * node_helper.js for MMM-SensorData
 * Handles MQTT connection, persistence (SQLite or JSON fallback) and history requests.
 */
const NodeHelper = require("node_helper");
let mqtt; // lazy loaded
const path = require("path");
const fs = require("fs");
let Database; // lazy load for better-sqlite3

module.exports = NodeHelper.create({
  start() {
    this.client = null;
    this.config = null;
    this.db = null; // sqlite handle
    this._useSqlite = false;
    this._useJson = false; // JSON fallback flag
    this._jsonStore = { file: null, data: [], lastFlush: 0 };
    this._lastMessageTs = null;
    this._inactivityTimer = null;
  this._statsTimer = null; // periodic stats logging
  this._downsampleTimer = null; // periodic downsampling
  this._dbFile = null; // remember db path for size stats
    console.log("[MMM-SensorData] node_helper started");
  this._logLevels = { silent:0, error:1, warn:2, info:3, debug:4 };
  },

  stop() {
    if (this._inactivityTimer) {
      clearInterval(this._inactivityTimer);
    }
    if (this._statsTimer) {
      clearInterval(this._statsTimer);
    }
    if (this._downsampleTimer) {
      clearInterval(this._downsampleTimer);
    }
    if (this.client) {
      try {
        this.client.end(true);
      } catch (e) {
        console.error('[MMM-SensorData] Error closing MQTT:', e.message);
      }
    }
    if (this.db) {
      try { this.db.close(); } catch (e) { console.error("[MMM-SensorData] Erro ao fechar DB:", e.message); }
    }
    // final JSON flush
    if (this._useJson) this._flushJson(true);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "SENSORDATA_CONFIG") {
      this.config = payload;
      const lvlName = (this.config.logLevel||'info').toLowerCase();
      const lvl = this._logLevels[lvlName] != null ? this._logLevels[lvlName] : 3;
      this._logLevelValue = lvl;
      this._l = {
        error: (...a)=> { if (this._logLevelValue >= 1) console.error('[MMM-SensorData]', ...a); },
        warn:  (...a)=> { if (this._logLevelValue >= 2) console.warn('[MMM-SensorData]', ...a); },
        info:  (...a)=> { if (this._logLevelValue >= 3) console.log('[MMM-SensorData]', ...a); },
        debug: (...a)=> { if (this._logLevelValue >= 4) console.debug('[MMM-SensorData]', ...a); }
      };
      if (this.config.enablePersistence) this._initPersistence();
      this._connectMqtt();
    } else if (notification === "SENSORDATA_GET_HISTORY") {
      this._sendHistory(payload?.sinceMinutes);
    } else if (notification === 'SENSORDATA_EXPORT_CSV') {
      this._exportCsv(payload || {});
    } else if (notification === 'SENSORDATA_REPORT_REQUEST') {
      this._generateReport(payload || {});
    }
  },

  // Carrega a biblioteca 'mqtt' de forma preguiçosa. Foi removida acidentalmente em refactor.
  _loadMqttLibrary() {
    if (mqtt) return true;
    try {
      mqtt = require('mqtt');
      this._l?.debug('Biblioteca mqtt carregada.');
      return true;
    } catch (e) {
      console.error('[MMM-SensorData] Falha ao carregar biblioteca mqtt:', e.message);
      console.error('[MMM-SensorData] Execute: npm install mqtt  (na pasta raiz ou do módulo)');
      return false;
    }
  },

  /* ---------------- MQTT ---------------- */
  _connectMqtt() {
    if (!this.config || this.client) return;
    const { mqttServer, topic, reconnectPeriod, deviceInactivitySeconds } = this.config;
    if (!mqtt && !this._loadMqttLibrary()) {
      console.error("[MMM-SensorData] MQTT indisponível; conexão não iniciada.");
      this.sendSocketNotification("SENSORDATA_STATUS", { status: "disconnected" });
      return;
    }
  this._l?.info(`Connecting MQTT ${mqttServer} topic=${topic}`);
    if (!mqttServer.startsWith('mqtt://') && !mqttServer.startsWith('ws://') && !mqttServer.startsWith('wss://')) {
      console.warn('[MMM-SensorData] AVISO: mqttServer não parece ter protocolo (mqtt:// ou ws://). Valor atual:', mqttServer);
    }
    this.sendSocketNotification("SENSORDATA_STATUS", { status: "connecting" });
    const options = {};
    if (typeof reconnectPeriod === "number") options.reconnectPeriod = reconnectPeriod;
    this.client = mqtt.connect(mqttServer, options);

    if (deviceInactivitySeconds > 0) {
      this._inactivityTimer = setInterval(() => {
        if (!this._lastMessageTs) return;
        const age = (Date.now() - this._lastMessageTs) / 1000;
        if (age >= deviceInactivitySeconds) {
          this.sendSocketNotification("SENSORDATA_STATUS", { status: "inactive" });
        }
      }, 5000);
    }

    this.client.on("connect", () => {
      this._l?.info('[MMM-SensorData] MQTT conectado, realizando subscribe...');
      try {
        this.client.subscribe(topic, (err) => {
          if (err) console.error("[MMM-SensorData] Subscribe error:", err.message);
          else {
            this._l?.info(`[MMM-SensorData] Inscrito no tópico: ${topic}`);
            this.sendSocketNotification("SENSORDATA_STATUS", { status: "connected" });
          }
        });
      } catch (e) {
        console.error("[MMM-SensorData] Subscribe exception:", e.message);
      }
    });
    this.client.on("reconnect", () => { console.log('[MMM-SensorData] MQTT reconnect'); this.sendSocketNotification("SENSORDATA_STATUS", { status: "connecting" }); });
    this.client.on("close", () => { console.log('[MMM-SensorData] MQTT close'); this.sendSocketNotification("SENSORDATA_STATUS", { status: "disconnected" }); });
    this.client.on("end", () => { console.log('[MMM-SensorData] MQTT end'); });
    this.client.on("offline", () => { console.log('[MMM-SensorData] MQTT offline'); });
    this.client.on("error", (err) => {
      console.error("[MMM-SensorData] MQTT error:", err.message);
      this.sendSocketNotification("SENSORDATA_STATUS", { status: "disconnected" });
    });
    this.client.on("message", (receivedTopic, buf) => {
      if (receivedTopic !== topic) {
        this._l?.debug && this._l.debug('Ignorando tópico diferente:', receivedTopic);
        return;
      }
      this._lastMessageTs = Date.now();
      let data;
      try { data = JSON.parse(buf.toString()); }
      catch (e) { console.error("[MMM-SensorData] JSON parse error:", e.message, 'payload=', buf.toString()); return; }
      this._l?.info(`[MMM-SensorData] Leitura recebida: ${JSON.stringify(data)}`);
      if (this.config.enablePersistence) this._storeReading(data);
      this.sendSocketNotification("SENSORDATA_UPDATE", data);
    });
  },

  /* ------------- Persistence Orchestration ------------- */
  _initPersistence() {
    const mode = (this.config.persistenceBackend || 'auto').toLowerCase();
    const dbFile = path.isAbsolute(this.config.dbPath) ? this.config.dbPath : path.join(process.cwd(), this.config.dbPath);
    this._ensureDir(path.dirname(dbFile));
    const wantSqlite = mode === 'sqlite' || mode === 'auto';
    const wantJson = mode === 'json' || mode === 'auto';

    let sqliteOk = false;
    if (wantSqlite) sqliteOk = this._initSqlite(dbFile, mode);
    if (!sqliteOk && wantJson) this._initJsonFallback(dbFile);
  },

  _initSqlite(dbFile, mode) {
    try {
      if (!Database) Database = require('better-sqlite3');
      this.db = new Database(dbFile);
      this._applySqlitePragmas();
      this._createTables();
      this._dbFile = dbFile;
      this._useSqlite = true;
      console.log(`[MMM-SensorData] SQLite ativo em ${dbFile}`);
      if (mode === 'auto') this._maybeMigrateJson(dbFile);
      this._purgeOld();
      this._scheduleStats();
      this._scheduleDownsampling();
      return true;
    } catch (e) {
      if (mode === 'sqlite') {
        console.error('[MMM-SensorData] Erro inicializando SQLite (modo forçado):', e.message);
      } else {
        console.warn('[MMM-SensorData] SQLite indisponível:', e.message);
      }
      return false;
    }
  },

  _applySqlitePragmas() {
    const pragmas = [
      'journal_mode = WAL',
      'synchronous = NORMAL',
      'temp_store = MEMORY',
      'busy_timeout = 3000',
      'mmap_size = 268435456'
    ];
    for (const p of pragmas) {
      try { this.db.pragma(p); } catch (e) { console.debug('[MMM-SensorData] PRAGMA falhou:', p, e.message); }
    }
  },

  _createTables() {
    try {
      this.db.prepare(`CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        temperature REAL,
        humidity REAL,
        light REAL,
        motion INTEGER
      )`).run();
      try { this.db.prepare('CREATE INDEX IF NOT EXISTS idx_sensor_ts ON sensor_readings(ts)').run(); }
      catch (ie) { console.warn('[MMM-SensorData] Aviso ao criar índice:', ie.message); }
      // aggregated (downsampled) table
      this.db.prepare(`CREATE TABLE IF NOT EXISTS sensor_readings_ds (
        bucket_start INTEGER PRIMARY KEY, -- início do intervalo (epoch ms)
        bucket_end INTEGER NOT NULL,
        temperature REAL,
        humidity REAL,
        light REAL,
        motion INTEGER
      )`).run();
  try { this.db.prepare('CREATE INDEX IF NOT EXISTS idx_sensor_ds_bucket ON sensor_readings_ds(bucket_start)').run(); } catch (e2) { console.debug('[MMM-SensorData] Índice ds opcional falhou:', e2.message); }
      // meta table para incremental export
      this.db.prepare(`CREATE TABLE IF NOT EXISTS sensor_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )`).run();
    } catch (e) {
      console.error('[MMM-SensorData] Erro criando tabelas:', e.message);
      throw e;
    }
  },

  _maybeMigrateJson(dbFile) {
    const jsonCandidate = dbFile.endsWith('.db') ? dbFile.replace(/\.db$/i, '.json') : dbFile + '.json';
    if (!fs.existsSync(jsonCandidate)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(jsonCandidate, 'utf8'));
      if (!Array.isArray(raw) || !raw.length) return;
      const insert = this.db.prepare('INSERT INTO sensor_readings (ts, temperature, humidity, light, motion) VALUES (?,?,?,?,?)');
      let migrated = 0;
      const tx = this.db.transaction((rows) => {
        for (const r of rows) {
          if (r && typeof r.ts === 'number') {
            insert.run(r.ts, r.temperature ?? null, r.humidity ?? null, r.light ?? null, r.motion ?? null);
            migrated++;
          }
        }
      });
      tx(raw);
      console.log(`[MMM-SensorData] Migração JSON->SQLite concluída (${migrated} registros).`);
      fs.renameSync(jsonCandidate, jsonCandidate + '.migrated.bak');
    } catch (e) {
      console.warn('[MMM-SensorData] Falha migração JSON->SQLite:', e.message);
    }
  },

  _initJsonFallback(dbFile) {
    // Derive json file path
    const jsonFile = dbFile.endsWith('.db') ? dbFile.replace(/\.db$/i, '.json') : dbFile + '.json';
    this._jsonStore.file = jsonFile;
    try {
      if (fs.existsSync(jsonFile)) {
        const raw = fs.readFileSync(jsonFile, 'utf8');
        this._jsonStore.data = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[MMM-SensorData] Falha ao ler JSON existente, começando vazio:', e.message);
      this._jsonStore.data = [];
    }
    this._useJson = true;
    console.log(`[MMM-SensorData] Usando fallback JSON em ${jsonFile}`);
    this._purgeOld();
  },

  /* ------------- Store Reading ------------- */
  _storeReading(data) {
    if (this._useSqlite) return this._storeReadingSqlite(data);
    if (this._useJson) return this._storeReadingJson(data);
  },

  _storeReadingSqlite(data) {
    try {
      let motionVal = null;
      if (typeof data.motion === 'boolean') motionVal = data.motion ? 1 : 0;
      this.db.prepare("INSERT INTO sensor_readings (ts, temperature, humidity, light, motion) VALUES (@ts, @temperature, @humidity, @light, @motion)")
        .run({
          ts: Date.now(),
            temperature: typeof data.temperature === 'number' ? data.temperature : null,
            humidity: typeof data.humidity === 'number' ? data.humidity : null,
            light: typeof data.light === 'number' ? data.light : null,
            motion: motionVal
        });
      if (this.config.retentionDays && Math.random() < 0.01) this._purgeOld();
    } catch (e) {
      console.error('[MMM-SensorData] Erro ao inserir leitura (sqlite):', e.message);
    }
  },

  _storeReadingJson(data) {
    try {
      let motionField = null;
      if (typeof data.motion === 'boolean') motionField = data.motion ? 1 : 0;
      const row = {
        ts: Date.now(),
        temperature: typeof data.temperature === 'number' ? data.temperature : null,
        humidity: typeof data.humidity === 'number' ? data.humidity : null,
        light: typeof data.light === 'number' ? data.light : null,
        motion: motionField
      };
      this._jsonStore.data.push(row);
      if (this.config.retentionDays && Math.random() < 0.01) this._purgeOld();
      this._flushJson();
    } catch (e) {
      console.error('[MMM-SensorData] Erro ao inserir leitura (json):', e.message);
    }
  },

  _flushJson(force = false) {
    if (!this._useJson) return;
    const now = Date.now();
    if (!force && now - this._jsonStore.lastFlush < 4000) return; // throttle
    try {
      fs.writeFileSync(this._jsonStore.file, JSON.stringify(this._jsonStore.data));
      this._jsonStore.lastFlush = now;
    } catch (e) {
      console.error('[MMM-SensorData] Erro ao gravar JSON:', e.message);
    }
  },

  /* ------------- Purge Old ------------- */
  _purgeOld() {
    if (!this.config.retentionDays) return;
    const cutoff = Date.now() - this.config.retentionDays * 86400 * 1000;
    if (this._useSqlite) {
      try {
        const info = this.db.prepare('DELETE FROM sensor_readings WHERE ts < ?').run(cutoff);
        if (info.changes) console.log(`[MMM-SensorData] Purga sqlite: ${info.changes} removidos`);
      } catch (e) { console.error('[MMM-SensorData] Erro purga sqlite:', e.message); }
    } else if (this._useJson) {
      const before = this._jsonStore.data.length;
      this._jsonStore.data = this._jsonStore.data.filter(r => r.ts >= cutoff);
      const removed = before - this._jsonStore.data.length;
      if (removed) console.log(`[MMM-SensorData] Purga json: ${removed} removidos`);
      this._flushJson();
    }
  },

  /* ------------- Stats / Downsampling Schedulers ------------- */
  _scheduleStats() {
    const minutes = this.config.dbStatsIntervalMinutes || 60; // default hourly
    if (!minutes || minutes <= 0) return;
    if (this._statsTimer) clearInterval(this._statsTimer);
    this._statsTimer = setInterval(() => this._logStats(), minutes * 60 * 1000);
    // log first soon
    setTimeout(() => this._logStats(), 5000);
  },

  _logStats() {
    try {
      if (this._useSqlite && this.db) return this._logSqliteStats();
      if (this._useJson) return this._logJsonStats();
    } catch (e) {
      console.warn('[MMM-SensorData] Falha log stats:', e.message);
    }
  },

  _logSqliteStats() {
    const row = this.db.prepare('SELECT COUNT(*) c, MIN(ts) minTs, MAX(ts) maxTs FROM sensor_readings').get();
    let sizeMB = null;
    if (this._dbFile && fs.existsSync(this._dbFile)) {
      const st = fs.statSync(this._dbFile);
      sizeMB = (st.size / (1024*1024)).toFixed(2);
    }
    const spanH = row.maxTs && row.minTs ? ((row.maxTs - row.minTs)/3600000).toFixed(1) : '0';
  this._l?.debug(`Stats: linhas=${row.c} janelaHoras=${spanH} tamanhoMB=${sizeMB}`);
  },

  _logJsonStats() {
    const c = this._jsonStore.data.length;
    const min = c ? this._jsonStore.data[0].ts : null;
    const max = c ? this._jsonStore.data[c-1].ts : null;
    const spanH = (min && max) ? ((max-min)/3600000).toFixed(1) : '0';
    let sizeMB = null;
    if (this._jsonStore.file && fs.existsSync(this._jsonStore.file)) {
      sizeMB = (fs.statSync(this._jsonStore.file).size / (1024*1024)).toFixed(2);
    }
  this._l?.debug(`Stats(JSON): linhas=${c} janelaHoras=${spanH} tamanhoMB=${sizeMB}`);
  },

  _scheduleDownsampling() {
    // auto mode: decide later based on growth
    if (this.config.downsample === 'auto') {
      // check every run interval if criteria met (size or row count)
    } else if (!this.config.downsample) return; // feature flag off
    const runEvery = this.config.downsampleRunIntervalMinutes || 30; // cada 30 min
    if (this._downsampleTimer) clearInterval(this._downsampleTimer);
    this._downsampleTimer = setInterval(() => this._downsampleIfNeeded(), runEvery * 60 * 1000);
    // primeira tentativa após 20s
    setTimeout(() => this._downsampleIfNeeded(), 20000);
  },

  _downsampleIfNeeded() {
    if (!this._useSqlite) return;
    // Auto enable logic: if downsample === 'auto' and not yet enabled but DB large or many rows
    if (this.config.downsample === 'auto' && !this._autoDownsampleEnabled) {
      try {
        const row = this.db.prepare('SELECT COUNT(*) c, MIN(ts) minTs, MAX(ts) maxTs FROM sensor_readings').get();
        let sizeMB = 0;
        if (this._dbFile && fs.existsSync(this._dbFile)) sizeMB = fs.statSync(this._dbFile).size / (1024*1024);
        const hoursSpan = (row.maxTs && row.minTs) ? (row.maxTs - row.minTs) / 3600000 : 0;
        // heurística simples: mais de 50k linhas OU > 30MB OU > 72h de dados => habilita
        if (row.c > 50000 || sizeMB > 30 || hoursSpan > 72) {
          this._l?.info('Ativando downsampling automaticamente (auto mode)');
          this._autoDownsampleEnabled = true;
        } else {
          return; // ainda não ativa
        }
      } catch (e) { return; }
    }
    if (!this.config.downsample || (this.config.downsample === 'auto' && !this._autoDownsampleEnabled)) return;
    const intervalMin = this.config.downsampleIntervalMinutes || 5;
    const keepRawHours = this.config.downsampleKeepRawHours ?? 12;
    const purgeRaw = this.config.downsamplePurgeRaw !== false; // default true
    if (intervalMin <= 0 || keepRawHours < 0) return;
    try {
      const now = Date.now();
      const keepRawMs = keepRawHours * 3600 * 1000;
      const rawCutoff = now - keepRawMs; // tudo ANTES deste timestamp pode ser agregado
      // descobrir último bucket agregado para evitar reprocessar
      const last = this.db.prepare('SELECT MAX(bucket_end) as lastEnd FROM sensor_readings_ds').get();
      let startFrom = last?.lastEnd ? last.lastEnd : 0; // timestamp exclusivo
      // limitar para não tocar nas últimas keepRawHours horas
      const processUntil = rawCutoff - (rawCutoff % (intervalMin*60000));
      if (processUntil <= startFrom) return; // nada novo
      // Buscar leituras que precisamos agregar
      const rows = this.db.prepare('SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts > ? AND ts < ? ORDER BY ts ASC').all(startFrom, processUntil);
      if (!rows.length) return;
      const bucketSize = intervalMin * 60000;
      this._aggregateAndStore(rows, bucketSize);
  this._l?.info(`Downsample: agregadas ${rows.length} leituras até ${new Date(processUntil).toISOString()}`);
      if (purgeRaw) {
        this._purgeRawAfterDownsample(rawCutoff);
      }
    } catch (e) {
      console.warn('[MMM-SensorData] Downsample falhou:', e.message);
    }
  },

  _aggregateAndStore(rows, bucketSize) {
    const insert = this.db.prepare('INSERT OR REPLACE INTO sensor_readings_ds (bucket_start, bucket_end, temperature, humidity, light, motion) VALUES (?,?,?,?,?,?)');
    let bucketStart = null;
    let bucketEnd = null;
    let acc = [];
    const flush = () => {
      if (!acc.length || bucketStart == null) return;
      const avg = (k) => {
        const vals = acc.map(r=>r[k]).filter(v=>typeof v==='number');
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      };
      const maxMotion = acc.some(r=>r.motion === 1) ? 1 : 0;
      insert.run(bucketStart, bucketEnd, avg('temperature'), avg('humidity'), avg('light'), maxMotion);
      acc = [];
    };
    for (const r of rows) {
      if (bucketStart == null) {
        bucketStart = r.ts - (r.ts % bucketSize);
        bucketEnd = bucketStart + bucketSize;
      }
      while (r.ts >= bucketEnd) { flush(); bucketStart = bucketEnd; bucketEnd += bucketSize; }
      acc.push(r);
    }
    flush();
  },

  _purgeRawAfterDownsample(rawCutoff) {
    try {
      const info = this.db.prepare('DELETE FROM sensor_readings WHERE ts < ?').run(rawCutoff);
  if (info.changes) this._l?.info(`Downsample purge: removidas ${info.changes} brutas < ${new Date(rawCutoff).toISOString()}`);
    } catch (e) { console.warn('[MMM-SensorData] Erro purgando brutas após downsample:', e.message); }
  },

  /* ------------- Utilidades internas ------------- */
  _ensureDir(dir) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (e) { console.error('[MMM-SensorData] Erro criando diretório:', dir, e.message); }
  },

  /* ------------- History ------------- */
  _sendHistory(sinceMinutes) {
    const minutes = sinceMinutes || 60;
    if (!this.config?.enablePersistence) {
      this.sendSocketNotification('SENSORDATA_HISTORY', { readings: [] });
      return;
    }
    const cutoff = Date.now() - minutes * 60 * 1000;
    if (this._useSqlite) {
      try {
        if (this.config.downsample && (this.config.downsample === true || this._autoDownsampleEnabled)) {
          const keepRawHours = this.config.downsampleKeepRawHours ?? 12;
          const keepRawCutoff = Date.now() - keepRawHours * 3600 * 1000;
          const aggregated = this.db.prepare(`SELECT bucket_end - 1 as ts, temperature, humidity, light, motion
            FROM sensor_readings_ds
            WHERE bucket_end > ? AND bucket_end - 1 >= ?
            ORDER BY ts ASC`).all(cutoff, cutoff);
          const raw = this.db.prepare(`SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts >= ? ORDER BY ts ASC`).all(Math.max(cutoff, keepRawCutoff));
          const merged = aggregated.concat(raw);
          this.sendSocketNotification('SENSORDATA_HISTORY', { readings: merged, rawStartTs: Math.max(cutoff, keepRawCutoff) });
        } else {
          const rows = this.db.prepare('SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts >= ? ORDER BY ts ASC').all(cutoff);
          this.sendSocketNotification('SENSORDATA_HISTORY', { readings: rows });
        }
      } catch (e) {
        console.error('[MMM-SensorData] Erro ao obter histórico (sqlite):', e.message);
        this.sendSocketNotification('SENSORDATA_HISTORY', { readings: [] });
      }
    } else if (this._useJson) {
      try {
        const rows = this._jsonStore.data.filter(r => r.ts >= cutoff).sort((a,b)=>a.ts-b.ts);
        this.sendSocketNotification('SENSORDATA_HISTORY', { readings: rows });
      } catch (e) {
        console.error('[MMM-SensorData] Erro ao obter histórico (json):', e.message);
        this.sendSocketNotification('SENSORDATA_HISTORY', { readings: [] });
      }
    } else {
      this.sendSocketNotification('SENSORDATA_HISTORY', { readings: [] });
    }
  },

  /* --- Downsample helpers (refactor) --- */
  _shouldRunDownsample() {
    if (!this.config.downsample) return false;
    if (this.config.downsample === 'auto' && !this._autoDownsampleEnabled) {
      try {
        const row = this.db.prepare('SELECT COUNT(*) c, MIN(ts) minTs, MAX(ts) maxTs FROM sensor_readings').get();
        let sizeMB = 0;
        if (this._dbFile && fs.existsSync(this._dbFile)) sizeMB = fs.statSync(this._dbFile).size / (1024*1024);
        const hoursSpan = (row.maxTs && row.minTs) ? (row.maxTs - row.minTs) / 3600000 : 0;
        if (row.c > 50000 || sizeMB > 30 || hoursSpan > 72) {
          this._autoDownsampleEnabled = true;
          this._l?.info('Ativando downsampling automaticamente (auto mode)');
        } else return false;
      } catch (e) { return false; }
    }
    if (this.config.downsample === 'auto' && !this._autoDownsampleEnabled) return false;
    return true;
  },
  _downsampleConfig() {
    const intervalMin = this.config.downsampleIntervalMinutes || 5;
    const keepRawHours = this.config.downsampleKeepRawHours ?? 12;
    if (intervalMin <= 0 || keepRawHours < 0) return null;
    return {
      bucketSizeMs: intervalMin * 60000,
      keepRawMs: keepRawHours * 3600 * 1000,
      purgeRaw: this.config.downsamplePurgeRaw !== false
    };
  },
  _computeDownsampleWindow(cfg) {
    try {
      const now = Date.now();
      const rawCutoff = now - cfg.keepRawMs;
      const last = this.db.prepare('SELECT MAX(bucket_end) as lastEnd FROM sensor_readings_ds').get();
      const startFrom = last?.lastEnd ? last.lastEnd : 0;
      const processUntil = rawCutoff - (rawCutoff % cfg.bucketSizeMs);
      if (processUntil <= startFrom) return { skip: true };
      return { startFrom, processUntil, rawCutoff };
    } catch (e) { this._l?.debug('Janela downsample falhou', e.message); return null; }
  },
  _loadRowsForDownsample(startFrom, processUntil) {
    try {
      return this.db.prepare('SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts > ? AND ts < ? ORDER BY ts ASC').all(startFrom, processUntil);
    } catch (e) { this._l?.warn('Falha carregando leituras para downsample:', e.message); return []; }
  },
  // end downsample helpers

  /* ------------- CSV Export (internal) ------------- */
  _exportCsv(options) {
    try {
      if (!this.config?.enablePersistence) return;
      const incremental = !!this.config.incrementalExport;
      const lastExportTs = incremental ? this._getLastExportTs() : 0;
      const cutoff = incremental ? 0 : this._computeExportCutoff(options);
      const { readings, rawStartTs } = this._loadExportReadings({ incremental, lastExportTs, cutoff });
      if (!readings.length) return this._finishExportEmpty();
      const exportDir = this._ensureExportDir();
      if (incremental) {
        const res = this._writeIncrementalCsv(exportDir, readings);
        this._updateLastExportTs(res.newLastTs);
        this._l?.info(`Export incremental appended ${readings.length} linhas -> ${res.filePath}`);
        this.sendSocketNotification('SENSORDATA_EXPORT_DONE', { success: true, filePath: res.filePath, rows: readings.length, incremental: true });
      } else {
        const res = this._writeFullCsv(exportDir, readings, rawStartTs, options?.fileName);
        this._l?.info(`Export CSV concluído: ${readings.length} linhas -> ${res.filePath}`);
        this.sendSocketNotification('SENSORDATA_EXPORT_DONE', { success: true, filePath: res.filePath, rows: readings.length });
      }
    } catch (e) {
      console.error('[MMM-SensorData] CSV export error:', e.message);
      this.sendSocketNotification('SENSORDATA_EXPORT_DONE', { success: false, error: e.message });
    }
  }
  ,
  _getLastExportTs() {
    if (!this._useSqlite && !this._useJson) return 0;
    try {
      if (this._useSqlite) {
        const row = this.db.prepare('SELECT value FROM sensor_meta WHERE key = ?').get('lastExportTs');
        return row?.value ? parseInt(row.value,10) || 0 : 0;
      }
      if (this._useJson) {
        const metaPath = (this._jsonStore.file || '').replace(/\.json$/i, '.meta.json');
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath,'utf8'));
          return meta.lastExportTs || 0;
        }
      }
    } catch (e) { this._l?.debug('Falha lendo lastExportTs', e.message); }
    return 0;
  },
  _computeExportCutoff(options) {
    const sinceMinutes = options?.sinceMinutes || this.config.exportSinceMinutes || 1440;
    return Date.now() - sinceMinutes * 60000;
  },
  _loadExportReadings({ incremental, lastExportTs, cutoff }) {
    let readings = []; let rawStartTs = null;
    try {
      if (this._useSqlite) {
        if (!incremental && this.config.downsample && (this.config.downsample === true || this._autoDownsampleEnabled)) {
          const keepRawHours = this.config.downsampleKeepRawHours ?? 12;
            const keepRawCutoff = Date.now() - keepRawHours * 3600000;
          const aggregated = this.db.prepare(`SELECT bucket_end - 1 as ts, temperature, humidity, light, motion
            FROM sensor_readings_ds
            WHERE bucket_end > ? AND bucket_end - 1 >= ?
            ORDER BY ts ASC`).all(cutoff, cutoff);
          const raw = this.db.prepare(`SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts >= ? ORDER BY ts ASC`).all(Math.max(cutoff, keepRawCutoff));
          readings = aggregated.concat(raw);
          rawStartTs = Math.max(cutoff, keepRawCutoff);
        } else {
          const sqlCut = incremental ? lastExportTs : cutoff;
          readings = this.db.prepare('SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts > ? ORDER BY ts ASC').all(sqlCut);
        }
      } else if (this._useJson) {
        const jsonCut = incremental ? lastExportTs : cutoff;
        readings = this._jsonStore.data.filter(r=>r.ts > jsonCut).sort((a,b)=>a.ts-b.ts);
      }
    } catch (e) { this._l?.warn('Falha carregando leituras export:', e.message); }
    return { readings, rawStartTs };
  },
  _finishExportEmpty() {
    this._l?.info('Export CSV: nenhuma leitura no intervalo');
    this.sendSocketNotification('SENSORDATA_EXPORT_DONE', { success: true, filePath: null, rows: 0 });
  },
  _ensureExportDir() {
    const exportDirRaw = this.config.exportDir || 'data';
    const exportDir = path.isAbsolute(exportDirRaw) ? exportDirRaw : path.join(process.cwd(), exportDirRaw);
    try { if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir,{recursive:true}); } catch (e) { this._l?.warn('Falha criando exportDir', e.message); }
    return exportDir;
  },
  _writeIncrementalCsv(dir, readings) {
    const fileName = this.config.exportFileName || 'sensordata.csv';
    const filePath = path.join(dir, fileName);
    const exists = fs.existsSync(filePath);
    const fd = fs.openSync(filePath, 'a');
    try {
      if (!exists) fs.writeSync(fd, 'ts,iso,temperature,humidity,light,motion\n');
      for (const r of readings) {
        const iso = new Date(r.ts).toISOString();
        fs.writeSync(fd, `${r.ts},${iso},${this._csvVal(r.temperature)},${this._csvVal(r.humidity)},${this._csvVal(r.light)},${this._csvVal(r.motion)}\n`);
      }
    } finally { fs.closeSync(fd); }
    return { filePath, newLastTs: readings[readings.length-1].ts };
  },
  _writeFullCsv(dir, readings, rawStartTs, customName) {
    const filename = customName || `sensordata_export_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
    const filePath = path.join(dir, filename);
    const header = 'ts,iso,temperature,humidity,light,motion,aggregated\n';
    const lines = [header];
    for (const r of readings) {
      const iso = new Date(r.ts).toISOString();
      const agg = rawStartTs && r.ts < rawStartTs ? '1' : '0';
      lines.push(`${r.ts},${iso},${this._csvVal(r.temperature)},${this._csvVal(r.humidity)},${this._csvVal(r.light)},${this._csvVal(r.motion)},${agg}\n`);
    }
    fs.writeFileSync(filePath, lines.join(''));
    return { filePath };
  },
  _updateLastExportTs(ts) {
    if (!ts) return;
    try {
      if (this._useSqlite) {
        this.db.prepare('INSERT INTO sensor_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('lastExportTs', String(ts));
      } else if (this._useJson) {
        const metaPath = (this._jsonStore.file || '').replace(/\.json$/i, '.meta.json');
        let meta = {};
        if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath,'utf8')); } catch (e) { this._l?.debug('Falha lendo meta json', e.message); } }
        meta.lastExportTs = ts;
        fs.writeFileSync(metaPath, JSON.stringify(meta));
      }
    } catch (e) { this._l?.warn('Falha atualizando lastExportTs', e.message); }
  },
  _csvVal(v){ return (v===null||typeof v==='undefined') ? '' : v; },

  /* ------------- Report Generation ------------- */
  _generateReport(options) {
    if (!this.config?.enablePersistence) {
      this.sendSocketNotification('SENSORDATA_REPORT_READY', { success:false, error:'persistence-disabled' });
      return;
    }
    try {
      const range = options.range || { minutes: 120 }; // default 2h
      const groupBy = options.groupBy; // 'hour' | 'day'
      const { from, to } = this._normalizeRange(range);
      if (from == null || to == null || to <= from) throw new Error('intervalo inválido');
      let rows = [];
      if (this._useSqlite) {
        // pegar agregados + brutos (simples). Pode haver sobreposição pequena; deduplicar por ts.
        let aggregated = [];
        try {
          aggregated = this.db.prepare(`SELECT bucket_end - 1 as ts, temperature, humidity, light, motion FROM sensor_readings_ds WHERE (bucket_end - 1) BETWEEN ? AND ? ORDER BY ts ASC`).all(from, to);
        } catch(e) { this._l?.debug('Falha lendo agregados para relatório', e.message); }
        let raw = [];
        try {
          raw = this.db.prepare(`SELECT ts, temperature, humidity, light, motion FROM sensor_readings WHERE ts BETWEEN ? AND ? ORDER BY ts ASC`).all(from, to);
        } catch(e) { this._l?.debug('Falha lendo brutos para relatório', e.message); }
        const aggregatedCount = aggregated.length;
        const rawCount = raw.length;
        const map = new Map();
        for (const r of aggregated.concat(raw)) {
          if (!map.has(r.ts)) map.set(r.ts, r);
        }
        rows = Array.from(map.values()).sort((a,b)=>a.ts-b.ts);
        // store counts for later payload
        rows._rawCount = rawCount;
        rows._aggregatedCount = aggregatedCount;
      } else if (this._useJson) {
        rows = this._jsonStore.data.filter(r=> r.ts >= from && r.ts <= to).sort((a,b)=>a.ts-b.ts);
      }
      const stats = this._computeStats(rows);
      let groups = null;
      if (groupBy) {
        groups = this._groupRows(rows, groupBy);
      }
  const basePayload = { 
        success: true,
        from, to,
        rangeLabel: options.rangeLabel || this._rangeLabel(range),
        totalReadings: rows.length,
        stats,
        groupBy: groupBy || null,
        groups,
        rawCount: rows._rawCount != null ? rows._rawCount : rows.length,
        aggregatedCount: rows._aggregatedCount != null ? rows._aggregatedCount : 0,
  downsamplingActive: !!this._autoDownsampleEnabled || !!this.config.downsample,
  lastDownsampleRun: this._lastDownsampleRun || null
  };

  if (this.config.aiSummaryEnabled) {
    try {
      basePayload.aiProvider = (this.config.aiProvider || "gemini").toString().trim().toLowerCase();
      basePayload.aiSummaryPrompt = this._buildAiPrompt(basePayload);
      const fallback = this._buildLocalSummary(basePayload);
      if (fallback) {
        basePayload.aiSummaryFallback = fallback;
      }
    } catch (err) {
      this._l?.debug("Falha preparando resumo IA:", err.message);
      basePayload.aiSummaryError = "prompt-error";
    }
  }

  this.sendSocketNotification('SENSORDATA_REPORT_READY', basePayload);
    } catch (e) {
      console.error('[MMM-SensorData] Report error:', e.message);
      this.sendSocketNotification('SENSORDATA_REPORT_READY', { success:false, error:e.message });
    }
  },
  _normalizeRange(r) {
    const now = Date.now();
    if (typeof r === 'string') {
      if (r === 'today') {
        const d = new Date(); d.setHours(0,0,0,0); return { from: d.getTime(), to: now };
      }
      if (r === 'month') {
        const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return { from: d.getTime(), to: now };
      }
      return { from: now - 120*60000, to: now }; // fallback
    }
    if (typeof r === 'object') {
      if (r.from && r.to) return { from: r.from, to: r.to };
      if (r.minutes) return { from: now - r.minutes*60000, to: now };
      if (r.hours) return { from: now - r.hours*3600000, to: now };
      if (r.days) return { from: now - r.days*86400000, to: now };
    }
    return { from: now - 120*60000, to: now };
  },
  _rangeLabel(r) {
    if (typeof r === 'string') return r;
    if (r.minutes) return `últimos ${r.minutes} minutos`;
    if (r.hours) return `últimas ${r.hours} horas`;
    if (r.days) return `últimos ${r.days} dias`;
    return 'intervalo';
  },
  _computeStats(rows) {
    const metrics = ['temperature','humidity','light'];
    const result = {};
    for (const m of metrics) {
      const vals = rows.map(r=>r[m]).filter(v=> typeof v === 'number');
      if (!vals.length) { result[m] = null; continue; }
      const sorted = vals.slice().sort((a,b)=>a-b);
      const sum = vals.reduce((a,b)=>a+b,0);
      const avg = sum/vals.length;
      const min = sorted[0];
      const max = sorted[sorted.length-1];
      const median = sorted[Math.floor(sorted.length/2)];
      const variance = vals.reduce((a,b)=> a + Math.pow(b-avg,2),0) / vals.length;
      const std = Math.sqrt(variance);
      result[m] = { count: vals.length, min, max, avg, median, std };
    }
    const motionVals = rows.map(r=> r.motion).filter(v=> v===0 || v===1);
    const motionCount = motionVals.filter(v=>v===1).length;
    result.motion = { events: motionCount, samples: motionVals.length, ratio: motionVals.length? motionCount/motionVals.length : null };
    return result;
  },
  _groupRows(rows, groupBy) {
    const bucketMap = new Map();
    const hourMs = 3600000;
    for (const r of rows) {
      let bucket;
      if (groupBy === 'hour') bucket = Math.floor(r.ts/hourMs)*hourMs;
      else if (groupBy === 'day') { const d = new Date(r.ts); d.setHours(0,0,0,0); bucket = d.getTime(); }
      else continue;
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
      bucketMap.get(bucket).push(r);
    }
    const out = [];
    for (const [bucket, arr] of Array.from(bucketMap.entries()).sort((a,b)=>a[0]-b[0])) {
      out.push({ bucketStart: bucket, stats: this._computeStats(arr), samples: arr.length });
    }
    return out;
  }
  ,
  /* -------- AI Summary helpers -------- */
  _buildLocalSummary(report){
    // Gera um resumo heurístico simples baseado em variações básicas
    if (!report?.stats) return null;
    const t = report.stats.temperature; const h = report.stats.humidity; const m = report.stats.motion;
    const parts = [];
    if (t) {
      const span = (t.max - t.min).toFixed(1);
      parts.push(`Temperatura média ${t.avg.toFixed(1)}°C (amplitude ${span}°C).`);
    }
    if (h) {
      const spanH = (h.max - h.min).toFixed(1);
      parts.push(`Humidade média ${h.avg.toFixed(0)}% (variação ${spanH}%).`);
    }
    if (m && m.ratio != null) {
      parts.push(`Atividade de movimento em ${(m.ratio*100).toFixed(0)}% das amostras.`);
    }
    if (!parts.length) return null;
    return parts.join(' ');
  },
  _buildAiPrompt(report) {
    const stats = report.stats || {};
    const motion = stats.motion || {};
    const toNumberLabel = (value, fractionDigits = 1) => {
      if (value === null || value === undefined) {
        return "-";
      }
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        return "-";
      }
      return numeric.toFixed(fractionDigits);
    };

    const formatMetric = (metric, unit = "") => {
      if (!metric) {
        return "sem dados";
      }
      const avg = toNumberLabel(metric.avg) + unit;
      const min = toNumberLabel(metric.min) + unit;
      const max = toNumberLabel(metric.max) + unit;
      const median = toNumberLabel(metric.median) + unit;
      return `avg ${avg} (min ${min} / max ${max} / med ${median})`;
    };

    const lines = [];
    lines.push(`Resumo dos sensores entre ${new Date(report.from).toISOString()} e ${new Date(report.to).toISOString()}.`);

    if (stats.temperature) {
      lines.push(`Temperatura: ${formatMetric(stats.temperature, '°C')}`);
    }
    if (stats.humidity) {
      lines.push(`Humidade: ${formatMetric(stats.humidity, '%')}`);
    }
    if (stats.light) {
      const avgLight = toNumberLabel(stats.light.avg, 0);
      const minLight = toNumberLabel(stats.light.min, 0);
      const maxLight = toNumberLabel(stats.light.max, 0);
      lines.push(`Luz: média ${avgLight} (min ${minLight} / max ${maxLight})`);
    }
    if (typeof motion.ratio === "number") {
      const ratioPercent = Math.round(motion.ratio * 100);
      const events = motion.events ?? 0;
      const samples = motion.samples ?? 0;
      lines.push(`Movimento: ${ratioPercent}% de amostras ativas (${events} eventos / ${samples} amostras).`);
    }

    if (Array.isArray(report.groups) && report.groups.length) {
      const sampleWindow = report.groups.slice(-Math.min(4, report.groups.length));
      const parts = sampleWindow.map((group) => {
        const ts = new Date(group.bucketStart);
        const label = report.groupBy === "hour"
          ? `${ts.getHours().toString().padStart(2, "0")}:00`
          : ts.toLocaleDateString();
        const avgTemp = toNumberLabel(group.stats?.temperature?.avg);
        const motionRatio = typeof group.stats?.motion?.ratio === "number"
          ? `${Math.round(group.stats.motion.ratio * 100)}%`
          : "-";
        return `${label}: ${avgTemp === "-" ? '-' : `${avgTemp}°C`} mov ${motionRatio}`;
      });
      lines.push(`Amostra recente por grupo: ${parts.join(' | ')}`);
    }

    lines.push("Gere um resumo curto (<=3 frases) em português, enfatizando tendências (subida/descida), estabilidade ou variações, possíveis causas simples (ex: período mais frio, variação de humidade), e interpretação da atividade de movimento. Evite repetir números triviais demais.");
    return lines.join("\n");
  }
});
