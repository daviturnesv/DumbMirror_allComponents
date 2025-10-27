/*
 * MMM-Pages
 * Simple page manager for MagicMirror². Allows grouping modules into logical
 * pages and switching between them via notifications or the optional page
 * indicator UI.
 */

Module.register("MMM-Pages", {
  defaults: {
    pages: [],
    startPage: 0,
    animationTime: 600,
    autoRotate: false,
    rotationTime: 60,
    indicator: {
      enabled: true,
      showPageName: true,
      clickable: true,
      className: ""
    },
    fixedClasses: ["page-fixed"],
    fixedModuleNames: [],
    persistState: true,
    storageKey: "MMM-Pages:lastPage"
  },

  requiresVersion: "2.15.0",

  start() {
    this.pages = this._normalizePages(this.config.pages || []);
    this.trackedClasses = new Set(
      this.pages.flatMap((page) => page.classNames)
    );
    this.fixedClassSet = new Set(this.config.fixedClasses || []);
    this.fixedModuleSet = new Set(this.config.fixedModuleNames || []);
    this.currentIndex = this._resolveStartPage();
    this.rotationTimer = null;
    this.modulesReady = false;
    this.loaded = false;
    this._activeBodyTokens = [];
    this._activeModuleTokens = [];
    this._pendingModulePage = null;
    this.wrapper = null;
  },

  getStyles() {
    return [this.file("MMM-Pages.css")];
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-pages";
    this.wrapper = wrapper;

    if (this._pendingModulePage) {
      const pending = this._pendingModulePage;
      this._pendingModulePage = null;
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(() => this._applyModulePageClasses(pending));
      } else {
        setTimeout(() => this._applyModulePageClasses(pending), 0);
      }
    }

    const indicatorCfg = this.config.indicator || {};
    const indicatorEnabled = indicatorCfg.enabled !== false;
    if (!indicatorEnabled || this.pages.length <= 1) {
      wrapper.classList.add("mmm-pages--indicator-disabled");
      return wrapper;
    }

    if (indicatorCfg.className) {
      wrapper.classList.add(indicatorCfg.className);
    }

    const list = document.createElement("div");
    list.className = "mmm-pages__indicator";

    this.pages.forEach((page, index) => {
      const isActive = index === this.currentIndex;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mmm-pages__indicator-button";
      if (isActive) {
        btn.classList.add("is-active");
      }
      btn.textContent = indicatorCfg.showPageName !== false
        ? page.name
        : String(index + 1);

      if (indicatorCfg.clickable !== false) {
        btn.addEventListener("click", () => {
          this._switchToPage(index, this.config.animationTime, false, true);
        });
      } else {
        btn.disabled = true;
      }

      list.appendChild(btn);
    });

    wrapper.appendChild(list);
    return wrapper;
  },

  notificationReceived(notification, payload, sender) {
    if (notification === "DOM_OBJECTS_CREATED") {
      this.modulesReady = true;
      const applyInitial = () => {
        this._updateBodyState(this.pages[this.currentIndex]);
        this._applyPage(this.currentIndex, 0);
        this._scheduleRotation();
        this.loaded = true;
        this.updateDom(0);
      };
      // Wait a tick to ensure every module reported.
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(applyInitial);
      } else {
        setTimeout(applyInitial, 0);
      }
      return;
    }

    if (!this.modulesReady || !this.pages.length) {
      return;
    }

    switch (notification) {
      case "PAGE_NEXT":
        this._switchToPage(this._wrapIndex(this.currentIndex + 1));
        break;
      case "PAGE_PREVIOUS":
      case "PAGE_BACK":
        this._switchToPage(this._wrapIndex(this.currentIndex - 1));
        break;
      case "PAGE_SELECT":
        this._handleSelectPayload(payload);
        break;
      default:
        break;
    }
  },

  suspend() {
    this._clearRotation();
  },

  resume() {
    this._scheduleRotation();
    if (this.loaded) {
      this._applyPage(this.currentIndex, this.config.animationTime);
      this._updateBodyState(this.pages[this.currentIndex]);
      this.updateDom(0);
    }
  },

  /**
   * Normalize the pages configuration into consistent objects.
   */
  _normalizePages(pages) {
    if (!Array.isArray(pages)) {
      return [];
    }

    return pages
      .map((entry, index) => {
        if (!entry) {
          return null;
        }

        let name = null;
        const classNames = new Set();

        if (typeof entry === "string") {
          classNames.add(entry);
          name = this._prettifyName(entry);
        } else if (Array.isArray(entry)) {
          entry.filter(Boolean).forEach((cls) => classNames.add(String(cls)));
          name = this._prettifyName(entry[0] || `Page ${index + 1}`);
        } else if (typeof entry === "object") {
          if (entry.name) {
            name = String(entry.name);
          }
          const classProps = [
            entry.class,
            entry.className,
            entry.moduleClass,
            entry.moduleClasses,
            entry.classes
          ];
          classProps.forEach((val) => {
            if (!val) {
              return;
            }
            if (Array.isArray(val)) {
              val.filter(Boolean).forEach((cls) => classNames.add(String(cls)));
            } else {
              classNames.add(String(val));
            }
          });
        }

        const normalizedClasses = Array.from(classNames);
        if (!normalizedClasses.length) {
          return null;
        }

        if (!name) {
          name = this._prettifyName(normalizedClasses[0]);
        }

        return {
          name,
          classNames: normalizedClasses,
          index
        };
      })
      .filter(Boolean);
  },

  _prettifyName(raw) {
    if (!raw) {
      return "";
    }
    const noPrefix = String(raw).replace(/^page[-_]?/i, "");
    return noPrefix
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();
  },

  _resolveStartPage() {
    if (!this.pages.length) {
      return 0;
    }

    if (this.config.persistState && this._hasStorage()) {
      const stored = window.localStorage.getItem(this.config.storageKey);
      if (stored != null) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed < this.pages.length) {
          return parsed;
        }
      }
    }

    const start = this.config.startPage;
    if (typeof start === "number" && start >= 0 && start < this.pages.length) {
      return start;
    }

    if (typeof start === "string" && start.trim()) {
      const idx = this._findPageIndexByName(start.trim());
      if (idx >= 0) {
        return idx;
      }
      const classMatch = this.pages.findIndex((page) =>
        page.classNames.includes(start.trim())
      );
      if (classMatch >= 0) {
        return classMatch;
      }
    }

    return 0;
  },

  _handleSelectPayload(payload) {
    if (payload == null) {
      return;
    }

    if (typeof payload === "number") {
      this._switchToPage(this._wrapIndex(payload));
      return;
    }

    if (typeof payload === "string") {
      this._switchToName(payload);
      return;
    }

    if (typeof payload === "object") {
      if (typeof payload.index === "number") {
        this._switchToPage(this._wrapIndex(payload.index));
        return;
      }
      if (payload.name) {
        this._switchToName(payload.name);
        return;
      }
      if (payload.class) {
        this._switchToName(payload.class);
      }
    }
  },

  _switchToName(name) {
    if (!name) {
      return;
    }
    const trimmed = String(name).trim();
    const idxByName = this._findPageIndexByName(trimmed);
    if (idxByName >= 0) {
      this._switchToPage(idxByName);
      return;
    }
    const idxByClass = this.pages.findIndex((page) =>
      page.classNames.some((cls) => cls.toLowerCase() === trimmed.toLowerCase())
    );
    if (idxByClass >= 0) {
      this._switchToPage(idxByClass);
    }
  },

  _findPageIndexByName(name) {
    const lower = String(name).toLowerCase();
    return this.pages.findIndex((page) => page.name.toLowerCase() === lower);
  },

  _switchToPage(index, speed = this.config.animationTime, fromAuto = false, fromClick = false) {
    if (!this.pages.length) {
      return;
    }
    const normalized = this._wrapIndex(index);
    if (normalized === this.currentIndex && this.loaded) {
      return;
    }
    this.currentIndex = normalized;
    const selectedPage = this.pages[this.currentIndex];
    this._applyPage(this.currentIndex, speed);
    this._updateBodyState(selectedPage);
    this.updateDom(0);

    if (this.config.persistState && this._hasStorage()) {
      window.localStorage.setItem(this.config.storageKey, String(this.currentIndex));
    }

    if (!fromAuto) {
      this._scheduleRotation();
    }

    this.sendNotification("PAGE_CHANGED", {
      index: this.currentIndex,
      name: this.pages[this.currentIndex].name,
      classNames: this.pages[this.currentIndex].classNames,
      source: fromAuto ? "auto" : fromClick ? "click" : "manual"
    });
  },

  _applyPage(index, speed = this.config.animationTime) {
    const selectedPage = this.pages[index];
    if (!selectedPage) {
      return;
    }

    const targetClasses = new Set(selectedPage.classNames);
    const modules = MM.getModules();
    const lockString = this.identifier;

    modules.enumerate((module) => {
      if (!module || module.identifier === this.identifier) {
        return;
      }

      if (this._isFixed(module)) {
        module.show(speed, undefined, { lockString });
        return;
      }

      const belongs = this._moduleBelongsTo(module, targetClasses);
      const isTracked = this._moduleIsTracked(module);

      if (belongs) {
        module.show(speed, undefined, { lockString });
      } else if (isTracked) {
        module.hide(speed, undefined, { lockString });
      } else {
        module.show(speed, undefined, { lockString });
      }
    });
  },

  _moduleBelongsTo(module, targetClasses) {
    const classes = this._getModuleClasses(module);
    return classes.some((cls) => targetClasses.has(cls));
  },

  _moduleIsTracked(module) {
    const classes = this._getModuleClasses(module);
    return classes.some((cls) => this.trackedClasses.has(cls));
  },

  _isFixed(module) {
    if (this.fixedModuleSet.has(module.name) || this.fixedModuleSet.has(module.data?.name)) {
      return true;
    }
    const classes = this._getModuleClasses(module);
    return classes.some((cls) => this.fixedClassSet.has(cls));
  },

  _getModuleClasses(module) {
    const raw = module?.data?.classes || "";
    return raw
      .split(/\s+/)
      .map((cls) => cls.trim())
      .filter(Boolean);
  },

  _wrapIndex(index) {
    if (!this.pages.length) {
      return 0;
    }
    const max = this.pages.length;
    return ((index % max) + max) % max;
  },

  _scheduleRotation() {
    this._clearRotation();
    const isEnabled =
      (this.config.autoRotate || this.config.rotationTime > 0) &&
      this.config.rotationTime > 0 &&
      this.pages.length > 1;

    if (!isEnabled) {
      return;
    }

    this.rotationTimer = setTimeout(() => {
      this._switchToPage(this._wrapIndex(this.currentIndex + 1), undefined, true);
    }, this.config.rotationTime * 1000);
  },

  _clearRotation() {
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
  },

  _updateBodyState(page) {
    if (typeof document === "undefined") {
      return;
    }
    const body = document.body;
    if (!body) {
      return;
    }

    if (Array.isArray(this._activeBodyTokens) && this._activeBodyTokens.length) {
      this._activeBodyTokens.forEach((cls) => body.classList.remove(cls));
    }

    const tokens = [];
    if (page) {
      const nameSlug = this._slugify(page.name);
      if (nameSlug) {
        tokens.push(`mm-current-name-${nameSlug}`);
      }
      if (Array.isArray(page.classNames)) {
        page.classNames.forEach((cls) => {
          const slug = this._slugify(cls);
          if (slug) {
            tokens.push(`mm-current-${slug}`);
          }
        });
      }
    }

    tokens.forEach((cls) => body.classList.add(cls));
    this._activeBodyTokens = tokens;

    this._applyModulePageClasses(page);
  },

  _slugify(input) {
    if (typeof input !== "string") {
      return "";
    }
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  },

  _applyModulePageClasses(page) {
    const container = this.wrapper?.closest?.(".module") || this.wrapper?.parentElement;
    if (!container) {
      this._pendingModulePage = page;
      return;
    }

    if (Array.isArray(this._activeModuleTokens) && this._activeModuleTokens.length) {
      this._activeModuleTokens.forEach((cls) => container.classList.remove(cls));
    }
    container.classList.remove("mmm-pages--active");

    const tokens = [];
    if (page) {
      const nameSlug = this._slugify(page.name);
      if (nameSlug) {
        tokens.push(`mmm-pages--name-${nameSlug}`);
      }
      if (Array.isArray(page.classNames)) {
        page.classNames.forEach((cls) => {
          const slug = this._slugify(cls);
          if (slug) {
            tokens.push(`mmm-pages--active-${slug}`);
          }
        });
      }
    }

    tokens.forEach((cls) => container.classList.add(cls));
    container.classList.add("mmm-pages--active");
    this._activeModuleTokens = tokens;
  },

  _hasStorage() {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    try {
      const key = "__mmm_pages_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.warn("[MMM-Pages] localStorage unavailable", err);
      return false;
    }
  }
});
