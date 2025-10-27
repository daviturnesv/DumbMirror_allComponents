/* global Module */
/*
 * MMM-SensorControl
 * Ponte simples entre módulos de voz/gestos e o MMM-SensorData.
 * Converte notificações (VOICE_COMMAND, GESTURE_DETECTED, etc.) em
 * SENSORDATA_EXPORT ou SENSORDATA_REFRESH_HISTORY.
 */
Module.register("MMM-SensorControl", {
  defaults: {
    targetModule: "MMM-SensorData", // nome do módulo sensor (caso renomeie)
    showAlert: true,                 // feedback visual usando SHOW_ALERT
    debug: false,
    // Frases de voz mapeadas (case / acentos ignorados)
    voiceMap: {
      export: [
        "exportar dados",
        "export csv",
        "salvar csv",
        "exportar csv",
        "export data"
      ],
      refresh: [
        "atualizar histórico",
        "recarregar histórico",
        "refresh history",
        "atualizar sensores",
        "reload history"
      ]
    },
    // Gestos provenientes de módulos como MMM-GroveGestures / MMM-Gestures / MMM-Swipe
    gestureMap: {
      export: ["CLOCKWISE", "SWIPE_UP", "PALM_OPEN"],
      refresh: ["COUNTER_CLOCKWISE", "SWIPE_DOWN", "PALM_CLOSED"]
    },
    // Mapeamento direto de notificações simples => ação
    directNotificationMap: {
      SWIPE_UP: "export",
      SWIPE_DOWN: "refresh"
    }
  },

  start() {
    this._normVoice = this._buildVoiceIndex();
    if (this.config.debug) console.log("[MMM-SensorControl] started");
  },

  getScripts() { return []; },
  getStyles() { return []; },

  // Normaliza string (acentos + caixa)
  _norm(str) {
    return (str || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  },

  _buildVoiceIndex() {
    const idx = {};
    const vm = this.config.voiceMap || {};
    Object.keys(vm).forEach(action => {
      (vm[action] || []).forEach(phrase => {
        idx[this._norm(phrase)] = action; // export | refresh
      });
    });
    return idx;
  },

  notificationReceived(notification, payload, sender) {
    // 1. Notificações diretas mapeadas
    const direct = this.config.directNotificationMap[notification];
    if (direct) {
      return this._doAction(direct, `direct:${notification}`);
    }

    switch (notification) {
      case "VOICE_COMMAND":           // Ex: MMM-Voice
      case "ASSISTANT_ACTION":        // Possível módulo Assistant
      case "GA_VOICE_COMMAND":        // Outros wrappers Google Assistant
      case "ASSISTANT_TEXT":          // Texto reconhecido
        if (typeof payload === "string") {
          this._handleVoice(payload, notification);
        } else if (payload && payload.text) {
          this._handleVoice(payload.text, notification);
        }
        break;
      case "GESTURE_DETECTED":        // MMM-GroveGestures / MMM-Gestures
        if (payload && payload.gesture) {
          this._handleGesture(payload.gesture, notification);
        } else if (typeof payload === "string") {
          this._handleGesture(payload, notification);
        }
        break;
      default:
        // Alguns módulos emitem notificações simples (ex: SWIPE_LEFT etc.) já tratadas acima
        break;
    }
  },

  _handleVoice(raw, src) {
    const norm = this._norm(raw);
    const action = this._normVoice[norm];
    if (this.config.debug) console.log(`[MMM-SensorControl] voice '${raw}' => ${action || 'no-match'}`);
    if (action) this._doAction(action, `voice:${src}`);
  },

  _handleGesture(g, src) {
    const action = Object.keys(this.config.gestureMap || {}).find(a => (this.config.gestureMap[a] || []).includes(g));
    if (this.config.debug) console.log(`[MMM-SensorControl] gesture '${g}' => ${action || 'no-match'}`);
    if (action) this._doAction(action, `gesture:${src}`);
  },

  _doAction(action, origin) {
    let notif;
    if (action === "export") notif = "SENSORDATA_EXPORT"; else if (action === "refresh") notif = "SENSORDATA_REFRESH_HISTORY"; else return;
    if (this.config.debug) console.log(`[MMM-SensorControl] send ${notif} (origin=${origin})`);
    this.sendNotification(notif);
    if (this.config.showAlert) {
      this.sendNotification("SHOW_ALERT", { type: "notification", message: `SensorData: ${action}`, timer: 2500 });
    }
  }
});
