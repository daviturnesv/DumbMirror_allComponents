/* global Module */

/* Magic Mirror
 * Module: MMM-Screencast
 * Original by Kevin Townsend
 * Tweaks: display screencast status card.
 * MIT Licensed.
 */

Module.register("MMM-Screencast", {

	requiresVersion: "2.1.0", // Required version of MagicMirror

	defaults: {
		debug: false,
		debugLimit: 2048,
		preferEmbed: false,
		autoEmbedFallback: true,
		autoEmbedFallbackThreshold: 4
	},

	start() {
		Log.info("Starting module: " + this.name);
		this.isElectron = this._detectElectron();
		this.userAgent = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebkit/538.1 (KHTML, like Gecko) SamsungBrowser/1.1 TV Safari/538.1';
		this._webviewPoller = null;
		this._currentWebview = null;
		this._emptyFrameCount = 0;
		this.debugPanelExpanded = true;
		this.state = {
			status: "idle",
			app: null,
			port: null,
			error: null,
			url: null,
			launchData: null,
			rawLaunchData: null,
			videoId: null,
			videoTitle: null,
			videoCandidates: [],
			webviewUrl: null,
			videoState: null,
			embedFallback: false
		};

		this.sendSocketNotification("SET_CONFIG", this._buildSocketConfig());
	},

	socketNotificationReceived(notification, payload = {}) {
		let handled = false;
		switch (notification) {
			case "MMM-Screencast:START-DIAL":
				this.state = {
					status: "listening",
					app: null,
					port: payload?.port ?? this.state.port,
					error: null,
					url: null,
					launchData: null,
					rawLaunchData: null,
					videoId: null,
					videoTitle: null,
					videoCandidates: [],
					webviewUrl: null,
					videoState: null,
					embedFallback: false
				};
				this._emptyFrameCount = 0;
				handled = true;
				break;
			case "MMM-Screencast:LAUNCH-APP":
				this.state = {
					status: "launching",
					app: payload?.app || null,
					port: this.state.port,
					error: null,
					url: payload?.url || null,
					launchData: payload?.launchData ?? null,
					rawLaunchData: payload?.rawLaunchData ?? null,
					videoId: null,
					videoTitle: null,
					videoCandidates: [],
					webviewUrl: null,
					videoState: null,
					embedFallback: false
				};
				this._emptyFrameCount = 0;
				handled = true;
				break;
			case "MMM-Screencast:RUN-APP":
				this.state = {
					status: "running",
					app: payload?.app || null,
					port: this.state.port,
					error: null,
					url: payload?.url || null,
					launchData: payload?.launchData ?? this.state.launchData,
					rawLaunchData: payload?.rawLaunchData ?? this.state.rawLaunchData,
					videoId: null,
					videoTitle: null,
					videoCandidates: [],
					webviewUrl: null,
					videoState: null,
					embedFallback: false
				};
				this._emptyFrameCount = 0;
				handled = true;
				break;
			case "MMM-Screencast:STOP-APP":
			case "MMM-Screencast:CLOSE":
				this.state = {
					status: "idle",
					app: null,
					port: this.state.port,
					error: null,
					url: null,
					launchData: null,
					rawLaunchData: null,
					videoId: null,
					videoTitle: null,
					videoCandidates: [],
					webviewUrl: null,
					videoState: null,
					embedFallback: false
				};
				this._disposeWebviewPoller();
				this._emptyFrameCount = 0;
				handled = true;
				break;
			case "MMM-Screencast:CONFIG-ERROR":
				this.state = {
					...this.state,
					status: "error",
					error: payload?.message || "Erro na configuração"
				};
				handled = true;
				break;
			default:
				break;
		}

		if (!handled) {
			return;
		}

		this.updateDom(250);
		this.sendNotification(notification, payload);
	},

	_buildSocketConfig() {
		const configuredPosition = this.config.position || this.data?.position || "bottomCenter";
		const raw = {
			debug: Boolean(this.config.debug),
			castName: this.config.castName,
			port: Number.isFinite(this.config.port) ? this.config.port : undefined,
			position: configuredPosition,
			height: Number.isFinite(this.config.height) ? this.config.height : undefined,
			width: Number.isFinite(this.config.width) ? this.config.width : undefined,
			x: Number.isFinite(this.config.x) ? this.config.x : undefined,
			y: Number.isFinite(this.config.y) ? this.config.y : undefined,
			preferEmbed: Boolean(this.config.preferEmbed)
		};
		return Object.fromEntries(
			Object.entries(raw).filter(([, value]) => value !== undefined && value !== null)
		);
	},

	notificationReceived(notification, payload, sender) {
		switch (notification) {
			case "MMM-Screencast:DEBUG_COLLAPSE":
				this._setDebugPanelExpanded(false);
				return;
			case "MMM-Screencast:DEBUG_EXPAND":
				this._setDebugPanelExpanded(true);
				return;
			case "MMM-Screencast:DEBUG_TOGGLE":
				this._setDebugPanelExpanded();
				return;
			default:
				break;
		}
		if (notification.includes("MMM-Screencast")) {
			this.sendSocketNotification(notification);
		}
	},

	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-screencast-card";
		const statusClass = this.state.status ? `mmm-screencast-card--${this.state.status}` : "mmm-screencast-card--unknown";
		wrapper.classList.add(statusClass);
		if (this._hasLikelyVideo()) {
			wrapper.classList.add("mmm-screencast-card--has-video");
		} else {
			wrapper.classList.add("mmm-screencast-card--no-video");
		}

		const header = document.createElement("div");
		header.className = "mmm-screencast-card__header";
		header.textContent = this.config.cardTitle || "Screencast";
		wrapper.appendChild(header);

		const status = document.createElement("div");
		status.className = "mmm-screencast-card__status";
		if (this.state.status === "error") {
			status.classList.add("mmm-screencast-card__status--error");
		}
		status.textContent = this._renderStatusMessage();
		wrapper.appendChild(status);

		const hint = document.createElement("div");
		hint.className = "mmm-screencast-card__hint";
		hint.textContent = this._renderHint();
		wrapper.appendChild(hint);

		if (this._shouldRenderViewport()) {
			const viewport = this._createViewport();
			if (viewport) {
				wrapper.appendChild(viewport);
			}
		}

		if (this.config.debug) {
			const debugPanel = this._renderDebugPanel();
			if (debugPanel) {
				wrapper.appendChild(debugPanel);
			}
		}

		return wrapper;
	},

	_renderStatusMessage() {
		switch (this.state.status) {
			case "listening":
				return "Pronto para receber transmissão";
			case "launching":
				return this.state.app ? `Abrindo ${this.state.app}...` : "Iniciando aplicativo...";
			case "running":
				return this.state.app ? `${this.state.app} em reprodução` : "Transmitindo";
			case "error":
				return this.state.error || "Erro no módulo";
			default:
				return "Aguardando conexão";
		}
	},

	_renderHint() {
		if (this.state.status === "running") {
			if (!this.isElectron) {
				return "Clique em 'Abrir player' para assistir na aba do navegador.";
			}
			return "Use o botão de elenco para encerrar quando terminar.";
		}
		if (this.state.status === "error") {
			return "Verifique a configuração e reinicie o módulo.";
		}
		const friendlyName = this.config.castName || "MagicMirror Screencast";
		const portInfo = this.state.port ? `:${this.state.port}` : "";
		const portSuffix = portInfo ? ` (porta ${portInfo})` : "";
		return `Escolha '${friendlyName}' na lista de dispositivos Cast${portSuffix}.`;
	},

	_shouldRenderViewport() {
		return Boolean(this.state.url);
	},

	_hasLikelyVideo() {
		if (typeof this.state !== "object" || !this.state) {
			return false;
		}
		if (this._getYouTubeVideoId()) {
			return true;
		}
		if (Array.isArray(this.state.videoCandidates)) {
			const hasCandidate = this.state.videoCandidates.some((candidate) => this._sanitizeVideoId(candidate));
			if (hasCandidate) {
				return true;
			}
		}
		if (typeof this.state.webviewUrl === "string" && /[?&#](?:v|videoId|video_id)=/.test(this.state.webviewUrl)) {
			return true;
		}
		return this.state.status === "running" && Boolean(this.state.url);
	},

	_shouldUseEmbed() {
		return Boolean(this.config.preferEmbed || this.state.embedFallback);
	},

	_createViewport() {
		const viewportWrapper = document.createElement("div");
		viewportWrapper.className = "mmm-screencast-card__viewport";
		const targetUrl = this._resolveDisplayUrl();

		if (!this.isElectron) {
			const warning = document.createElement("div");
			warning.className = "mmm-screencast-card__warning";
			warning.textContent = "Transmissões abertas no navegador precisam ser exibidas em uma nova aba.";
			viewportWrapper.appendChild(warning);

			if (targetUrl) {
				const action = document.createElement("button");
				action.type = "button";
				action.className = "mmm-screencast-card__action";
				action.textContent = "Abrir player";
				action.addEventListener("click", () => {
					window.open(targetUrl, "_blank", "noopener,noreferrer");
				});
				viewportWrapper.appendChild(action);

				const directLink = document.createElement("a");
				directLink.className = "mmm-screencast-card__link";
				directLink.href = targetUrl;
				directLink.target = "_blank";
				directLink.rel = "noopener";
				directLink.textContent = "Ou copie este link";
				viewportWrapper.appendChild(directLink);
			} else {
				const fallback = document.createElement("div");
				fallback.className = "mmm-screencast-card__warning";
				fallback.textContent = "Ainda não foi possível detectar a URL do vídeo.";
				viewportWrapper.appendChild(fallback);
			}
			return viewportWrapper;
		}

		this._disposeWebviewPoller();
		const webview = document.createElement("webview");
		webview.className = "mmm-screencast-card__webview";
		webview.setAttribute("src", targetUrl || this.state.url);
		webview.setAttribute("allowfullscreen", "true");
		webview.setAttribute("webpreferences", "autoplayPolicy=no-user-gesture-required");
		webview.setAttribute("useragent", this.userAgent);
		webview.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
		webview.setAttribute("allowpopups", "true");
		webview.addEventListener("did-fail-load", (event) => {
			Log.error("MMM-Screencast: webview falhou ao carregar", {
				errorCode: event.errorCode,
				errorDescription: event.errorDescription,
				validatedURL: event.validatedURL
			});
		});
		webview.addEventListener("console-message", (event) => {
			Log.info(`MMM-Screencast:webview console [${event.level}] ${event.message}`);
		});
		webview.addEventListener("did-stop-loading", () => {
			try {
				Log.info(`MMM-Screencast: webview did-stop-loading ${webview.getAttribute("src")}`);
				webview.insertCSS(`html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; background: #000 !important; }
video { width: 100% !important; height: 100% !important; object-fit: contain !important; background: #000 !important; }
iframe, #player, .ytp-chrome-top, .ytp-cued-thumbnail-overlay, .ytp-chrome-bottom { width: 100% !important; }
`);
			} catch (error) {
				Log.debug("MMM-Screencast: falha ao aplicar CSS no webview", error);
			}
			try {
				const currentUrl = typeof webview.getURL === "function" ? webview.getURL() : null;
				if (currentUrl) {
					const harvested = this._collectCandidatesFromUrlText(currentUrl);
					this._applyVideoProbe({ url: currentUrl, candidates: harvested });
				}
			} catch (error) {
				Log.debug("MMM-Screencast: falha ao processar URL do webview", error);
			}
		});
		webview.addEventListener("dom-ready", () => {
			Log.info("MMM-Screencast: webview dom-ready disparado");
			try {
				webview.setZoomFactor(1);
				const script = `
					(function() {
						console.log('mmm-screencast:layout-script-injected');
						const STYLE_PROPS = {
							top: ['0', 'important'],
							left: ['0', 'important'],
							width: ['100%', 'important'],
							height: ['100%', 'important'],
							maxWidth: ['100%', 'important'],
							maxHeight: ['100%', 'important'],
							margin: ['0', 'important'],
							padding: ['0', 'important'],
							display: ['block', 'important'],
							background: ['#000', 'important'],
							overflow: ['hidden', 'important']
						};
						const forceFull = (element) => {
							if (!element || !element.style) return;
							for (const [prop, [value, priority]] of Object.entries(STYLE_PROPS)) {
								element.style.setProperty(prop, value, priority);
							}
							if (getComputedStyle(element).position === 'static') {
								element.style.setProperty('position', 'relative', 'important');
							}
						};
						const hide = (element) => {
							if (!element || !element.style) return;
							element.style.setProperty('display', 'none', 'important');
						};
						const walkRoots = (callback) => {
							const queue = [document];
							const seen = new Set();
							while (queue.length) {
								const root = queue.shift();
								if (!root || seen.has(root)) continue;
								seen.add(root);
								callback(root);
								if (root.querySelectorAll) {
									const elements = root.querySelectorAll('*');
									for (const el of elements) {
										if (el.shadowRoot) {
											queue.push(el.shadowRoot);
										}
									}
								}
							}
						};
						const queryAllDeep = (selector) => {
							const matches = new Set();
							walkRoots((root) => {
								if (root.querySelectorAll) {
									root.querySelectorAll(selector).forEach((el) => matches.add(el));
								}
							});
							return Array.from(matches);
						};
						const expandAncestors = (element) => {
							const visited = new Set();
							let current = element;
							while (current && !visited.has(current)) {
								visited.add(current);
								forceFull(current);
								const root = current.getRootNode ? current.getRootNode() : null;
								if (current.assignedSlot) {
									current = current.assignedSlot;
								} else if (current.parentElement) {
									current = current.parentElement;
								} else if (root && root.host) {
									current = root.host;
								} else {
									current = null;
								}
							}
						};
						let exposureCounter = 0;
						let bestVideoState = null;
						const apply = () => {
							bestVideoState = null;
							forceFull(document.documentElement);
							forceFull(document.body);
							queryAllDeep('ytlr-app, ytlr-main-app, ytlr-watch-page, ytlr-video-player, ytlr-player, #player, #player-container, #main-stage, .player, .player-api, #player-api, .ytp-iv-player-content')
								.forEach(expandAncestors);
							const videos = queryAllDeep('video');
							for (const video of videos) {
								video.style.setProperty('width', '100%', 'important');
								video.style.setProperty('height', '100%', 'important');
								video.style.setProperty('max-width', '100%', 'important');
								video.style.setProperty('max-height', '100%', 'important');
								video.style.setProperty('object-fit', 'contain', 'important');
								video.style.setProperty('transform', 'none', 'important');
								video.style.setProperty('opacity', '1', 'important');
								video.style.setProperty('visibility', 'visible', 'important');
								video.style.setProperty('z-index', '10', 'important');
								video.style.setProperty('background', '#000', 'important');
								video.style.setProperty('display', 'block', 'important');
								video.style.setProperty('mix-blend-mode', 'normal', 'important');
								video.style.setProperty('will-change', 'auto', 'important');
								video.style.setProperty('contain', 'none', 'important');
								expandAncestors(video);
								const computed = getComputedStyle(video);
								const videoState = {
									readyState: video.readyState,
									paused: video.paused,
									autoplay: video.autoplay,
									muted: video.muted,
									seeking: video.seeking,
									haveFrameData: video.readyState >= 2,
									haveEnoughData: video.readyState >= 4,
									display: computed.display,
									visibility: computed.visibility,
									opacity: computed.opacity,
									currentSrc: video.currentSrc,
									error: video.error ? { code: video.error.code, message: video.error.message } : null
								};
								if (exposureCounter < 6) {
									const rect = video.getBoundingClientRect();
									console.log('mmm-screencast:video-rect', rect.width, rect.height, window.innerWidth, window.innerHeight);
									try {
										console.log('mmm-screencast:video-state ' + JSON.stringify(videoState));
									} catch (error) {
										console.log('mmm-screencast:video-state stringify-failed', error?.message);
									}
									exposureCounter += 1;
								}
								const score = typeof video.readyState === 'number' ? video.readyState : 0;
								if (!bestVideoState || score >= (bestVideoState.readyState ?? 0)) {
									bestVideoState = Object.assign({}, videoState, { elementCount: videos.length, timestamp: Date.now() });
								}
							}
							queryAllDeep('.ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-bottom, .ytp-gradient-top, .ytp-pause-overlay, ytlr-watch-options')
								.forEach(hide);
						};
						const schedule = () => {
							apply();
							requestAnimationFrame(apply);
							setTimeout(apply, 500);
							setTimeout(apply, 1500);
							setTimeout(apply, 4000);
						};
						schedule();
						if (window.__mmmScreencastObserver) {
							window.__mmmScreencastObserver.disconnect();
						}
						window.__mmmScreencastObserver = new MutationObserver(() => schedule());
						window.__mmmScreencastObserver.observe(document, { childList: true, subtree: true, attributes: true });
						window.addEventListener('beforeunload', () => {
							if (window.__mmmScreencastObserver) {
								window.__mmmScreencastObserver.disconnect();
							}
						});
					})();
				`;
				webview.executeJavaScript(script, true).then(() => {
					Log.info("MMM-Screencast: script de layout executado");
				}).catch((error) => {
					Log.error("MMM-Screencast: falha ao executar script de ajuste", error);
				});
			} catch (error) {
				Log.error("MMM-Screencast: erro adicionando script de ajuste", error);
			}
		});
		webview.addEventListener("dom-ready", () => {
			Log.info("MMM-Screencast: iniciando poller do webview");
			this._startWebviewPoller(webview);
		});
		webview.addEventListener("destroyed", () => {
			this._disposeWebviewPoller();
		});
		viewportWrapper.appendChild(webview);
		return viewportWrapper;
	},

	_resolveDisplayUrl() {
		if (!this.state.url) {
			return null;
		}
		if (this.isElectron) {
			if (this._shouldUseEmbed()) {
				const videoId = this._getYouTubeVideoId();
				if (videoId) {
					const params = new URLSearchParams({ autoplay: "1", controls: "0", rel: "0", modestbranding: "1", playsinline: "1" });
					return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
				}
			}
			return this.state.url;
		}
		return this._resolveBrowserUrl() || this.state.url;
	},

	_resolveBrowserUrl() {
		const videoId = this._getYouTubeVideoId();
		if (videoId) {
			return `https://www.youtube.com/watch?v=${videoId}`;
		}
		return null;
	},

	_getYouTubeVideoId() {
		const candidates = [
			this.state.videoId,
			...this._collectCandidatesFromLaunchData(),
			...this._collectCandidatesFromRawLaunchData(),
			...this._collectCandidatesFromUrl()
		];
		const match = candidates
			.map((value) => this._sanitizeVideoId(value))
			.find(Boolean);
		return match || null;
	},

	_collectCandidatesFromLaunchData() {
		if (!this.state.launchData) {
			return [];
		}
		const entries = this._normalizeLaunchData(this.state.launchData);
		return this._extractCandidatesFromEntries(entries);
	},

	_collectCandidatesFromRawLaunchData() {
		if (!this.state.rawLaunchData) {
			return [];
		}
		const expandedValues = this._expandRawLaunchDataValues(this.state.rawLaunchData);
		const candidates = new Set();
		for (const value of expandedValues) {
			if (!value) {
				continue;
			}
			const normalizedEntries = this._normalizeLaunchData(value);
			const fromEntries = this._extractCandidatesFromEntries(normalizedEntries);
			for (const candidate of fromEntries) {
				candidates.add(candidate);
			}
			this._extractCandidatesFromText(value, candidates);
		}
		return Array.from(candidates);
	},

	_collectCandidatesFromUrl() {
		if (!this.state.url) {
			return [];
		}
		try {
			const parsedUrl = new URL(this.state.url);
			const params = parsedUrl.searchParams;
			const extracted = [];
			for (const key of ["v", "video_id", "content_id"]) {
				const value = params.get(key);
				if (value) {
					extracted.push(value);
				}
			}
			return extracted;
		} catch (error) {
			Log.debug("MMM-Screencast: falha ao interpretar URL do vídeo", error);
			return [];
		}
	},

	_normalizeLaunchData(launchData) {
		if (launchData && typeof launchData === "object") {
			return launchData;
		}
		if (typeof launchData === "string") {
			const attempts = [
				() => JSON.parse(launchData),
				() => {
					const params = new URLSearchParams(launchData);
					const parsed = {};
					for (const [key, value] of params.entries()) {
						if (parsed[key]) {
							parsed[key] = [].concat(parsed[key], value);
						} else {
							parsed[key] = value;
						}
					}
					return parsed;
				}
			];

			for (const attempt of attempts) {
				try {
					const result = attempt();
					if (result && typeof result === "object") {
						return result;
					}
				} catch (error) {
					Log.debug("MMM-Screencast: não foi possível interpretar launchData", error);
				}
			}
		}
		return {};
	},

	_extractCandidatesFromEntries(entries) {
		if (!entries) {
			return [];
		}
		const normalizedEntries = Array.isArray(entries) ? entries : [entries];
		const keys = [
			"currentVideo",
			"videoId",
			"video_id",
			"contentId",
			"content_id",
			"v",
			"id",
			"currentVideoId",
			"videoIds",
			"video_id_list"
		];
		const extracted = [];
		const seen = new Set();
		const pushValue = (value) => {
			if (!value) {
				return;
			}
			if (typeof value === "string") {
				const trimmed = value.trim();
				if (!trimmed) {
					return;
				}
				if (!seen.has(trimmed)) {
					seen.add(trimmed);
					extracted.push(trimmed);
				}
				const decoded = this._tryParseStringValue(trimmed);
				if (decoded !== null && decoded !== undefined) {
					pushValue(decoded);
				}
				return;
			}
			if (Array.isArray(value)) {
				for (const item of value) {
					pushValue(item);
				}
				return;
			}
			if (typeof value === "object") {
				for (const item of Object.values(value)) {
					pushValue(item);
				}
			}
		};

		for (const entry of normalizedEntries) {
			if (!entry || typeof entry !== "object") {
				continue;
			}
			for (const key of keys) {
				const rawValue = entry[key];
				if (rawValue === undefined || rawValue === null) {
					continue;
				}
				pushValue(rawValue);
			}
		}
		return extracted;
	},

	_expandRawLaunchDataValues(rawData) {
		const queue = [];
		const visited = new Set();
		const results = new Set();
		const enqueue = (value) => {
			if (typeof value === "string" && value && !visited.has(value)) {
				queue.push(value);
			}
		};

		if (typeof rawData === "string") {
			enqueue(rawData);
		} else {
			try {
				enqueue(JSON.stringify(rawData));
			} catch (error) {
				Log.debug("MMM-Screencast: falha ao serializar launchData bruto", error);
			}
		}

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current || visited.has(current)) {
				continue;
			}
			visited.add(current);
			results.add(current);
			const decodedUri = this._safeDecodeURIComponent(current);
			if (decodedUri) {
				enqueue(decodedUri);
			}
			const base64Decoded = this._decodeBase64(current);
			if (base64Decoded) {
				enqueue(base64Decoded);
			}
		}

		return results;
	},

	_extractCandidatesFromText(text, collection) {
		if (!text) {
			return;
		}
		const keys = [
			"currentVideoId",
			"currentVideo",
			"videoId",
			"video_id",
			"contentId",
			"content_id",
			"v"
		];
		this._extractFromQueryLikeText(text, keys, collection);
		for (const key of keys) {
			const jsonRegex = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "gi");
			this._scanRegexMatches(jsonRegex, text, collection);
		}
	},

	_extractFromQueryLikeText(text, keys, collection) {
		const segment = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
		let paramsHandled = false;
		try {
			const params = new URLSearchParams(segment);
			for (const key of keys) {
				const values = params.getAll(key);
				if (!values.length) {
					continue;
				}
				for (const value of values) {
					this._pushSplitCandidates(value, collection);
				}
			}
			paramsHandled = true;
		} catch (error) {
			Log.debug("MMM-Screencast: URLSearchParams falhou ao interpretar launchData", error);
		}
		if (!paramsHandled) {
			const fallbackRegex = new RegExp(`(?:^|[?&;])(${keys.join("|")})=([^&;]+)`, "gi");
			let match;
			while ((match = fallbackRegex.exec(text)) !== null) {
				this._pushSplitCandidates(match[2], collection);
			}
		}
	},

	_scanRegexMatches(regex, text, collection) {
		let match;
		while ((match = regex.exec(text)) !== null) {
			const [, value] = match;
			this._pushSplitCandidates(value, collection);
		}
	},

	_pushSplitCandidates(value, collection) {
		if (!value) {
			return;
		}
		const candidates = this._splitCandidateValues(value);
		for (const candidate of candidates) {
			if (/^[A-Za-z0-9_-]{8,11}$/.test(candidate)) {
				collection.add(candidate);
			}
		}
	},

	_splitCandidateValues(value) {
		const decoded = this._safeDecodeURIComponent(value) || value;
		const sanitized = decoded.replaceAll("[", "").replaceAll("]", "").replaceAll('"', "");
		const parts = sanitized.split(/[,|]/);
		const trimmed = [];
		for (const part of parts) {
			const fragment = part.trim();
			if (fragment) {
				trimmed.push(fragment);
			}
		}
		return trimmed;
	},

	_safeDecodeURIComponent(value) {
		if (typeof value !== "string") {
			return null;
		}
		try {
			const decoded = decodeURIComponent(value);
			if (decoded === value) {
				return null;
			}
			return decoded;
		} catch (error) {
			Log.debug("MMM-Screencast: decodeURIComponent falhou", error);
			return null;
		}
	},

	_renderDebugPanel() {
		const debugInfo = this._buildDebugInfo();
		try {
			const details = document.createElement("details");
			details.className = "mmm-screencast-card__debug";
			details.open = Boolean(this.debugPanelExpanded);
			const summary = document.createElement("summary");
			summary.textContent = "Informações de debug";
			details.appendChild(summary);
			const pre = document.createElement("pre");
			pre.className = "mmm-screencast-card__debug-content";
			pre.textContent = JSON.stringify(debugInfo, null, 2);
			details.appendChild(pre);
			return details;
		} catch (error) {
			Log.debug("MMM-Screencast: falha ao renderizar painel de debug", error);
			return null;
		}
	},

	_updateDebugPanel() {
		if (!this.config?.debug || !this.identifier) {
			return;
		}
		const root = document.getElementById(this.identifier);
		if (!root) {
			return;
		}
		const debugContent = root.querySelector(".mmm-screencast-card__debug-content");
		if (!debugContent) {
			return;
		}
		try {
			debugContent.textContent = JSON.stringify(this._buildDebugInfo(), null, 2);
		} catch (error) {
			Log.debug("MMM-Screencast: falha ao atualizar painel de debug", error);
		}
	},

	_setDebugPanelExpanded(forceValue) {
		if (!this.config?.debug) {
			return;
		}
		const nextValue = typeof forceValue === "boolean" ? forceValue : !this.debugPanelExpanded;
		if (nextValue === this.debugPanelExpanded) {
			return;
		}
		this.debugPanelExpanded = nextValue;
		this.updateDom(200);
	},

	_buildDebugInfo() {
		return {
			status: this.state.status,
			app: this.state.app,
			url: this.state.url,
			resolvedUrl: this._resolveDisplayUrl(),
			inferredVideoId: this._getYouTubeVideoId(),
			videoIdFromWebview: this.state.videoId,
			videoTitle: this.state.videoTitle,
			webviewCandidates: this.state.videoCandidates,
			webviewUrl: this.state.webviewUrl,
			preferEmbedConfigured: Boolean(this.config.preferEmbed),
			embedFallbackActive: Boolean(this.state.embedFallback),
			videoState: this.state.videoState,
			launchData: this._stringifyForDebug(this.state.launchData),
			rawLaunchData: this._stringifyForDebug(this.state.rawLaunchData),
			candidates: this._collectCandidatesFromRawLaunchData()
		};
	},

	_stringifyForDebug(value) {
		if (value === null || value === undefined) {
			return value;
		}
		const limit = Number.isFinite(this.config.debugLimit) ? this.config.debugLimit : 2048;
		const stringify = (val) => {
			if (typeof val === "string") {
				return val;
			}
			try {
				return JSON.stringify(val, null, 2);
			} catch (error) {
				Log.debug("MMM-Screencast: stringify de debug falhou", error);
				return String(val);
			}
		};
		const serialized = stringify(value);
		if (typeof serialized === "string" && serialized.length > limit) {
			return `${serialized.slice(0, limit)}…`;
		}
		return serialized;
	},

	_startWebviewPoller(webview) {
		if (!this.isElectron || !webview) {
			return;
		}
		this._disposeWebviewPoller();
		this._currentWebview = webview;
		const poll = () => {
			if (!this._currentWebview || this._currentWebview !== webview) {
				return;
			}
			Log.info("MMM-Screencast: sondando webview por videoId");
			this._probeWebviewVideo(webview);
		};
		poll();
		const intervalId = globalThis.setInterval(poll, 2500);
		this._webviewPoller = { intervalId, webview };
	},

	_disposeWebviewPoller() {
		if (this._webviewPoller) {
			globalThis.clearInterval(this._webviewPoller.intervalId);
			this._webviewPoller = null;
		}
		this._currentWebview = null;
		this._emptyFrameCount = 0;
	},

	_probeWebviewVideo(webview) {
		Log.info("MMM-Screencast: executando script de coleta no webview");
		const script = `(() => {
			const candidates = new Set();
			const pushValue = (value, reason) => {
				if (!value) return;
				const handle = (val) => {
					if (typeof val === 'string') {
						const trimmed = val.trim();
						if (!trimmed) return;
						candidates.add(trimmed);
						return;
					}
					if (Array.isArray(val)) {
						val.forEach(handle);
						return;
					}
					if (typeof val === 'object') {
						Object.values(val).forEach(handle);
					}
				};
				handle(value);
				if (reason) {
					console.log('mmm-screencast:candidate', reason, value);
				}
			};
			const tryParseStructured = (maybeData) => {
				if (!maybeData) return null;
				if (typeof maybeData === 'object') return maybeData;
				if (typeof maybeData !== 'string') return null;
				let text = maybeData.trim();
				if (!text) return null;
				if (text.startsWith(")]}')")) {
					text = text.slice(4).trim();
				}
				const candidates = [text];
				try {
					const decoded = decodeURIComponent(text);
					if (decoded && decoded !== text) {
						candidates.push(decoded);
					}
				} catch (error) {
					// ignore decoding failures
				}
				const compact = text.replace(/\\s+/g, '');
				if (typeof atob === 'function' && /^[A-Za-z0-9+/=]+$/.test(compact) && compact.length % 4 === 0) {
					try {
						const decodedBase64 = atob(compact);
						if (decodedBase64 && decodedBase64 !== text) {
							candidates.push(decodedBase64);
							try {
								const again = decodeURIComponent(decodedBase64);
								if (again && again !== decodedBase64) {
									candidates.push(again);
								}
							} catch (error) {
								// ignore invalid URI sequences
							}
						}
					} catch (error) {
						// ignore base64 conversion failures
					}
				}
				for (const candidate of candidates) {
					try {
						return JSON.parse(candidate);
					} catch (error) {
						// keep trying alternative decoders
					}
				}
				for (const candidate of candidates) {
					try {
						const params = new URLSearchParams(candidate);
						const result = {};
						let hasEntry = false;
						for (const [key, value] of params.entries()) {
							hasEntry = true;
							if (Object.prototype.hasOwnProperty.call(result, key)) {
								const existing = result[key];
								result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
							} else {
								result[key] = value;
							}
						}
						if (hasEntry) {
							return result;
						}
					} catch (error) {
						// continue
					}
				}
				return null;
			};
			const pushParsed = (value, reason) => {
				if (!value) return;
				const structured = tryParseStructured(value);
				if (structured && structured !== value) {
					pushValue(structured, reason + '.structured');
				}
				pushValue(value, reason);
			};
			const pushNestedPaths = (root, label, paths) => {
				if (!root) return;
				for (const rawPath of paths) {
					const keys = Array.isArray(rawPath) ? rawPath : [rawPath];
					let current = root;
					for (const key of keys) {
						if (current == null) {
							current = undefined;
							break;
						}
						current = current[key];
					}
					if (current !== undefined) {
						pushValue(current, label + '.' + keys.join('.'));
					}
				}
			};
			const collectFromYtcfgSource = (source, labelPrefix) => {
				if (!source) return;
				pushParsed(source.PLAYER_VARS, labelPrefix + '.PLAYER_VARS');
				pushParsed(source.PLAYER_RESPONSE, labelPrefix + '.PLAYER_RESPONSE');
				pushParsed(source.WEB_PLAYER_CONTEXT_CONFIGS, labelPrefix + '.WEB_PLAYER_CONTEXT_CONFIGS');
				pushParsed(source.APP_CONTEXT_CONFIG, labelPrefix + '.APP_CONTEXT_CONFIG');
				pushParsed(source.APP_CONTEXT, labelPrefix + '.APP_CONTEXT');
				const playerVars = tryParseStructured(source.PLAYER_VARS);
				if (playerVars && typeof playerVars === 'object') {
					pushNestedPaths(playerVars, labelPrefix + '.PLAYER_VARS', [
						['video_id'],
						['v'],
						['currentVideo'],
						['currentVideoId'],
						['videoIds']
					]);
				}
				const playerResponse = tryParseStructured(source.PLAYER_RESPONSE);
				if (playerResponse && typeof playerResponse === 'object') {
					pushNestedPaths(playerResponse, labelPrefix + '.PLAYER_RESPONSE', [
						['videoDetails', 'videoId'],
						['currentVideoEndpoint', 'watchEndpoint', 'videoId'],
						['queueData', 'content', 0, 'videoId'],
						['queueData', 'content', 0, 'content', 'videoId']
					]);
				}
				const contextConfigs = tryParseStructured(source.WEB_PLAYER_CONTEXT_CONFIGS);
				if (contextConfigs && typeof contextConfigs === 'object') {
					pushNestedPaths(contextConfigs, labelPrefix + '.WEB_PLAYER_CONTEXT_CONFIGS', [
						['webPlayerContextConfig', 'watchEndpoint', 'videoId'],
						['webPlayerContextConfig', 'videoId'],
						['webPlayerContextConfig', 'queue', 0, 'videoId']
					]);
				}
				const appContextConfig = tryParseStructured(source.APP_CONTEXT_CONFIG);
				if (appContextConfig && typeof appContextConfig === 'object') {
					pushNestedPaths(appContextConfig, labelPrefix + '.APP_CONTEXT_CONFIG', [
						['watchEndpoint', 'videoId'],
						['queue', 0, 'videoId'],
						['videoDetails', 'videoId']
					]);
				}
			};
			const collectSources = () => {
				const args = window?.ytplayer?.config?.args;
				if (args) {
					pushValue(args.video_id, 'ytplayer.config.args.video_id');
					pushValue(args.videoIds, 'ytplayer.config.args.videoIds');
					pushValue(args.currentVideo, 'ytplayer.config.args.currentVideo');
					const response = tryParseStructured(args.player_response);
					if (response && typeof response === 'object') {
						pushValue(response?.videoDetails?.videoId, 'player_response.videoDetails.videoId');
						pushValue(response?.currentVideoEndpoint?.watchEndpoint?.videoId, 'player_response.currentVideoEndpoint');
					}
				}
				const mdx = window?.yt?.config_?.MDX_CONFIG;
				if (mdx?.data?.screenQueueData) {
					pushValue(mdx.data.screenQueueData.nowPlaying?.contentId, 'MDX nowPlaying');
					pushValue(mdx.data.screenQueueData.content?.map?.((item) => item.contentId), 'MDX queue');
				}
				const playerVars = window?.yt?.config_?.PLAYER_VARS;
				if (playerVars) {
					pushValue(playerVars.video_id, 'PLAYER_VARS.video_id');
					pushValue(playerVars.v, 'PLAYER_VARS.v');
				}
				const mdxRemote = window?.yt?.mdx?.remote;
				if (mdxRemote?.setupReceiver_) {
					const receiver = mdxRemote.setupReceiver_;
					pushValue(receiver.currentVideoId, 'mdx.setupReceiver_.currentVideoId');
				}
				const mdxController = mdxRemote?.warehouse_?.controller_;
				if (mdxController) {
					pushValue(mdxController.currentVideoId, 'mdx.controller_.currentVideoId');
					const playerContext = mdxController.getPlayerContext?.();
					if (playerContext) {
						pushValue(playerContext.videoId, 'mdx.controller_.playerContext.videoId');
					}
				}
				const ytcfg = window?.ytcfg;
				if (ytcfg) {
					try {
						if (typeof ytcfg.getAll === 'function') {
							collectFromYtcfgSource(ytcfg.getAll(), 'ytcfg.getAll');
						}
					} catch (error) {
						console.warn('mmm-screencast:ytcfg.getAll failed', error);
					}
					if (ytcfg.data_) {
						collectFromYtcfgSource(ytcfg.data_, 'ytcfg.data_');
					}
					if (typeof ytcfg.get === 'function') {
						for (const key of ['PLAYER_VARS', 'PLAYER_RESPONSE', 'WEB_PLAYER_CONTEXT_CONFIGS', 'APP_CONTEXT_CONFIG', 'APP_CONTEXT']) {
							try {
								const value = ytcfg.get(key);
								if (!value) continue;
								collectFromYtcfgSource({ [key]: value }, 'ytcfg.get.' + key);
							} catch (error) {
								console.warn('mmm-screencast:ytcfg.get failed', key, error);
							}
						}
					}
				}
				const player = document.querySelector('video');
				if (player?.src) {
					const match = player.src.match(/[\\/?=]([A-Za-z0-9_-]{8,11})(?=[\\/?&]|$)/);
					if (match?.[1]) {
						pushValue(match[1], 'video[src] match');
					}
				}
				const scripts = Array.from(document.querySelectorAll('script')).slice(0, 8);
				for (const script of scripts) {
					const text = script.textContent || '';
					if (!text) continue;
					const match = text.match(/"videoId"\\s*:\\s*"([A-Za-z0-9_-]{8,11})"/);
					if (match?.[1]) {
						pushValue(match[1], 'inline script videoId');
					}
				}
				const html = document.body?.innerHTML;
				if (html && html.length < 5_000_000) {
					const globalMatch = html.match(/"videoId"\\s*:\\s*"([A-Za-z0-9_-]{8,11})"/);
					if (globalMatch?.[1]) {
						pushValue(globalMatch[1], 'html videoId');
					}
				}
			};
			collectSources();
			const sortedCandidates = Array.from(candidates);
			const best = sortedCandidates.find((value) => /^[A-Za-z0-9_-]{8,11}$/.test(value)) || null;
			if (!best) {
				console.log('mmm-screencast:no-video-id-yet', sortedCandidates.slice(0, 5));
			}
				return {
					videoId: best,
					title: document.title || null,
					candidates: sortedCandidates,
					url: window.location.href,
					videoState: bestVideoState
				};
		})()`;
		webview.executeJavaScript(script, true).then((info) => {
			Log.info(`MMM-Screencast: retorno do webview ${JSON.stringify(info)}`);
			this._applyVideoProbe(info);
		}).catch((error) => {
			Log.error("MMM-Screencast: falha ao consultar vídeo do webview", error);
		});
	},

	_applyVideoProbe(info) {
		const normalized = this._normalizeVideoProbeInfo(info);
		if (!normalized) {
			return;
		}
		const { webviewUrl, candidates, videoId, title, videoState } = normalized;
		const candidatesChanged = !this._areCandidateListsEqual(this.state.videoCandidates, candidates);
		const urlChanged = webviewUrl !== this.state.webviewUrl;
		const videoIdChanged = videoId !== this.state.videoId;
		const targetTitle = title || this.state.videoTitle || null;
		const titleChanged = targetTitle !== this.state.videoTitle;
		const videoStateChanged = JSON.stringify(this.state.videoState) !== JSON.stringify(videoState);
		const nextEmbedFallback = this._nextEmbedFallback(videoState, videoId);
		const embedFallbackChanged = nextEmbedFallback !== this.state.embedFallback;
		if (!candidatesChanged && !urlChanged && !videoIdChanged && !titleChanged && !videoStateChanged && !embedFallbackChanged) {
			return;
		}
		this.state = {
			...this.state,
			videoCandidates: candidates,
			webviewUrl,
			videoId,
			videoTitle: targetTitle,
			videoState,
			embedFallback: nextEmbedFallback
		};
		if (this.config?.debug) {
			this._updateDebugPanel();
		}
		const needsBrowserRefresh = !this.isElectron && (candidatesChanged || urlChanged || videoIdChanged || titleChanged);
		const needsEmbedRefresh = this.isElectron && this._shouldUseEmbed() && (videoIdChanged || embedFallbackChanged) && Boolean(videoId);
		if (embedFallbackChanged && nextEmbedFallback && !this.config?.preferEmbed) {
			Log.warn("MMM-Screencast: nenhum frame detectado, alternando para player embed.");
		}
		if (needsBrowserRefresh || needsEmbedRefresh || embedFallbackChanged) {
			this.updateDom(0);
		}
	},

	_normalizeVideoProbeInfo(info) {
		if (!info || typeof info !== "object") {
			return null;
		}
		const incomingUrl = typeof info.url === "string" && info.url.trim().length ? info.url.trim() : null;
		const webviewUrl = incomingUrl ?? this.state.webviewUrl ?? null;
		const candidates = this._mergeProbeCandidates(info.candidates, webviewUrl);
		const directVideoId = this._sanitizeVideoId(info.videoId);
		const candidateVideoId = candidates.map((candidate) => this._sanitizeVideoId(candidate)).find(Boolean) || null;
		const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : null;
		const videoState = this._normalizeVideoState(info.videoState);
		return {
			webviewUrl,
			candidates,
			videoId: directVideoId || candidateVideoId,
			title,
			videoState
		};
	},

	_normalizeVideoState(raw) {
		if (!raw || typeof raw !== "object") {
			return null;
		}
		const normalized = {
			readyState: Number.isFinite(raw.readyState) ? raw.readyState : null,
			paused: Boolean(raw.paused),
			autoplay: Boolean(raw.autoplay),
			muted: Boolean(raw.muted),
			seeking: Boolean(raw.seeking),
			haveFrameData: Boolean(raw.haveFrameData),
			haveEnoughData: Boolean(raw.haveEnoughData),
			display: typeof raw.display === "string" ? raw.display : null,
			visibility: typeof raw.visibility === "string" ? raw.visibility : null,
			opacity: typeof raw.opacity === "string" ? raw.opacity : null,
			currentSrc: typeof raw.currentSrc === "string" ? raw.currentSrc : "",
			elementCount: Number.isFinite(raw.elementCount) ? raw.elementCount : null,
			timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now(),
			error: raw.error && typeof raw.error === "object"
				? {
					code: raw.error.code ?? null,
					message: typeof raw.error.message === "string" ? raw.error.message : null
				}
				: null
		};
		return normalized;
	},

	_nextEmbedFallback(videoState, videoId) {
		if (this.config?.preferEmbed) {
			return Boolean(this.state.embedFallback);
		}
		if (!this.config.autoEmbedFallback) {
			this._emptyFrameCount = 0;
			return Boolean(this.state.embedFallback);
		}
		if (!videoState) {
			return Boolean(this.state.embedFallback);
		}
		const readyState = Number.isFinite(videoState.readyState) ? videoState.readyState : 0;
		const hasFrames = videoState.haveFrameData || videoState.haveEnoughData || readyState >= 2 || (videoState.currentSrc && videoState.currentSrc.length > 0);
		if (hasFrames) {
			this._emptyFrameCount = 0;
			return Boolean(this.state.embedFallback);
		}
		this._emptyFrameCount = (this._emptyFrameCount || 0) + 1;
		const threshold = Number.isFinite(this.config.autoEmbedFallbackThreshold) ? this.config.autoEmbedFallbackThreshold : 4;
		if (!this.state.embedFallback && videoId && this._emptyFrameCount >= threshold) {
			return true;
		}
		return Boolean(this.state.embedFallback);
	},

	_mergeProbeCandidates(rawCandidates, webviewUrl) {
		const unique = [];
		const push = (value) => {
			if (typeof value !== "string") {
				return;
			}
			const trimmed = value.trim();
			if (!trimmed || unique.includes(trimmed)) {
				return;
			}
			unique.push(trimmed);
		};
		if (Array.isArray(rawCandidates)) {
			for (const candidate of rawCandidates) {
				push(candidate);
			}
		}
		for (const candidate of this._collectCandidatesFromUrlText(webviewUrl)) {
			push(candidate);
		}
		return unique;
	},

	_collectCandidatesFromUrlText(value) {
		if (typeof value !== "string" || !value.trim()) {
			return [];
		}
		const results = [];
		const seen = new Set();
		const queue = [value.trim()];
		const enqueue = (fragment) => {
			if (typeof fragment === "string" && fragment && !seen.has(fragment)) {
				queue.push(fragment);
			}
		};
		const pushCandidate = (candidate) => {
			const sanitized = this._sanitizeVideoId(candidate);
			if (sanitized && !results.includes(sanitized)) {
				results.push(sanitized);
			}
		};
		while (queue.length) {
			const fragment = queue.shift();
			if (!fragment || seen.has(fragment)) {
				continue;
			}
			seen.add(fragment);
			this._enqueueDerivedFragments(fragment, enqueue);
			this._extractCandidatesFromFragment(fragment, pushCandidate);
		}
		return results;
	},

	_enqueueDerivedFragments(fragment, enqueue) {
		const decoded = this._safeDecodeURIComponent(fragment);
		if (decoded) {
			enqueue(decoded);
		}
		const base64Decoded = this._decodeBase64(fragment);
		if (base64Decoded) {
			enqueue(base64Decoded);
		}
		const paramRegex = /[?&#]([A-Za-z0-9_-]{2,})=([^&#]+)/g;
		let match;
		while ((match = paramRegex.exec(fragment)) !== null) {
			const [, key, raw] = match;
			if (/(id|video)/i.test(key) || key === "params") {
				enqueue(raw);
			}
		}
	},

	_extractCandidatesFromFragment(fragment, pushCandidate) {
		const regexes = [
			/[?&#]v=([A-Za-z0-9_-]{8,11})/g,
			/[?&#](?:videoId|video_id|contentId|content_id)=([A-Za-z0-9_-]{8,11})/g,
			/(?:watch|video|embed|v)[/=]([A-Za-z0-9_-]{8,11})/g
		];
		for (const regex of regexes) {
			let match;
			while ((match = regex.exec(fragment)) !== null) {
				pushCandidate(match[1]);
			}
		}
	},

	_sanitizeVideoId(value) {
		if (typeof value !== "string") {
			return null;
		}
		const trimmed = value.trim();
		if (!/^[A-Za-z0-9_-]{8,11}$/.test(trimmed)) {
			return null;
		}
		const forbidden = ["leanback", "watch", "player", "playlist", "default"];
		if (forbidden.includes(trimmed.toLowerCase())) {
			return null;
		}
		return trimmed;
	},

	_areCandidateListsEqual(previous, next) {
		if (!Array.isArray(previous) && !Array.isArray(next)) {
			return true;
		}
		if (!Array.isArray(previous) || !Array.isArray(next)) {
			return false;
		}
		if (previous.length !== next.length) {
			return false;
		}
		for (let index = 0; index < previous.length; index += 1) {
			if (previous[index] !== next[index]) {
				return false;
			}
		}
		return true;
	},

	_tryParseStringValue(value) {
		if (typeof value !== "string") {
			return null;
		}
		const attempts = [
			() => JSON.parse(value),
			() => JSON.parse(decodeURIComponent(value)),
			() => {
				const decoded = this._decodeBase64(value);
				return decoded ? JSON.parse(decoded) : null;
			},
			() => {
				const decoded = this._decodeBase64(decodeURIComponent(value));
				return decoded ? JSON.parse(decoded) : null;
			}
		];
		for (const attempt of attempts) {
			try {
				const result = attempt();
				if (result !== null && result !== undefined) {
					return result;
				}
			} catch (error) {
				Log.debug("MMM-Screencast: tentativa de parse de launchData falhou", error);
			}
		}
		if (value.includes(",")) {
			return value.split(",").map((part) => part.trim()).filter(Boolean);
		}
		return null;
	},

	_decodeBase64(value) {
		if (typeof value !== "string" || !value) {
			return null;
		}
		const compact = value.replaceAll(/\s+/g, "");
		if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length % 4 !== 0) {
			return null;
		}
		try {
			if (typeof globalThis !== "undefined" && typeof globalThis.atob === "function") {
				return globalThis.atob(compact);
			}
		} catch (error) {
			Log.debug("MMM-Screencast: falha ao decodificar base64 com atob", error);
		}
		if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
			try {
				return Buffer.from(compact, "base64").toString("utf-8");
			} catch (error) {
				Log.debug("MMM-Screencast: falha ao decodificar base64 com Buffer", error);
			}
		}
		return null;
	},

	_detectElectron() {
		const processElectron = Boolean(globalThis?.process?.versions?.electron);
		if (processElectron) {
			return true;
		}
		const globalNavigator = typeof globalThis === "object" ? globalThis.navigator : undefined;
		const ua = typeof globalNavigator?.userAgent === "string" ? globalNavigator.userAgent : "";
		if (/electron/i.test(ua)) {
			return true;
		}
		const globalWindow = typeof globalThis === "object" ? globalThis.window : undefined;
		const hasElectronBridge = Boolean(globalWindow?.electronBridge || globalWindow?.ipcRenderer);
		return hasElectronBridge;
	}

});
