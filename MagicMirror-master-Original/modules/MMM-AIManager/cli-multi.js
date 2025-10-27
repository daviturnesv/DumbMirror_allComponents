#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const HelperClass = require("./node_helper");
const helper = new HelperClass();

let envCache = null;

const PROVIDERS = {
  gemini: {
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    invoke: (prompt, payload, apiKey) => helper.callGemini(prompt, payload, apiKey),
  },
  huggingface: {
    envKeys: ["HUGGINGFACE_API_KEY", "HF_API_KEY"],
    invoke: (prompt, payload, apiKey) => helper.callHuggingFace(prompt, payload, apiKey),
  },
  hf: {
    envKeys: ["HUGGINGFACE_API_KEY", "HF_API_KEY"],
    invoke: (prompt, payload, apiKey) => helper.callHuggingFace(prompt, payload, apiKey),
  },
  openai: {
    envKeys: ["OPENAI_API_KEY"],
    invoke: (prompt, payload, apiKey) => helper.callOpenAI(prompt, payload, apiKey),
  },
};

async function main() {
  try {
    if (typeof helper.setName === "function") {
      helper.setName("MMM-AIManager");
    }
    if (typeof helper.start === "function") {
      helper.start();
    }

    const options = await parseArgs();
    const providerKey = (options.provider || "gemini").toLowerCase();
    const provider = PROVIDERS[providerKey];
    if (!provider) {
      throw new Error(`Provedor desconhecido: ${options.provider || providerKey}`);
    }

    const prompt = await resolvePrompt(options.prompt);
    if (!prompt) {
      throw new Error("Informe a pergunta via argumento ou stdin.");
    }

    const apiKey = resolveApiKey(options.apiKey, provider.envKeys);
    if (!apiKey) {
      throw new Error(`Chave para ${providerKey} não encontrada. Use --key ou configure o .env.`);
    }

    const payload = buildPayload(providerKey, prompt, options);

    const response = await provider.invoke(prompt, payload, apiKey);

    printResult({ provider: providerKey, payload, response });
  } catch (error) {
    console.error(`Falha: ${error.message}`);
    process.exitCode = 1;
  }
}

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    provider: null,
    prompt: null,
    apiKey: null,
    model: null,
    systemPrompt: null,
    temperature: undefined,
    maxTokens: undefined,
    useRouter: false,
    apiUrl: null,
  };

  const promptParts = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      promptParts.push(arg);
      continue;
    }

    const next = args[i + 1];

    switch (true) {
      case arg === "--provider":
        if (next) {
          options.provider = next;
          i += 1;
        }
        break;
      case arg.startsWith("--provider="):
        options.provider = arg.slice(11);
        break;
      case arg === "--key":
        if (next) {
          options.apiKey = next;
          i += 1;
        }
        break;
      case arg.startsWith("--key="):
        options.apiKey = arg.slice(6);
        break;
      case arg === "--model":
        if (next) {
          options.model = next;
          i += 1;
        }
        break;
      case arg.startsWith("--model="):
        options.model = arg.slice(8);
        break;
      case arg === "--system":
        if (next) {
          options.systemPrompt = next;
          i += 1;
        }
        break;
      case arg.startsWith("--system="):
        options.systemPrompt = arg.slice(9);
        break;
      case arg === "--temperature":
        if (next) {
          options.temperature = Number(next);
          i += 1;
        }
        break;
      case arg.startsWith("--temperature="):
        options.temperature = Number(arg.slice(14));
        break;
      case arg === "--max-tokens":
        if (next) {
          options.maxTokens = Number(next);
          i += 1;
        }
        break;
      case arg.startsWith("--max-tokens="):
        options.maxTokens = Number(arg.slice(13));
        break;
      case arg === "--router":
        options.useRouter = true;
        break;
      case arg === "--api-url":
        if (next) {
          options.apiUrl = next;
          i += 1;
        }
        break;
      case arg.startsWith("--api-url="):
        options.apiUrl = arg.slice(10);
        break;
      default:
        console.warn(`Opção desconhecida ignorada: ${arg}`);
    }
  }

  if (promptParts.length) {
    options.prompt = promptParts.join(" ");
  }

  return options;
}

async function resolvePrompt(initial) {
  if (initial && initial.trim()) {
    return initial.trim();
  }

  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const text = chunks.join("").trim();
    if (text) {
      return text;
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question("Digite a pergunta: ", (resp) => {
      rl.close();
      resolve(resp.trim());
    });
  });
  return answer;
}

function buildPayload(providerKey, prompt, options) {
  const payload = {
    provider: providerKey,
    prompt,
  };

  const opt = {};
  if (Number.isFinite(options.temperature)) {
    opt.temperature = options.temperature;
  }
  if (Number.isFinite(options.maxTokens)) {
    opt.maxTokens = options.maxTokens;
  }
  if (options.useRouter) {
    opt.api = "chat";
  }
  if (Object.keys(opt).length) {
    payload.options = opt;
  }

  if (options.model) {
    payload.model = options.model;
  }
  if (options.systemPrompt) {
    payload.systemPrompt = options.systemPrompt;
  }
  if (options.apiUrl) {
    payload.apiUrl = options.apiUrl;
  }

  return payload;
}

function resolveApiKey(inlineKey, envNames = []) {
  if (inlineKey) {
    return inlineKey;
  }

  for (const name of envNames) {
    if (!name) continue;
    if (typeof process !== "undefined" && process?.env?.[name]) {
      return process.env[name];
    }
  }

  if (!envCache) {
    envCache = loadDotEnv();
  }

  for (const name of envNames) {
    if (!name) continue;
    if (envCache && envCache[name]) {
      return envCache[name];
    }
  }

  return null;
}

function loadDotEnv() {
  try {
    const envPath = path.join(path.resolve(__dirname, "..", ".."), ".env");
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
    console.warn(`Aviso: não foi possível carregar .env (${error.message})`);
    return null;
  }
}

function printResult({ provider, payload, response }) {
  console.log(`\nProvedor: ${provider}`);
  if (payload.model) {
    console.log(`Modelo: ${payload.model}`);
  }
  if (payload.options && Object.keys(payload.options).length) {
    console.log(`Opções: ${JSON.stringify(payload.options)}`);
  }
  console.log("\nResposta:\n");
  console.log(response);
  console.log("\n--- fim ---\n");
}

main();
