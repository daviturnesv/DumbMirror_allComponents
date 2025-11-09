/* global Module */
/**
 * MMM-LocalCamera
 * Mostra o feed da webcam local diretamente no browser usando getUserMedia.
 * Não requer node_helper. Ideal para laptops/notebooks.
 */
Module.register("MMM-LocalCamera", {
  // Configuração padrão
  defaults: {
    width: 360,
    height: 202, // ~16:9
    mirror: true, // espelha horizontalmente para parecer um espelho
    startOnMount: true,
    facingMode: "user", // "user" (frontal) | "environment" (traseira em celulares)
    deviceId: "", // opcional: id específico do dispositivo de câmera
    preferredLabelPattern: "", // regex (string) aplicada a labels para escolha automática (Logi, C270 etc.)
    autoSwitchOnPattern: true, // se true tenta alternar automaticamente para a câmera cujo label casa com o pattern
    frameRate: 30,
    // Zoom/escala
    zoom: 1,
    minZoom: 1,
    maxZoom: 4,
    zoomStep: 0.2,
    sizeScale: 1,
    minScale: 0.6,
    maxScale: 2,
    scaleStep: 0.15,
    // Limites adicionais por viewport para evitar crescimento infinito do módulo
    // (fração do tamanho da janela). Pode ajustar conforme o layout.
    maxViewportWidth: 0.6,  // 60% da largura da tela
    maxViewportHeight: 0.45, // 45% da altura da tela
    // Detecção de sobreposição com outros módulos e aviso de limite
    overlapAwareMax: true,
    overlapPadding: 6, // px extras para considerar como limiar "um estágio antes"
    toastMs: 1400,
    // Modo de visualização máxima (override intencional)
    maxViewPercentWidth: 0.88,  // 88% da largura da tela
    maxViewPercentHeight: 0.8,  // 80% da altura da tela
    // Filtros
    filter: "none", // presets: none, grayscale, sepia, invert, contrast, saturate, warm, cool, blur
    showStatus: true,
    retryMs: 5000 // re-tenta após erro/permissão negada
  },

  start() {
    this.stream = null;
    this.videoEl = null;
    this.frameEl = null;
    this.status = "init"; // init | starting | playing | error | stopped
    this._devices = [];
    this._currentDeviceId = null;
    this._forcedDeviceId = null; // quando o usuário escolhe explicitamente
    this._preferredRegex = this._compilePreferredRegex(this.config.preferredLabelPattern);
    this._autoSwitchAttempted = false;
    this._hardwareZoom = { supported: false, min: 1, max: 1 };
    this._zoom = this.config.zoom;
    this._sizeScale = this.config.sizeScale;
    this._filter = this.config.filter;
    this._lastSafeScale = this._sizeScale;
    this._overrideMax = false;
    this._toastT = null;
  },

  getStyles() {
    return [this.file("MMM-LocalCamera.css")];
  },

  getDom() {
    const root = document.createElement("div");
    root.className = "mmm-localcamera";

    const frame = document.createElement("div");
    frame.className = "lc-frame";
    frame.style.width = (this.config.width * this._sizeScale) + "px";
    frame.style.height = (this.config.height * this._sizeScale) + "px";
    this.frameEl = frame;

    const v = document.createElement("video");
    v.className = "lc-video" + (this.config.mirror ? " mirror" : "");
    v.autoplay = true;
    v.muted = true; // necessário para autoplay sem interação
    v.playsInline = true; // iOS
    v.setAttribute("playsinline", "true");
    v.style.width = "100%";
    v.style.height = "100%";
    this.videoEl = v;
    frame.appendChild(v);
    root.appendChild(frame);

    if (this.config.showStatus) {
      const s = document.createElement("div");
      s.className = "lc-status";
      s.textContent = this._statusText();
      this._statusEl = s;
      root.appendChild(s);
    }

    // Toast para mensagens curtas (ex.: "zoom máximo atingido")
    const toast = document.createElement("div");
    toast.className = "lc-toast";
    toast.style.display = "none";
    this._toastEl = toast;
    // anexa ao frame para ficar logo acima dele
    frame.appendChild(toast);

    if (this.config.startOnMount) {
      // inicia após inserir no DOM
      setTimeout(() => this._startCamera(), 50);
    }

    return root;
  },

  _statusText() {
    switch (this.status) {
      case "playing":
        return "Câmera ativa";
      case "starting":
        return "Iniciando câmera...";
      case "error":
        return "Erro/permissão negada";
      case "stopped":
        return "Câmera parada";
      default:
        return "Pronto";
    }
  },

  _updateStatus(newStatus) {
    this.status = newStatus;
    if (this._statusEl) this._statusEl.textContent = this._statusText();
  },

  _constraints(fallback = false) {
    const { width, height, frameRate, facingMode, deviceId } = this.config;
    const video = { width, height, frameRate };
    // Se fallback=true, não usa deviceId exato (para retry após erro)
    if (!fallback) {
      const target = this._forcedDeviceId || deviceId;
      if (target) {
        video.deviceId = { exact: target };
      }
    } else if (facingMode) {
      video.facingMode = facingMode;
    }
    return { audio: false, video };
  },

  _startCamera(fallback = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._updateStatus("error");
      return;
    }
    this._updateStatus("starting");
    navigator.mediaDevices
      .getUserMedia(this._constraints(fallback))
      .then((stream) => {
        this.stream = stream;
        if (this.videoEl) {
          this.videoEl.srcObject = stream;
          const play = this.videoEl.play();
          if (play && typeof play.catch === "function") {
            play.catch(() => {/* ignore autoplay errors */});
          }
        }
        // Log qual câmera foi selecionada
        try {
          const track = stream.getVideoTracks && stream.getVideoTracks()[0];
          if (track) {
            const label = track.label || 'Desconhecida';
            const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
            this._currentDeviceId = settings.deviceId || track.id || null;
            console.log(`[MMM-LocalCamera] Câmera ativa: ${label}${fallback ? ' (fallback automático)' : ''}`);
            // Detecta suporte a zoom por hardware
            if (track.getCapabilities) {
              const caps = track.getCapabilities();
              if (caps && typeof caps.zoom !== "undefined") {
                const { zoom } = caps;
                const min = typeof zoom?.min === "number" ? zoom.min : 1;
                const max = typeof zoom?.max === "number" ? zoom.max : Math.max(1, this.config.maxZoom);
                this._hardwareZoom = { supported: true, min, max };
              }
            }
          }
          // Após primeira captura, armazena a lista completa e tenta aplicar preferências
          this._refreshDevices();
        } catch (e) {
          // ignore
        }
        this._applyStyles();
        this._updateStatus("playing");
      })
      .catch((err) => {
        console.error("[MMM-LocalCamera] getUserMedia error:", err);
        // Se falhou com deviceId específico e ainda não tentou fallback, tenta sem deviceId
        if (!fallback && this.config.deviceId && 
            (err.name === 'NotFoundError' || err.name === 'OverconstrainedError' || err.name === 'NotAllowedError')) {
          console.warn("[MMM-LocalCamera] Tentando novamente sem deviceId específico...");
          this._startCamera(true); // retry com fallback
          return;
        }
        // Se falhou com um forced deviceId explícito, remove para permitir fallback na próxima tentativa
        if (!fallback && this._forcedDeviceId) {
          console.warn("[MMM-LocalCamera] Dispositivo forçado não disponível, voltando ao modo automático.");
          this._forcedDeviceId = null;
          this._startCamera(true);
          return;
        }
        this._updateStatus("error");
        if (this.config.retryMs > 0) {
          clearTimeout(this._retryT);
          this._retryT = setTimeout(() => this._startCamera(fallback), this.config.retryMs);
        }
      });
  },

  _stopCamera() {
    clearTimeout(this._retryT);
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((t) => t.stop());
      } catch (e) { /* noop */ }
      this.stream = null;
    }
    if (this.videoEl) this.videoEl.srcObject = null;
    this._updateStatus("stopped");
  },

  // Lifecycle
  suspend() {
    this._stopCamera();
  },
  resume() {
    if (this.config.startOnMount) this._startCamera();
  },

  notificationReceived(notification, payload) {
    if (notification === "LOCALCAMERA_TOGGLE") {
      const on = !!(payload == null ? true : payload);
      if (on) this._startCamera();
      else this._stopCamera();
    }
    if (notification === "LOCALCAMERA_STOP") this._stopCamera();
    if (notification === "LOCALCAMERA_START") this._startCamera();

    if (notification === "LOCALCAMERA_ZOOM") {
      const p = payload || {};
      if (typeof p.set === "number") this._setZoom(p.set);
      else if (typeof p.delta === "number") this._setZoom(this._zoom + p.delta);
      else this._setZoom(this._zoom + this.config.zoomStep);
    }
    if (notification === "LOCALCAMERA_SIZE") {
      const p = payload || {};
      if (typeof p.set === "number") this._setSizeScale(p.set);
      else if (typeof p.delta === "number") this._setSizeScale(this._sizeScale + p.delta);
      else this._setSizeScale(this._sizeScale + this.config.scaleStep);
    }
    if (notification === "LOCALCAMERA_MAXIMIZE") {
      // ativa modo de sobreposição intencional para ver maior
      if (!this._overrideMax) {
        this._prevScaleBeforeMax = this._sizeScale;
        this._overrideMax = true;
        this._applyStyles();
        this._flashToast("modo câmera máximo");
      }
    }
    if (notification === "LOCALCAMERA_RESTORE") {
      // volta ao tamanho anterior ao MAXIMIZE
      if (this._overrideMax) {
        this._overrideMax = false;
        if (typeof this._prevScaleBeforeMax === "number") {
          this._sizeScale = this._prevScaleBeforeMax;
        }
        this._applyStyles();
        this._flashToast("tamanho da câmera restaurado");
      }
    }
    if (notification === "LOCALCAMERA_FILTER") {
      const p = payload || {};
      if (p.cycle) this._cycleFilter();
      else if (typeof p.name === "string") this._setFilter(p.name);
    }
    if (notification === "LOCALCAMERA_SET_DEVICE") {
      const p = payload || {};
      if (p.deviceId || p.id) {
        this._switchToDevice(p.deviceId || p.id);
      } else if (p.label) {
        this._switchToLabel(p.label);
      }
    }
    if (notification === "LOCALCAMERA_NEXT_DEVICE") this._cycleDevice(+1);
    if (notification === "LOCALCAMERA_PREV_DEVICE") this._cycleDevice(-1);
  }
});

// ------- Helpers (instance methods) -------
Module.prototype._applyStyles = function () {
  if (!this.videoEl) return;
  // container size
  if (this.frameEl) {
    const baseW = this.config.width;
    const baseH = this.config.height;
    const minScale = this.config.minScale || 0.6;
    const maxScale = this.config.maxScale || 2;
    // Em modo máximo, dimensiona por porcentagem do viewport e ignora limites declarados
    if (this._overrideMax) {
      try {
        const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
        const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
        const targetW = Math.floor(vw * (this.config.maxViewPercentWidth || 0.88));
        const targetH = Math.floor(vh * (this.config.maxViewPercentHeight || 0.8));
        const sW = targetW / baseW;
        const sH = targetH / baseH;
        this._effectiveSizeScale = Math.min(sW, sH);
        this.frameEl.style.width = (baseW * this._effectiveSizeScale) + "px";
        this.frameEl.style.height = (baseH * this._effectiveSizeScale) + "px";
        this.frameEl.classList.add("overlay-mode");
      } catch (e) { /* ignore */ }
    } else {
      let desiredScale = this._sizeScale;
    // sempre respeita min/max declarados
    desiredScale = Math.max(minScale, Math.min(maxScale, desiredScale));
    // aplica limite relativo ao viewport para não extrapolar a tela
    let viewportLimitedScale = desiredScale;
    try {
      const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
      const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
      const maxW = Math.max(120, Math.floor(vw * (this.config.maxViewportWidth || 0.6)));
      const maxH = Math.max(90, Math.floor(vh * (this.config.maxViewportHeight || 0.45)));
      const sW = maxW / baseW;
      const sH = maxH / baseH;
      viewportLimitedScale = Math.min(desiredScale, sW, sH);
    } catch (e) { /* ignore */ }
    this._effectiveSizeScale = viewportLimitedScale;
    this.frameEl.style.width = (baseW * viewportLimitedScale) + "px";
    this.frameEl.style.height = (baseH * viewportLimitedScale) + "px";
      this.frameEl.classList.remove("overlay-mode");
    }
  }
  // filter and zoom (digital or hardware)
  const filterCss = this._filterToCss(this._filter);
  this.videoEl.style.filter = filterCss;
  // For digital zoom: use CSS transform; if hardware zoom present, still scale CSS minimally (1)
  const cssZoom = this._hardwareZoom.supported ? 1 : this._zoom;
  const mirror = this.config.mirror ? "scaleX(-1) " : "";
  this.videoEl.style.transform = mirror + `scale(${cssZoom})`;

  // Try hardware zoom if supported
  if (this._hardwareZoom.supported && this.stream) {
    try {
      const track = this.stream.getVideoTracks()[0];
      const min = this._hardwareZoom.min || 1;
      const max = this._hardwareZoom.max || Math.max(1, this.config.maxZoom);
      const clamped = Math.max(min, Math.min(max, this._zoom));
      // Prefer direct constraint; fallback to advanced
      track.applyConstraints({ advanced: [{ zoom: clamped }] }).catch(() =>
        track.applyConstraints({ zoom: clamped }).catch(() => {/* ignore */})
      );
    } catch (e) { /* ignore */ }
  }
  if (this._statusEl) this._statusEl.textContent = this._statusText();
};

Module.prototype._refreshDevices = function () {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => {
        this._devices = (devices || []).filter((d) => d.kind === "videoinput");
        this._logDevices();
        if (this.config.autoSwitchOnPattern && this._preferredRegex && !this._autoSwitchAttempted) {
          this._autoSwitchAttempted = true;
          this._maybeSwitchPreferred();
        }
      })
      .catch(() => {/* ignore */});
  } catch {
    // ignore
  }
};

Module.prototype._compilePreferredRegex = function (pattern) {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, "i");
  } catch (e) {
    console.warn("[MMM-LocalCamera] preferredLabelPattern inválido:", e && e.message);
    return null;
  }
};

Module.prototype._logDevices = function () {
  if (!Array.isArray(this._devices) || this._devices.length === 0) return;
  try {
    console.log("[MMM-LocalCamera] Dispositivos de vídeo detectados:");
    this._devices.forEach((d, idx) => {
      console.log(`  [${idx}] label="${d.label || '(sem label)'}" id=${d.deviceId}`);
    });
  } catch {/* ignore */}
};

Module.prototype._maybeSwitchPreferred = function () {
  if (!this._preferredRegex || !Array.isArray(this._devices)) return;
  const match = this._devices.find((d) => typeof d.label === "string" && this._preferredRegex.test(d.label));
  if (!match) return;
  if (match.deviceId && match.deviceId !== this._currentDeviceId) {
    console.log(`[MMM-LocalCamera] Alternando automaticamente para câmera preferida (${match.label}).`);
    this._switchToDevice(match.deviceId);
  }
};

Module.prototype._switchToDevice = function (deviceId) {
  if (!deviceId) return;
  if (deviceId === this._currentDeviceId && this.status === "playing") {
    this._flashToast("câmera já em uso");
    return;
  }
  this._forcedDeviceId = String(deviceId);
  this._autoSwitchAttempted = true;
  this._restartWithForcedDevice();
};

Module.prototype._switchToLabel = function (label) {
  if (!label || !Array.isArray(this._devices)) return;
  const target = this._devices.find((d) => (d.label || "").toLowerCase() === String(label).toLowerCase());
  if (target?.deviceId) {
    this._switchToDevice(target.deviceId);
  } else {
    // procura por substring se não houver match exato
    const partial = this._devices.find((d) => (d.label || "").toLowerCase().includes(String(label).toLowerCase()));
    if (partial?.deviceId) this._switchToDevice(partial.deviceId);
  }
};

Module.prototype._cycleDevice = function (dir) {
  if (!Array.isArray(this._devices) || this._devices.length === 0) return;
  const currentIdx = this._devices.findIndex((d) => d.deviceId === this._currentDeviceId);
  const nextIdx = (currentIdx + (dir || 1) + this._devices.length) % this._devices.length;
  const target = this._devices[nextIdx];
  if (target?.deviceId) {
    console.log(`[MMM-LocalCamera] Alternando para dispositivo #${nextIdx}: ${target.label || '(sem label)'}`);
    this._switchToDevice(target.deviceId);
  }
};

Module.prototype._restartWithForcedDevice = function () {
  // Evita loop se não houver `getUserMedia`
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  this._stopCamera();
  // pequena espera para liberar o hardware antes de requisitar novamente
  setTimeout(() => this._startCamera(false), 120);
};

Module.prototype._setZoom = function (z) {
  const min = this.config.minZoom || 1;
  const max = this.config.maxZoom || 4;
  this._zoom = Math.max(min, Math.min(max, z));
  this._applyStyles();
};

Module.prototype._setSizeScale = function (s) {
  const min = this.config.minScale || 0.6;
  const max = this.config.maxScale || 2;
  // clamp by declared min/max first
  let next = Math.max(min, Math.min(max, s));
  // also clamp by current viewport limits so state doesn't grow invisibly
  try {
    const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
    const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    const maxW = Math.max(120, Math.floor(vw * (this.config.maxViewportWidth || 0.6)));
    const maxH = Math.max(90, Math.floor(vh * (this.config.maxViewportHeight || 0.45)));
    const limitW = maxW / (this.config.width || 1);
    const limitH = maxH / (this.config.height || 1);
    const viewportLimit = Math.max(min, Math.min(max, Math.min(limitW, limitH)));
    next = Math.min(next, viewportLimit);
  } catch (e) { /* ignore */ }
  const prev = this._sizeScale;
  this._sizeScale = next;
  // Se override máximo estiver ligado, apenas aplica sem checagem
  if (this._overrideMax) {
    this._applyStyles();
    return;
  }
  // Aplica para medir e, se houver sobreposição, reverte um passo
  this._applyStyles();
  if (this.config.overlapAwareMax && next > prev && this._wouldOverlapNow()) {
    // volta ao valor anterior seguro
    this._sizeScale = this._lastSafeScale;
    this._applyStyles();
    this._flashToast("zoom máximo atingido");
    return;
  }
  // se não houve sobreposição, registra como seguro
  this._lastSafeScale = this._sizeScale;
};

Module.prototype._setFilter = function (name) {
  this._filter = String(name || "none").toLowerCase();
  this._applyStyles();
};

Module.prototype._cycleFilter = function () {
  const list = ["none","grayscale","sepia","invert","contrast","saturate","warm","cool","blur"];
  const idx = Math.max(0, list.indexOf(this._filter));
  const next = list[(idx + 1) % list.length];
  this._filter = next;
  this._applyStyles();
};

Module.prototype._filterToCss = function (name) {
  switch ((name || "none").toLowerCase()) {
    case "grayscale": return "grayscale(1)";
    case "sepia": return "sepia(1)";
    case "invert": return "invert(1)";
    case "contrast": return "contrast(1.2) brightness(1.05)";
    case "saturate": return "saturate(1.35)";
    case "warm": return "sepia(0.25) saturate(1.15) hue-rotate(-8deg)";
    case "cool": return "sepia(0.1) saturate(1.05) hue-rotate(12deg)";
    case "blur": return "blur(2px)";
    default: return "none";
  }
};

// --- Overlap detection & toast helpers ---
Module.prototype._wouldOverlapNow = function () {
  try {
    if (!this.frameEl || !this.frameEl.getBoundingClientRect) return false;
    const pad = Math.max(0, this.config.overlapPadding || 0);
    const rA = this.frameEl.getBoundingClientRect();
    const a = { left: rA.left - pad, top: rA.top - pad, right: rA.right + pad, bottom: rA.bottom + pad };
    const mods = Array.from(document.querySelectorAll('.module'));
    for (const el of mods) {
      if (!el || !el.getBoundingClientRect) continue;
      // ignora nosso próprio wrapper
      if (el.contains(this.frameEl) || this.frameEl.contains(el)) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rB = el.getBoundingClientRect();
      if (rB.width <= 0 || rB.height <= 0) continue;
      if (a.right <= rB.left || a.left >= rB.right || a.bottom <= rB.top || a.top >= rB.bottom) {
        // no intersect
        continue;
      }
      return true; // houve interseção
    }
  } catch (e) { /* ignore */ }
  return false;
};

Module.prototype._flashToast = function (msg) {
  try {
    if (!this._toastEl) return;
    this._toastEl.textContent = msg || '';
    this._toastEl.style.display = 'block';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      if (this._toastEl) this._toastEl.style.display = 'none';
    }, Math.max(500, this.config.toastMs || 1400));
  } catch (e) { /* ignore */ }
};
