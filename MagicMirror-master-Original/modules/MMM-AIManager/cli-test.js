#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

let envCache = null;
let modelCache = null;
let preferredModel = null;

async function main() {
  try {
    const options = await parseArgs();
    const apiKey = resolveApiKey(options.apiKey, options.apiKeyEnv);
    if (!apiKey) {
      throw new Error("API key ausente. Use --key, defina a variável de ambiente, ou configure .env.");
    }

    const question = await resolveQuestion(options.question);
    if (!question) {
      throw new Error("Nenhuma pergunta fornecida.");
    }

    const answer = await invokeGemini({
      apiKey,
      question,
      model: options.model,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      systemPrompt: options.systemPrompt,
    });

    console.log("\nResposta:");
    console.log(answer.text);
    console.log("\nDetalhes (resposta bruta truncada):");
    console.log(JSON.stringify(answer.raw).slice(0, 800) + (JSON.stringify(answer.raw).length > 800 ? "…" : ""));
  } catch (error) {
    console.error(`Falha: ${error.message}`);
    process.exitCode = 1;
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    apiKey: null,
    apiKeyEnv: "GEMINI_API_KEY",
    question: null,
    model: null,
    temperature: undefined,
    maxOutputTokens: undefined,
    systemPrompt: null,
  };

  const questionParts = [];

  let index = 0;
  while (index < args.length) {
    const arg = args[index];

    if (arg.startsWith("--")) {
      if (arg === "--key") {
        const value = args[index + 1];
        if (value) {
          options.apiKey = value;
          index += 1;
        }
      } else if (arg.startsWith("--key=")) {
        options.apiKey = arg.slice(6);
      } else if (arg === "--env") {
        const value = args[index + 1];
        if (value) {
          options.apiKeyEnv = value;
          index += 1;
        }
      } else if (arg.startsWith("--env=")) {
        options.apiKeyEnv = arg.slice(6);
      } else if (arg === "--model") {
        const value = args[index + 1];
        if (value) {
          options.model = value;
          index += 1;
        }
      } else if (arg.startsWith("--model=")) {
        options.model = arg.slice(8);
      } else if (arg === "--temperature") {
        const value = args[index + 1];
        if (value) {
          options.temperature = Number(value);
          index += 1;
        }
      } else if (arg.startsWith("--temperature=")) {
        options.temperature = Number(arg.slice(14));
      } else if (arg === "--max-output") {
        const value = args[index + 1];
        if (value) {
          options.maxOutputTokens = Number(value);
          index += 1;
        }
      } else if (arg.startsWith("--max-output=")) {
        options.maxOutputTokens = Number(arg.slice(13));
      } else if (arg === "--system") {
        const value = args[index + 1];
        if (value) {
          options.systemPrompt = value;
          index += 1;
        }
      } else if (arg.startsWith("--system=")) {
        options.systemPrompt = arg.slice(9);
      } else {
        console.warn(`Opção desconhecida ignorada: ${arg}`);
      }
    } else {
      questionParts.push(arg);
    }

    index += 1;
  }

  if (questionParts.length) {
    options.question = questionParts.join(" ");
  }

  return options;
}

async function resolveQuestion(initial) {
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
  const question = await new Promise((resolve) => {
    rl.question("Digite a pergunta para o Gemini: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
  return question;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
async function invokeGemini(opts) {
  const { apiKey, model, question, temperature, maxOutputTokens, systemPrompt } = opts;
  const candidates = await determineCandidates({ apiKey, requestedModel: model });
  const apiVersions = ["v1beta", "v1"];
  const fetchImpl = await getFetch();
  let lastError = null;

  for (const candidate of candidates) {
    for (const apiVersion of apiVersions) {
      const body = buildRequestBody({
        question,
        systemPrompt,
        temperature,
        maxOutputTokens,
        useSystemInstruction: apiVersion !== "v1",
      });

  const basePath = candidate.startsWith("models/") ? candidate : `models/${candidate}`;
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/${basePath}:generateContent?key=${encodeURIComponent(apiKey)}`;
      log(`Consultando Gemini em ${apiVersion}/models/${candidate}`);

      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        const candidatePart = data?.candidates?.[0];
        const parts = candidatePart?.content?.parts || [];
        const answerText = parts
          .map((part) => (typeof part.text === "string" ? part.text : ""))
          .join(" ")
          .trim();

        preferredModel = candidate;
        return { text: answerText || "Não consegui formular uma resposta agora.", raw: data };
      }

      const status = response.status;
      const text = (await response.text()) || "";
      const snippet = text.length > 240 ? `${text.slice(0, 240)}…` : text;
      lastError = new Error(`Gemini retornou ${status} (${apiVersion}/models/${candidate}): ${snippet}`);
      if (status === 429) {
        throw lastError;
      }
      if (![400, 404].includes(status)) {
        throw lastError;
      }
      if (status === 404) {
        if (apiVersion === "v1beta") {
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error("Falha desconhecida ao consultar Gemini");
}

async function getFetch() {
  if (typeof fetch === "function") {
    return fetch;
  }
  const nodeFetch = await import("node-fetch");
  return nodeFetch.default;
}

function resolveApiKey(inlineKey, envName = "GEMINI_API_KEY") {
  if (inlineKey) return inlineKey;
  const target = envName;
  if (typeof process !== "undefined" && process?.env?.[target]) {
    return process.env[target];
  }
  if (!envCache) {
    envCache = loadDotEnv();
  }
  return envCache?.[target] || null;
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
    log(`Falha ao carregar .env: ${error.message}`);
    return null;
  }
}

function formatModelName(input) {
  const base = (input || "gemini-2.0-flash").trim();
  return base.replace(/^models\//i, "");
}

function modelCandidates(baseModel, dynamic = []) {
  const base = formatModelName(baseModel);
  const result = new Set();

  const addBaseVariants = (name) => {
    if (!name) return;
    result.add(name);
    if (name.endsWith("-latest")) {
      result.add(name.replace(/-latest$/i, ""));
    } else {
      result.add(`${name}-latest`);
    }
  };

  addBaseVariants(base);

  const familyPrefix = (() => {
    if (!base) return null;
    const parts = base.split("-");
    if (parts.length < 2) return null;
    return `${parts[0]}-${parts[1]}`;
  })();

  if (dynamic.length) {
    const filtered = familyPrefix ? dynamic.filter((dyn) => dyn.startsWith(familyPrefix)) : dynamic;
    for (const dyn of filtered) {
      addBaseVariants(formatModelName(dyn));
    }
  }

  const fallbackModels = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-latest",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite-latest",
    "gemini-2.5-pro",
    "gemini-2.5-pro-latest",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-8b-latest",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
  ];

  for (const fb of fallbackModels) {
    addBaseVariants(formatModelName(fb));
  }

  return Array.from(result).filter(Boolean);
}

function buildRequestBody({ question, systemPrompt, temperature, maxOutputTokens, useSystemInstruction }) {
  const body = { contents: [] };

  if (useSystemInstruction && systemPrompt) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: systemPrompt }],
    };
    body.contents.push({
      role: "user",
      parts: [{ text: question }],
    });
  } else {
    const combined = systemPrompt ? `${systemPrompt}\n\nPergunta: ${question}` : question;
    body.contents.push({
      role: "user",
      parts: [{ text: combined }],
    });
  }

  if (Number.isFinite(temperature)) {
    body.generationConfig = body.generationConfig || {};
    body.generationConfig.temperature = temperature;
  }

  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
    body.generationConfig = body.generationConfig || {};
    body.generationConfig.maxOutputTokens = maxOutputTokens;
  }

  return body;
}

async function availableModelCandidates(apiKey) {
  if (modelCache) {
    return modelCache;
  }

  try {
    const fetchImpl = await getFetch();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const response = await fetchImpl(url);

    if (!response.ok) {
      const text = await response.text();
      log(`Falha ao listar modelos (${response.status}): ${text}`);
      modelCache = [];
      return modelCache;
    }

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const names = models
      .filter((item) => {
        const methods = item?.supportedGenerationMethods;
        return Array.isArray(methods) ? methods.includes("generateContent") : true;
      })
      .map((item) => {
        const name = typeof item?.name === "string" ? item.name : "";
        return name.replace(/^models\//i, "");
      })
      .filter(Boolean);

    log(`Modelos disponíveis (cache): ${names.join(", ") || "nenhum"}`);
    modelCache = names;
    return modelCache;
  } catch (error) {
    log(`Erro listando modelos: ${error.message}`);
    modelCache = [];
    return modelCache;
  }
}

async function determineCandidates({ apiKey, requestedModel }) {
  if (preferredModel) {
    return [preferredModel];
  }

  const dynamic = await availableModelCandidates(apiKey);
  const candidates = modelCandidates(requestedModel, dynamic);
  if (!candidates.length) {
    return ["gemini-1.5-flash"];
  }
  return candidates.slice(0, 3);
}

function log(msg) {
  console.log(`[gemini-cli] ${msg}`);
}

if (require.main === module) {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main();
}
