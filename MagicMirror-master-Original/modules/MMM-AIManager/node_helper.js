const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  start() {
    this.log("MMM-AIManager helper iniciado");
    this._envCache = null;
    this.apiKeys = this._loadApiKeys();
    this.aiDefaults = this._loadAiDefaults();
  },

  async socketNotificationReceived(notification, payload) {
    if (notification !== "GET_AI_RESPONSE" || !payload) {
      return;
    }

    const requestId = payload.requestId || Date.now();
    const provider = (payload.provider || "gemini").toString().trim().toLowerCase();
    const senderId = payload.senderId || null;
    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const context = { requestId, senderId, provider };

    if (!prompt) {
      this.sendSocketNotification("AI_RESPONSE", {
        ...context,
        error: "Prompt vazio.",
      });
      return;
    }

    const mergedKeys = {
      ...this.apiKeys,
      ...(payload.apiKeys && typeof payload.apiKeys === "object" ? payload.apiKeys : {}),
    };

    let effectiveProvider = provider;
    let fallbackFrom = null;

    try {
      let responseText;
      if (provider === "gemini") {
        responseText = await this.callGemini(prompt, payload, mergedKeys.gemini);
      } else if (provider === "openai") {
        responseText = await this.callOpenAI(prompt, payload, mergedKeys.openai);
      } else if (provider === "huggingface" || provider === "hf") {
        responseText = await this.callHuggingFace(prompt, payload, mergedKeys.huggingface);
        effectiveProvider = "huggingface";
      } else {
        throw new Error(`Provedor desconhecido: ${provider}`);
      }

      context.provider = effectiveProvider;
      if (fallbackFrom) {
        context.fallbackFrom = fallbackFrom;
      }

      this.sendSocketNotification("AI_RESPONSE", {
        ...context,
        response: responseText.trim() || "Sem resposta do provedor.",
      });
      return;
    } catch (primaryError) {
      if (provider === "gemini") {
        const hfKey = mergedKeys.huggingface;
        const hasHfKey = hfKey && !/SUA_CHAVE/i.test(hfKey);
        if (hasHfKey) {
          this.log(`Gemini falhou (${primaryError.message}). Tentando fallback no Hugging Face.`);
          try {
            const responseText = await this.callHuggingFace(prompt, payload, hfKey);
            effectiveProvider = "huggingface";
            fallbackFrom = "gemini";
            context.provider = effectiveProvider;
            context.fallbackFrom = fallbackFrom;

            this.sendSocketNotification("AI_RESPONSE", {
              ...context,
              response: responseText.trim() || "Sem resposta do provedor.",
            });
            return;
          } catch (fallbackError) {
            const composed = `${primaryError.message} | Fallback Hugging Face falhou: ${fallbackError.message}`;
            this.log(`Falha no fallback Hugging Face: ${fallbackError.message}`);
            this.sendSocketNotification("AI_RESPONSE", {
              ...context,
              error: composed,
            });
            return;
          }
        }
      }

      this.log(`Erro ao consultar ${provider}: ${primaryError.message}`);
      this.sendSocketNotification("AI_RESPONSE", {
        ...context,
        error: primaryError.message || "Falha ao consultar o provedor de IA.",
      });
    }
  },

  async callGemini(prompt, payload, apiKey) {
    const key = apiKey || "SUA_CHAVE_GEMINI_AQUI";
    if (!key || key.includes("SUA_CHAVE")) {
      throw new Error("Configure a chave do Gemini.");
    }

    const options = payload.options || {};
    const systemPrompt = options.systemPrompt || payload.systemPrompt || null;
    const temperature = this._resolveNumber(options.temperature ?? payload.temperature);
    const maxOutputTokens = this._resolveNumber(
      options.maxOutputTokens ?? options.maxTokens ?? payload.maxOutputTokens,
    );
    const model = (
      payload.model ||
      options.model ||
      (this.aiDefaults ? this.aiDefaults.geminiModel : null) ||
      "gemini-2.0-flash"
    )
      .toString()
      .trim();

    const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

    if (systemPrompt) {
      body.systemInstruction = { role: "system", parts: [{ text: systemPrompt }] };
    }

    if (Number.isFinite(temperature)) {
      body.generationConfig = body.generationConfig || {};
      body.generationConfig.temperature = temperature;
    }

    if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
      body.generationConfig = body.generationConfig || {};
      body.generationConfig.maxOutputTokens = maxOutputTokens;
    }

    const fetchImpl = await this._ensureFetch();
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini retornou ${response.status}: ${this._snippet(text)}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const answer = parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join(" ")
      .trim();

    return answer || "Não consegui formular uma resposta agora.";
  },

  async callOpenAI(prompt, payload, apiKey) {
    const key = apiKey || "SUA_CHAVE_OPENAI_AQUI";
    if (!key || key.includes("SUA_CHAVE")) {
      throw new Error("Configure a chave da OpenAI.");
    }

    const options = payload.options || {};
    const systemPrompt = options.systemPrompt || payload.systemPrompt;
    const temperature = this._resolveNumber(options.temperature ?? payload.temperature, 0.7);
    const maxTokens = this._resolveNumber(options.maxTokens ?? options.maxOutputTokens ?? payload.maxOutputTokens);

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const body = {
      model: "gpt-3.5-turbo",
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
    };

    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      body.max_tokens = maxTokens;
    }

    const fetchImpl = await this._ensureFetch();
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI retornou ${response.status}: ${this._snippet(text)}`);
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (answer) {
      return answer;
    }

    throw new Error("OpenAI não retornou conteúdo.");
  },

  async callHuggingFace(prompt, payload, apiKey) {
    const key = apiKey || "SUA_CHAVE_HUGGINGFACE_AQUI";
    if (!key || key.includes("SUA_CHAVE")) {
      throw new Error("Configure o token do Hugging Face.");
    }

    const options = payload.options || {};
    const temperature = this._resolveNumber(options.temperature ?? payload.temperature);
    const maxTokens = this._resolveNumber(options.maxTokens ?? options.maxOutputTokens ?? payload.maxOutputTokens);

    const model = (
      payload.model ||
      options.model ||
      (this.aiDefaults ? this.aiDefaults.huggingfaceModel : null) ||
      "mistralai/Mistral-7B-Instruct-v0.2:featherless-ai"
    )
      .toString()
      .trim();
    const useRouter = model.includes(":") || options.api === "chat";

    let url;
    let requestBody;

    if (useRouter) {
      url = payload.apiUrl || "https://router.huggingface.co/v1/chat/completions";
      requestBody = {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      };
      if (Number.isFinite(temperature)) {
        requestBody.temperature = temperature;
      }
      if (Number.isFinite(maxTokens) && maxTokens > 0) {
        requestBody.max_tokens = maxTokens;
      }
    } else {
      const modelPath = model
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      url = payload.apiUrl || `https://api-inference.huggingface.co/models/${modelPath}`;
      requestBody = {
        inputs: prompt,
        parameters: {},
        options: { wait_for_model: true },
      };
      if (Number.isFinite(temperature)) {
        requestBody.parameters.temperature = temperature;
      }
      if (Number.isFinite(maxTokens) && maxTokens > 0) {
        requestBody.parameters.max_new_tokens = maxTokens;
      }
    }

    const fetchImpl = await this._ensureFetch();
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || /invalid credentials/i.test(text)) {
        throw new Error("Token Hugging Face inválido ou sem permissão (401).");
      }
      throw new Error(`Hugging Face retornou ${response.status}: ${this._snippet(text)}`);
    }

    const data = await response.json();
    if (useRouter) {
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) {
        return text.trim();
      }
    } else {
      if (Array.isArray(data)) {
        const generated = data.find((item) => typeof item?.generated_text === "string");
        if (generated?.generated_text) {
          return generated.generated_text.trim();
        }
      }

      if (typeof data?.generated_text === "string") {
        return data.generated_text.trim();
      }
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    throw new Error("Hugging Face não retornou conteúdo.");
  },

  async _ensureFetch() {
    if (typeof fetch === "function") {
      return fetch;
    }
    const nodeFetch = await import("node-fetch");
    return nodeFetch.default;
  },

  _resolveNumber(value, fallback) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
    return fallback;
  },

  _loadApiKeys() {
    return {
      gemini: this._resolveEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]) || "SUA_CHAVE_GEMINI_AQUI",
      openai: this._resolveEnv(["OPENAI_API_KEY"]) || "SUA_CHAVE_OPENAI_AQUI",
      huggingface: this._resolveEnv(["HUGGINGFACE_API_KEY", "HF_API_KEY"]) || "SUA_CHAVE_HUGGINGFACE_AQUI",
    };
  },

  _loadAiDefaults() {
    return {
      geminiModel:
        this._resolveEnv(["GEMINI_MODEL", "GOOGLE_MODEL", "AI_GEMINI_MODEL"]) ||
        "gemini-2.0-flash",
      huggingfaceModel:
        this._resolveEnv(["HUGGINGFACE_MODEL", "HF_MODEL", "AI_HF_MODEL"]) ||
        "mistralai/Mistral-7B-Instruct-v0.2:featherless-ai",
    };
  },

  _resolveEnv(keys) {
    if (!Array.isArray(keys)) {
      return null;
    }
    for (const key of keys) {
      if (!key) continue;
      if (typeof process !== "undefined" && process?.env?.[key]) {
        return process.env[key];
      }
      if (!this._envCache) {
        this._envCache = this._loadDotEnv();
      }
      if (this._envCache && this._envCache[key]) {
        return this._envCache[key];
      }
    }
    return null;
  },

  _loadDotEnv() {
    try {
  const fs = require("node:fs");
  const path = require("node:path");
      const envPath = path.join(process.cwd(), ".env");
      if (!fs.existsSync(envPath)) {
        return null;
      }
      const text = fs.readFileSync(envPath, "utf8");
      const entries = text
        .split(/\r?\n/)
        .map((line) => {
          const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
          if (!match) return null;
          const key = match[1];
          let value = match[2];
          if (value?.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          return [key, value?.trim() ?? ""];
        })
        .filter(Boolean);
      return Object.fromEntries(entries);
    } catch (error) {
      this.log(`Falha ao carregar .env: ${error.message}`);
      return null;
    }
  },

  _snippet(text) {
    if (!text) {
      return "";
    }
    const clean = text
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
    return clean.length > 160 ? `${clean.slice(0, 160)}…` : clean;
  },

  log(msg) {
    // eslint-disable-next-line no-console
    console.log(`[MMM-AIManager] ${msg}`);
  },
});
