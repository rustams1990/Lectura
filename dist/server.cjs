var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// routes/geminiClient.ts
function sanitizeGeminiKey(rawKey) {
  if (!rawKey) return null;
  const clean = rawKey.trim().replace(/^["']|["']$/g, "");
  const ascii = clean.replace(/[^\x00-\x7F]/g, "");
  if (!ascii || ascii === "MY_GEMINI_API_KEY" || ascii.includes("\u0432\u0430\u0448_\u043A\u043B\u044E\u0447") || ascii.length < 10) {
    return null;
  }
  return ascii;
}
function getGeminiClient(customKey) {
  const key = sanitizeGeminiKey(customKey || process.env.GEMINI_API_KEY);
  if (!key) return null;
  try {
    return new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI client:", err);
    return null;
  }
}
function getCandidateUrls(inputUrl) {
  const clean = inputUrl.trim();
  const urls = [clean];
  if (clean.includes("localhost") || clean.includes("127.0.0.1")) {
    urls.push(clean.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"));
    urls.push(clean.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"));
  }
  return Array.from(new Set(urls));
}
function extractAndParseJson(raw) {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const firstBrace = clean.indexOf("{");
  const firstBracket = clean.indexOf("[");
  let startIdx = -1;
  let endIdx = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = clean.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = clean.lastIndexOf("]");
  }
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    clean = clean.substring(startIdx, endIdx + 1);
  }
  return JSON.parse(clean);
}
async function callUniversalAiProvider(profile, prompt, options = {}) {
  const provider = profile.provider || "gemini";
  const apiKey = (profile.apiKey || "").trim();
  const timeoutMs = options.timeoutMs || 6e4;
  if (provider === "gemini") {
    const key = sanitizeGeminiKey(apiKey || process.env.GEMINI_API_KEY);
    if (!key) {
      const err = new Error("GEMINI_API_KEY is not configured or invalid");
      err.status = 401;
      throw err;
    }
    const ai = new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" }
      }
    });
    const modelName2 = (profile.model === "gemini-2.0-flash" ? "gemini-2.5-flash" : profile.model) || "gemini-2.5-flash";
    const config = {};
    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }
    if (options.temperature !== void 0) {
      config.temperature = options.temperature;
    }
    if (options.maxOutputTokens !== void 0) {
      config.maxOutputTokens = options.maxOutputTokens;
    }
    if (options.formatJson) {
      config.responseMimeType = "application/json";
      if (options.responseSchema) {
        config.responseSchema = options.responseSchema;
      }
    }
    try {
      const response = await ai.models.generateContent({
        model: modelName2,
        contents: prompt,
        config: Object.keys(config).length > 0 ? config : void 0
      });
      const rawText = response.text || "";
      if (options.formatJson) {
        return extractAndParseJson(rawText);
      }
      return rawText;
    } catch (err) {
      let cleanMessage = err.message || String(err);
      try {
        const parsed = typeof cleanMessage === "string" && cleanMessage.startsWith("{") ? JSON.parse(cleanMessage) : null;
        if (parsed?.error?.message) {
          cleanMessage = parsed.error.message;
        }
      } catch (_) {
      }
      const errStr = cleanMessage;
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("QuotaExceeded") || errStr.includes("rate limit") || err.status === 429) {
        const error2 = new Error(`Quota limit exceeded for Gemini key (${modelName2}): ${cleanMessage}`);
        error2.status = 429;
        error2.isQuotaExceeded = true;
        throw error2;
      }
      const error = new Error(cleanMessage);
      error.status = err.status || (errStr.includes("404") || errStr.includes("NOT_FOUND") ? 404 : 400);
      throw error;
    }
  }
  if (provider === "ollama" && (!profile.baseUrl || profile.baseUrl.includes("/api/generate"))) {
    const url = profile.baseUrl || "http://localhost:11434/api/generate";
    const model = profile.model || "phi3.5";
    let combinedPrompt = prompt;
    if (options.systemInstruction) {
      combinedPrompt = `System: ${options.systemInstruction}

User: ${prompt}`;
    }
    return callLocalAi(url, model, combinedPrompt, options.formatJson);
  }
  let endpoint = "";
  let defaultModel = "gpt-4o-mini";
  if (provider === "openai") {
    endpoint = (profile.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    defaultModel = "gpt-4o-mini";
  } else if (provider === "groq") {
    endpoint = (profile.baseUrl || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    defaultModel = "llama-3.3-70b-versatile";
  } else if (provider === "ollama") {
    endpoint = (profile.baseUrl || "http://localhost:11434/v1").replace(/\/$/, "");
    defaultModel = "llama3.2";
  } else {
    endpoint = (profile.baseUrl || "http://localhost:11434/v1").replace(/\/$/, "");
    defaultModel = profile.model || "default";
  }
  if (!endpoint.endsWith("/chat/completions")) {
    endpoint = `${endpoint}/chat/completions`;
  }
  const modelName = profile.model || defaultModel;
  const messages = [];
  if (options.systemInstruction) {
    messages.push({ role: "system", content: options.systemInstruction });
  }
  messages.push({ role: "user", content: prompt });
  const bodyPayload = {
    model: modelName,
    messages,
    temperature: options.temperature !== void 0 ? options.temperature : 0.3
  };
  if (options.maxOutputTokens) {
    bodyPayload.max_tokens = options.maxOutputTokens;
  }
  if (options.formatJson) {
    bodyPayload.response_format = { type: "json_object" };
  }
  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  const candidateUrls = getCandidateUrls(endpoint);
  let lastError = null;
  for (const urlToTry of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(urlToTry, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        let parsedErr = {};
        try {
          parsedErr = JSON.parse(errorText);
        } catch (_) {
        }
        const errMsg = parsedErr.error?.message || errorText || `HTTP ${res.status}`;
        if (res.status === 429 || errMsg.includes("rate_limit") || errMsg.includes("quota")) {
          const err2 = new Error(`Quota limit exceeded for ${provider} (${modelName}): ${errMsg}`);
          err2.status = 429;
          err2.isQuotaExceeded = true;
          throw err2;
        }
        const err = new Error(`${provider.toUpperCase()} API Error (${res.status}): ${errMsg}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content || "";
      if (options.formatJson) {
        return extractAndParseJson(rawText);
      }
      return rawText;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.isQuotaExceeded || err.status === 429) {
        throw err;
      }
      if (err.name === "AbortError") {
        continue;
      }
      if (err.code === "ECONNREFUSED" || err.message?.includes("fetch failed")) {
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error(`Failed to connect to ${provider} API at ${endpoint}`);
}
async function callLocalAi(url, model, prompt, formatJson = false) {
  const cleanUrl = (url || "http://localhost:11434/api/generate").trim();
  const cleanModel = (model || "phi3.5").trim();
  const candidateUrls = getCandidateUrls(cleanUrl);
  let lastError = null;
  for (const urlToTry of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6e4);
    try {
      const bodyPayload = {
        model: cleanModel,
        prompt,
        stream: false
      };
      if (formatJson) {
        bodyPayload.format = "json";
      }
      const response = await fetch(urlToTry, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Local AI server returned status ${response.status}`);
      }
      const data = await response.json();
      const rawText = (data.response || "").trim();
      if (formatJson) {
        return extractAndParseJson(rawText);
      }
      return rawText;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === "AbortError") {
        continue;
      }
      if (err.code === "ECONNREFUSED" || err.message?.includes("fetch failed")) {
        continue;
      }
      throw err;
    }
  }
  if (lastError?.name === "AbortError") {
    throw new Error("\u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0418\u0418 \u043F\u0440\u0435\u0432\u044B\u0441\u0438\u043B \u043B\u0438\u043C\u0438\u0442 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 (60 \u0441\u0435\u043A\u0443\u043D\u0434).");
  }
  if (lastError?.code === "ECONNREFUSED" || lastError?.message?.includes("fetch failed")) {
    const displayHost = cleanUrl.replace("/api/generate", "");
    throw new Error(`\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0418\u0418 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435, \u0437\u0430\u043F\u0443\u0449\u0435\u043D \u043B\u0438 Ollama \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0441\u0435\u0440\u0432\u0435\u0440\u0435 (${displayHost}).`);
  }
  throw lastError;
}
var import_genai;
var init_geminiClient = __esm({
  "routes/geminiClient.ts"() {
    import_genai = require("@google/genai");
  }
});

// routes/ai.ts
function extractAiProfile(req) {
  if (req.body?.aiProfile && typeof req.body.aiProfile === "object") {
    return req.body.aiProfile;
  }
  const customKey = req.headers["x-gemini-key"] || req.body?.geminiApiKey;
  if (req.body?.aiProvider === "local" || req.body?.localAiUrl) {
    return {
      provider: "ollama",
      baseUrl: req.body.localAiUrl || "http://localhost:11434/api/generate",
      model: req.body.localAiModel || "phi3.5"
    };
  }
  return {
    provider: "gemini",
    apiKey: customKey || process.env.GEMINI_API_KEY,
    model: req.body?.aiModel || "gemini-2.5-flash"
  };
}
function sanitizeLang(raw, fallback) {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim().substring(0, 80);
  if (INJECTION_PATTERNS.some((p) => p.test(trimmed))) {
    console.warn(`[sanitizeLang] Potential prompt injection blocked: "${trimmed.substring(0, 60)}"`);
    return fallback;
  }
  const cleaned = trimmed.replace(/[^\p{L}\p{N}\s\-]/gu, "").trim();
  const lookup = cleaned.toLowerCase();
  if (KNOWN_LANGUAGES[lookup]) {
    return KNOWN_LANGUAGES[lookup];
  }
  if (cleaned.length >= 2 && cleaned.length <= 40 && !/\d/.test(cleaned)) {
    return cleaned;
  }
  return fallback;
}
function sanitizeGrammarTag(tag) {
  if (!tag) return "Word";
  let clean = tag.trim();
  const separators = [",", ";", "(", "/"];
  for (const sep of separators) {
    const idx = clean.indexOf(sep);
    if (idx !== -1) {
      clean = clean.substring(0, idx).trim();
    }
  }
  clean = clean.replace(/^[^a-zA-Z\p{L}]+|[^a-zA-Z\p{L}]+$/gu, "");
  const lower = clean.toLowerCase();
  const ruToEnMap = {
    "\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435": "Noun",
    "\u0441\u0443\u0449": "Noun",
    "\u0433\u043B\u0430\u0433\u043E\u043B": "Verb",
    "\u0433\u043B": "Verb",
    "\u043F\u0440\u0438\u043B\u0430\u0433\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435": "Adjective",
    "\u043F\u0440\u0438\u043B": "Adjective",
    "\u043D\u0430\u0440\u0435\u0447\u0438\u0435": "Adverb",
    "\u043D\u0430\u0440": "Adverb",
    "\u043C\u0435\u0436\u0434\u043E\u043C\u0435\u0442\u0438\u0435": "Interjection",
    "\u043C\u0435\u0436\u0434": "Interjection",
    "\u0441\u043E\u044E\u0437": "Conjunction",
    "\u043F\u0440\u0435\u0434\u043B\u043E\u0433": "Preposition",
    "\u043C\u0435\u0441\u0442\u043E\u0438\u043C\u0435\u043D\u0438\u0435": "Pronoun",
    "\u043C\u0435\u0441\u0442": "Pronoun",
    "\u0447\u0430\u0441\u0442\u0438\u0446\u0430": "Particle",
    "\u043F\u0440\u0438\u0447\u0430\u0441\u0442\u0438\u0435": "Participle",
    "\u0434\u0435\u0435\u043F\u0440\u0438\u0447\u0430\u0441\u0442\u0438\u0435": "Gerund",
    "\u0438\u0434\u0438\u043E\u043C\u0430": "Idiom",
    "\u0444\u0440\u0430\u0437\u043E\u0432\u044B\u0439 \u0433\u043B\u0430\u0433\u043E\u043B": "Phrasal Verb",
    "\u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435": "Phrase",
    "\u0443\u0441\u0442\u043E\u0439\u0447\u0438\u0432\u043E\u0435 \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435": "Set Expression",
    "\u0441\u043E\u043A\u0440\u0430\u0449\u0435\u043D\u0438\u0435": "Abbreviation"
  };
  if (ruToEnMap[lower]) {
    return ruToEnMap[lower];
  }
  if (/[а-яА-ЯёЁ]/.test(clean)) {
    if (clean.includes(" ") || clean.length > 15) {
      return "Phrase";
    }
    return "Word";
  }
  if (clean.length > 0) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean || "Word";
}
function getCacheDb() {
  if (!cacheDbConn) {
    cacheDbConn = new import_better_sqlite3.default(CACHE_DB_PATH);
    cacheDbConn.pragma("journal_mode = WAL");
    cacheDbConn.exec(`
      CREATE TABLE IF NOT EXISTS ai_explain_cache (
        cache_key TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        context TEXT,
        target_lang TEXT NOT NULL,
        translation_lang TEXT NOT NULL,
        custom_question TEXT,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_explain_cache_created ON ai_explain_cache(created_at);
    `);
  }
  return cacheDbConn;
}
function getCachedExplain(word, context, targetLang, translationLang, customQuestion) {
  try {
    const db = getCacheDb();
    const keySource = `${word.toLowerCase().trim()}|${(context || "").toLowerCase().trim()}|${targetLang.toLowerCase().trim()}|${translationLang.toLowerCase().trim()}|${(customQuestion || "").toLowerCase().trim()}`;
    const cacheKey = import_crypto.default.createHash("md5").update(keySource).digest("hex");
    const stmt = db.prepare("SELECT response_json FROM ai_explain_cache WHERE cache_key = ?");
    const row = stmt.get(cacheKey);
    if (row && row.response_json) {
      const parsed = JSON.parse(row.response_json);
      return { ...parsed, isCached: true };
    }
  } catch (err) {
    console.error("[AI Cache Read Error]:", err);
  }
  return null;
}
function setCachedExplain(word, context, targetLang, translationLang, customQuestion, responseObj) {
  try {
    if (!responseObj || responseObj.isDemo || responseObj.error) return;
    const db = getCacheDb();
    const keySource = `${word.toLowerCase().trim()}|${(context || "").toLowerCase().trim()}|${targetLang.toLowerCase().trim()}|${translationLang.toLowerCase().trim()}|${(customQuestion || "").toLowerCase().trim()}`;
    const cacheKey = import_crypto.default.createHash("md5").update(keySource).digest("hex");
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ai_explain_cache
      (cache_key, word, context, target_lang, translation_lang, custom_question, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      cacheKey,
      word.trim(),
      context || "",
      targetLang,
      translationLang,
      customQuestion || "",
      JSON.stringify(responseObj),
      Date.now()
    );
  } catch (err) {
    console.error("[AI Cache Write Error]:", err);
  }
}
function saveGlobalWordPropertiesCache() {
  try {
    const dir = import_path.default.dirname(GLOBAL_WORD_PROPERTIES_CACHE_PATH);
    if (!import_fs.default.existsSync(dir)) import_fs.default.mkdirSync(dir, { recursive: true });
    import_fs.default.writeFileSync(GLOBAL_WORD_PROPERTIES_CACHE_PATH, JSON.stringify(GLOBAL_WORD_PROPERTIES_CACHE, null, 2), "utf-8");
  } catch (e) {
    console.warn(`[GlobalWordPropertiesCache] Could not save cache: ${e.message}`);
  }
}
function normalizeLangCode(rawLang) {
  if (!rawLang) return "en";
  const l = rawLang.trim().toLowerCase();
  if (l.startsWith("kk") || l.startsWith("kaz") || l.includes("\u043A\u0430\u0437\u0430\u0445") || l.includes("\u049B\u0430\u0437\u0430\u049B")) return "kk";
  if (l.startsWith("en") || l.includes("english") || l.includes("\u0430\u043D\u0433\u043B\u0438")) return "en";
  if (l.startsWith("es") || l.includes("spanish") || l.includes("\u0438\u0441\u043F\u0430\u043D")) return "es";
  if (l.startsWith("de") || l.includes("german") || l.includes("\u043D\u0435\u043C\u0435\u0446")) return "de";
  if (l.startsWith("fr") || l.includes("french") || l.includes("\u0444\u0440\u0430\u043D\u0446")) return "fr";
  if (l.startsWith("ja") || l.includes("japan") || l.includes("\u044F\u043F\u043E\u043D")) return "ja";
  if (l.startsWith("zh") || l.includes("chinese") || l.includes("\u043A\u0438\u0442\u0430\u0439")) return "zh";
  if (l.startsWith("ru") || l.includes("russian") || l.includes("\u0440\u0443\u0441\u0441\u043A")) return "ru";
  if (l.startsWith("it") || l.includes("italian") || l.includes("\u0438\u0442\u0430\u043B\u044C")) return "it";
  if (l.startsWith("pt") || l.includes("portug") || l.includes("\u043F\u043E\u0440\u0442\u0443\u0433")) return "pt";
  if (l.startsWith("tr") || l.includes("turkish") || l.includes("\u0442\u0443\u0440\u0435\u0446")) return "tr";
  if (l.startsWith("hu") || l.includes("hungar") || l.includes("\u0432\u0435\u043D\u0433\u0435\u0440")) return "hu";
  return l.substring(0, 2);
}
function saveGlobalLemmasCache() {
  try {
    const dir = import_path.default.dirname(GLOBAL_LEMMAS_CACHE_PATH);
    if (!import_fs.default.existsSync(dir)) import_fs.default.mkdirSync(dir, { recursive: true });
    import_fs.default.writeFileSync(GLOBAL_LEMMAS_CACHE_PATH, JSON.stringify(GLOBAL_LEMMAS_CACHE, null, 2), "utf-8");
  } catch (e) {
    console.warn(`[GlobalLemmasCache] Could not save global lemmas cache: ${e.message}`);
  }
}
var import_express, import_genai2, import_express_rate_limit, import_crypto, import_path, import_fs, import_better_sqlite3, router, handleTestProfile, DATA_DIR, aiRateLimit, KNOWN_LANGUAGES, INJECTION_PATTERNS, CACHE_DB_PATH, cacheDbConn, handleDetectExpressions, GLOBAL_WORD_PROPERTIES_CACHE_PATH, GLOBAL_WORD_PROPERTIES_CACHE, GLOBAL_LEMMAS_CACHE_PATH, GLOBAL_LEMMAS_CACHE, ai_default;
var init_ai = __esm({
  "routes/ai.ts"() {
    import_express = require("express");
    import_genai2 = require("@google/genai");
    import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
    import_crypto = __toESM(require("crypto"), 1);
    import_path = __toESM(require("path"), 1);
    import_fs = __toESM(require("fs"), 1);
    import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
    init_geminiClient();
    router = (0, import_express.Router)();
    handleTestProfile = async (req, res) => {
      const profile = req.body?.profile || req.body;
      if (!profile || !profile.provider) {
        return res.status(400).json({ error: "Profile configuration is missing" });
      }
      const start = performance.now();
      try {
        const result = await callUniversalAiProvider(profile, "Hello, reply with 'OK' only.", {
          maxOutputTokens: 15,
          temperature: 0.1,
          timeoutMs: 15e3
        });
        const latencyMs = Math.round(performance.now() - start);
        return res.json({
          success: true,
          message: "Connection test succeeded",
          reply: typeof result === "string" ? result.trim() : JSON.stringify(result),
          latencyMs
        });
      } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        return res.status(err.status || 400).json({
          success: false,
          error: err.message || "Connection failed",
          status: err.status || 400,
          isQuotaExceeded: !!err.isQuotaExceeded,
          latencyMs
        });
      }
    };
    DATA_DIR = process.env.DATA_DIR || process.cwd();
    aiRateLimit = (0, import_express_rate_limit.default)({
      windowMs: 60 * 1e3,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u043A AI. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043C\u0438\u043D\u0443\u0442\u0443.",
        retryAfter: 60
      },
      keyGenerator: (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown"
    });
    router.post("/test-profile", aiRateLimit, handleTestProfile);
    router.post("/ai/test-profile", aiRateLimit, handleTestProfile);
    KNOWN_LANGUAGES = {
      // English labels
      "english": "English",
      "en": "English",
      "spanish": "Spanish",
      "espa\xF1ol": "Spanish",
      "es": "Spanish",
      "french": "French",
      "fran\xE7ais": "French",
      "fr": "French",
      "german": "German",
      "deutsch": "German",
      "de": "German",
      "italian": "Italian",
      "italiano": "Italian",
      "it": "Italian",
      "portuguese": "Portuguese",
      "portugu\xEAs": "Portuguese",
      "pt": "Portuguese",
      "russian": "Russian",
      "ru": "Russian",
      "japanese": "Japanese",
      "ja": "Japanese",
      "chinese": "Chinese",
      "zh": "Chinese",
      "arabic": "Arabic",
      "ar": "Arabic",
      "korean": "Korean",
      "ko": "Korean",
      "turkish": "Turkish",
      "t\xFCrk\xE7e": "Turkish",
      "tr": "Turkish",
      "ukrainian": "Ukrainian",
      "uk": "Ukrainian",
      "kazakh": "Kazakh",
      "kk": "Kazakh",
      "polish": "Polish",
      "pl": "Polish",
      "dutch": "Dutch",
      "nl": "Dutch",
      "swedish": "Swedish",
      "sv": "Swedish",
      "greek": "Greek",
      "el": "Greek",
      "hebrew": "Hebrew",
      "he": "Hebrew",
      "hindi": "Hindi",
      "hi": "Hindi",
      // Russian labels
      "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439": "English",
      "\u0438\u0441\u043F\u0430\u043D\u0441\u043A\u0438\u0439": "Spanish",
      "\u0444\u0440\u0430\u043D\u0446\u0443\u0437\u0441\u043A\u0438\u0439": "French",
      "\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u0439": "German",
      "\u0438\u0442\u0430\u043B\u044C\u044F\u043D\u0441\u043A\u0438\u0439": "Italian",
      "\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B\u044C\u0441\u043A\u0438\u0439": "Portuguese",
      "\u0440\u0443\u0441\u0441\u043A\u0438\u0439": "Russian",
      "\u044F\u043F\u043E\u043D\u0441\u043A\u0438\u0439": "Japanese",
      "\u043A\u0438\u0442\u0430\u0439\u0441\u043A\u0438\u0439": "Chinese",
      "\u0430\u0440\u0430\u0431\u0441\u043A\u0438\u0439": "Arabic",
      "\u043A\u043E\u0440\u0435\u0439\u0441\u043A\u0438\u0439": "Korean",
      "\u0442\u0443\u0440\u0435\u0446\u043A\u0438\u0439": "Turkish",
      "\u0443\u043A\u0440\u0430\u0438\u043D\u0441\u043A\u0438\u0439": "Ukrainian",
      "\u043A\u0430\u0437\u0430\u0445\u0441\u043A\u0438\u0439": "Kazakh",
      "\u043F\u043E\u043B\u044C\u0441\u043A\u0438\u0439": "Polish",
      "\u043D\u0438\u0434\u0435\u0440\u043B\u0430\u043D\u0434\u0441\u043A\u0438\u0439": "Dutch",
      "\u0448\u0432\u0435\u0434\u0441\u043A\u0438\u0439": "Swedish",
      "\u0433\u0440\u0435\u0447\u0435\u0441\u043A\u0438\u0439": "Greek",
      "\u0438\u0432\u0440\u0438\u0442": "Hebrew",
      "\u0445\u0438\u043D\u0434\u0438": "Hindi",
      // Native labels
      "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430": "Ukrainian",
      "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0438\u0439": "Ukrainian",
      "\u049B\u0430\u0437\u0430\u049B\u0448\u0430": "Kazakh",
      "\u049B\u0430\u0437\u0430\u049B \u0442\u0456\u043B\u0456": "Kazakh",
      "\u4E2D\u6587": "Chinese",
      "\u65E5\u672C\u8A9E": "Japanese",
      "\uD55C\uAD6D\uC5B4": "Korean",
      "\u0639\u0631\u0628\u064A": "Arabic",
      "\u0639\u0631\u0628\u064A\u0629": "Arabic"
    };
    INJECTION_PATTERNS = [
      /ignore\s+(previous|above|all)/i,
      /system\s+prompt/i,
      /\binstruction/i,
      /\bpretend\b/i,
      /\bforget\b/i,
      /\bact\s+as\b/i,
      /\brole\s*play/i,
      /\bjailbreak/i,
      /\bDAN\b/,
      /\bdo\s+anything\s+now\b/i
    ];
    CACHE_DB_PATH = import_path.default.join(DATA_DIR, "ai_cache.sqlite");
    cacheDbConn = null;
    router.post("/explain", aiRateLimit, async (req, res) => {
      const { word, context, customQuestion } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
      const cleanQuestion = typeof customQuestion === "string" ? customQuestion.substring(0, 500) : void 0;
      if (!word) {
        return res.status(400).json({ error: "Word is required" });
      }
      const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");
      const cachedData = getCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, cleanQuestion);
      if (cachedData) {
        return res.json(cachedData);
      }
      const profile = extractAiProfile(req);
      try {
        let prompt = "";
        let systemInstruction = "";
        if (cleanQuestion) {
          systemInstruction = `You are a helpful language learning assistant. Answer the user's specific linguistic question in ${translationLanguage || "Russian"}. Return strictly valid JSON.`;
          prompt = `The user highlighted the text: "${word}"
Surrounding context: "${context || word}"
Target language of the text: ${targetLanguage || "auto-detect"}
User's native/translation language: ${translationLanguage || "Russian"}

The user has a custom question/request about this highlighted text:
"${cleanQuestion}"

Please answer the user's question clearly and helpful in ${translationLanguage || "Russian"}.

Return your answer strictly in JSON format with these exact keys:
- "translation": A concise summary translation or direct answer (1-2 sentences) in ${translationLanguage || "Russian"}
- "contextRelation": The detailed explanation answering the user's question, including grammatical analysis, context details, or idiom break down in ${translationLanguage || "Russian"}
- "ipa": Pronunciation IPA representation of the highlighted text (optional, leave empty if not applicable)
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "examples": an array of up to 2 objects, each containing:
  - "text": a simple example sentence in the target language featuring the highlighted text or related concept
  - "translation": translation of the example sentence in ${translationLanguage || "Russian"}`;
        } else {
          systemInstruction = `You are a precise language dictionary and vocabulary explainer. You explain words/phrases strictly in the user's native/study translation language: ${translationLanguage || "Russian"}. Return strictly valid JSON.`;
          const isMonolingual = targetLanguage.toLowerCase().trim() === translationLanguage.toLowerCase().trim() || targetLanguage.toLowerCase().startsWith("en") && translationLanguage.toLowerCase().startsWith("en");
          if (isMonolingual) {
            prompt = `Explain the word "${cleanWord}" (which is inside the surrounding context: "${context || cleanWord}") in ${translationLanguage}.
Since both the text language and study/translation language are ${targetLanguage}, provide a clear, concise definition, meaning in this context, or primary synonyms in ${translationLanguage} for the "translation" field (do NOT merely repeat the word "${cleanWord}" unchanged, provide its clear meaning/definition in ${translationLanguage}).
Provide the exact IPA pronunciation of the word "${cleanWord}", its grammar/part of speech details, explanation on how it functions in this context in ${translationLanguage}, and 2 helpful example sentences in ${targetLanguage} featuring this word with their explanations/definitions in ${translationLanguage}.

Return your answer strictly in JSON format with these exact keys:
- "translation": the definition or meaning of the word in ${translationLanguage}
- "ipa": the phonetic IPA representation of the word (e.g., [ola])
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "contextRelation": detailed explanation written strictly in ${translationLanguage || "Russian"} explaining how the word functions/means in this specific sentence context
- "examples": an array of 2 objects, each containing:
  - "text": a simple example sentence in the target language featuring the word
  - "translation": explanation or meaning of the example sentence in ${translationLanguage}`;
          } else {
            prompt = `Translate and explain the word "${cleanWord}" (which is inside the surrounding context: "${context || cleanWord}") from ${targetLanguage || "auto-detect"} to ${translationLanguage || "Russian"}.
Provide the exact IPA pronunciation of the word "${cleanWord}", its grammar/part of speech details, detailed explanation on how it functions in this context written strictly in ${translationLanguage || "Russian"}, and 2 helpful example sentences in ${targetLanguage || "the target language"} featuring this word with translations in ${translationLanguage || "Russian"}.

CRITICAL: The "contextRelation" explanation MUST be written entirely in ${translationLanguage || "Russian"}, NEVER in ${targetLanguage || "English"}.

Return your answer strictly in JSON format with these exact keys:
- "translation": the translation of the word into ${translationLanguage || "Russian"}
- "ipa": the phonetic IPA representation of the word (e.g., [ola])
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "contextRelation": clear and detailed explanation written strictly in ${translationLanguage || "Russian"} of what this word means and how it works in the current sentence context
- "examples": an array of 2 objects, each containing:
  - "text": a simple example sentence in ${targetLanguage || "the target language"} featuring the word
  - "translation": translation of the example sentence in ${translationLanguage || "Russian"}`;
          }
        }
        const data = await callUniversalAiProvider(profile, prompt, {
          systemInstruction,
          formatJson: true,
          responseSchema: {
            type: import_genai2.Type.OBJECT,
            properties: {
              translation: { type: import_genai2.Type.STRING },
              ipa: { type: import_genai2.Type.STRING },
              grammar: { type: import_genai2.Type.STRING },
              contextRelation: { type: import_genai2.Type.STRING },
              examples: {
                type: import_genai2.Type.ARRAY,
                items: {
                  type: import_genai2.Type.OBJECT,
                  properties: {
                    text: { type: import_genai2.Type.STRING },
                    translation: { type: import_genai2.Type.STRING }
                  },
                  required: ["text", "translation"]
                }
              }
            },
            required: ["translation", "ipa", "grammar", "contextRelation", "examples"]
          }
        });
        if (data) {
          data.grammar = sanitizeGrammarTag(data.grammar);
          setCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, cleanQuestion, data);
        }
        return res.json(data);
      } catch (err) {
        console.error("AI word explanation error:", err);
        if (err.isQuotaExceeded || err.status === 429) {
          return res.status(429).json({ error: err.message, isQuotaExceeded: true });
        }
        return res.status(err.status || 500).json({ error: err.message || "Failed to analyze word" });
      }
    });
    router.post("/youtube-fallback-generate", aiRateLimit, async (req, res) => {
      const { title } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      if (!title || !targetLanguage) {
        return res.status(400).json({ error: "Title and targetLanguage are required" });
      }
      const profile = extractAiProfile(req);
      try {
        const prompt = `You are an expert language teacher.
Create a detailed, beautiful and comprehensive educational study text, narrative or transcript fully written in the target language: "${targetLanguage}", inspired by the YouTube video titled: "${title}".
Let the text expand on this topic naturally using standard, common vocabulary of ${targetLanguage} suitable for study.
Structure the text into 4 to 6 clean, engaging paragraphs with a double line break between them.
IMPORTANT: Output ONLY the raw paragraph text in ${targetLanguage}. Do not provide titles, introductory explanations, ending summaries, translation notes, bracketed remarks, or markdown headers. Provide only the article body paragraphs in ${targetLanguage}.`;
        const text = await callUniversalAiProvider(profile, prompt, {
          systemInstruction: "You are an expert language teacher. Provide only clean text for language learning.",
          temperature: 0.7
        });
        return res.json({ text: typeof text === "string" ? text.trim() : JSON.stringify(text) });
      } catch (err) {
        console.error("Fallback AI Lesson Generator failed:", err);
        if (err.isQuotaExceeded || err.status === 429) {
          return res.status(429).json({ error: err.message, isQuotaExceeded: true });
        }
        return res.status(err.status || 500).json({ error: err.message || "Failed to generate fallback study text" });
      }
    });
    router.post("/generate-story", aiRateLimit, async (req, res) => {
      const { words, level, genre } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
      if (!words || !Array.isArray(words) || words.length === 0 || !targetLanguage) {
        return res.status(400).json({ error: "words array and targetLanguage are required" });
      }
      const profile = extractAiProfile(req);
      try {
        const prompt = `You are a creative writer and language teacher.
Write a short story in ${targetLanguage} suitable for a language learner at difficulty level "${level || "A2-B1"}".
The genre of the story should be "${genre || "general"}".
The story MUST naturally include the following vocabulary words: ${words.join(", ")}.
Structure the story into 3 to 5 short paragraphs with a double line break \\n\\n between them.

Return your answer strictly in JSON format with these exact keys:
- "title": creative title of the story in ${targetLanguage}
- "text": the full story in ${targetLanguage} (paragraphs separated by double newlines \\n\\n)
- "translation": paragraph-by-paragraph translation of the story into ${translationLanguage || "Russian"} (paragraphs separated by double newlines \\n\\n)`;
        const data = await callUniversalAiProvider(profile, prompt, {
          systemInstruction: "You are a creative writer and language teacher. Return strictly valid JSON.",
          formatJson: true,
          responseSchema: {
            type: import_genai2.Type.OBJECT,
            properties: {
              title: { type: import_genai2.Type.STRING },
              text: { type: import_genai2.Type.STRING },
              translation: { type: import_genai2.Type.STRING }
            },
            required: ["title", "text", "translation"]
          }
        });
        return res.json(data);
      } catch (err) {
        console.error("AI Story Generator failed:", err);
        if (err.isQuotaExceeded || err.status === 429) {
          return res.status(429).json({ error: err.message, isQuotaExceeded: true });
        }
        return res.status(err.status || 500).json({ error: err.message || "Failed to generate story" });
      }
    });
    handleDetectExpressions = async (req, res) => {
      const { text, aiProvider, localAiUrl, localAiModel } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
      if (!text || !targetLanguage) {
        return res.status(400).json({ error: "Text and targetLanguage are required" });
      }
      const systemPrompt = `You are an expert language teacher and lexicographer for "${targetLanguage}".
Analyze the following text written in "${targetLanguage}".
Identify ALL phrasal verbs, idioms, slang, set expressions, sayings, and proverbs present in the text.

CRITICAL RULE:
- DO NOT include single regular words (such as "quit", "run", "make", "take", "go"). Single words are standard vocabulary items, NOT idioms or phrasal verbs.
- ONLY include genuine multi-word phrasal verbs (e.g., "give up", "figure out"), idioms, slang expressions, and true set expressions.

For each item found:
1. "phrase": the exact phrase as it appears in the text or normalized (all lowercase).
2. "parent": the canonical dictionary base lemma form of the expression (e.g. "kicked the bucket" -> "kick the bucket").
3. "translation_in_context": contextual translation of the meaning in "${translationLanguage || "Russian"}".
4. "literal_translation": word-for-word literal translation to explain internal logic (in "${translationLanguage || "Russian"}").
5. "explanation": helpful usage note in "${translationLanguage || "Russian"}".
6. "type": classification ('phrasal_verb', 'idiom', 'slang', 'saying', or 'set_expression').
7. "register": register style ('Formal', 'Informal', 'Slang', 'Taboo', 'Archaic').
8. "tags": list of tags, e.g. ["Idiom", "Informal"].

Return JSON object:
{
  "detectedPhrasesList": [
    {
      "phrase": "kicked the bucket",
      "parent": "kick the bucket",
      "translation_in_context": "\u0443\u043C\u0435\u0440 / \u0441\u043A\u043B\u0435\u0438\u043B \u043B\u0430\u0441\u0442\u044B",
      "literal_translation": "\u043F\u043D\u0443\u043B \u0432\u0435\u0434\u0440\u043E",
      "explanation": "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043D\u044B\u0439 \u044D\u0432\u0444\u0435\u043C\u0438\u0437\u043C \u0434\u043B\u044F \u0441\u043C\u0435\u0440\u0442\u0438",
      "type": "idiom",
      "register": "Informal",
      "tags": ["Idiom", "Informal"]
    }
  ]
}`;
      const profile = extractAiProfile(req);
      try {
        const combinedPrompt = `${systemPrompt}

Here is the text to analyze:
---
${text.substring(0, 15e3)}
---`;
        const data = await callUniversalAiProvider(profile, combinedPrompt, {
          systemInstruction: "You are an expert linguistics analyzer specializing in idioms, phrasal verbs, and multi-word expressions. Return strictly valid JSON.",
          formatJson: true
        });
        const phrasesList = Array.isArray(data) ? data : data.detectedPhrasesList || data.detectedPhrases || data.phrases || data.items || data.expressions || [];
        const formattedPhrases = {};
        const itemsList = [];
        for (const item of phrasesList) {
          if (item && (item.phrase || item.parent)) {
            const key = (item.phrase || item.parent).toLowerCase();
            const obj = {
              phrase: item.phrase || key,
              parent: item.parent || key,
              translation_in_context: item.translation_in_context || item.translation || "",
              literal_translation: item.literal_translation || "",
              explanation: item.explanation || "",
              type: item.type || "idiom",
              register: item.register || "Informal",
              tags: item.tags || [item.type || "Idiom", item.register || "Informal"].filter(Boolean)
            };
            formattedPhrases[key] = obj;
            itemsList.push(obj);
          }
        }
        return res.json({ detectedPhrases: formattedPhrases, items: itemsList });
      } catch (err) {
        console.error("AI Expression Detector Error:", err.message || err);
        if (err.isQuotaExceeded || err.status === 429) {
          return res.status(429).json({ error: err.message, isQuotaExceeded: true });
        }
        return res.status(err.status || 500).json({ error: `AI Error: ${err.message || "Failed to reach AI"}` });
      }
    };
    router.post("/detect-expressions", aiRateLimit, handleDetectExpressions);
    router.post("/detect-idioms", aiRateLimit, handleDetectExpressions);
    GLOBAL_WORD_PROPERTIES_CACHE_PATH = import_path.default.join(process.cwd(), "data", "global_word_properties_cache.json");
    GLOBAL_WORD_PROPERTIES_CACHE = {};
    try {
      if (import_fs.default.existsSync(GLOBAL_WORD_PROPERTIES_CACHE_PATH)) {
        const rawData = import_fs.default.readFileSync(GLOBAL_WORD_PROPERTIES_CACHE_PATH, "utf-8");
        const loaded = JSON.parse(rawData);
        for (const lang of Object.keys(loaded)) {
          GLOBAL_WORD_PROPERTIES_CACHE[lang] = {};
          for (const [wordKey, val] of Object.entries(loaded[lang] || {})) {
            if (val && typeof val === "object" && val.pos !== "Noun" || val.cefr !== "A1" || val.frequency !== "Top 3000") {
              GLOBAL_WORD_PROPERTIES_CACHE[lang][wordKey] = val;
            }
          }
        }
        console.log(`[GlobalWordPropertiesCache] Loaded and cleaned cache from ${GLOBAL_WORD_PROPERTIES_CACHE_PATH}`);
      }
    } catch (e) {
      console.warn(`[GlobalWordPropertiesCache] Could not load cache: ${e.message}`);
    }
    router.post("/analyze-word-properties", aiRateLimit, async (req, res) => {
      const { text, words, aiProvider, localAiUrl, localAiModel } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      const langCode = normalizeLangCode(targetLanguage);
      let tokenList = [];
      if (Array.isArray(words) && words.length > 0) {
        const seen = /* @__PURE__ */ new Set();
        tokenList = words.map((w) => String(w).trim()).filter((w) => {
          const low = w.toLowerCase();
          if (!w || seen.has(low)) return false;
          seen.add(low);
          return true;
        });
      } else if (text) {
        const cleanText = text.replace(/(?:[bcdjlmnst]|qu)['’]/gi, " ");
        const rawTokens = cleanText.match(/[\p{L}\p{M}]+/gu) || [];
        const seen = /* @__PURE__ */ new Set();
        tokenList = rawTokens.map((t) => t.trim()).filter((t) => {
          const low = t.toLowerCase();
          if (t.length <= 1 || seen.has(low)) return false;
          seen.add(low);
          return true;
        });
      }
      if (tokenList.length === 0) {
        return res.json({ wordProperties: [] });
      }
      const pageTokens = tokenList.slice(0, 300);
      if (!GLOBAL_WORD_PROPERTIES_CACHE[langCode]) {
        GLOBAL_WORD_PROPERTIES_CACHE[langCode] = {};
      }
      const langCache = GLOBAL_WORD_PROPERTIES_CACHE[langCode];
      const CORE_POS_MAP = {
        // English
        "do": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/du\u02D0/", ipa_uk: "/du\u02D0/" },
        "does": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/d\u028Cz/", ipa_uk: "/d\u028Cz/" },
        "did": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/d\u026Ad/", ipa_uk: "/d\u026Ad/" },
        "done": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/d\u028Cn/", ipa_uk: "/d\u028Cn/" },
        "doing": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u02C8du\u02D0.\u026A\u014B/", ipa_uk: "/\u02C8du\u02D0.\u026A\u014B/" },
        "be": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/bi\u02D0/", ipa_uk: "/bi\u02D0/" },
        "is": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u026Az/", ipa_uk: "/\u026Az/" },
        "are": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u0251\u02D0r/", ipa_uk: "/\u0251\u02D0/" },
        "was": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/w\u028Cz/", ipa_uk: "/w\u0252z/" },
        "were": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/w\u025C\u02D0r/", ipa_uk: "/w\u025C\u02D0/" },
        "have": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/h\xE6v/", ipa_uk: "/h\xE6v/" },
        "has": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/h\xE6z/", ipa_uk: "/h\xE6z/" },
        "had": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/h\xE6d/", ipa_uk: "/h\xE6d/" },
        "in": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u026An/", ipa_uk: "/\u026An/" },
        "on": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u0251\u02D0n/", ipa_uk: "/\u0252n/" },
        "at": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/\xE6t/", ipa_uk: "/\xE6t/" },
        "the": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/\xF0\u0259/", ipa_uk: "/\xF0\u0259/" },
        "a": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u0259/", ipa_uk: "/\u0259/" },
        "an": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u0259n/", ipa_uk: "/\u0259n/" },
        "this": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/\xF0\u026As/", ipa_uk: "/\xF0\u026As/" },
        "that": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/\xF0\xE6t/", ipa_uk: "/\xF0\xE6t/" },
        "to": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/tu\u02D0/", ipa_uk: "/tu\u02D0/" },
        "for": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/f\u0254\u02D0r/", ipa_uk: "/f\u0254\u02D0/" },
        "of": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u0259v/", ipa_uk: "/\u0259v/" },
        "and": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/\xE6nd/", ipa_uk: "/\xE6nd/" },
        "but": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/b\u028Ct/", ipa_uk: "/b\u028Ct/" },
        // Spanish Core Stop Words & Known Forms
        "un": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/un/" },
        "una": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u02C8una/" },
        "el": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/el/" },
        "\xE9l": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/el/" },
        "la": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/la/" },
        "los": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/los/" },
        "las": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/las/" },
        "de": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/de/" },
        "del": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/del/" },
        "por": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/por/" },
        "con": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/kon/" },
        "que": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/ke/" },
        "pero": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u02C8pero/" },
        "en": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/en/" },
        "y": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/i/" },
        "o": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/o/" },
        "al": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/al/" },
        "no": { pos: "Adverb", cefr: "A1", frequency: "Top 1000", ipa_us: "/no/" },
        "si": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/si/" },
        "mi": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/mi/" },
        "tu": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/tu/" },
        "sus": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/sus/" },
        "su": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/su/" },
        "todas": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u02C8todas/" },
        "todos": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u02C8todos/" },
        "yo": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/\u025Fo/" },
        "se": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/se/" },
        // Kazakh Core Words & Agglutinative Examples
        "\u043C\u0435\u043D": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0441\u0435\u043D": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u043E\u043B": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0431\u0456\u0437": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0431\u04B1\u043B": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u043C\u0430\u0493\u0430\u043D": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0441\u0430\u0493\u0430\u043D": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u043E\u0493\u0430\u043D": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0431\u0456\u0437\u0433\u0435": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0441\u0456\u0437\u0433\u0435": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0441\u0456\u0437\u0434\u0435\u0440\u0433\u0435": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
        "\u0436\u04D9\u043D\u0435": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000" },
        "\u0431\u0456\u0440\u0430\u049B": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000" },
        "\u04AF\u0448\u0456\u043D": { pos: "Preposition", cefr: "A1", frequency: "Top 1000" },
        "\u04E9\u0442\u0435": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
        "\u04D9\u0434\u0435\u0442\u0442\u0435": { pos: "Adverb", cefr: "A2", frequency: "Top 3000" },
        "\u043A\u04AF\u043D\u0434\u0435": { pos: "Adverb", cefr: "A2", frequency: "Top 3000" },
        "\u0431\u04AF\u0433\u0456\u043D": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
        "\u0435\u0440\u0442\u0435": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
        "\u0442\u0430\u04A3\u0435\u0440\u0442\u0435\u04A3": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
        "\u0434\u043E\u0441\u044B\u043C\u0434\u044B": { pos: "Noun", cefr: "A1", frequency: "Top 1000" },
        "\u043A\u0435\u0437\u0434\u0435\u0441\u0442\u0456\u0440\u0434\u0456\u043C": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
        "\u0448\u0435\u0448\u0442\u0456\u043C": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
        "\u0431\u043E\u043B\u044B\u043F": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
        "\u0442\u04B1\u0440": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
        "\u043E\u0442\u044B\u0440\u044B\u043F": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
        "\u0436\u0430\u0441\u0430\u0493\u0430\u043D": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
        "\u0431\u0435\u0440\u0435\u0442\u0456\u043D": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
        "\u0431\u0430\u0439\u044B\u0442\u0430\u0442\u044B\u043D": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
        "\u0441\u0430\u044F\u0445\u0430\u0442\u0442\u0430\u0443": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
        "\u0442\u0430\u04A3\u0493\u0430\u0436\u0430\u0439\u044B\u043F": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
        "\u0493\u0430\u0436\u0430\u0439\u044B\u043F": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
        "\u043A\u0435\u0440\u0435\u043C\u0435\u0442": { pos: "Adjective", cefr: "A1", frequency: "Top 1000" },
        "\u043A\u04E9\u0440\u043A\u0435\u043C": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
        "\u043C\u04E9\u043B\u0434\u0456\u0440": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
        "\u0442\u0430\u0437\u0430": { pos: "Adjective", cefr: "A1", frequency: "Top 1000" },
        "\u0430\u043F\u043F\u0430\u049B": { pos: "Adjective", cefr: "A1", frequency: "Top 1000" },
        "\u049B\u0430\u043B\u044B\u04A3": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
        "\u0440\u0443\u0445\u0430\u043D\u0438": { pos: "Adjective", cefr: "B1", frequency: "Top 5000" },
        "\u0456\u0448\u043A\u0456": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
        "\u04E9\u0440\u043A\u0435\u043D\u0438\u0435\u0442": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
        "\u04E9\u0440\u043A\u0435\u043D\u0438\u0435\u0442\u0442\u0456\u04A3": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
        "\u049B\u04B1\u0434\u0456\u0440\u0435\u0442": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
        "\u049B\u04B1\u0434\u0456\u0440\u0435\u0442\u0456\u043D\u0435": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
        "\u0448\u0430\u0431\u044B\u0442": { pos: "Noun", cefr: "B1", frequency: "Top 5000" }
      };
      const inferGrammaticalPos = (w) => {
        const low = w.toLowerCase().trim();
        if (CORE_POS_MAP[low]) return CORE_POS_MAP[low].pos;
        if (/(?:маған|саған|оған|бізге|сізге|сіздерге)$/i.test(low)) return "Pronoun";
        if (/(?:aba|aban|ías|ían|aría|arían|aron|erlas|arlo|arse|ió|astis|este|imos|isteis|мын|мін|сың|сің|ды|ді|ады|еді|бару|ішу|тұру|дім|тім|дым|тым|п|ып|іп|ған|ген|қан|кен|атын|етін|йтын|йтін|тау|теу|дау|деу|лау|леу|ру)$/i.test(low)) return "Verb";
        if (/(?:oso|osa|osas|osos|iente|iento|ienta|able|ables|ible|ibles|al|ales|ante|antes|ша|ше|ық|ік|ні|ни|көм|дір|дар|дер|пақ|ппек|жайып|емет)$/i.test(low)) return "Adjective";
        return "Noun";
      };
      const resultsMap = {};
      const uncachedTokens = [];
      for (const tok of pageTokens) {
        const lower = tok.toLowerCase().trim();
        if (langCache[lower] && langCache[lower].pos !== "Noun") {
          resultsMap[lower] = { ...langCache[lower], word: tok };
        } else if (CORE_POS_MAP[lower]) {
          const core = CORE_POS_MAP[lower];
          const item = {
            word: tok,
            pos: core.pos,
            cefr: core.cefr,
            frequency: core.frequency,
            ipa_us: core.ipa_us || "",
            ipa_uk: core.ipa_uk || "",
            tags: [core.cefr, core.pos, core.frequency].filter(Boolean)
          };
          langCache[lower] = item;
          resultsMap[lower] = item;
        } else {
          uncachedTokens.push(tok);
        }
      }
      if (uncachedTokens.length > 0) {
        const profile = extractAiProfile(req);
        const systemPrompt = `You are a master lexicographer specializing in morphology and CEFR grading for target language "${targetLanguage}".
Analyze each word extracted from a "${targetLanguage}" text.

CRITICAL KAZAKH MORPHOLOGY & POS RULES FOR "${targetLanguage}":
1. PRONOUNS IN DATIVE CASE:
   - Words like "\u043C\u0430\u0493\u0430\u043D", "\u0441\u0430\u0493\u0430\u043D", "\u043E\u0493\u0430\u043D", "\u0431\u0456\u0437\u0433\u0435", "\u0441\u0456\u0437\u0433\u0435", "\u0441\u0456\u0437\u0434\u0435\u0440\u0433\u0435" MUST be classified as PRONOUN, NOT Verb or Noun.

2. COMPOUND & QUALITY ADJECTIVES:
   - Quality & wonder words ("\u0442\u0430\u04A3\u0493\u0430\u0436\u0430\u0439\u044B\u043F", "\u0493\u0430\u0436\u0430\u0439\u044B\u043F", "\u043A\u0435\u0440\u0435\u043C\u0435\u0442", "\u043A\u04E9\u0440\u043A\u0435\u043C", "\u043C\u04E9\u043B\u0434\u0456\u0440", "\u0442\u0430\u0437\u0430", "\u0430\u043F\u043F\u0430\u049B", "\u049B\u0430\u043B\u044B\u04A3", "\u0440\u0443\u0445\u0430\u043D\u0438", "\u0456\u0448\u043A\u0456") MUST be classified as ADJECTIVE, NOT Verb or Noun.

3. CASE-SUFFIX STRIPPING FOR CEFR & LEMMA:
   - ALWAYS strip possessive/genitive/dative suffixes (-\u0442\u0456\u04A3/-\u043D\u0456\u04A3/-\u0442\u044B\u04A3/-\u043D\u0456\u04A3, -\u0442\u0456\u043D\u0435/-\u043D\u0435/-\u0493\u0430/-\u0433\u0435) FIRST to find the core base lemma before assigning CEFR level.

4. VERBS & PARTICIPLES:
   - Words ending in verbal, participle, or infinitive suffixes (-\u0493\u0430\u043D/-\u0433\u0435\u043D, -\u049B\u0430\u043D/-\u043A\u0435\u043D, -\u0430\u0442\u044B\u043D/-\u0435\u0442\u0456\u043D, -\u0439\u0442\u044B\u043D/-\u0439\u0442\u0456\u043D, -\u0443, -\u0442\u0430\u0443/-\u0442\u0435\u0443/-\u0434\u0430\u0443/-\u0434\u0435\u0443) MUST be classified as VERB (unless they are dative pronouns like "\u043C\u0430\u0493\u0430\u043D", "\u0441\u0430\u0493\u0430\u043D", "\u043E\u0493\u0430\u043D").

FIELDS TO RETURN FOR EACH WORD:
1. "word": exact input word form.
2. "lemma": base dictionary lemma (e.g. "\u04E9\u0440\u043A\u0435\u043D\u0438\u0435\u0442", "\u0434\u043E\u0441", "\u0436\u0430\u0441\u0430\u0443", "\u043A\u04E9\u0440\u043A\u0435\u043C").
3. "pos": Part of Speech ('Verb', 'Noun', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Determiner', 'Interjection').
4. "cefr": CEFR level evaluated at the BASE LEMMA level ('A1', 'A2', 'B1', 'B2', 'C1', 'C2').
5. "frequency": Frequency Tier evaluated at the BASE LEMMA level ('Top 1000', 'Top 3000', 'Top 5000', 'Rare').
6. "ipa_us": Phonetic IPA transcription string.

Return JSON object with key "wordProperties":
{
  "wordProperties": [
    {
      "word": "\u043C\u0430\u0493\u0430\u043D",
      "lemma": "\u043C\u0435\u043D",
      "pos": "Pronoun",
      "cefr": "A1",
      "frequency": "Top 1000",
      "ipa_us": "/ma\u0263an/"
    }
  ]
}`;
        const BATCH_SIZE = 50;
        let hasNewCacheItems = false;
        for (let i = 0; i < uncachedTokens.length; i += BATCH_SIZE) {
          const chunk = uncachedTokens.slice(i, i + BATCH_SIZE);
          try {
            const combinedPrompt = `${systemPrompt}

Words to analyze:
${JSON.stringify(chunk)}`;
            const data = await callUniversalAiProvider(profile, combinedPrompt, {
              systemInstruction: "You are a master lexicographer. Return strictly valid JSON.",
              formatJson: true
            });
            let rawList = [];
            if (Array.isArray(data)) {
              rawList = data;
            } else if (data.wordProperties || data.items || data.words || data.properties || data.word_properties || data.results || data.data) {
              rawList = data.wordProperties || data.items || data.words || data.properties || data.word_properties || data.results || data.data;
            } else if (typeof data === "object" && data !== null) {
              rawList = Object.entries(data).map(([key, val]) => {
                if (typeof val === "object" && val !== null) {
                  return { word: val.word || key, ...val };
                }
                return { word: key, pos: String(val) };
              });
            }
            rawList.forEach((item) => {
              const rawWord = item.word || item.token || item.lemma || "";
              const lower = rawWord.toLowerCase().trim();
              if (!lower) return;
              const pos = item.pos || item.partOfSpeech || item.part_of_speech || item.type || inferGrammaticalPos(rawWord);
              const cefr = item.cefr || item.level || item.cefr_level || item.cefrLevel || "A1";
              const frequency = item.frequency || item.frequency_tier || item.freq || item.frequencyTier || "Top 1000";
              const propObj = {
                word: rawWord,
                pos,
                cefr,
                frequency,
                ipa_us: item.ipa_us || item.ipa || "",
                ipa_uk: item.ipa_uk || item.ipa || "",
                tags: item.tags || [cefr, pos, frequency].filter(Boolean)
              };
              langCache[lower] = propObj;
              resultsMap[lower] = propObj;
              hasNewCacheItems = true;
            });
          } catch (err) {
            console.error("Batch AI Word Property error:", err);
          }
        }
        if (hasNewCacheItems) {
          saveGlobalWordPropertiesCache();
        }
        for (const tok of uncachedTokens) {
          const lower = tok.toLowerCase().trim();
          if (!resultsMap[lower]) {
            const pos = inferGrammaticalPos(tok);
            resultsMap[lower] = {
              word: tok,
              pos,
              cefr: "A1",
              frequency: "Top 1000",
              ipa_us: "",
              ipa_uk: "",
              tags: ["A1", pos, "Top 1000"]
            };
          }
        }
      }
      const finalPropertiesList = pageTokens.map((tok) => {
        const lower = tok.toLowerCase().trim();
        return resultsMap[lower] || {
          word: tok,
          pos: inferGrammaticalPos(tok),
          cefr: "A1",
          frequency: "Top 1000",
          ipa_us: "",
          ipa_uk: "",
          tags: ["A1", "Top 1000"]
        };
      });
      return res.json({ wordProperties: finalPropertiesList });
    });
    router.post("/analyze-word-family", aiRateLimit, async (req, res) => {
      const { word, sentence, aiProvider, localAiUrl, localAiModel } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
      if (!word) {
        return res.status(400).json({ error: "Word is required" });
      }
      const systemPrompt = `You are an expert etymologist and lexicographer for "${targetLanguage}".
Given the target word "${word}" used in the context sentence: "${sentence || word}", analyze its specific contextual meaning.
CRITICAL POLYSEMY RULE: Return ONLY true morphological cognates and word family members (nouns, verbs, adjectives, adverbs) derived from that EXACT contextual root meaning in "${targetLanguage}".
Strictly IGNORE homonyms that have a different etymology or meaning.
For example:
- If target word is "lead" in sentence "He will lead the team" (meaning to guide): return "leader", "leadership", "leading". DO NOT return "leaded" or "unleaded" (which come from the metal lead).
- If target word is "lead" in sentence "The pipe is made of lead" (meaning the metal): return "leaded", "unleaded". DO NOT return "leader" or "leadership".

For each family member:
1. "word": the cognate word form.
2. "pos": Part of Speech ('Noun', 'Verb', 'Adjective', 'Adverb').
3. "translation": concise translation into "${translationLanguage || "Russian"}".

Return JSON object:
{
  "word": "${word}",
  "contextMeaning": "brief explanation of the contextual meaning",
  "family": [
    { "word": "leader", "pos": "Noun", "translation": "\u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C / \u043B\u0438\u0434\u0435\u0440" },
    { "word": "leadership", "pos": "Noun", "translation": "\u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E / \u043B\u0438\u0434\u0435\u0440\u0441\u0442\u0432\u043E" },
    { "word": "leading", "pos": "Adjective", "translation": "\u0432\u0435\u0434\u0443\u0449\u0438\u0439" }
  ]
}`;
      const profile = extractAiProfile(req);
      try {
        const combinedPrompt = `${systemPrompt}

Target Word: "${word}"
Sentence: "${sentence || word}"`;
        const data = await callUniversalAiProvider(profile, combinedPrompt, {
          systemInstruction: "You are an expert morphological analyzer. Return strictly valid JSON.",
          formatJson: true
        });
        return res.json({
          word,
          contextMeaning: data?.contextMeaning || "",
          family: data?.family || []
        });
      } catch (err) {
        console.error("AI Word Family Generator failed:", err);
        if (err.isQuotaExceeded || err.status === 429) {
          return res.status(429).json({ error: err.message, isQuotaExceeded: true });
        }
        return res.status(err.status || 500).json({ error: err.message || "Failed to generate word family" });
      }
    });
    GLOBAL_LEMMAS_CACHE_PATH = import_path.default.join(process.cwd(), "data", "global_lemmas_cache.json");
    GLOBAL_LEMMAS_CACHE = {};
    try {
      if (import_fs.default.existsSync(GLOBAL_LEMMAS_CACHE_PATH)) {
        const rawData = import_fs.default.readFileSync(GLOBAL_LEMMAS_CACHE_PATH, "utf-8");
        GLOBAL_LEMMAS_CACHE = JSON.parse(rawData);
        console.log(`[GlobalLemmasCache] Loaded global AI lemmas cache from ${GLOBAL_LEMMAS_CACHE_PATH}`);
      }
    } catch (e) {
      console.warn(`[GlobalLemmasCache] Could not load global lemmas cache: ${e.message}`);
    }
    router.post("/lemmatize-text", aiRateLimit, async (req, res) => {
      const { text, words, aiProvider, localAiUrl, localAiModel } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "Kazakh");
      const langCode = normalizeLangCode(targetLanguage);
      if (!text && (!words || !Array.isArray(words) || words.length === 0)) {
        return res.status(400).json({ error: "Text or words array is required" });
      }
      let tokenList = [];
      if (Array.isArray(words) && words.length > 0) {
        tokenList = Array.from(new Set(words.map((w) => String(w).trim()).filter(Boolean)));
      } else if (text) {
        const rawTokens = text.match(/[\p{L}\p{M}'’]+/gu) || [];
        tokenList = Array.from(new Set(rawTokens.map((t) => t.trim()).filter((t) => t.length > 1)));
      }
      if (tokenList.length === 0) {
        return res.json({ lemmas: {} });
      }
      GLOBAL_LEMMAS_CACHE[langCode] = GLOBAL_LEMMAS_CACHE[langCode] || {};
      const cachedLemmas = {};
      const missingTokens = [];
      for (const tok of tokenList) {
        const lowerTok = tok.toLowerCase();
        const cachedVal = GLOBAL_LEMMAS_CACHE[langCode][tok] || GLOBAL_LEMMAS_CACHE[langCode][lowerTok];
        if (cachedVal && cachedVal.toLowerCase() !== lowerTok) {
          cachedLemmas[tok] = cachedVal;
        } else {
          missingTokens.push(tok);
        }
      }
      if (missingTokens.length === 0) {
        console.log(`[POST /api/lemmatize-text] 100% fulfilled from Global Cache [${langCode}]! (${Object.keys(cachedLemmas).length} words, 0 AI calls)`);
        return res.json({ lemmas: cachedLemmas, cachedCount: Object.keys(cachedLemmas).length, aiCount: 0 });
      }
      const batchTokens = missingTokens.slice(0, 150);
      const systemPrompt = `You are an expert lexicographer and lemmatizer for target language: "${targetLanguage}".
Given a list of inflected words or tokens from a text, provide the exact canonical dictionary base lemma for each word in "${targetLanguage}".

STRICT LEMMATIZATION RULES:
- FOR ALL VERBS: You MUST return the standard dictionary INFINITIVE form of the verb.
  Examples for Russian verbs:
    "\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u043E" -> "\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", "\u0440\u0430\u0431\u043E\u0442\u0430\u043B" -> "\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", "\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u043C" -> "\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", "\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0438" -> "\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", "\u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442" -> "\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", "\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0430" -> "\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C"
    "\u0433\u043E\u0432\u043E\u0440\u0438\u043B" -> "\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C", "\u0431\u044B\u043B\u0438" -> "\u0431\u044B\u0442\u044C", "\u0441\u043A\u0430\u0437\u0430\u043B" -> "\u0441\u043A\u0430\u0437\u0430\u0442\u044C", "\u043F\u043E\u0448\u0435\u043B" -> "\u043F\u043E\u0439\u0442\u0438"
  Examples for Kazakh verbs:
    "\u04D9\u043A\u0435\u043B\u0434\u0456" -> "\u04D9\u043A\u0435\u043B\u0443", "\u0436\u0430\u0442\u044B\u0440" -> "\u0436\u0430\u0442\u0443", "\u0431\u0430\u0440\u0430\u043C\u044B\u0437" -> "\u0431\u0430\u0440\u0443"
  Examples for English verbs:
    "running" -> "run", "went" -> "go", "worked" -> "work"
  Examples for Spanish verbs:
    "hablando" -> "hablar", "fue" -> "ir", "casaron" -> "casar"

- FOR NOUNS & ADJECTIVES: You MUST return the standard singular nominative (initial dictionary) form.
  Examples for Russian: "\u043A\u0440\u0430\u0441\u0438\u0432\u044B\u043C\u0438" -> "\u043A\u0440\u0430\u0441\u0438\u0432\u044B\u0439", "\u0434\u043E\u043C\u0430\u043C\u0438" -> "\u0434\u043E\u043C", "\u0434\u0435\u0440\u0435\u0432\u044C\u044F\u0445" -> "\u0434\u0435\u0440\u0435\u0432\u043E"
  Examples for Kazakh: "\u049A\u0430\u0437\u0430\u049B\u0441\u0442\u0430\u043D\u0434\u0430" -> "\u049A\u0430\u0437\u0430\u049B\u0441\u0442\u0430\u043D", "\u0431\u0430\u043B\u0430\u043C\u044B\u0437" -> "\u0431\u0430\u043B\u0430", "\u04AF\u0439\u043B\u0435\u0440" -> "\u04AF\u0439"

- FOR PRONOUNS & IRREGULARS: You MUST return the nominative base root.
  Examples for Russian: "\u043C\u0435\u043D\u044F" -> "\u044F", "\u043C\u043D\u0435" -> "\u044F", "\u0435\u0433\u043E" -> "\u043E\u043D"
  Examples for Kazakh: "\u043C\u0435\u043D\u0456\u04A3" -> "\u043C\u0435\u043D", "\u043E\u043D\u044B\u04A3" -> "\u043E\u043B"

- If a word is already in base form or is a proper name, keep it as is.
Return a JSON object with a "lemmas" property containing a dictionary mapping each input word to its canonical dictionary base lemma.`;
      let newLemmas = {};
      const profile = extractAiProfile(req);
      try {
        const combinedPrompt = `${systemPrompt}

Words to lemmatize:
${JSON.stringify(batchTokens)}`;
        const data = await callUniversalAiProvider(profile, combinedPrompt, {
          systemInstruction: "You are an expert lexicographer and lemmatizer. Return strictly valid JSON with a 'lemmas' dictionary mapping each word to its dictionary base lemma.",
          formatJson: true
        });
        newLemmas = data?.lemmas || (typeof data === "object" && !Array.isArray(data) ? data : {}) || {};
      } catch (err) {
        console.error("AI Lemmatizer failed:", err);
      }
      if (Object.keys(newLemmas).length > 0) {
        Object.entries(newLemmas).forEach(([tok, lem]) => {
          if (tok && lem && tok.toLowerCase() !== lem.toLowerCase()) {
            GLOBAL_LEMMAS_CACHE[langCode][tok] = lem;
            GLOBAL_LEMMAS_CACHE[langCode][tok.toLowerCase()] = lem;
          }
        });
        saveGlobalLemmasCache();
      }
      const combinedLemmas = { ...cachedLemmas, ...newLemmas };
      return res.json({
        lemmas: combinedLemmas,
        cachedCount: Object.keys(cachedLemmas).length,
        aiCount: Object.keys(newLemmas).length
      });
    });
    ai_default = router;
  }
});

// routes/ytdlpWrapper.ts
function getYtDlp() {
  if (cachedYtDlp) return cachedYtDlp;
  const systemPaths = [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "/bin/yt-dlp",
    "C:\\Program Files\\yt-dlp\\yt-dlp.exe"
  ];
  for (const p of systemPaths) {
    if (import_fs3.default.existsSync(p)) {
      try {
        cachedYtDlp = (0, import_yt_dlp_exec.create)(p);
        console.log(`[yt-dlp] Using system yt-dlp binary at: ${p}`);
        return cachedYtDlp;
      } catch (_) {
      }
    }
  }
  cachedYtDlp = import_yt_dlp_exec.default;
  return cachedYtDlp;
}
var import_fs3, import_yt_dlp_exec, cachedYtDlp;
var init_ytdlpWrapper = __esm({
  "routes/ytdlpWrapper.ts"() {
    import_fs3 = __toESM(require("fs"), 1);
    import_yt_dlp_exec = __toESM(require("yt-dlp-exec"), 1);
    cachedYtDlp = null;
  }
});

// src/utils/subtitleSanitizer.ts
function sanitizeSubtitleText(text) {
  if (!text) return "";
  let cleaned = text.replace(HTML_TAG_REGEX, "").replace(/&nbsp;/gi, " ").replace(/&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#10;/gi, " ").replace(SUBTITLE_ARTIFACTS_REGEX, " ").replace(/\s+/g, " ").trim();
  return cleaned;
}
var SUBTITLE_ARTIFACTS_REGEX, HTML_TAG_REGEX;
var init_subtitleSanitizer = __esm({
  "src/utils/subtitleSanitizer.ts"() {
    SUBTITLE_ARTIFACTS_REGEX = /[♪♫♬♩#]+|>>+|-->|align:(?:start|center|end|left|right)|position:\d+%?|line:\d+%?|size:\d+%?/gi;
    HTML_TAG_REGEX = /<[^>]+>/g;
  }
});

// src/utils/sentenceChunker.ts
function isAbbreviationOrNumber(word) {
  const cleanWord = word.trim().toLowerCase();
  if (COMMON_ABBREVIATIONS.has(cleanWord)) return true;
  if (/^[a-z]\.$/i.test(cleanWord)) return true;
  if (/^([a-z]\.){2,}$/i.test(cleanWord)) return true;
  if (/^\d+(\.\d+)?\.?$/.test(cleanWord)) return true;
  return false;
}
function cleanSentenceText(text) {
  if (!text) return "";
  let cleaned = sanitizeSubtitleText(text);
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}
function chunkSubtitlesIntoSentences(items) {
  if (!items || items.length === 0) return [];
  const wordItems = [];
  for (const item of items) {
    const tokens = item.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const duration = item.end && item.end > item.start ? item.end - item.start : 2;
    const timePerWord = duration / tokens.length;
    for (let idx = 0; idx < tokens.length; idx++) {
      const wStart = item.start + idx * timePerWord;
      const wEnd = wStart + timePerWord;
      wordItems.push({
        text: tokens[idx],
        start: wStart,
        end: wEnd
      });
    }
  }
  const result = [];
  let currentBlock = [];
  const MAX_BLOCK_LENGTH = 150;
  for (let i = 0; i < wordItems.length; i++) {
    const item = wordItems[i];
    const nextItem = i < wordItems.length - 1 ? wordItems[i + 1] : null;
    currentBlock.push(item);
    const accumulatedRawText = currentBlock.map((b) => b.text).join(" ").trim();
    const itemText = item.text.trim();
    const isPunctuationEnd = /[.!?]$/.test(itemText) && !isAbbreviationOrNumber(itemText);
    const itemEnd = item.end !== void 0 ? item.end : item.start + 1;
    const pauseDuration = nextItem ? nextItem.start - itemEnd : 0;
    const isLongPause = nextItem ? pauseDuration > 2 : false;
    const isExceedingLength = accumulatedRawText.length >= MAX_BLOCK_LENGTH;
    const shouldClose = isPunctuationEnd || isLongPause || isExceedingLength || !nextItem;
    if (shouldClose && currentBlock.length > 0) {
      const startSec = Math.floor(currentBlock[0].start);
      const formattedText = cleanSentenceText(accumulatedRawText);
      if (formattedText) {
        result.push({
          start: startSec,
          text: formattedText,
          words: [...currentBlock]
        });
      }
      currentBlock = [];
    }
  }
  return result;
}
var COMMON_ABBREVIATIONS;
var init_sentenceChunker = __esm({
  "src/utils/sentenceChunker.ts"() {
    init_subtitleSanitizer();
    COMMON_ABBREVIATIONS = /* @__PURE__ */ new Set([
      "mr.",
      "mrs.",
      "ms.",
      "dr.",
      "prof.",
      "sr.",
      "jr.",
      "st.",
      "vs.",
      "v.",
      "e.g.",
      "i.e.",
      "etc.",
      "vol.",
      "p.",
      "pp.",
      "no.",
      "jan.",
      "feb.",
      "mar.",
      "apr.",
      "jun.",
      "jul.",
      "aug.",
      "sep.",
      "oct.",
      "nov.",
      "dec.",
      "a1.",
      "a2.",
      "b1.",
      "b2.",
      "c1.",
      "c2.",
      "co.",
      "inc.",
      "ltd."
    ]);
  }
});

// routes/youtube.ts
var youtube_exports = {};
__export(youtube_exports, {
  chunkSubtitlesIntoSentences: () => chunkSubtitlesIntoSentences,
  cleanHtmlTitle: () => cleanHtmlTitle,
  cleanSentenceText: () => cleanSentenceText,
  default: () => youtube_default,
  fetchYoutubeVideoAndSubtitles: () => fetchYoutubeVideoAndSubtitles,
  formatGeminiTranscript: () => formatGeminiTranscript,
  isAbbreviationOrNumber: () => isAbbreviationOrNumber,
  isValidVideoTitle: () => isValidVideoTitle,
  resolveBestYoutubeThumbnail: () => resolveBestYoutubeThumbnail
});
function formatGeminiTranscript(rawText) {
  if (!rawText) return "";
  let text = rawText;
  text = text.replace(/(\d+)\s*m\s*(\d+)\s*s?/gi, (_, m, s) => {
    const totalSec = parseInt(m, 10) * 60 + parseInt(s, 10);
    return `${totalSec}s`;
  });
  text = text.replace(/(\d+)\s*m(?!\w)/gi, (_, m) => {
    const totalSec = parseInt(m, 10) * 60;
    return `${totalSec}s`;
  });
  const timestampPattern = /(?:^|\s+)(?:\b(\d{1,2}:\d{2}(?::\d{2})?)\b|\b(\d+)s\b)\s*/gi;
  const lines = [];
  let lastIndex = 0;
  let currentSec = null;
  const matches = Array.from(text.matchAll(timestampPattern));
  if (matches.length === 0) return rawText;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (i > 0) {
      const chunk = text.substring(lastIndex, matchStart).trim();
      if (chunk && currentSec !== null) {
        const mins = Math.floor(currentSec / 60);
        const secs = Math.floor(currentSec % 60);
        const formattedTime = `${mins}:${secs.toString().padStart(2, "0")}`;
        lines.push(`${formattedTime} ${chunk}`);
      }
    }
    if (match[1]) {
      const parts = match[1].split(":").map((n) => parseInt(n, 10));
      if (parts.length === 2) currentSec = parts[0] * 60 + parts[1];
      else if (parts.length === 3) currentSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (match[2]) {
      currentSec = parseInt(match[2], 10);
    }
    lastIndex = matchEnd;
  }
  if (lastIndex < text.length && currentSec !== null) {
    const chunk = text.substring(lastIndex).trim();
    if (chunk) {
      const mins = Math.floor(currentSec / 60);
      const secs = Math.floor(currentSec % 60);
      const formattedTime = `${mins}:${secs.toString().padStart(2, "0")}`;
      lines.push(`${formattedTime} ${chunk}`);
    }
  }
  return lines.join("\n");
}
async function resolveBestYoutubeThumbnail(videoId, oembedThumbnailUrl) {
  const maxres = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const headRes = await fetch(maxres, { method: "HEAD", signal: AbortSignal.timeout(2e3) });
    if (headRes.ok && headRes.status === 200) {
      return maxres;
    }
  } catch (_) {
  }
  const sd = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
  try {
    const headSd = await fetch(sd, { method: "HEAD", signal: AbortSignal.timeout(1500) });
    if (headSd.ok && headSd.status === 200) {
      return sd;
    }
  } catch (_) {
  }
  return oembedThumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
function isValidVideoTitle(val) {
  if (!val || typeof val !== "string") return false;
  const clean = val.trim();
  if (clean.length === 0) return false;
  const lower = clean.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.") || lower.includes("youtube.com") || lower.includes("youtu.be") || lower === "youtube" || lower === "- youtube" || lower === "youtube video" || lower === "youtube video lesson" || lower === "video") {
    return false;
  }
  return true;
}
function cleanHtmlTitle(raw) {
  if (!raw) return "";
  return raw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/\s*-\s*YouTube$/i, "").trim();
}
async function fetchYoutubeVideoAndSubtitles(urlOrVideoId, targetLanguage = "English", geminiApiKey) {
  const fullUrl = /^[a-zA-Z0-9_-]{11}$/.test(urlOrVideoId.trim()) ? `https://www.youtube.com/watch?v=${urlOrVideoId.trim()}` : urlOrVideoId.trim();
  let statusCode = 200;
  let responseData = null;
  const mockReq = {
    body: {
      url: fullUrl,
      targetLanguage,
      geminiApiKey,
      mode: "auto"
    },
    headers: {}
  };
  const mockRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };
  if (_ytSubtitlesHandler) {
    await _ytSubtitlesHandler(mockReq, mockRes);
  }
  if (statusCode >= 200 && statusCode < 300 && responseData && responseData.text) {
    return {
      ok: true,
      title: responseData.title || responseData.videoTitle || "YouTube Video",
      videoTitle: responseData.videoTitle || responseData.title || "YouTube Video",
      text: responseData.text,
      coverUrl: responseData.coverUrl || "",
      youtubeId: responseData.youtubeId || "",
      youtubeDuration: responseData.youtubeDuration ?? null,
      channelName: responseData.channelName ?? null,
      channelAvatarUrl: responseData.channelAvatarUrl ?? null,
      isFallback: responseData.isFallback
    };
  }
  return {
    ok: false,
    title: responseData?.title || responseData?.videoTitle || "",
    videoTitle: responseData?.videoTitle || "",
    text: responseData?.text || "",
    coverUrl: responseData?.coverUrl || "",
    youtubeId: responseData?.youtubeId || "",
    youtubeDuration: responseData?.youtubeDuration ?? null,
    channelName: responseData?.channelName ?? null,
    channelAvatarUrl: responseData?.channelAvatarUrl ?? null,
    error: responseData?.error || "Failed to fetch YouTube subtitles"
  };
}
var import_express3, import_os, import_fs4, import_path3, import_youtube_transcript, import_node_webvtt, router3, _ytSubtitlesHandler, registerYtSubtitles, handleChannelInfo, handleYoutubeVideoInfo, youtube_default;
var init_youtube = __esm({
  "routes/youtube.ts"() {
    import_express3 = require("express");
    import_os = __toESM(require("os"), 1);
    import_fs4 = __toESM(require("fs"), 1);
    import_path3 = __toESM(require("path"), 1);
    init_ytdlpWrapper();
    import_youtube_transcript = require("youtube-transcript");
    import_node_webvtt = __toESM(require("node-webvtt"), 1);
    init_ai();
    init_geminiClient();
    init_sentenceChunker();
    router3 = (0, import_express3.Router)();
    _ytSubtitlesHandler = null;
    registerYtSubtitles = (routePath, mw, fn) => {
      _ytSubtitlesHandler = fn;
      router3.post(routePath, mw, fn);
    };
    registerYtSubtitles("/youtube-subtitles", aiRateLimit, async (req, res) => {
      const { url } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
      if (!match) {
        return res.status(400).json({ error: "Invalid YouTube URL format" });
      }
      const videoId = match[1];
      let title = "";
      let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      let videoLengthSeconds = null;
      let channelName = null;
      let channelAvatarUrl = null;
      const mode = req.body.mode || "auto";
      const doChunkSentences = req.body.chunkSentences !== false;
      try {
        let oembedThumbUrl = null;
        let oembedAuthorUrl = null;
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(6e3)
          });
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            if (oembedData.thumbnail_url) {
              oembedThumbUrl = oembedData.thumbnail_url;
            }
            if (oembedData.author_name) {
              channelName = oembedData.author_name;
            }
            if (isValidVideoTitle(oembedData.title)) {
              title = cleanHtmlTitle(oembedData.title);
            }
            if (oembedData.author_url) {
              oembedAuthorUrl = oembedData.author_url;
            }
          }
        } catch (_) {
        }
        try {
          const resPage = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9"
            },
            signal: AbortSignal.timeout(8e3)
          });
          const html = await resPage.text();
          const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(.*?);<\/script>/);
          if (playerResponseMatch) {
            try {
              const parsed = JSON.parse(playerResponseMatch[1]);
              if (parsed?.videoDetails?.lengthSeconds) {
                videoLengthSeconds = parseInt(parsed.videoDetails.lengthSeconds, 10);
              }
              if (!isValidVideoTitle(title) && isValidVideoTitle(parsed?.videoDetails?.title)) {
                title = cleanHtmlTitle(parsed.videoDetails.title);
              }
              if (!channelName && parsed?.videoDetails?.author) {
                channelName = parsed.videoDetails.author;
              }
            } catch (e) {
              console.error("Failed to parse ytInitialPlayerResponse", e);
            }
          }
          if (!videoLengthSeconds) {
            const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/i) || html.match(/\\?"lengthSeconds\\?"\s*:\s*\\?"(\d+)\\?"/i);
            if (lengthMatch) {
              videoLengthSeconds = parseInt(lengthMatch[1], 10);
            }
          }
          if (!isValidVideoTitle(title)) {
            const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']*)["']/i) || html.match(/<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']og:title["']/i);
            const metaTitleMatch = html.match(/<meta\s+(?:property|name)=["']title["']\s+content=["']([^"']*)["']/i) || html.match(/<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']title["']/i);
            const pageTitleMatch = html.match(/<title>([^<]*)<\/title>/i);
            const candidate = ogTitleMatch && ogTitleMatch[1] || metaTitleMatch && metaTitleMatch[1] || pageTitleMatch && pageTitleMatch[1];
            if (candidate) {
              const cleaned = cleanHtmlTitle(candidate);
              if (isValidVideoTitle(cleaned)) {
                title = cleaned;
              }
            }
          }
          if (!channelName) {
            const channelMatch = html.match(/"author"\s*:\s*"([^"]+)"/) || html.match(/<link itemprop="name" content="([^"]+)">/i);
            if (channelMatch) channelName = channelMatch[1];
          }
          if (!channelAvatarUrl) {
            const avatarMatch = html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/) || html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-=]+/);
            if (avatarMatch) {
              channelAvatarUrl = avatarMatch[1] || avatarMatch[0];
            }
          }
        } catch (_) {
        }
        if (oembedAuthorUrl && !channelAvatarUrl) {
          try {
            const cRes = await fetch(oembedAuthorUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
              },
              signal: AbortSignal.timeout(6e3)
            });
            if (cRes.ok) {
              const cHtml = await cRes.text();
              const ogImgMatch = cHtml.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) || cHtml.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
              if (ogImgMatch) channelAvatarUrl = ogImgMatch[1];
            }
          } catch (_) {
          }
        }
        if (!isValidVideoTitle(title) || !videoLengthSeconds) {
          try {
            const dlp = getYtDlp();
            const dlpInfo = await dlp(`https://www.youtube.com/watch?v=${videoId}`, {
              dumpSingleJson: true,
              skipDownload: true,
              noCheckCertificate: true,
              addHeader: ["Accept-Language:en-US,en;q=0.9"]
            });
            if (dlpInfo) {
              if (!isValidVideoTitle(title) && isValidVideoTitle(dlpInfo.title)) {
                title = cleanHtmlTitle(dlpInfo.title);
              }
              if (!videoLengthSeconds && dlpInfo.duration) {
                videoLengthSeconds = Math.round(dlpInfo.duration);
              }
              if (!channelName && dlpInfo.uploader) {
                channelName = dlpInfo.uploader;
              }
            }
          } catch (_) {
          }
        }
        thumbnail = await resolveBestYoutubeThumbnail(videoId, oembedThumbUrl);
        if (!isValidVideoTitle(title)) {
          title = channelName ? `${channelName} Video` : "YouTube Video Lesson";
        }
        let langCode = "es";
        const targetLower = (targetLanguage || "spanish").toLowerCase();
        if (targetLower.startsWith("span") || targetLower === "es") langCode = "es";
        else if (targetLower.startsWith("fren") || targetLower === "fr") langCode = "fr";
        else if (targetLower.startsWith("germ") || targetLower === "de") langCode = "de";
        else if (targetLower.startsWith("ital") || targetLower === "it") langCode = "it";
        else if (targetLower.startsWith("russ") || targetLower === "ru") langCode = "ru";
        else if (targetLower.startsWith("engl") || targetLower === "en") langCode = "en";
        else if (targetLower.startsWith("jap") || targetLower === "ja") langCode = "ja";
        else if (targetLower.startsWith("chin") || targetLower === "zh") langCode = "zh";
        else if (targetLower.startsWith("arab") || targetLower === "ar") langCode = "ar";
        else langCode = targetLower.substring(0, 2);
        let isSuccessful = false;
        let lines = [];
        const fetchWithYoutubeTranscript = async (lang) => {
          try {
            const opts = lang ? { lang } : void 0;
            const rawCues = await import_youtube_transcript.YoutubeTranscript.fetchTranscript(videoId, opts);
            if (!rawCues || rawCues.length === 0) return false;
            const cleanCues = rawCues.map((c) => {
              let t = c.text || "";
              t = t.replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, " ").replace(/[♪♫♬♩#]+|>>+/g, " ").replace(/\s+/g, " ").trim();
              return {
                start: c.offset / 1e3,
                end: (c.offset + c.duration) / 1e3,
                text: t
              };
            }).filter((c) => c.text.length > 0);
            if (cleanCues.length === 0) return false;
            if (doChunkSentences) {
              const formattedSentences = chunkSubtitlesIntoSentences(cleanCues);
              lines = formattedSentences.map((s) => `${s.start}s	${s.text}`);
            } else {
              lines = cleanCues.map((cue) => `${Math.floor(cue.start)}s	${cue.text}`);
            }
            return lines.length > 0;
          } catch (err) {
            console.log(`[YouTube] youtube-transcript info for ${videoId}${lang ? ` (lang: ${lang})` : ""}:`, err.message || err);
            return false;
          }
        };
        const downloadSubs = async (lang) => {
          const tempDir = import_os.default.tmpdir();
          const tempBaseName = `yt_sub_${videoId}_${Date.now()}`;
          const tempBasePath = import_path3.default.join(tempDir, tempBaseName);
          const findWordOverlap = (a, b) => {
            const wordsA = a.trim().split(/\s+/);
            const wordsB = b.trim().split(/\s+/);
            const normalize = (w) => w.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
            const normA = wordsA.map(normalize).filter(Boolean);
            const normB = wordsB.map(normalize).filter(Boolean);
            const maxOverlap = Math.min(normA.length, normB.length);
            for (let len = maxOverlap; len > 0; len--) {
              let match2 = true;
              for (let i = 0; i < len; i++) {
                if (normA[normA.length - len + i] !== normB[i]) {
                  match2 = false;
                  break;
                }
              }
              if (match2) {
                let wordCount = 0;
                let charIdx = 0;
                while (charIdx < b.length && /\s/.test(b[charIdx])) {
                  charIdx++;
                }
                while (charIdx < b.length && wordCount < len) {
                  while (charIdx < b.length && !/\s/.test(b[charIdx])) {
                    charIdx++;
                  }
                  wordCount++;
                  while (charIdx < b.length && /\s/.test(b[charIdx])) {
                    charIdx++;
                  }
                }
                return charIdx;
              }
            }
            return 0;
          };
          try {
            const dlp = getYtDlp();
            await dlp(`https://www.youtube.com/watch?v=${videoId}`, {
              writeSub: true,
              writeAutoSub: true,
              subLang: `${lang}.*,${lang}`,
              subFormat: "vtt",
              addHeader: [
                "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language:en-US,en;q=0.9"
              ],
              output: tempBasePath,
              skipDownload: true,
              noCheckCertificate: true
            });
          } catch (dlErr) {
            console.warn(`[YouTube] yt-dlp warning/info for ${videoId} (${lang}):`, dlErr.message || dlErr);
          }
          try {
            const files = import_fs4.default.readdirSync(tempDir);
            const matchingFile = files.find((f) => f.startsWith(tempBaseName) && f.endsWith(".vtt"));
            if (matchingFile) {
              const fullPath = import_path3.default.join(tempDir, matchingFile);
              const rawContent = import_fs4.default.readFileSync(fullPath, "utf-8");
              const rawLines = rawContent.split(/\r?\n/);
              const sanitizedLines = ["WEBVTT", ""];
              let inHeader = true;
              for (let i = 0; i < rawLines.length; i++) {
                const line = rawLines[i].trim();
                if (line.startsWith("WEBVTT")) continue;
                if (inHeader) {
                  if (line.includes("-->")) {
                    inHeader = false;
                  } else {
                    continue;
                  }
                }
                sanitizedLines.push(rawLines[i]);
              }
              const sanitizedContent = sanitizedLines.join("\n");
              const parsed = import_node_webvtt.default.parse(sanitizedContent);
              if (parsed?.cues && parsed.cues.length > 0) {
                const cleanCues = parsed.cues.map((c) => {
                  let t = c.text || "";
                  t = t.replace(/<[^>]+>/g, "");
                  t = t.replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, " ").replace(/[♪♫♬♩#]+|>>+|-->|align:(?:start|center|end|left|right)|position:\d+%?|line:\d+%?|size:\d+%?/gi, " ").replace(/\s+([.,!?:;])/g, "$1").replace(/^([.,!?:;]\s*)+/g, "").replace(/\s+/g, " ").trim();
                  return {
                    start: c.start,
                    end: c.end,
                    text: t
                  };
                }).filter((c) => c.text.length > 0);
                const filteredCues = [];
                for (let i = 0; i < cleanCues.length; i++) {
                  const current = cleanCues[i].text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
                  const next = i < cleanCues.length - 1 ? cleanCues[i + 1].text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "") : "";
                  if (next && next.startsWith(current)) {
                    continue;
                  }
                  filteredCues.push(cleanCues[i]);
                }
                const finalLines = [];
                if (filteredCues.length > 0) {
                  finalLines.push({
                    start: filteredCues[0].start,
                    end: filteredCues[0].end,
                    text: filteredCues[0].text
                  });
                  for (let i = 1; i < filteredCues.length; i++) {
                    const prevText = filteredCues[i - 1].text;
                    const currentText = filteredCues[i].text;
                    const skipBytes = findWordOverlap(prevText, currentText);
                    const cleanText = currentText.substring(skipBytes).trim();
                    if (cleanText) {
                      finalLines.push({
                        start: filteredCues[i].start,
                        end: filteredCues[i].end,
                        text: cleanText
                      });
                    }
                  }
                }
                if (doChunkSentences) {
                  const formattedSentences = chunkSubtitlesIntoSentences(finalLines);
                  lines = formattedSentences.map((s) => `${s.start}s	${s.text}`);
                } else {
                  lines = finalLines.map((cue) => {
                    const offsetSec = Math.floor(cue.start);
                    return `${offsetSec}s	${cue.text}`;
                  });
                }
              }
              try {
                import_fs4.default.unlinkSync(fullPath);
              } catch (e) {
              }
              if (lines.length > 0) {
                return true;
              }
            }
          } catch (err) {
          }
          return false;
        };
        if (mode !== "force_ai") {
          isSuccessful = await fetchWithYoutubeTranscript(langCode);
          if (!isSuccessful) {
            isSuccessful = await fetchWithYoutubeTranscript();
          }
          if (!isSuccessful) {
            isSuccessful = await downloadSubs(langCode);
          }
          if (!isSuccessful) {
            isSuccessful = await downloadSubs("en");
          }
        } else {
          console.log(`[YouTube] Forced AI mode for video ${videoId}. Running Gemini Audio Speech-to-Text...`);
        }
        if (!isSuccessful || lines.length === 0) {
          const userApiKey = req.headers["x-gemini-key"] || req.body.geminiApiKey;
          const ai = getGeminiClient(userApiKey);
          if (mode === "force_ai" && !ai) {
            return res.status(400).json({
              error: "Gemini API Key missing or invalid. Please set your Gemini API Key in Settings to use Gemini AI Speech-to-Text transcription.",
              videoTitle: title,
              coverUrl: thumbnail,
              youtubeId: videoId,
              youtubeDuration: videoLengthSeconds
            });
          }
          if (ai) {
            let tempAudioPath = null;
            let uploadedGeminiFile = null;
            let lastAiErr = null;
            try {
              console.log(`[YouTube] Attempting Gemini Audio Speech-to-Text for video ${videoId}...`);
              const tempAudioDir = import_os.default.tmpdir();
              const tempAudioBase = import_path3.default.join(tempAudioDir, `yt_audio_${videoId}_${Date.now()}`);
              const dlp = getYtDlp();
              await dlp(`https://www.youtube.com/watch?v=${videoId}`, {
                extractAudio: true,
                audioFormat: "mp3",
                audioQuality: 5,
                format: "bestaudio/best",
                addHeader: [
                  "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                  "Accept-Language:en-US,en;q=0.9"
                ],
                output: `${tempAudioBase}.%(ext)s`,
                noCheckCertificate: true
              });
              const tempFiles = import_fs4.default.readdirSync(tempAudioDir);
              const downloadedFile = tempFiles.find((f) => f.startsWith(import_path3.default.basename(tempAudioBase)));
              if (downloadedFile) {
                tempAudioPath = import_path3.default.join(tempAudioDir, downloadedFile);
                uploadedGeminiFile = await ai.files.upload({
                  file: tempAudioPath,
                  mimeType: "audio/mp3"
                });
                const prompt = `Listen carefully to this audio track from a YouTube video titled: "${title}".
Transcribe all spoken words accurately into short, sentence-by-sentence entries in the original spoken language (preferably target study language: "${targetLanguage}").
For EVERY single spoken sentence or dialogue turn, provide the exact start timestamp in seconds or minutes (e.g. 0s	..., 20s	..., 47s	..., 1m3s	..., 1m17s	...).
Do NOT group multiple sentences or long paragraphs into a single timestamp entry. Break the transcript into short, individual spoken sentences so that every line has an accurate timestamp matching when it is actually spoken in the audio.

IMPORTANT: Output ONLY the line-by-line timestamped transcript entries. Do not provide titles, introductory explanations, translation notes, bracketed remarks, or markdown code blocks.`;
                const response = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [
                    {
                      fileData: {
                        fileUri: uploadedGeminiFile.uri,
                        mimeType: uploadedGeminiFile.mimeType || "audio/mp3"
                      }
                    },
                    prompt
                  ]
                });
                const aiText = response.text || "";
                if (aiText.trim()) {
                  const formattedAiText = formatGeminiTranscript(aiText);
                  return res.json({
                    title: `${title} (Gemini AI Transcription)`,
                    text: formattedAiText,
                    coverUrl: thumbnail,
                    youtubeId: videoId,
                    youtubeDuration: videoLengthSeconds,
                    isFallback: false,
                    channelName,
                    channelAvatarUrl
                  });
                }
              }
            } catch (gErr) {
              console.error("Gemini AI Audio Speech-to-Text failed:", gErr);
              lastAiErr = gErr.message || String(gErr);
            } finally {
              if (tempAudioPath) {
                try {
                  import_fs4.default.unlinkSync(tempAudioPath);
                } catch (e) {
                }
              }
              if (uploadedGeminiFile?.name) {
                try {
                  await ai.files.delete({ name: uploadedGeminiFile.name });
                } catch (e) {
                }
              }
            }
            if (mode === "force_ai") {
              let cleanErr = lastAiErr || "Could not process audio track.";
              if (cleanErr.includes("RESOURCE_EXHAUSTED") || cleanErr.includes("Quota exceeded") || cleanErr.includes("429")) {
                cleanErr = "Gemini API rate limit or daily quota exceeded (Google Free Tier limit: 20 requests/day). Please wait a minute before retrying or provide a paid/different API key.";
              }
              return res.status(500).json({
                error: `Gemini AI Speech-to-Text failed: ${cleanErr}`,
                videoTitle: title,
                coverUrl: thumbnail,
                youtubeId: videoId,
                youtubeDuration: videoLengthSeconds
              });
            }
          }
          const uiLang = (req.body.uiLang || "en").toLowerCase();
          const isRu = uiLang.startsWith("ru");
          const fallbackTitle = isRu ? `${title} (\u0421\u0443\u0431\u0442\u0438\u0442\u0440\u044B \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442)` : `${title} (No Subtitles Available)`;
          const fallbackText = isRu ? `\u0423 \u044D\u0442\u043E\u0433\u043E \u0432\u0438\u0434\u0435\u043E \u043D\u0430 YouTube \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442 \u0433\u043E\u0442\u043E\u0432\u044B\u0435 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B.

\u0414\u043B\u044F \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F \u0440\u0435\u0447\u0438 \u0418\u0418 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0432\u0430\u0448 \u0440\u0430\u0431\u043E\u0447\u0438\u0439 Gemini API Key (\u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u043D\u0430 AIza...) \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 Docker \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u0430 (-e GEMINI_API_KEY="AIzaSy...") \u0438\u043B\u0438 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F.` : `This YouTube video does not have ready-made subtitles.

To enable automatic AI Speech-to-Text transcription, please provide a valid Gemini API Key (starts with AIza...) when starting the Docker container (-e GEMINI_API_KEY="AIzaSy...") or in application settings.`;
          return res.json({
            title: fallbackTitle,
            text: fallbackText,
            coverUrl: thumbnail,
            youtubeId: videoId,
            youtubeDuration: videoLengthSeconds,
            isFallback: true,
            channelName,
            channelAvatarUrl
          });
        }
        const formattedText = lines.join("\n");
        return res.json({
          title,
          text: formattedText,
          coverUrl: thumbnail,
          youtubeId: videoId,
          youtubeDuration: videoLengthSeconds,
          channelName,
          channelAvatarUrl
        });
      } catch (err) {
        console.error("YouTube importing subtitle error:", err);
        return res.status(500).json({
          error: `Could not parse subtitles: ${err.message || "Unknown error"}. Clean YouTube transcription blocks may be geo-restricted or unavailable.`,
          videoTitle: title || "YouTube Study Lesson",
          coverUrl: thumbnail,
          youtubeId: videoId
        });
      }
    });
    router3.post("/youtube-playlist", async (req, res) => {
      const { url } = req.body;
      const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }
      const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
      if (!listMatch || !listMatch[1]) {
        return res.status(400).json({ error: "No YouTube playlist ID found in URL (missing '?list=...')" });
      }
      const playlistId = listMatch[1];
      const canonicalPlaylistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
      try {
        console.log(`[YouTube Playlist] Fetching full metadata for playlist ${playlistId}...`);
        let title = "YouTube Playlist";
        let description = "";
        let channelTitle = "";
        let thumbnailUrl = "";
        let items = [];
        try {
          const dlp = getYtDlp();
          const data = await dlp(canonicalPlaylistUrl, {
            dumpSingleJson: true,
            flatPlaylist: true,
            noWarnings: true,
            ignoreErrors: true,
            addHeader: [
              "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept-Language:en-US,en;q=0.9"
            ],
            noCheckCertificate: true
          });
          if (data) {
            title = data.title || title;
            description = data.description || "";
            channelTitle = data.uploader || data.channel || data.channel_title || "";
            if (data.thumbnails && Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
              thumbnailUrl = data.thumbnails[data.thumbnails.length - 1].url || "";
            }
            const rawEntries = Array.isArray(data.entries) ? data.entries : [];
            items = rawEntries.map((entry, idx) => {
              const videoId = entry.id || entry.url?.match(/(?:v=|shorts\/|youtu\.be\/)([^&"/?\s]{11})/)?.[1] || "";
              let thumb = "";
              if (entry.thumbnails && Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
                thumb = entry.thumbnails[entry.thumbnails.length - 1].url;
              }
              if (!thumb && videoId) {
                thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
              }
              return {
                id: `yt_item_${playlistId}_${videoId || idx}`,
                videoId,
                title: entry.title || `Video ${idx + 1}`,
                durationSeconds: typeof entry.duration === "number" ? Math.round(entry.duration) : 0,
                thumbnailUrl: thumb,
                publishedAt: entry.upload_date || entry.timestamp ? String(entry.upload_date || entry.timestamp) : void 0,
                transcriptLoaded: false
              };
            }).filter((item) => !!item.videoId);
          }
        } catch (ytdlpErr) {
          console.warn("[YouTube Playlist] yt-dlp flat playlist extraction had a warning/error, attempting fallback:", ytdlpErr);
        }
        if (items.length === 0) {
          try {
            const pageRes = await fetch(canonicalPlaylistUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
              }
            });
            if (pageRes.ok) {
              const html = await pageRes.text();
              const matchTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
              if (matchTitle && matchTitle[1]) {
                title = matchTitle[1].replace(" - YouTube", "").trim();
              }
              const matchChannel = html.match(/"ownerText"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/i) || html.match(/"author"\s*:\s*"([^"]+)"/i);
              if (matchChannel && matchChannel[1]) {
                channelTitle = matchChannel[1];
              }
              const dataMatch = html.match(/var ytInitialData = (\{.+?\});<\/script>/);
              if (dataMatch && dataMatch[1]) {
                const parsed = JSON.parse(dataMatch[1]);
                const sectionContents = parsed?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;
                if (Array.isArray(sectionContents)) {
                  for (let i = 0; i < sectionContents.length; i++) {
                    const renderer = sectionContents[i]?.playlistVideoRenderer;
                    if (!renderer || !renderer.videoId) continue;
                    const vId = renderer.videoId;
                    const vTitle = renderer.title?.runs?.[0]?.text || `Video ${i + 1}`;
                    const durSec = parseInt(renderer.lengthSeconds || "0", 10);
                    const thumb = renderer.thumbnail?.thumbnails?.pop()?.url || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`;
                    items.push({
                      id: `yt_item_${playlistId}_${vId}`,
                      videoId: vId,
                      title: vTitle,
                      durationSeconds: durSec,
                      thumbnailUrl: thumb,
                      transcriptLoaded: false
                    });
                  }
                }
              }
            }
          } catch (scrapeErr) {
            console.error("[YouTube Playlist] HTML scrape fallback error:", scrapeErr);
          }
        }
        if (items.length === 0) {
          return res.status(404).json({
            error: "Could not retrieve videos from this YouTube playlist. Please check that the playlist is public or unlisted."
          });
        }
        if (!thumbnailUrl && items[0]?.thumbnailUrl) {
          thumbnailUrl = items[0].thumbnailUrl;
        }
        return res.json({
          id: `pl_yt_${playlistId}`,
          title: title || "YouTube Playlist",
          description,
          thumbnailUrl,
          sourceType: "youtube_playlist",
          externalUrl: canonicalPlaylistUrl,
          channelTitle,
          itemCount: items.length,
          language: targetLanguage,
          items,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (err) {
        console.error("YouTube Playlist import error:", err);
        return res.status(500).json({
          error: `Failed to import YouTube playlist: ${err.message || "Unknown error"}`
        });
      }
    });
    handleChannelInfo = async (req, res) => {
      try {
        const rawUrl = req.body?.url || req.body?.channelUrl || req.body?.link || "";
        const rawName = req.body?.channelName || req.body?.title || "";
        const youtubeId = req.body?.youtubeId || "";
        let resolvedName = rawName && typeof rawName === "string" ? rawName.trim() : null;
        let resolvedAvatarUrl = null;
        let resolvedUrl = rawUrl && typeof rawUrl === "string" ? rawUrl.trim() : null;
        let vId = youtubeId;
        if (!vId && resolvedUrl) {
          const vMatch = resolvedUrl.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
          if (vMatch) vId = vMatch[1];
        }
        if (vId) {
          try {
            const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vId}&format=json`, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
              signal: AbortSignal.timeout(5e3)
            });
            if (oembedRes.ok) {
              const data = await oembedRes.json();
              if (data.author_name && !resolvedName) resolvedName = data.author_name;
              if (data.author_url && !resolvedUrl) resolvedUrl = data.author_url;
            }
          } catch (_) {
          }
        }
        if (resolvedUrl) {
          try {
            let cleanUrl = resolvedUrl;
            if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
              if (cleanUrl.startsWith("@")) {
                cleanUrl = `https://www.youtube.com/${cleanUrl}`;
              } else {
                cleanUrl = `https://www.youtube.com/@${cleanUrl}`;
              }
            }
            resolvedUrl = cleanUrl;
            const chRes = await fetch(cleanUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
              },
              signal: AbortSignal.timeout(8e3)
            });
            if (chRes.ok) {
              const html = await chRes.text();
              const titleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
              if (titleMatch && titleMatch[1]) {
                let chTitle = titleMatch[1].replace(/ - YouTube$/, "").trim();
                if (chTitle && (!resolvedName || resolvedName === "__unknown__")) {
                  resolvedName = chTitle;
                }
              }
              const ogImg = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
              if (ogImg && ogImg[1]) {
                resolvedAvatarUrl = ogImg[1];
              } else {
                const avatarMatch = html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-=]+/);
                if (avatarMatch) resolvedAvatarUrl = avatarMatch[0];
              }
            }
          } catch (fetchErr) {
            console.warn("[handleChannelInfo] Error fetching channel page:", fetchErr?.message);
          }
        }
        if (!resolvedName && !resolvedAvatarUrl) {
          return res.status(404).json({
            ok: false,
            error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 YouTube \u043A\u0430\u043D\u0430\u043B\u0430 \u043F\u043E \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u043A\u0430\u043D\u0430\u043B\u0430."
          });
        }
        return res.json({
          ok: true,
          title: resolvedName || "",
          avatar: resolvedAvatarUrl || "",
          channelName: resolvedName || "",
          channelAvatarUrl: resolvedAvatarUrl || "",
          channelUrl: resolvedUrl || ""
        });
      } catch (e) {
        console.error("[handleChannelInfo] Error:", e);
        return res.status(500).json({ ok: false, error: e.message || "Failed to resolve channel info" });
      }
    };
    router3.post("/channel-info", handleChannelInfo);
    router3.post("/youtube/channel-info", handleChannelInfo);
    router3.post("/resolve-channel", handleChannelInfo);
    handleYoutubeVideoInfo = async (req, res) => {
      try {
        const rawUrl = req.body?.url || req.body?.videoUrl || req.body?.link || "";
        if (!rawUrl || typeof rawUrl !== "string") {
          return res.status(400).json({ ok: false, error: "Missing YouTube video URL" });
        }
        const trimmedUrl = rawUrl.trim();
        const match = trimmedUrl.match(/(?:watch\?v=|youtu\.be\/|embed\/|shorts\/|^)([a-zA-Z0-9_-]{11})(?:[?&]|$)/);
        if (!match || !match[1]) {
          return res.status(400).json({ ok: false, error: "Could not find a valid YouTube video ID in the provided link" });
        }
        const videoId = match[1];
        let title = "";
        let channelName = "";
        let channelUrl = "";
        let channelAvatarUrl = "";
        let durationSeconds = 0;
        let coverUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(6e3)
          });
          if (oembedRes.ok) {
            const data = await oembedRes.json();
            if (isValidVideoTitle(data.title)) title = cleanHtmlTitle(data.title);
            if (data.author_name) channelName = data.author_name;
            if (data.author_url) channelUrl = data.author_url;
            if (data.thumbnail_url) coverUrl = data.thumbnail_url;
          }
        } catch (_) {
        }
        try {
          const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9"
            },
            signal: AbortSignal.timeout(8e3)
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/i) || html.match(/\\?"lengthSeconds\\?"\s*:\s*\\?"(\d+)\\?"/i);
            if (lengthMatch && lengthMatch[1]) {
              durationSeconds = parseInt(lengthMatch[1], 10);
            }
            if (!isValidVideoTitle(title)) {
              const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']*)["']/i) || html.match(/<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']og:title["']/i);
              const metaTitleMatch = html.match(/<meta\s+(?:property|name)=["']title["']\s+content=["']([^"']*)["']/i) || html.match(/<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']title["']/i);
              const pageTitleMatch = html.match(/<title>([^<]*)<\/title>/i);
              const candidate = ogTitleMatch && ogTitleMatch[1] || metaTitleMatch && metaTitleMatch[1] || pageTitleMatch && pageTitleMatch[1];
              if (candidate) {
                const cleaned = cleanHtmlTitle(candidate);
                if (isValidVideoTitle(cleaned)) {
                  title = cleaned;
                }
              }
            }
            if (!channelName) {
              const authorMatch = html.match(/"author"\s*:\s*"([^"]+)"/i) || html.match(/<link itemprop="name" content="([^"]+)">/i);
              if (authorMatch && authorMatch[1]) {
                channelName = authorMatch[1].trim();
              }
            }
            const avatarMatch = html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/i) || html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-=]+/);
            if (avatarMatch) {
              channelAvatarUrl = avatarMatch[1] || avatarMatch[0];
            }
          }
        } catch (_) {
        }
        if (channelUrl && !channelAvatarUrl) {
          try {
            const chRes = await fetch(channelUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
              },
              signal: AbortSignal.timeout(6e3)
            });
            if (chRes.ok) {
              const chHtml = await chRes.text();
              const ogImgMatch = chHtml.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) || chHtml.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
              if (ogImgMatch && ogImgMatch[1]) {
                channelAvatarUrl = ogImgMatch[1];
              }
            }
          } catch (_) {
          }
        }
        if (!durationSeconds || !isValidVideoTitle(title)) {
          try {
            const dlp = getYtDlp();
            const dlpInfo = await dlp(`https://www.youtube.com/watch?v=${videoId}`, {
              dumpSingleJson: true,
              skipDownload: true,
              noCheckCertificate: true,
              addHeader: ["Accept-Language:en-US,en;q=0.9"]
            });
            if (dlpInfo) {
              if (!isValidVideoTitle(title) && isValidVideoTitle(dlpInfo.title)) {
                title = cleanHtmlTitle(dlpInfo.title);
              }
              if (!durationSeconds && dlpInfo.duration) durationSeconds = Math.round(dlpInfo.duration);
              if (!channelName && dlpInfo.uploader) channelName = dlpInfo.uploader;
              if (!channelUrl && dlpInfo.uploader_url) channelUrl = dlpInfo.uploader_url;
              if (dlpInfo.thumbnail) coverUrl = dlpInfo.thumbnail;
            }
          } catch (_) {
          }
        }
        if (title) {
          title = cleanHtmlTitle(title);
        }
        if (!isValidVideoTitle(title)) {
          title = channelName ? `${channelName} Video` : "YouTube Video Lesson";
        }
        const bestThumb = await resolveBestYoutubeThumbnail(videoId, coverUrl);
        const durationMinutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : 10;
        return res.json({
          ok: true,
          youtubeId: videoId,
          title,
          durationSeconds: durationSeconds || durationMinutes * 60,
          durationMinutes,
          channelName: channelName || "",
          channelUrl: channelUrl || (channelName ? `https://www.youtube.com/@${encodeURIComponent(channelName)}` : ""),
          channelAvatarUrl: channelAvatarUrl || "",
          coverUrl: bestThumb || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        });
      } catch (err) {
        console.error("[handleYoutubeVideoInfo] Error:", err);
        return res.status(500).json({ ok: false, error: err.message || "Failed to resolve video info" });
      }
    };
    router3.post("/video-info", handleYoutubeVideoInfo);
    router3.post("/youtube/video-info", handleYoutubeVideoInfo);
    router3.post("/resolve-video", handleYoutubeVideoInfo);
    router3.post("/youtube-video-metadata", handleYoutubeVideoInfo);
    youtube_default = router3;
  }
});

// server.ts
var import_express17 = __toESM(require("express"), 1);
var import_path17 = __toESM(require("path"), 1);
var import_fs17 = __toESM(require("fs"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
init_ai();

// routes/tts.ts
var import_express2 = require("express");
var import_genai3 = require("@google/genai");
var import_express_rate_limit2 = __toESM(require("express-rate-limit"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
init_geminiClient();
var router2 = (0, import_express2.Router)();
var DATA_DIR2 = process.env.DATA_DIR || process.cwd();
var AUDIO_CACHE_DIR = import_path2.default.join(DATA_DIR2, "audio_cache");
if (!import_fs2.default.existsSync(AUDIO_CACHE_DIR)) {
  import_fs2.default.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}
function getCacheFilename(text, lang) {
  const hash = import_crypto2.default.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
  return `google_${lang}_${hash}.mp3`;
}
var ttsRateLimit = (0, import_express_rate_limit2.default)({
  windowMs: 60 * 1e3,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u043A TTS. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043C\u0438\u043D\u0443\u0442\u0443.",
    retryAfter: 60
  },
  keyGenerator: (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown"
});
router2.post("/generate-tts", ttsRateLimit, async (req, res) => {
  const { text, language } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({
      error: "Gemini API key is missing. AI TTS requires the GEMINI_API_KEY secret configured in AI Studio Settings.",
      isDemo: true
    });
  }
  try {
    const speechText = `Convert the following text into speech. Do not translate, do not answer, do not add any commentary. Output only the spoken audio of the text.
Language: ${language || "appropriate language"}
Text: ${text}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: speechText }] }],
      config: {
        responseModalities: [import_genai3.Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }
            // Warm narration voice
          }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio chunk was returned from the model");
    }
    return res.json({ audioBase64: base64Audio });
  } catch (err) {
    console.error("Gemini TTS audio generation error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate AI audio narration" });
  }
});
router2.get("/google-tts", async (req, res) => {
  const text = req.query.text;
  const lang = req.query.lang || "en";
  const speed = parseFloat(req.query.speed || "1.0");
  if (!text) {
    return res.status(400).json({ error: "text query param is required" });
  }
  try {
    const clampedSpeed = Math.min(1, Math.max(0.24, speed));
    const ttsspeed = clampedSpeed < 1 ? String(clampedSpeed) : "1";
    const cacheFilename = getCacheFilename(text, lang);
    const cacheFilePath = import_path2.default.join(AUDIO_CACHE_DIR, cacheFilename);
    if (import_fs2.default.existsSync(cacheFilePath)) {
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "public, max-age=31536000");
      return res.sendFile(cacheFilePath);
    }
    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("tl", lang);
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("q", text.slice(0, 200));
    if (ttsspeed !== "1") url.searchParams.set("ttsspeed", ttsspeed);
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/"
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Google TTS returned ${response.status}` });
    }
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await import_fs2.default.promises.writeFile(cacheFilePath, buffer);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000");
    return res.send(buffer);
  } catch (err) {
    console.error("Google Translate TTS proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy Google TTS" });
  }
});
function getCandidateUrls2(inputUrl) {
  const clean = inputUrl.trim();
  const urls = [clean];
  if (clean.includes("localhost") || clean.includes("127.0.0.1")) {
    urls.push(clean.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"));
    urls.push(clean.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"));
  }
  return Array.from(new Set(urls));
}
router2.post("/local-tts", ttsRateLimit, async (req, res) => {
  const { text, voice, language, speed, localTtsUrl } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }
  const cleanUrl = (localTtsUrl || "http://localhost:8880/v1/audio/speech").trim();
  let cleanVoice = (voice || "").trim();
  const cleanSpeed = typeof speed === "number" ? speed : 1;
  const langLower = (language || "").toLowerCase().trim();
  if (!cleanVoice || cleanVoice === "af_sarah" || cleanVoice === "am_adam") {
    if (langLower.includes("span") || langLower.includes("espa\xF1") || langLower.startsWith("es")) cleanVoice = "ef_dora";
    else if (langLower.includes("fren") || langLower.includes("fran") || langLower.startsWith("fr")) cleanVoice = "ff_siwis";
    else if (langLower.includes("ital") || langLower.startsWith("it")) cleanVoice = "it_sara";
    else if (langLower.includes("germ") || langLower.includes("deut") || langLower.startsWith("de")) cleanVoice = "de_de";
    else if (langLower.includes("japa") || langLower.startsWith("ja")) cleanVoice = "jf_alpha";
    else if (langLower.includes("chin") || langLower.startsWith("zh")) cleanVoice = "zf_xiaobei";
    else if (langLower.includes("port") || langLower.startsWith("pt")) cleanVoice = "pf_dora";
    else if (langLower.includes("russ") || langLower.startsWith("ru")) cleanVoice = "ru_dmitri";
    else if (!cleanVoice) cleanVoice = "af_sarah";
  }
  const textHash = import_crypto2.default.createHash("md5").update(`${cleanVoice}_${text.toLowerCase().trim()}`).digest("hex");
  const cacheFilename = `local_${cleanVoice}_${textHash}.mp3`;
  const cacheFilePath = import_path2.default.join(AUDIO_CACHE_DIR, cacheFilename);
  if (import_fs2.default.existsSync(cacheFilePath)) {
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=31536000");
    return res.sendFile(cacheFilePath);
  }
  const candidateUrls = getCandidateUrls2(cleanUrl);
  let lastError = null;
  for (const urlToTry of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15e3);
    try {
      const bodyPayload = {
        model: "kokoro",
        input: text,
        voice: cleanVoice,
        response_format: "mp3",
        speed: cleanSpeed
      };
      const response = await fetch(urlToTry, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`\u0421\u0435\u0440\u0432\u0435\u0440 TTS (${urlToTry}) \u0432\u0435\u0440\u043D\u0443\u043B \u0441\u0442\u0430\u0442\u0443\u0441 ${response.status}: ${errorText || response.statusText}`);
      }
      const contentType = response.headers.get("content-type") || "audio/mpeg";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await import_fs2.default.promises.writeFile(cacheFilePath, buffer);
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=31536000");
      return res.send(buffer);
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === "AbortError") {
        continue;
      }
      if (err.code === "ECONNREFUSED" || err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED")) {
        continue;
      }
      break;
    }
  }
  console.error("Local TTS proxy error:", lastError);
  if (lastError?.name === "AbortError") {
    return res.status(504).json({ error: "\u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0443 TTS \u043F\u0440\u0435\u0432\u044B\u0441\u0438\u043B \u043B\u0438\u043C\u0438\u0442 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 (15 \u0441\u0435\u043A\u0443\u043D\u0434)." });
  }
  if (lastError?.code === "ECONNREFUSED" || lastError?.message?.includes("fetch failed") || lastError?.message?.includes("ECONNREFUSED")) {
    return res.status(503).json({
      error: `\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 TTS \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443 ${cleanUrl}. \u0423\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440 Kokoro \u0438\u043B\u0438 Piper \u0437\u0430\u043F\u0443\u0449\u0435\u043D \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0441\u0435\u0440\u0432\u0435\u0440\u0435 (\u043F\u043E\u0440\u0442 8880 \u0438\u043B\u0438 5000).`
    });
  }
  return res.status(500).json({ error: lastError?.message || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0440\u0435\u0447\u0438 \u0447\u0435\u0440\u0435\u0437 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 TTS" });
});
var tts_default = router2;

// server.ts
init_youtube();

// routes/auth.ts
var import_express4 = require("express");
var import_crypto3 = __toESM(require("crypto"), 1);
var import_path5 = __toESM(require("path"), 1);
var import_fs6 = __toESM(require("fs"), 1);
var import_express_rate_limit3 = __toESM(require("express-rate-limit"), 1);
var import_util = __toESM(require("util"), 1);

// routes/dbConnection.ts
var import_path4 = __toESM(require("path"), 1);
var import_fs5 = __toESM(require("fs"), 1);
var import_better_sqlite32 = __toESM(require("better-sqlite3"), 1);
var RAW_DATA_DIR = process.env.DATA_DIR;
var DATA_DIR3 = RAW_DATA_DIR ? RAW_DATA_DIR : process.cwd();
if (!import_fs5.default.existsSync(DATA_DIR3)) {
  import_fs5.default.mkdirSync(DATA_DIR3, { recursive: true });
}
var SQLITE_DB_PATH = import_path4.default.join(DATA_DIR3, "local_server_db.sqlite");
var _sharedDb = null;
function setupSchema(db) {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      code TEXT PRIMARY KEY,
      name TEXT,
      flag TEXT
    );

    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      language_code TEXT NOT NULL,
      word TEXT NOT NULL,
      translation TEXT,
      definition TEXT,
      ipa TEXT,
      grammar TEXT,
      contextRelation TEXT,
      status TEXT NOT NULL,
      createdAt INTEGER,
      tags TEXT,
      imageUrl TEXT,
      audioClipUrl TEXT,
      examples TEXT,
      spellingCorrectCount INTEGER DEFAULT 0,
      spellingIncorrectCount INTEGER DEFAULT 0,
      spellingAccentCount INTEGER DEFAULT 0,
      lastSpelledCorrectly INTEGER,
      lastSpelledWithAccentError INTEGER DEFAULT 0,
      spellingExclude INTEGER DEFAULT 0,
      srsNextReview INTEGER,
      srsInterval INTEGER,
      srsEaseFactor REAL,
      srsRepetitions INTEGER,
      UNIQUE(user_id, language_code, word)
    );

    UPDATE words 
    SET translation = '' 
    WHERE lower(translation) IN ('translating...', 'loading...', '\u2014', '\u2014 (\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)', '\u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D');

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      audioUrl TEXT,
      audioBase64 TEXT,
      targetLanguage TEXT NOT NULL,
      translationLanguage TEXT NOT NULL,
      isBuiltIn INTEGER DEFAULT 0,
      isArchived INTEGER DEFAULT 0,
      coverUrl TEXT,
      youtubeId TEXT,
      localVideoUrl TEXT,
      lessonType TEXT,
      pinned INTEGER DEFAULT 0,
      translationText TEXT,
      detectedPhrases TEXT,
      difficulty TEXT,
      difficultyExplanation TEXT,
      createdAt INTEGER,
      channelName TEXT,
      channelTitle TEXT,
      channelAvatarUrl TEXT,
      channelAvatar TEXT,
      channelUrl TEXT,
      playlistId TEXT,
      wordTimestamps TEXT,
      images TEXT,
      audioProgress INTEGER DEFAULT 0,
      audio_progress REAL DEFAULT 0,
      audio_progress_updated_at INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      timeSpentSeconds INTEGER DEFAULT 0,
      status TEXT DEFAULT 'IN_PROGRESS',
      updatedAt TEXT,
      sourceType TEXT,
      primaryTag TEXT,
      tags TEXT,
      wordCount INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS lesson_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_history (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default',
      lessonId TEXT NOT NULL,
      lessonTitle TEXT NOT NULL,
      lessonType TEXT,
      coverUrl TEXT,
      targetLanguage TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      actionType TEXT NOT NULL,
      status TEXT,
      durationSeconds INTEGER DEFAULT 0,
      notes TEXT,
      channelName TEXT,
      channelTitle TEXT,
      channelAvatarUrl TEXT,
      channelAvatar TEXT,
      channelUrl TEXT,
      category TEXT,
      customTitle TEXT,
      mode TEXT,
      tags TEXT,
      primaryTag TEXT,
      lastPosition REAL DEFAULT 0,
      audioUrl TEXT,
      guid TEXT,
      podcastTitle TEXT,
      duration REAL DEFAULT 0,
      youtubeId TEXT,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS server_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      avatarUrl TEXT,
      passwordHint TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS server_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER,
      FOREIGN KEY(user_id) REFERENCES server_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      settings TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS podcast_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      author TEXT,
      feed_url TEXT NOT NULL,
      artwork_url TEXT,
      language TEXT,
      created_at INTEGER,
      UNIQUE(user_id, feed_url)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      description TEXT,
      thumbnailUrl TEXT,
      sourceType TEXT NOT NULL,
      externalUrl TEXT,
      channelTitle TEXT,
      itemCount INTEGER DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en',
      items TEXT,
      isArchived INTEGER DEFAULT 0,
      primaryTag TEXT,
      tags TEXT,
      orderIndex INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3B82F6',
      targetLanguage TEXT,
      createdAt TEXT,
      UNIQUE(user_id, name, targetLanguage)
    );

    CREATE TABLE IF NOT EXISTS item_tags (
      user_id TEXT NOT NULL DEFAULT 'default',
      item_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, item_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_item_tags_lookup ON item_tags(user_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_item_tags_primary ON item_tags(user_id, is_primary);
  `);
  const metaHasUserId = db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('metadata') WHERE name='user_id'"
  ).get().c > 0;
  if (!metaHasUserId) {
    const metaExists = db.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='metadata'"
    ).get().c > 0;
    if (metaExists) {
      db.exec(`
        CREATE TABLE metadata_new (
          user_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (user_id, key)
        );
        INSERT OR IGNORE INTO metadata_new (user_id, key, value)
          SELECT 'default', key, value FROM metadata;
        DROP TABLE metadata;
        ALTER TABLE metadata_new RENAME TO metadata;
      `);
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          user_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (user_id, key)
        );
      `);
    }
  }
  const linksHasUserId = db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('word_links') WHERE name='user_id'"
  ).get().c > 0;
  if (!linksHasUserId) {
    const linksExists = db.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='word_links'"
    ).get().c > 0;
    if (linksExists) {
      db.exec(`
        CREATE TABLE word_links_new (
          user_id TEXT NOT NULL DEFAULT 'default',
          language_code TEXT NOT NULL,
          word_from TEXT NOT NULL,
          word_to TEXT NOT NULL,
          PRIMARY KEY (user_id, language_code, word_from)
        );
        INSERT OR IGNORE INTO word_links_new (user_id, language_code, word_from, word_to)
          SELECT 'default', language_code, word_from, word_to FROM word_links;
        DROP TABLE word_links;
        ALTER TABLE word_links_new RENAME TO word_links;
      `);
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS word_links (
          user_id TEXT NOT NULL DEFAULT 'default',
          language_code TEXT NOT NULL,
          word_from TEXT NOT NULL,
          word_to TEXT NOT NULL,
          PRIMARY KEY (user_id, language_code, word_from)
        );
      `);
    }
  }
  try {
    db.exec(`
      UPDATE words SET language_code = 'Spanish' WHERE language_code = 'es' OR language_code = 'Es';
      UPDATE words SET language_code = 'English' WHERE language_code = 'en' OR language_code = 'En';
      DELETE FROM languages WHERE code IN ('es', 'Es', 'en', 'En', 'de', 'De', 'fr', 'Fr', 'it', 'It', 'ru', 'Ru', 'pt', 'Pt');
    `);
  } catch (_) {
  }
  const wordsCols = db.prepare("PRAGMA table_info(words)").all().map((c) => c.name);
  if (!wordsCols.includes("user_id")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`);
    } catch (e) {
      console.error("Migrate words user_id error:", e);
    }
  }
  if (!wordsCols.includes("definition")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN definition TEXT;`);
    } catch (e) {
      console.error("Migrate words definition error:", e);
    }
  }
  if (!wordsCols.includes("spellingCorrectCount")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN spellingCorrectCount INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("spellingIncorrectCount")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN spellingIncorrectCount INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("spellingAccentCount")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN spellingAccentCount INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("lastSpelledCorrectly")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN lastSpelledCorrectly INTEGER;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("lastSpelledWithAccentError")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN lastSpelledWithAccentError INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("spellingExclude")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN spellingExclude INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("srsNextReview")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN srsNextReview INTEGER;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("srsInterval")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN srsInterval INTEGER;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("srsEaseFactor")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN srsEaseFactor REAL;`);
    } catch (_) {
    }
  }
  if (!wordsCols.includes("srsRepetitions")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN srsRepetitions INTEGER;`);
    } catch (_) {
    }
  }
  const lessonsCols = db.prepare("PRAGMA table_info(lessons)").all().map((c) => c.name);
  if (!lessonsCols.includes("user_id")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("localVideoUrl")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN localVideoUrl TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("createdAt")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN createdAt INTEGER;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("wordTimestamps")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN wordTimestamps TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("channelName")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN channelName TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("channelTitle")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN channelTitle TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("channelAvatarUrl")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN channelAvatarUrl TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("channelAvatar")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN channelAvatar TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("channelUrl")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN channelUrl TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("playlistId")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN playlistId TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("images")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN images TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("audioProgress")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN audioProgress INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("audio_progress")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN audio_progress REAL DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("audio_progress_updated_at")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN audio_progress_updated_at INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("duration")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN duration INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("timeSpentSeconds")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN timeSpentSeconds INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("status")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN status TEXT DEFAULT 'IN_PROGRESS';`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("updatedAt")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN updatedAt TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("sourceType")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN sourceType TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("primaryTag")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN primaryTag TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("tags")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN tags TEXT;`);
    } catch (_) {
    }
  }
  if (!lessonsCols.includes("wordCount")) {
    try {
      db.exec(`ALTER TABLE lessons ADD COLUMN wordCount INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS study_activity_logs (
        userId TEXT NOT NULL,
        lessonId TEXT NOT NULL,
        date TEXT NOT NULL,
        secondsSpent INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY(userId, lessonId, date)
      );
    `);
  } catch (_) {
  }
  const playlistsCols = db.prepare("PRAGMA table_info(playlists)").all().map((c) => c.name);
  if (!playlistsCols.includes("user_id")) {
    try {
      db.exec(`ALTER TABLE playlists ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`);
    } catch (_) {
    }
  }
  if (!playlistsCols.includes("isArchived")) {
    try {
      db.exec(`ALTER TABLE playlists ADD COLUMN isArchived INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!playlistsCols.includes("primaryTag")) {
    try {
      db.exec(`ALTER TABLE playlists ADD COLUMN primaryTag TEXT;`);
    } catch (_) {
    }
  }
  if (!playlistsCols.includes("tags")) {
    try {
      db.exec(`ALTER TABLE playlists ADD COLUMN tags TEXT;`);
    } catch (_) {
    }
  }
  if (!playlistsCols.includes("orderIndex")) {
    try {
      db.exec(`ALTER TABLE playlists ADD COLUMN orderIndex INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!playlistsCols.includes("pinned")) {
    try {
      db.exec(`ALTER TABLE playlists ADD COLUMN pinned INTEGER DEFAULT 0;`);
    } catch (_) {
    }
  }
  const currentWordsCols = db.prepare("PRAGMA table_info(words)").all().map((c) => c.name);
  if (!currentWordsCols.includes("audioClipUrl")) {
    try {
      db.exec(`ALTER TABLE words ADD COLUMN audioClipUrl TEXT;`);
    } catch (_) {
    }
  }
  try {
    db.prepare(`
      DELETE FROM lessons 
      WHERE (text IS NULL OR TRIM(text) = '') 
        AND (isBuiltIn IS NULL OR isBuiltIn = 0) 
        AND (wordTimestamps IS NULL OR length(wordTimestamps) <= 2)
    `).run();
  } catch (_) {
  }
  setTimeout(async () => {
    try {
      const unpopulated = db.prepare(`
        SELECT id, user_id, youtubeId, title, coverUrl, audioUrl FROM lessons 
        WHERE (channelName IS NULL OR TRIM(channelName) = '' OR title = 'YouTube Video')
      `).all();
      for (const row of unpopulated) {
        try {
          let yId = row.youtubeId;
          if (!yId && row.coverUrl) {
            const m = row.coverUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
            if (m) yId = m[1];
          }
          if (!yId && row.audioUrl) {
            const m = row.audioUrl.match(/(?:youtu\.be\/|v=|\/embed\/)([a-zA-Z0-9_-]{11})/);
            if (m) yId = m[1];
          }
          if (!yId) continue;
          let channelName = null;
          let newTitle = row.title;
          let avatarUrl = null;
          try {
            const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yId}&format=json`, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.author_name) channelName = data.author_name;
              if (data.title && (row.title === "YouTube Video" || !row.title)) newTitle = data.title;
              if (data.author_url) {
                try {
                  const cRes = await fetch(data.author_url, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                  });
                  if (cRes.ok) {
                    const cHtml = await cRes.text();
                    const ogImg = cHtml.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) || cHtml.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
                    if (ogImg) avatarUrl = ogImg[1];
                  }
                } catch (_) {
                }
              }
            }
          } catch (_) {
          }
          if (!channelName || channelName === "YouTube Video") {
            try {
              const watchRes = await fetch(`https://www.youtube.com/watch?v=${yId}`, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Accept-Language": "en-US,en;q=0.9"
                }
              });
              if (watchRes.ok) {
                const html = await watchRes.text();
                const itemprop = html.match(/<link itemprop="name" content="([^"]+)">/i);
                const ownerMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/i) || html.match(/"author"\s*:\s*"([^"]+)"/i);
                if (itemprop && itemprop[1]) {
                  channelName = itemprop[1];
                } else if (ownerMatch && ownerMatch[1]) {
                  channelName = ownerMatch[1];
                }
                const avatarMatch = html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-=]+/);
                if (avatarMatch && !avatarUrl) {
                  avatarUrl = avatarMatch[0];
                }
              }
            } catch (_) {
            }
          }
          if (channelName) {
            const rowUser = row.user_id || "default";
            db.prepare("UPDATE lessons SET youtubeId = COALESCE(youtubeId, ?), channelName = ?, channelAvatarUrl = COALESCE(?, channelAvatarUrl), title = ? WHERE id = ? AND user_id = ?").run(yId, channelName, avatarUrl, newTitle, row.id, rowUser);
            try {
              db.prepare("UPDATE reading_history SET channelName = ?, channelAvatarUrl = COALESCE(?, channelAvatarUrl) WHERE lessonId = ? AND user_id = ?").run(channelName, avatarUrl, row.id, rowUser);
            } catch (_) {
            }
          }
        } catch (_) {
        }
      }
    } catch (_) {
    }
  }, 1e3);
  const historyCols = db.prepare("PRAGMA table_info(reading_history)").all().map((c) => c.name);
  if (!historyCols.includes("user_id")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("channelName")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN channelName TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("channelTitle")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN channelTitle TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("channelAvatarUrl")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN channelAvatarUrl TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("channelAvatar")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN channelAvatar TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("channelUrl")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN channelUrl TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("category")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN category TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("customTitle")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN customTitle TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("mode")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN mode TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("tags")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN tags TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("primaryTag")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN primaryTag TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("lastPosition")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN lastPosition REAL DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("audioUrl")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN audioUrl TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("guid")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN guid TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("podcastTitle")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN podcastTitle TEXT;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("duration")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN duration REAL DEFAULT 0;`);
    } catch (_) {
    }
  }
  if (!historyCols.includes("youtubeId")) {
    try {
      db.exec(`ALTER TABLE reading_history ADD COLUMN youtubeId TEXT;`);
    } catch (_) {
    }
  }
  try {
    db.prepare(`
      UPDATE reading_history
      SET tags = NULL
      WHERE tags = '["youtube","extension"]' OR tags = '["youtube", "extension"]' OR tags = '["extension","youtube"]' OR tags = '["extension", "youtube"]'
    `).run();
  } catch (_) {
  }
  try {
    const lessonsPkCount = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('lessons') WHERE pk > 0").get()?.c || 0;
    if (lessonsPkCount === 1) {
      console.log("[DB] Migrating lessons table to composite PRIMARY KEY (user_id, id)...");
      db.exec(`
        DROP TABLE IF EXISTS lessons_new;
        CREATE TABLE lessons_new (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'default',
          title TEXT NOT NULL,
          text TEXT NOT NULL,
          audioUrl TEXT,
          audioBase64 TEXT,
          targetLanguage TEXT NOT NULL,
          translationLanguage TEXT NOT NULL,
          isBuiltIn INTEGER DEFAULT 0,
          isArchived INTEGER DEFAULT 0,
          coverUrl TEXT,
          youtubeId TEXT,
          localVideoUrl TEXT,
          lessonType TEXT,
          pinned INTEGER DEFAULT 0,
          translationText TEXT,
          detectedPhrases TEXT,
          difficulty TEXT,
          difficultyExplanation TEXT,
          createdAt INTEGER,
          channelName TEXT,
          channelTitle TEXT,
          channelAvatarUrl TEXT,
          channelAvatar TEXT,
          channelUrl TEXT,
          playlistId TEXT,
          wordTimestamps TEXT,
          images TEXT,
          audioProgress INTEGER DEFAULT 0,
          audio_progress REAL DEFAULT 0,
          audio_progress_updated_at INTEGER DEFAULT 0,
          duration INTEGER DEFAULT 0,
          timeSpentSeconds INTEGER DEFAULT 0,
          status TEXT DEFAULT 'IN_PROGRESS',
          updatedAt TEXT,
          sourceType TEXT,
          primaryTag TEXT,
          tags TEXT,
          wordCount INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, id)
        );
      `);
      const oldCols = db.prepare("PRAGMA table_info(lessons)").all().map((c) => c.name);
      const newCols = db.prepare("PRAGMA table_info(lessons_new)").all().map((c) => c.name);
      const sharedCols = oldCols.filter((c) => newCols.includes(c));
      const colList = sharedCols.join(", ");
      db.exec(`
        INSERT OR IGNORE INTO lessons_new (${colList}) SELECT ${colList} FROM lessons;
        DROP TABLE lessons;
        ALTER TABLE lessons_new RENAME TO lessons;
      `);
      console.log("[DB] lessons table successfully migrated to composite PK (user_id, id).");
    }
  } catch (err) {
    console.error("[DB] Failed to migrate lessons composite PK:", err);
  }
  try {
    const playlistsPkCount = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('playlists') WHERE pk > 0").get()?.c || 0;
    if (playlistsPkCount === 1) {
      console.log("[DB] Migrating playlists table to composite PRIMARY KEY (user_id, id)...");
      db.exec(`
        DROP TABLE IF EXISTS playlists_new;
        CREATE TABLE playlists_new (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'default',
          title TEXT NOT NULL,
          description TEXT,
          thumbnailUrl TEXT,
          sourceType TEXT NOT NULL,
          externalUrl TEXT,
          channelTitle TEXT,
          itemCount INTEGER DEFAULT 0,
          language TEXT NOT NULL DEFAULT 'en',
          items TEXT,
          isArchived INTEGER DEFAULT 0,
          primaryTag TEXT,
          tags TEXT,
          orderIndex INTEGER DEFAULT 0,
          pinned INTEGER DEFAULT 0,
          createdAt TEXT,
          updatedAt TEXT,
          PRIMARY KEY (user_id, id)
        );
      `);
      const oldCols = db.prepare("PRAGMA table_info(playlists)").all().map((c) => c.name);
      const newCols = db.prepare("PRAGMA table_info(playlists_new)").all().map((c) => c.name);
      const sharedCols = oldCols.filter((c) => newCols.includes(c));
      const colList = sharedCols.join(", ");
      db.exec(`
        INSERT OR IGNORE INTO playlists_new (${colList}) SELECT ${colList} FROM playlists;
        DROP TABLE playlists;
        ALTER TABLE playlists_new RENAME TO playlists;
      `);
      console.log("[DB] playlists table successfully migrated to composite PK (user_id, id).");
    }
  } catch (err) {
    console.error("[DB] Failed to migrate playlists composite PK:", err);
  }
  try {
    const historyPkCount = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('reading_history') WHERE pk > 0").get()?.c || 0;
    if (historyPkCount === 1) {
      console.log("[DB] Migrating reading_history table to composite PRIMARY KEY (user_id, id)...");
      db.exec(`
        DROP VIEW IF EXISTS activity_history;
        DROP TABLE IF EXISTS reading_history_new;
        CREATE TABLE reading_history_new (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'default',
          lessonId TEXT NOT NULL,
          lessonTitle TEXT NOT NULL,
          lessonType TEXT,
          coverUrl TEXT,
          targetLanguage TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          actionType TEXT NOT NULL,
          status TEXT,
          durationSeconds INTEGER DEFAULT 0,
          notes TEXT,
          channelName TEXT,
          channelTitle TEXT,
          channelAvatarUrl TEXT,
          channelAvatar TEXT,
          channelUrl TEXT,
          category TEXT,
          customTitle TEXT,
          mode TEXT,
          tags TEXT,
          primaryTag TEXT,
          lastPosition REAL DEFAULT 0,
          audioUrl TEXT,
          guid TEXT,
          podcastTitle TEXT,
          duration REAL DEFAULT 0,
          youtubeId TEXT,
          PRIMARY KEY (user_id, id)
        );
      `);
      const oldCols = db.prepare("PRAGMA table_info(reading_history)").all().map((c) => c.name);
      const newCols = db.prepare("PRAGMA table_info(reading_history_new)").all().map((c) => c.name);
      const sharedCols = oldCols.filter((c) => newCols.includes(c));
      const colList = sharedCols.join(", ");
      db.exec(`
        INSERT OR IGNORE INTO reading_history_new (${colList}) SELECT ${colList} FROM reading_history;
        DROP TABLE reading_history;
        ALTER TABLE reading_history_new RENAME TO reading_history;
      `);
      console.log("[DB] reading_history table successfully migrated to composite PK (user_id, id).");
    }
  } catch (err) {
    console.error("[DB] Failed to migrate reading_history composite PK:", err);
  }
  try {
    db.exec(`CREATE VIEW IF NOT EXISTS activity_history AS SELECT * FROM reading_history;`);
  } catch (_) {
  }
  try {
    db.exec(`
      UPDATE reading_history
      SET channelName = (
            SELECT channelName FROM lessons 
            WHERE lessons.id = reading_history.lessonId 
              AND lessons.user_id = reading_history.user_id
              AND lessons.channelName IS NOT NULL 
              AND TRIM(lessons.channelName) != ''
          ),
          channelAvatarUrl = COALESCE(
            reading_history.channelAvatarUrl,
            (
              SELECT channelAvatarUrl FROM lessons 
              WHERE lessons.id = reading_history.lessonId 
                AND lessons.user_id = reading_history.user_id
                AND lessons.channelAvatarUrl IS NOT NULL 
                AND TRIM(lessons.channelAvatarUrl) != ''
            )
          )
      WHERE (reading_history.channelName IS NULL OR TRIM(reading_history.channelName) = '')
        AND EXISTS (
          SELECT 1 FROM lessons 
          WHERE lessons.id = reading_history.lessonId 
            AND lessons.user_id = reading_history.user_id
            AND lessons.channelName IS NOT NULL 
            AND TRIM(lessons.channelName) != ''
        );
    `);
  } catch (_) {
  }
  const serverUsersCols = db.prepare("PRAGMA table_info(server_users)").all().map((c) => c.name);
  if (!serverUsersCols.includes("passwordHint")) {
    try {
      db.exec(`ALTER TABLE server_users ADD COLUMN passwordHint TEXT;`);
    } catch (e) {
      console.error("Migrate server_users passwordHint error:", e);
    }
  }
  if (!serverUsersCols.includes("avatarUrl")) {
    try {
      db.exec(`ALTER TABLE server_users ADD COLUMN avatarUrl TEXT;`);
    } catch (e) {
      console.error("Migrate server_users avatarUrl error:", e);
    }
  }
  const hasUsersTable = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='users'").get().c > 0;
  if (hasUsersTable) {
    const usersCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
    if (!usersCols.includes("passwordHint")) {
      try {
        db.exec(`ALTER TABLE users ADD COLUMN passwordHint TEXT;`);
      } catch (_) {
      }
    }
    if (!usersCols.includes("avatarUrl")) {
      try {
        db.exec(`ALTER TABLE users ADD COLUMN avatarUrl TEXT;`);
      } catch (_) {
      }
    }
  }
  try {
    const wordsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='words'").get()?.sql || "";
    const hasOldConstraint = wordsSchema.includes("UNIQUE(language_code, word)") || wordsSchema.includes("UNIQUE( language_code, word)");
    if (hasOldConstraint) {
      console.log("[DB] Migrating words table: fixing UNIQUE constraint to include user_id...");
      const allWords = db.prepare("SELECT * FROM words").all();
      db.exec("DROP TABLE words");
      db.exec(`
        CREATE TABLE words (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'default',
          language_code TEXT NOT NULL,
          word TEXT NOT NULL,
          translation TEXT,
          definition TEXT,
          ipa TEXT,
          grammar TEXT,
          contextRelation TEXT,
          status TEXT NOT NULL,
          createdAt INTEGER,
          tags TEXT,
          imageUrl TEXT,
          audioClipUrl TEXT,
          examples TEXT,
          spellingCorrectCount INTEGER DEFAULT 0,
          spellingIncorrectCount INTEGER DEFAULT 0,
          spellingAccentCount INTEGER DEFAULT 0,
          lastSpelledCorrectly INTEGER,
          lastSpelledWithAccentError INTEGER DEFAULT 0,
          spellingExclude INTEGER DEFAULT 0,
          srsNextReview INTEGER,
          srsInterval INTEGER,
          srsEaseFactor REAL,
          srsRepetitions INTEGER,
          UNIQUE(user_id, language_code, word)
        )
      `);
      const stmtRestore = db.prepare(`
        INSERT OR IGNORE INTO words (
          id, user_id, language_code, word, translation, definition, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, audioClipUrl, examples,
          spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
          srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const restoreTx = db.transaction((words) => {
        for (const w of words) {
          stmtRestore.run(
            w.id,
            w.user_id || "default",
            w.language_code,
            w.word,
            w.translation,
            w.definition || null,
            w.ipa,
            w.grammar,
            w.contextRelation,
            w.status,
            w.createdAt,
            w.tags,
            w.imageUrl,
            w.audioClipUrl || null,
            w.examples,
            w.spellingCorrectCount || 0,
            w.spellingIncorrectCount || 0,
            w.spellingAccentCount || 0,
            w.lastSpelledCorrectly,
            w.lastSpelledWithAccentError || 0,
            w.spellingExclude || 0,
            w.srsNextReview || null,
            w.srsInterval || null,
            w.srsEaseFactor || null,
            w.srsRepetitions || null
          );
        }
      });
      restoreTx(allWords);
      console.log(`[DB] Restored ${allWords.length} words with new user_id-scoped schema.`);
    }
  } catch (err) {
    console.error("[DB] Failed to migrate words UNIQUE constraint:", err);
  }
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_words_user_lang ON words(user_id, language_code);
      CREATE INDEX IF NOT EXISTS idx_words_user_status ON words(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_lessons_user_arch_lang ON lessons(user_id, isArchived, targetLanguage);
      CREATE INDEX IF NOT EXISTS idx_lessons_user_yt ON lessons(user_id, youtubeId);
      CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, isArchived);
      CREATE INDEX IF NOT EXISTS idx_history_user_ts ON reading_history(user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_history_user_lesson ON reading_history(user_id, lessonId);
      CREATE INDEX IF NOT EXISTS idx_tags_user_lang ON tags(user_id, targetLanguage);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date ON study_activity_logs(userId, date);
    `);
  } catch (err) {
    console.error("[DB] Failed to create user_id indexes:", err);
  }
  db.pragma("foreign_keys = ON");
}
var hasPerformedLegacyMigration = false;
function performLegacyFileMigration(db) {
  if (hasPerformedLegacyMigration) return;
  hasPerformedLegacyMigration = true;
  try {
    const usrFiles = import_fs5.default.readdirSync(DATA_DIR3).filter(
      (f) => f.startsWith("local_server_db_usr_") && f.endsWith(".sqlite")
    );
    if (usrFiles.length === 0) return;
    console.log(`[LegacyMigration] Found ${usrFiles.length} isolated user DB file(s). Consolidating into main DB...`);
    for (const file of usrFiles) {
      const srcPath = import_path4.default.join(DATA_DIR3, file);
      if (srcPath === SQLITE_DB_PATH) continue;
      try {
        const srcDb = new import_better_sqlite32.default(srcPath);
        const userIdMatch = file.match(/^local_server_db_(usr_[a-zA-Z0-9]+)\.sqlite$/);
        const fileUserId = userIdMatch ? userIdMatch[1] : "default";
        try {
          const users = srcDb.prepare("SELECT * FROM server_users").all();
          const stmt = db.prepare("INSERT OR IGNORE INTO server_users (id, email, password_hash, display_name, avatarUrl, passwordHint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
          for (const u of users) stmt.run(u.id, u.email, u.password_hash, u.display_name, u.avatarUrl || null, u.passwordHint || null, u.created_at);
        } catch (_) {
        }
        try {
          const sessions = srcDb.prepare("SELECT * FROM server_sessions").all();
          const stmt = db.prepare("INSERT OR IGNORE INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)");
          for (const s of sessions) stmt.run(s.token, s.user_id, s.expires_at);
        } catch (_) {
        }
        try {
          const langs = srcDb.prepare("SELECT * FROM languages").all();
          const stmt = db.prepare("INSERT OR IGNORE INTO languages (code, name, flag) VALUES (?, ?, ?)");
          for (const l of langs) stmt.run(l.code, l.name, l.flag);
        } catch (_) {
        }
        try {
          const lessons = srcDb.prepare("SELECT * FROM lessons").all();
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO lessons (
              id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage,
              isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned,
              translationText, detectedPhrases, difficulty, difficultyExplanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const l of lessons) {
            const isDel = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?").get(fileUserId, `deleted_lesson_${l.id}`);
            if (isDel) continue;
            stmt.run(
              l.id,
              fileUserId,
              l.title,
              l.text,
              l.audioUrl,
              l.audioBase64,
              l.targetLanguage,
              l.translationLanguage,
              l.isBuiltIn ? 1 : 0,
              l.isArchived ? 1 : 0,
              l.coverUrl,
              l.youtubeId,
              l.lessonType,
              l.pinned ? 1 : 0,
              l.translationText,
              l.detectedPhrases,
              l.difficulty,
              l.difficultyExplanation
            );
          }
        } catch (_) {
        }
        try {
          const words = srcDb.prepare("SELECT * FROM words").all();
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO words (
              id, user_id, language_code, word, translation, ipa, grammar, contextRelation,
              status, createdAt, tags, imageUrl, examples,
              spellingCorrectCount, spellingIncorrectCount, spellingAccentCount,
              lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
              srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const w of words) {
            stmt.run(
              w.id,
              fileUserId,
              w.language_code,
              w.word,
              w.translation,
              w.ipa,
              w.grammar,
              w.contextRelation,
              w.status,
              w.createdAt,
              w.tags,
              w.imageUrl,
              w.examples,
              w.spellingCorrectCount || 0,
              w.spellingIncorrectCount || 0,
              w.spellingAccentCount || 0,
              w.lastSpelledCorrectly,
              w.lastSpelledWithAccentError || 0,
              w.spellingExclude || 0,
              w.srsNextReview,
              w.srsInterval,
              w.srsEaseFactor,
              w.srsRepetitions
            );
          }
        } catch (_) {
        }
        try {
          const hist = srcDb.prepare("SELECT * FROM reading_history").all();
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO reading_history (
              id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
              timestamp, actionType, status, durationSeconds, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const h of hist) {
            stmt.run(
              h.id,
              fileUserId,
              h.lessonId,
              h.lessonTitle,
              h.lessonType,
              h.coverUrl,
              h.targetLanguage,
              h.timestamp,
              h.actionType,
              h.status,
              h.durationSeconds,
              h.notes
            );
          }
        } catch (_) {
        }
        try {
          const meta = srcDb.prepare("SELECT * FROM metadata").all();
          const stmt = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)");
          for (const m of meta) stmt.run(fileUserId, m.key, m.value);
        } catch (_) {
        }
        srcDb.close();
        try {
          import_fs5.default.unlinkSync(srcPath);
          console.log(`[LegacyMigration] Merged and deleted legacy file: ${file}`);
        } catch (_) {
          console.log(`[LegacyMigration] Merged ${file} \u2192 user_id=${fileUserId}`);
        }
      } catch (e) {
        console.error(`[LegacyMigration] Error merging ${file}:`, e);
      }
    }
    console.log("[LegacyMigration] Done consolidating all legacy user DB files.");
  } catch (e) {
    console.error("[LegacyMigration] Failed:", e);
  }
}
function autoAssignDefaultDataToPrimaryUser(db) {
  try {
    const alreadyMigrated = db.prepare(
      "SELECT value FROM metadata WHERE user_id = '__system__' AND key = 'orphan_migration_v1_done'"
    ).get();
    if (alreadyMigrated?.value === "1") {
      return;
    }
    let primaryUser = db.prepare(
      "SELECT id, email FROM server_users ORDER BY created_at ASC LIMIT 1"
    ).get();
    if (!primaryUser) {
      console.log("[AutoAssign] No registered users found yet. Skipping.");
      return;
    }
    const uid = primaryUser.id;
    const email = primaryUser.email;
    const orphaned = db.transaction(() => {
      const [lN, wN, hN, mN, liN, pN] = [
        db.prepare("UPDATE OR IGNORE lessons SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
        db.prepare("UPDATE OR IGNORE words SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
        db.prepare("UPDATE OR IGNORE reading_history SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
        db.prepare("UPDATE OR IGNORE word_links SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
        db.prepare("UPDATE OR IGNORE metadata SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users) AND user_id != '__system__'").run(uid).changes,
        db.prepare("UPDATE OR IGNORE playlists SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes
      ];
      db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES ('__system__', 'orphan_migration_v1_done', '1')").run();
      return lN + wN + pN;
    });
    const changed = orphaned();
    if (changed > 0) {
      console.log(`[AutoAssign] Assigned ${changed} orphaned records \u2192 "${email}" (${uid})`);
    } else {
      console.log("[AutoAssign] All records properly assigned. Marked one-time migration complete.");
    }
  } catch (e) {
    console.error("[AutoAssign] Failed:", e);
  }
}
function getDbConnection(_rawUserId = "default") {
  if (_sharedDb) return _sharedDb;
  _sharedDb = new import_better_sqlite32.default(SQLITE_DB_PATH);
  _sharedDb.pragma("journal_mode = WAL");
  _sharedDb.pragma("synchronous = NORMAL");
  _sharedDb.pragma("temp_store = MEMORY");
  _sharedDb.pragma("cache_size = -32000");
  _sharedDb.pragma("mmap_size = 268435456");
  _sharedDb.pragma("wal_autocheckpoint = 1000");
  setupSchema(_sharedDb);
  performLegacyFileMigration(_sharedDb);
  autoAssignDefaultDataToPrimaryUser(_sharedDb);
  try {
    const isoMap = {
      en: "English",
      es: "Spanish",
      ru: "Russian",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      zh: "Chinese",
      ja: "Japanese",
      ko: "Korean",
      uk: "Ukrainian",
      ua: "Ukrainian",
      kk: "Kazakh",
      pl: "Polish",
      tr: "Turkish",
      ar: "Arabic",
      nl: "Dutch",
      sv: "Swedish",
      he: "Hebrew",
      hi: "Hindi",
      fa: "Persian",
      el: "Greek"
    };
    const updateLessonTarget = _sharedDb.prepare("UPDATE lessons SET targetLanguage = ? WHERE lower(trim(targetLanguage)) = ?");
    const updateLessonTrans = _sharedDb.prepare("UPDATE lessons SET translationLanguage = ? WHERE lower(trim(translationLanguage)) = ?");
    const updateHistTarget = _sharedDb.prepare("UPDATE reading_history SET targetLanguage = ? WHERE lower(trim(targetLanguage)) = ?");
    _sharedDb.transaction(() => {
      for (const [code, fullName] of Object.entries(isoMap)) {
        updateLessonTarget.run(fullName, code);
        updateLessonTrans.run(fullName, code);
        updateHistTarget.run(fullName, code);
      }
    })();
  } catch (e) {
    console.warn("[DB] ISO language normalization warning:", e);
  }
  console.log("[DB] Shared database ready at:", SQLITE_DB_PATH);
  return _sharedDb;
}

// routes/auth.ts
var router4 = (0, import_express4.Router)();
var DATA_DIR4 = process.env.DATA_DIR || process.cwd();
var AVATARS_DIR = import_path5.default.join(DATA_DIR4, "media", "avatars");
if (!import_fs6.default.existsSync(AVATARS_DIR)) {
  import_fs6.default.mkdirSync(AVATARS_DIR, { recursive: true });
}
var authRateLimit = (0, import_express_rate_limit3.default)({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 300,
  // Generous limit for home/local servers
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A \u0432\u0445\u043E\u0434\u0430 \u0438\u043B\u0438 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 15 \u043C\u0438\u043D\u0443\u0442.",
    code: "TOO_MANY_ATTEMPTS",
    retryAfter: 900
  }
});
var pbkdf2Async = import_util.default.promisify(import_crypto3.default.pbkdf2);
async function hashPassword(password) {
  const salt = import_crypto3.default.randomBytes(16).toString("hex");
  const iterations = 31e4;
  const hashBuffer = await pbkdf2Async(password, salt, iterations, 64, "sha512");
  return `${iterations}:${salt}:${hashBuffer.toString("hex")}`;
}
async function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length === 2) {
    const [salt, originalHash] = parts;
    const hashBuffer = (await pbkdf2Async(password, salt, 1e3, 64, "sha512")).toString("hex");
    return import_crypto3.default.timingSafeEqual(Buffer.from(hashBuffer, "hex"), Buffer.from(originalHash, "hex"));
  } else if (parts.length === 3) {
    const [iterStr, salt, originalHash] = parts;
    const iterations = parseInt(iterStr, 10);
    const hashBuffer = (await pbkdf2Async(password, salt, iterations, 64, "sha512")).toString("hex");
    return import_crypto3.default.timingSafeEqual(Buffer.from(hashBuffer, "hex"), Buffer.from(originalHash, "hex"));
  }
  return false;
}
function resolveUserId(req) {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const db = getDbConnection("default");
      const session = db.prepare("SELECT user_id, expires_at FROM server_sessions WHERE token = ?").get(token);
      if (session) {
        if (session.expires_at && session.expires_at < Date.now()) {
          db.prepare("DELETE FROM server_sessions WHERE token = ?").run(token);
        } else {
          return session.user_id;
        }
      }
    }
  }
  const expectedKey = process.env.LOCAL_SYNC_KEY;
  if (expectedKey) {
    const clientKey = req.headers["x-local-sync-key"] || req.headers["x-sync-key"] || req.query.sync_key;
    if (!clientKey || clientKey !== expectedKey) {
      console.warn(`[resolveUserId] Fallback sync key check failed.`);
      throw new Error("UNAUTHORIZED_SYNC_KEY");
    }
  }
  const rawUser = String(
    req.headers["x-user-id"] || req.headers["x-user-email"] || req.headers["x-local-sync-user"] || req.headers["x-user"] || req.headers["user-email"] || req.headers["user-id"] || req.query.userId || req.query.userEmail || req.query.sync_user || (req.body && typeof req.body === "object" ? req.body.userId || req.body.userEmail || req.body.syncUser : "") || ""
  ).trim();
  if (rawUser && rawUser !== "default") {
    try {
      const db = getDbConnection("default");
      const userRow = db.prepare("SELECT id FROM server_users WHERE id = ? OR lower(email) = ? LIMIT 1").get(rawUser, rawUser.toLowerCase());
      if (userRow) {
        return userRow.id;
      }
    } catch (_) {
    }
    return rawUser;
  }
  return "default";
}
function requireAuth(req, res, next) {
  try {
    const userId = resolveUserId(req);
    req.userId = userId;
    next();
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
}
router4.post("/register", authRateLimit, async (req, res) => {
  const emailInput = req.body.email || req.body.username;
  const { password, name, passwordHint, avatarUrl } = req.body;
  if (!emailInput || !password) {
    return res.status(400).json({ error: "Email \u0438 \u043F\u0430\u0440\u043E\u043B\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B", code: "REQUIRED_FIELDS" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432", code: "PASSWORD_TOO_SHORT" });
  }
  const cleanEmail = String(emailInput).trim().toLowerCase();
  const cleanName = name ? String(name).trim() : cleanEmail.split("@")[0];
  const cleanHint = passwordHint && String(passwordHint).trim() ? String(passwordHint).trim() : null;
  const cleanAvatar = avatarUrl && String(avatarUrl).trim() ? String(avatarUrl).trim() : null;
  const db = getDbConnection("default");
  try {
    const existing = db.prepare("SELECT id FROM server_users WHERE email = ?").get(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0441 \u0442\u0430\u043A\u0438\u043C email \u0443\u0436\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D", code: "EMAIL_IN_USE" });
    }
    const userId = "usr_" + import_crypto3.default.randomBytes(16).toString("hex");
    const pwdHash = await hashPassword(password);
    const createdAt = Date.now();
    db.prepare("INSERT INTO server_users (id, email, password_hash, display_name, avatarUrl, passwordHint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(userId, cleanEmail, pwdHash, cleanName, cleanAvatar, cleanHint, createdAt);
    const token = import_crypto3.default.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1e3;
    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
    return res.json({
      token,
      user: {
        uid: userId,
        id: userId,
        email: cleanEmail,
        username: cleanEmail,
        displayName: cleanName,
        avatarUrl: cleanAvatar,
        passwordHint: cleanHint
      }
    });
  } catch (err) {
    console.error("[AUTH REGISTER] Error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F: " + err.message });
  }
});
router4.post("/login", authRateLimit, async (req, res) => {
  const emailInput = req.body.email || req.body.username;
  const { password } = req.body;
  if (!emailInput || !password) {
    return res.status(400).json({ error: "Email \u0438 \u043F\u0430\u0440\u043E\u043B\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B" });
  }
  const cleanEmail = String(emailInput).trim().toLowerCase();
  const db = getDbConnection("default");
  try {
    const user = db.prepare("SELECT * FROM server_users WHERE lower(email) = ?").get(cleanEmail);
    if (!user) {
      return res.status(400).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C", code: "INVALID_CREDENTIALS" });
    }
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C", code: "INVALID_CREDENTIALS" });
    }
    const token = import_crypto3.default.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1e3;
    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expiresAt);
    return res.json({
      token,
      user: {
        uid: user.id,
        id: user.id,
        email: user.email,
        username: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatarUrl || null,
        passwordHint: user.passwordHint || null
      }
    });
  } catch (err) {
    console.error("[AUTH LOGIN] Error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438: " + err.message });
  }
});
router4.post("/logout", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.json({ status: "success" });
  }
  const db = getDbConnection("default");
  try {
    db.prepare("DELETE FROM server_sessions WHERE token = ?").run(token);
    return res.json({ status: "success" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0432\u044B\u0445\u043E\u0434\u0435: " + err.message });
  }
});
router4.get("/profiles", (req, res) => {
  try {
    const db = getDbConnection("default");
    const users = db.prepare("SELECT id, email, display_name FROM server_users ORDER BY display_name ASC").all();
    return res.json({
      status: "ok",
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name || u.email.split("@")[0]
      }))
    });
  } catch (err) {
    console.error("[GET /api/auth/profiles] Error:", err);
    return res.json({ status: "ok", users: [] });
  }
});
router4.get("/me", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ error: "\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D" });
  }
  const db = getDbConnection("default");
  try {
    const session = db.prepare("SELECT * FROM server_sessions WHERE token = ? AND expires_at > ?").get(token, Date.now());
    if (!session) {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430 \u0438\u043B\u0438 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430" });
    }
    const user = db.prepare("SELECT id, email, display_name, avatarUrl, passwordHint FROM server_users WHERE id = ?").get(session.user_id);
    if (!user) {
      return res.status(401).json({ error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    return res.json({
      user: {
        uid: user.id,
        id: user.id,
        email: user.email,
        username: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatarUrl || null,
        passwordHint: user.passwordHint || null
      }
    });
  } catch (err) {
    console.error("Auth check error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438: " + err.message });
  }
});
router4.get("/password-hint", authRateLimit, (req, res) => {
  try {
    const queryUser = req.query.username || req.query.email || req.query.login;
    if (!queryUser) {
      return res.json({ hint: null });
    }
    const cleanQuery = String(queryUser).trim().toLowerCase();
    if (!cleanQuery) {
      return res.json({ hint: null });
    }
    const db = getDbConnection("default");
    const user = db.prepare("SELECT passwordHint FROM server_users WHERE lower(email) = ? LIMIT 1").get(cleanQuery);
    if (!user || !user.passwordHint || !String(user.passwordHint).trim()) {
      return res.json({ hint: null });
    }
    return res.json({ hint: String(user.passwordHint).trim() });
  } catch (err) {
    console.error("[AUTH PASSWORD-HINT] Error:", err);
    return res.json({ hint: null });
  }
});
var updateProfileHandler = (req, res) => {
  const userId = req.userId;
  const { displayName, name, avatarUrl, passwordHint } = req.body;
  const db = getDbConnection("default");
  try {
    const user = db.prepare("SELECT id, email, display_name, avatarUrl, passwordHint FROM server_users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    const newName = displayName !== void 0 || name !== void 0 ? String(displayName ?? name).trim() : user.display_name;
    const newAvatar = avatarUrl !== void 0 ? avatarUrl ? String(avatarUrl).trim() : null : user.avatarUrl || null;
    const newHint = passwordHint !== void 0 ? passwordHint ? String(passwordHint).trim() : null : user.passwordHint || null;
    db.prepare("UPDATE server_users SET display_name = ?, avatarUrl = ?, passwordHint = ? WHERE id = ?").run(newName, newAvatar, newHint, userId);
    return res.json({
      success: true,
      user: {
        uid: user.id,
        id: user.id,
        email: user.email,
        username: user.email,
        displayName: newName,
        avatarUrl: newAvatar,
        passwordHint: newHint
      }
    });
  } catch (err) {
    console.error("[AUTH PROFILE UPDATE] Error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044F: " + err.message });
  }
};
router4.put("/profile", requireAuth, updateProfileHandler);
router4.patch("/profile", requireAuth, updateProfileHandler);
router4.put("/change-password", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { currentPassword, newPassword, passwordHint } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0438 \u043D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432" });
  }
  const db = getDbConnection("default");
  try {
    const user = db.prepare("SELECT * FROM server_users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" });
    }
    const newHash = await hashPassword(newPassword);
    const newHint = passwordHint !== void 0 ? passwordHint ? String(passwordHint).trim() : null : user.passwordHint || null;
    db.prepare("UPDATE server_users SET password_hash = ?, passwordHint = ? WHERE id = ?").run(newHash, newHint, userId);
    return res.json({
      success: true,
      message: "\u041F\u0430\u0440\u043E\u043B\u044C \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0435\u043D",
      passwordHint: newHint
    });
  } catch (err) {
    console.error("[AUTH CHANGE-PASSWORD] Error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043C\u0435\u043D\u0435 \u043F\u0430\u0440\u043E\u043B\u044F: " + err.message });
  }
});
router4.post("/avatar-upload", requireAuth, (req, res) => {
  const userId = req.userId;
  const { imageBase64, avatarData } = req.body;
  const dataStr = imageBase64 || avatarData;
  if (!dataStr) {
    return res.status(400).json({ error: "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E" });
  }
  try {
    const matches = String(dataStr).match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      const filename = `avatar_${userId}_${Date.now()}.${ext}`;
      const filePath = import_path5.default.join(AVATARS_DIR, filename);
      import_fs6.default.writeFileSync(filePath, buffer);
      const avatarUrl = `/api/auth/avatar/${filename}`;
      const db = getDbConnection("default");
      db.prepare("UPDATE server_users SET avatarUrl = ? WHERE id = ?").run(avatarUrl, userId);
      return res.json({ success: true, avatarUrl });
    } else {
      const cleanUrl = String(dataStr).trim();
      const db = getDbConnection("default");
      db.prepare("UPDATE server_users SET avatarUrl = ? WHERE id = ?").run(cleanUrl, userId);
      return res.json({ success: true, avatarUrl: cleanUrl });
    }
  } catch (err) {
    console.error("[AUTH AVATAR-UPLOAD] Error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0430\u0432\u0430\u0442\u0430\u0440\u0430: " + err.message });
  }
});
router4.get("/avatar/:filename", (req, res) => {
  const filename = import_path5.default.basename(req.params.filename);
  const filePath = import_path5.default.join(AVATARS_DIR, filename);
  if (import_fs6.default.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "\u0410\u0432\u0430\u0442\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
  }
});
var auth_default = router4;

// routes/db.ts
var import_express6 = require("express");
var import_path7 = __toESM(require("path"), 1);
var import_fs8 = __toESM(require("fs"), 1);
var import_zlib = __toESM(require("zlib"), 1);

// server/frequency/frequencyService.ts
var import_fs7 = __toESM(require("fs"), 1);
var import_path6 = __toESM(require("path"), 1);
var import_better_sqlite33 = __toESM(require("better-sqlite3"), 1);
var freqDbInstance = null;
function normalizeLangCode2(rawLang) {
  if (!rawLang) return null;
  const l = rawLang.toLowerCase().trim();
  if (l.startsWith("en") || l.includes("engl") || l.includes("\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A")) return "en";
  if (l.startsWith("es") || l.includes("span") || l.includes("\u0438\u0441\u043F\u0430\u043D\u0441\u043A")) return "es";
  if (l.startsWith("de") || l.includes("ger") || l.includes("deutsch") || l.includes("\u043D\u0435\u043C\u0435\u0446\u043A")) return "de";
  if (l.startsWith("fr") || l.includes("fren") || l.includes("franc") || l.includes("\u0444\u0440\u0430\u043D\u0446\u0443\u0437")) return "fr";
  if (l.startsWith("it") || l.includes("ital") || l.includes("\u0438\u0442\u0430\u043B\u044C\u044F\u043D")) return "it";
  if (l.startsWith("pt") || l.includes("port") || l.includes("\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B")) return "pt";
  if (l.startsWith("kk") || l.startsWith("kz") || l.includes("kaz") || l.includes("\u049B\u0430\u0437\u0430\u049B") || l.includes("\u043A\u0430\u0437\u0430\u0445")) return "kk";
  if (l.startsWith("ru") || l.includes("russ") || l.includes("\u0440\u0443\u0441\u0441\u043A")) return "ru";
  if (l.startsWith("uk") || l.startsWith("ua") || l.includes("ukr") || l.includes("\u0443\u043A\u0440\u0430\u0438\u043D") || l.includes("\u0443\u043A\u0440\u0430\u0457\u043D")) return "uk";
  if (l.startsWith("pl") || l.includes("pol") || l.includes("\u043F\u043E\u043B\u044C\u0441\u043A") || l.includes("polski")) return "pl";
  if (l.startsWith("cs") || l.startsWith("cz") || l.includes("cze") || l.includes("\u0447\u0435\u0448\u0441\u043A") || l.includes("\u010De\u0161")) return "cs";
  return null;
}
var KAZAKH_SUFFIXES = [
  // Plural + Case combinations
  "\u043B\u0430\u0440\u044B\u043C\u044B\u0437\u0431\u0435\u043D",
  "\u043B\u0435\u0440\u0456\u043C\u0456\u0437\u0431\u0435\u043D",
  "\u0434\u0430\u0440\u044B\u043C\u044B\u0437\u0431\u0435\u043D",
  "\u0434\u0435\u0440\u0456\u043C\u0456\u0437\u0431\u0435\u043D",
  "\u0442\u0430\u0440\u044B\u043C\u044B\u0437\u0431\u0435\u043D",
  "\u0442\u0435\u0440\u0456\u043C\u0456\u0437\u0431\u0435\u043D",
  "\u043B\u0430\u0440\u044B\u043D\u044B\u04A3",
  "\u043B\u0435\u0440\u0456\u043D\u0456\u04A3",
  "\u0434\u0430\u0440\u044B\u043D\u044B\u04A3",
  "\u0434\u0435\u0440\u0456\u043D\u0456\u04A3",
  "\u0442\u0430\u0440\u044B\u043D\u044B\u04A3",
  "\u0442\u0435\u0440\u0456\u043D\u0456\u04A3",
  "\u043B\u0430\u0440\u044B\u043D\u0430\u043D",
  "\u043B\u0435\u0440\u0456\u043D\u0435\u043D",
  "\u0434\u0430\u0440\u044B\u043D\u0430\u043D",
  "\u0434\u0435\u0440\u0456\u043D\u0435\u043D",
  "\u0442\u0430\u0440\u044B\u043D\u0430\u043D",
  "\u0442\u0435\u0440\u0456\u043D\u0435\u043D",
  "\u043B\u0430\u0440\u044B\u043D\u0434\u0430",
  "\u043B\u0435\u0440\u0456\u043D\u0434\u0435",
  "\u0434\u0430\u0440\u044B\u043D\u0434\u0430",
  "\u0434\u0435\u0440\u0456\u043D\u0434\u0435",
  "\u0442\u0430\u0440\u044B\u043D\u0434\u0430",
  "\u0442\u0435\u0440\u0456\u043D\u0434\u0435",
  "\u043B\u0430\u0440\u044B\u043D\u0430",
  "\u043B\u0435\u0440\u0456\u043D\u0435",
  "\u0434\u0430\u0440\u044B\u043D\u0430",
  "\u0434\u0435\u0440\u0456\u043D\u0435",
  "\u0442\u0430\u0440\u044B\u043D\u0430",
  "\u0442\u0435\u0440\u0456\u043D\u0435",
  "\u043B\u0430\u0440\u0434\u044B\u04A3",
  "\u043B\u0435\u0440\u0434\u0456\u04A3",
  "\u0434\u0430\u0440\u0434\u044B\u04A3",
  "\u0434\u0435\u0440\u0434\u0456\u04A3",
  "\u0442\u0430\u0440\u0434\u044B\u04A3",
  "\u0442\u0435\u0440\u0434\u0456\u04A3",
  "\u043B\u0430\u0440\u0434\u0430\u043D",
  "\u043B\u0435\u0440\u0434\u0435\u043D",
  "\u0434\u0430\u0440\u0434\u0430\u043D",
  "\u0434\u0435\u0440\u0434\u0435\u043D",
  "\u0442\u0430\u0440\u0434\u0430\u043D",
  "\u0442\u0435\u0440\u0434\u0435\u043D",
  "\u043B\u0430\u0440\u0434\u0430",
  "\u043B\u0435\u0440\u0434\u0435",
  "\u0434\u0430\u0440\u0434\u0430",
  "\u0434\u0435\u0440\u0434\u0435",
  "\u0442\u0430\u0440\u0434\u0430",
  "\u0442\u0435\u0440\u0434\u0435",
  "\u043B\u0430\u0440\u0493\u0430",
  "\u043B\u0435\u0440\u0433\u0435",
  "\u0434\u0430\u0440\u0493\u0430",
  "\u0434\u0435\u0440\u0433\u0435",
  "\u0442\u0430\u0440\u0493\u0430",
  "\u0442\u0435\u0440\u0433\u0435",
  "\u043B\u0430\u0440\u0434\u044B",
  "\u043B\u0435\u0440\u0434\u0456",
  "\u0434\u0430\u0440\u0434\u044B",
  "\u0434\u0435\u0440\u0434\u0456",
  "\u0442\u0430\u0440\u0434\u044B",
  "\u0442\u0435\u0440\u0434\u0456",
  // Plural endings
  "\u043B\u0430\u0440",
  "\u043B\u0435\u0440",
  "\u0434\u0430\u0440",
  "\u0434\u0435\u0440",
  "\u0442\u0430\u0440",
  "\u0442\u0435\u0440",
  // Case endings
  "\u043D\u044B\u04A3",
  "\u043D\u0456\u04A3",
  "\u0434\u044B\u04A3",
  "\u0434\u0456\u04A3",
  "\u0442\u044B\u04A3",
  "\u0442\u0456\u04A3",
  "\u0434\u0430\u043D",
  "\u0434\u0435\u043D",
  "\u0442\u0430\u043D",
  "\u0442\u0435\u043D",
  "\u043D\u0430\u043D",
  "\u043D\u0435\u043D",
  "\u043C\u0435\u043D",
  "\u0431\u0435\u043D",
  "\u043F\u0435\u043D",
  "\u043D\u0434\u0430",
  "\u043D\u0434\u0435",
  "\u0434\u0430",
  "\u0434\u0435",
  "\u0442\u0430",
  "\u0442\u0435",
  "\u0493\u0430",
  "\u0433\u0435",
  "\u049B\u0430",
  "\u043A\u0435",
  "\u043D\u0430",
  "\u043D\u0435",
  "\u043D\u044B",
  "\u043D\u0456",
  "\u0434\u044B",
  "\u0434\u0456",
  "\u0442\u044B",
  "\u0442\u0456",
  // Possessive endings
  "\u044B\u043C\u044B\u0437",
  "\u0456\u043C\u0456\u0437",
  "\u043C\u044B\u0437",
  "\u043C\u0456\u0437",
  "\u044B\u04A3\u044B\u0437",
  "\u0456\u04A3\u0456\u0437",
  "\u04A3\u044B\u0437",
  "\u04A3\u0456\u0437",
  "\u044B\u04A3",
  "\u0456\u04A3",
  "\u044B\u043C",
  "\u0456\u043C",
  "\u0441\u044B",
  "\u0441\u0456",
  "\u044B",
  "\u0456"
];
function stripKazakhSuffix(word) {
  const candidates = [];
  for (const suf of KAZAKH_SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      candidates.push(word.slice(0, -suf.length));
    }
  }
  return candidates;
}
function getFrequencyDb() {
  if (freqDbInstance) return freqDbInstance;
  const dbDir = import_path6.default.join(process.cwd(), "server", "frequency");
  if (!import_fs7.default.existsSync(dbDir)) {
    import_fs7.default.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = import_path6.default.join(dbDir, "frequency.db");
  const db = new import_better_sqlite33.default(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS word_frequencies (
      lang TEXT NOT NULL,
      word TEXT NOT NULL,
      rank INTEGER NOT NULL,
      frequency INTEGER NOT NULL,
      cefr TEXT NOT NULL,
      PRIMARY KEY (lang, word)
    );
    CREATE INDEX IF NOT EXISTS idx_freq_lookup ON word_frequencies(lang, word);
  `);
  const langConfigs = [
    { code: "en", file: "en_50k.txt" },
    { code: "es", file: "es_50k.txt" },
    { code: "de", file: "de_50k.txt" },
    { code: "fr", file: "fr_50k.txt" },
    { code: "it", file: "it_50k.txt" },
    { code: "pt", file: "pt_50k.txt" },
    { code: "kk", file: "kk_50k.txt" },
    { code: "ru", file: "ru_50k.txt" },
    { code: "uk", file: "uk_50k.txt" },
    { code: "pl", file: "pl_50k.txt" },
    { code: "cs", file: "cs_50k.txt" }
  ];
  for (const cfg of langConfigs) {
    const row = db.prepare("SELECT COUNT(*) as c FROM word_frequencies WHERE lang = ?").get(cfg.code);
    if (!row || row.c < 500) {
      populateLanguageFrequencies(db, cfg.code, cfg.file);
    }
  }
  freqDbInstance = db;
  return db;
}
function calculateCefr(rank) {
  if (rank <= 1e3) return "A1";
  if (rank <= 2500) return "A2";
  if (rank <= 5e3) return "B1";
  if (rank <= 9e3) return "B2";
  if (rank <= 16e3) return "C1";
  if (rank <= 3e4) return "C2";
  return "rare";
}
function populateLanguageFrequencies(db, lang, filename) {
  const txtPath = import_path6.default.join(process.cwd(), "server", "frequency", filename);
  if (!import_fs7.default.existsSync(txtPath)) {
    console.warn(`${filename} not found, skipping frequency DB population for ${lang}`);
    return;
  }
  console.log(`Populating ${lang.toUpperCase()} frequency database into SQLite...`);
  const content = import_fs7.default.readFileSync(txtPath, "utf-8");
  const lines = content.split("\n");
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO word_frequencies (lang, word, rank, frequency, cefr)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insertStmt.run(r[0], r[1], r[2], r[3], r[4]);
    }
  });
  const batch = [];
  let rank = 1;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const word = parts[0].toLowerCase().trim();
      const freq = parseInt(parts[1], 10) || 0;
      if (word && !word.startsWith("'") && word.length > 0) {
        const cefr = calculateCefr(rank);
        batch.push([lang, word, rank, freq, cefr]);
        rank++;
      }
    }
  }
  if (batch.length > 0) {
    insertMany(batch);
    console.log(`Successfully indexed ${batch.length} ${lang.toUpperCase()} frequency words into SQLite!`);
  }
}
function lookupWordFrequency(word, rawLang = "en") {
  const lang = normalizeLangCode2(rawLang);
  if (!lang) {
    return null;
  }
  const cleanWord = word.trim().toLowerCase().replace(/[’‘`]/g, "'");
  const db = getFrequencyDb();
  const stmt = db.prepare(
    "SELECT rank, frequency, cefr FROM word_frequencies WHERE lang = ? AND word = ?"
  );
  let row = stmt.get(lang, cleanWord);
  if (!row && cleanWord.includes("'")) {
    const parts = cleanWord.split("'");
    if (parts.length >= 2) {
      const basePart = parts[parts.length - 1];
      const prefixPart = parts[0] + "'";
      if (basePart) {
        row = stmt.get(lang, basePart);
      }
      if (!row && prefixPart) {
        row = stmt.get(lang, prefixPart);
      }
    }
  }
  if (!row && cleanWord.includes("-")) {
    const parts = cleanWord.split("-");
    for (const p of parts) {
      if (p.length > 1) {
        const subRow = stmt.get(lang, p);
        if (subRow && (!row || subRow.rank < row.rank)) {
          row = subRow;
        }
      }
    }
  }
  if (!row && lang === "kk") {
    const stemCandidates = stripKazakhSuffix(cleanWord);
    for (const stem of stemCandidates) {
      const stemRow = stmt.get("kk", stem);
      if (stemRow && (!row || stemRow.rank < row.rank)) {
        row = stemRow;
      }
    }
  }
  if (!row && lang === "ru" && (cleanWord.includes("\u0451") || cleanWord.includes("\u0435"))) {
    const altWord1 = cleanWord.replace(/ё/g, "\u0435");
    const altWord2 = cleanWord.replace(/е/g, "\u0451");
    row = stmt.get("ru", altWord1) || stmt.get("ru", altWord2);
  }
  const totalWords = 5e4;
  if (row) {
    const percentile = Math.max(0.01, Math.min(100, row.rank / totalWords * 100));
    return {
      word: cleanWord,
      lang,
      found: true,
      rank: row.rank,
      frequency: row.frequency,
      cefr: row.cefr,
      percentile: parseFloat(percentile.toFixed(1)),
      totalWords
    };
  }
  return {
    word: cleanWord,
    lang,
    found: false,
    cefr: "rare",
    totalWords
  };
}
function lookupBatchWordFrequency(words, lang = "en") {
  const db = getFrequencyDb();
  const results = {};
  const totalWords = 5e4;
  if (!words || words.length === 0) return results;
  const placeholders = words.map(() => "?").join(",");
  const query = `
    SELECT word, rank, frequency, cefr 
    FROM word_frequencies 
    WHERE lang = ? AND word IN (${placeholders})
  `;
  const rows = db.prepare(query).all(lang, ...words.map((w) => w.toLowerCase()));
  const foundMap = /* @__PURE__ */ new Map();
  for (const r of rows) {
    foundMap.set(r.word, r);
  }
  for (const w of words) {
    const lower = w.toLowerCase();
    const row = foundMap.get(lower);
    if (row) {
      results[lower] = {
        word: lower,
        lang,
        found: true,
        rank: row.rank,
        frequency: row.frequency,
        cefr: row.cefr,
        totalWords
      };
    } else {
      results[lower] = {
        word: lower,
        lang,
        found: false,
        cefr: "rare",
        totalWords
      };
    }
  }
  return results;
}
function analyzeTextComplexity(text, rawLang = "en") {
  const lang = normalizeLangCode2(rawLang);
  if (!lang) {
    return null;
  }
  if (!text || !text.trim()) {
    return {
      totalWords: 0,
      uniqueWords: 0,
      coverage: { a1_a2: 100, b1_b2: 0, c1_c2: 0, rare: 0 },
      cefrOverall: "A1",
      stats: { a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0, rare: 0 },
      rarestWords: []
    };
  }
  const words = text.match(/[\p{L}'’]+/gu) || [];
  const properNouns = /* @__PURE__ */ new Set();
  const rawWordsWithPos = text.split(/\s+/);
  for (let i = 1; i < rawWordsWithPos.length; i++) {
    const prev = rawWordsWithPos[i - 1];
    const curr = rawWordsWithPos[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (curr.length > 1 && !/[.!?]$/.test(prev) && /^\p{Lu}\p{Ll}+$/u.test(curr)) {
      properNouns.add(curr.toLowerCase());
    }
  }
  const rawTokens = [];
  for (const w of words) {
    const clean = w.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (clean.length > 1 && !properNouns.has(clean)) {
      rawTokens.push(clean);
    }
  }
  const totalWords = rawTokens.length;
  if (totalWords === 0) {
    return {
      totalWords: 0,
      uniqueWords: 0,
      coverage: { a1_a2: 100, b1_b2: 0, c1_c2: 0, rare: 0 },
      cefrOverall: "A1",
      stats: { a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0, rare: 0 },
      rarestWords: []
    };
  }
  const uniqueWordsSet = new Set(rawTokens);
  const uniqueWordsList = Array.from(uniqueWordsSet);
  const batchResults = lookupBatchWordFrequency(uniqueWordsList, lang);
  const stats = { a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0, rare: 0 };
  const rarestWordsMap = /* @__PURE__ */ new Map();
  for (const token of rawTokens) {
    const res = batchResults[token];
    if (res && res.found) {
      stats[res.cefr.toLowerCase()]++;
      if (res.cefr === "C1" || res.cefr === "C2" || res.cefr === "rare") {
        if (!rarestWordsMap.has(token)) {
          rarestWordsMap.set(token, { word: token, rank: res.rank, cefr: res.cefr });
        }
      }
    } else {
      stats.rare++;
      if (!rarestWordsMap.has(token)) {
        rarestWordsMap.set(token, { word: token, cefr: "rare" });
      }
    }
  }
  const a1_a2_pct = parseFloat(((stats.a1 + stats.a2) / totalWords * 100).toFixed(1));
  const b1_b2_pct = parseFloat(((stats.b1 + stats.b2) / totalWords * 100).toFixed(1));
  const c1_c2_pct = parseFloat(((stats.c1 + stats.c2) / totalWords * 100).toFixed(1));
  const rare_pct = parseFloat((stats.rare / totalWords * 100).toFixed(1));
  let cefrOverall = "A1";
  if (a1_a2_pct >= 92) {
    cefrOverall = stats.a2 > stats.a1 ? "A2" : "A1";
  } else if (a1_a2_pct + b1_b2_pct >= 88) {
    cefrOverall = stats.b2 > stats.b1 ? "B2" : "B1";
  } else if (c1_c2_pct > 8 || rare_pct > 6) {
    cefrOverall = "C2";
  } else {
    cefrOverall = "C1";
  }
  const rarestWords = Array.from(rarestWordsMap.values()).sort((a, b) => (b.rank || 999999) - (a.rank || 999999)).slice(0, 10);
  return {
    totalWords,
    uniqueWords: uniqueWordsSet.size,
    coverage: {
      a1_a2: a1_a2_pct,
      b1_b2: b1_b2_pct,
      c1_c2: c1_c2_pct,
      rare: rare_pct
    },
    cefrOverall,
    stats,
    rarestWords
  };
}

// routes/htmlTextUtils.ts
var import_jsdom = require("jsdom");
function cleanWordPrefix(word) {
  if (typeof word !== "string") return "";
  return word.replace(/^[a-zA-Z]+_/, "");
}
var LANG_MAP = {
  en: "English",
  english: "English",
  es: "Spanish",
  spanish: "Spanish",
  de: "German",
  german: "German",
  fr: "French",
  french: "French",
  it: "Italian",
  italian: "Italian",
  ru: "Russian",
  russian: "Russian",
  ja: "Japanese",
  japanese: "Japanese",
  zh: "Chinese",
  chinese: "Chinese",
  pt: "Portuguese",
  portuguese: "Portuguese",
  nl: "Dutch",
  dutch: "Dutch",
  pl: "Polish",
  polish: "Polish",
  sv: "Swedish",
  swedish: "Swedish",
  da: "Danish",
  danish: "Danish",
  fi: "Finnish",
  finnish: "Finnish",
  no: "Norwegian",
  norwegian: "Norwegian",
  ko: "Korean",
  korean: "Korean",
  ar: "Arabic",
  arabic: "Arabic",
  tr: "Turkish",
  turkish: "Turkish",
  hi: "Hindi",
  hindi: "Hindi",
  uk: "Ukrainian",
  ua: "Ukrainian",
  ukrainian: "Ukrainian",
  kk: "Kazakh",
  kazakh: "Kazakh",
  he: "Hebrew",
  hebrew: "Hebrew",
  fa: "Persian",
  persian: "Persian",
  cs: "Czech",
  czech: "Czech",
  vi: "Vietnamese",
  vietnamese: "Vietnamese",
  th: "Thai",
  thai: "Thai",
  el: "Greek",
  greek: "Greek"
};
function normalizeLang(lang) {
  if (!lang) return "English";
  const lower = lang.trim().toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  const base = lower.split(/[-_]/)[0];
  if (LANG_MAP[base]) return LANG_MAP[base];
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
}
function matchLanguage(entryLang, targetLang) {
  if (!targetLang || targetLang === "all" || targetLang === "overall") return true;
  if (!entryLang) return false;
  const normalize = (l) => {
    const s = l.toLowerCase().trim();
    if (s.startsWith("es") || s === "spanish" || s === "\u0438\u0441\u043F\u0430\u043D\u0441\u043A\u0438\u0439" || s === "espa\xF1ol") return "es";
    if (s.startsWith("en") || s === "english" || s === "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439") return "en";
    if (s.startsWith("ru") || s === "russian" || s === "\u0440\u0443\u0441\u0441\u043A\u0438\u0439") return "ru";
    if (s.startsWith("de") || s === "german" || s === "deutsch" || s === "\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u0439") return "de";
    if (s.startsWith("fr") || s === "french" || s === "fran\xE7ais" || s === "\u0444\u0440\u0430\u043D\u0446\u0443\u0437\u0441\u043A\u0438\u0439") return "fr";
    if (s.startsWith("it") || s === "italian" || s === "italiano" || s === "\u0438\u0442\u0430\u043B\u044C\u044F\u043D\u0441\u043A\u0438\u0439") return "it";
    if (s.startsWith("pt") || s === "portuguese" || s === "portugu\xEAs" || s === "\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B\u044C\u0441\u043A\u0438\u0439") return "pt";
    if (s.startsWith("zh") || s === "chinese" || s === "\u043A\u0438\u0442\u0430\u0439\u0441\u043A\u0438\u0439") return "zh";
    if (s.startsWith("ja") || s === "japanese" || s === "\u044F\u043F\u043E\u043D\u0441\u043A\u0438\u0439") return "ja";
    if (s.startsWith("ko") || s === "korean" || s === "\u043A\u043E\u0440\u0435\u0439\u0441\u043A\u0438\u0439") return "ko";
    if (s.startsWith("tr") || s === "turkish" || s === "\u0442\u0443\u0440\u0435\u0446\u043A\u0438\u0439") return "tr";
    if (s.startsWith("uk") || s.startsWith("ua") || s === "ukrainian" || s === "\u0443\u043A\u0440\u0430\u0438\u043D\u0441\u043A\u0438\u0439") return "uk";
    if (s.startsWith("pl") || s === "polish" || s === "\u043F\u043E\u043B\u044C\u0441\u043A\u0438\u0439") return "pl";
    if (s.startsWith("ar") || s === "arabic" || s === "\u0430\u0440\u0430\u0431\u0441\u043A\u0438\u0439") return "ar";
    if (s.startsWith("nl") || s === "dutch" || s === "\u0433\u043E\u043B\u043B\u0430\u043D\u0434\u0441\u043A\u0438\u0439") return "nl";
    if (s.startsWith("sv") || s === "swedish" || s === "\u0448\u0432\u0435\u0434\u0441\u043A\u0438\u0439") return "sv";
    if (s.startsWith("el") || s === "greek" || s === "\u0433\u0440\u0435\u0447\u0435\u0441\u043A\u0438\u0439") return "el";
    if (s.startsWith("cs") || s === "czech" || s === "\u0447\u0435\u0448\u0441\u043A\u0438\u0439") return "cs";
    if (s.startsWith("hi") || s === "hindi" || s === "\u0445\u0438\u043D\u0434\u0438") return "hi";
    if (s.startsWith("vi") || s === "vietnamese" || s === "\u0432\u044C\u0435\u0442\u043D\u0430\u043C\u0441\u043A\u0438\u0439") return "vi";
    if (s.startsWith("kk") || s === "kazakh" || s === "\u043A\u0430\u0437\u0430\u0445\u0441\u043A\u0438\u0439") return "kk";
    if (s.startsWith("he") || s === "hebrew" || s === "\u0438\u0432\u0440\u0438\u0442") return "he";
    if (s.startsWith("fa") || s === "persian" || s === "\u043F\u0435\u0440\u0441\u0438\u0434\u0441\u043A\u0438\u0439") return "fa";
    const clean = s.replace(/[-_].*$/, "");
    return clean.slice(0, 2);
  };
  return normalize(entryLang) === normalize(targetLang);
}
function deduplicateDbPlaylistItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length <= 1) return Array.isArray(rawItems) ? rawItems : [];
  const result = [];
  for (const item of rawItems) {
    if (!item) continue;
    const existingIdx = result.findIndex((existing) => {
      if (existing.id && item.id && existing.id === item.id) return true;
      if (existing.videoId && item.videoId && existing.videoId === item.videoId) return true;
      if (existing.lessonId && item.lessonId && existing.lessonId === item.lessonId) return true;
      if (item.title && existing.title && item.title.trim().toLowerCase() === existing.title.trim().toLowerCase() && item.durationSeconds && existing.durationSeconds && Math.abs(item.durationSeconds - existing.durationSeconds) <= 25) {
        return true;
      }
      return false;
    });
    if (existingIdx === -1) {
      result.push({ ...item });
    } else {
      const prev = result[existingIdx];
      result[existingIdx] = {
        ...prev,
        lessonId: prev.lessonId || item.lessonId || void 0,
        videoId: prev.videoId || item.videoId || void 0,
        transcriptLoaded: Boolean(prev.transcriptLoaded || item.transcriptLoaded),
        title: prev.title && prev.title.trim().length >= (item.title || "").trim().length ? prev.title : item.title || prev.title,
        durationSeconds: Math.max(prev.durationSeconds || 0, item.durationSeconds || 0),
        thumbnailUrl: prev.thumbnailUrl?.includes("maxresdefault") ? prev.thumbnailUrl : item.thumbnailUrl?.includes("maxresdefault") ? item.thumbnailUrl : prev.thumbnailUrl || item.thumbnailUrl || ""
      };
    }
  }
  return result;
}
function htmlToPlainText(html) {
  if (!html) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.trim();
  }
  try {
    const dom = new import_jsdom.JSDOM(`<body>${html}</body>`);
    const doc = dom.window.document;
    doc.querySelectorAll("script, style, noscript, svg, button, nav, header, footer, aside, form, input, select, canvas").forEach((el) => el.remove());
    const metaSelectors = [
      '[data-component="byline-block"]',
      '[data-testid="byline"]',
      '[data-testid="timestamp"]',
      ".article__byline",
      ".byline",
      "time",
      'header [data-component="headline-block"] ~ div:not([data-component="text-block"])'
    ];
    metaSelectors.forEach((sel) => {
      try {
        doc.querySelectorAll(sel).forEach((el) => el.remove());
      } catch (_) {
      }
    });
    doc.querySelectorAll("figure").forEach((fig) => {
      const img = fig.querySelector("img");
      const figcaption = fig.querySelector("figcaption");
      let src = "";
      if (img) {
        src = img.getAttribute("data-src") || img.getAttribute("src") || "";
        if (!src && img.getAttribute("srcset")) {
          const parts = img.getAttribute("srcset").split(",");
          const last = parts[parts.length - 1].trim().split(/\s+/)[0];
          if (last) src = last;
        }
      }
      const rawCap = (figcaption?.textContent || "").trim().replace(/\s+/g, " ");
      const cap = rawCap.replace(/^image caption[:,]?\s*/i, "").trim();
      let markerText = "";
      if (src && !src.startsWith("data:") && !src.includes("placeholder") && !src.includes("grey-")) {
        markerText += `[IMG:${src}]`;
      }
      if (cap) {
        markerText += (markerText ? "\n" : "") + `[CAPTION:${cap}]`;
      }
      if (markerText) {
        const p = doc.createElement("p");
        p.textContent = markerText;
        fig.replaceWith(p);
      } else {
        fig.remove();
      }
    });
    doc.querySelectorAll("img").forEach((img) => {
      let src = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (!src && img.getAttribute("srcset")) {
        const parts = img.getAttribute("srcset").split(",");
        const last = parts[parts.length - 1].trim().split(/\s+/)[0];
        if (last) src = last;
      }
      if (src && !src.startsWith("data:") && !src.includes("placeholder") && !src.includes("grey-")) {
        const p = doc.createElement("p");
        p.textContent = `[IMG:${src}]`;
        img.replaceWith(p);
      } else {
        img.remove();
      }
    });
    doc.querySelectorAll("h1, h2").forEach((h) => {
      const txt = (h.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `## ${txt} ##`;
        h.replaceWith(p);
      } else {
        h.remove();
      }
    });
    doc.querySelectorAll("h3, h4, h5, h6").forEach((h) => {
      const txt = (h.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `# ${txt} #`;
        h.replaceWith(p);
      } else {
        h.remove();
      }
    });
    doc.querySelectorAll("li").forEach((li) => {
      const txt = (li.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `\u2022 ${txt}`;
        li.replaceWith(p);
      } else {
        li.remove();
      }
    });
    return Array.from(doc.body.childNodes).map((node) => node.textContent?.trim()).filter(Boolean).join("\n\n");
  } catch (err) {
    console.warn("[htmlToPlainText] Parsing failed, fallback:", err);
    return html.replace(/<[^>]+>/g, "").trim();
  }
}

// routes/dictionaryLookup.ts
function getLangCode(langName) {
  const norm = (langName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439") return "en";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "\u0438\u0441\u043F\u0430\u043D\u0441\u043A\u0438\u0439") return "es";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "\u0444\u0440\u0430\u043D\u0446\u0443\u0437\u0441\u043A\u0438\u0439") return "fr";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u0439") return "de";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "\u0438\u0442\u0430\u043B\u044C\u044F\u043D\u0441\u043A\u0438\u0439") return "it";
  if (norm.startsWith("ru") || norm === "\u0440\u0443\u0441\u0441\u043A\u0438\u0439") return "ru";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B\u044C\u0441\u043A\u0438\u0439") return "pt";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "\u0442\u0443\u0440\u0435\u0446\u043A\u0438\u0439") return "tr";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "\u044F\u043F\u043E\u043D\u0441\u043A\u0438\u0439") return "ja";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "\u043A\u0438\u0442\u0430\u0439\u0441\u043A\u0438\u0439") return "zh";
  if (norm.startsWith("ar") || norm === "\u0430\u0440\u0430\u0431\u0441\u043A\u0438\u0439") return "ar";
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "\u0443\u043A\u0440\u0430\u0438\u043D\u0441\u043A\u0438\u0439" || norm === "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430" || norm === "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0438\u0439") return "uk";
  return "en";
}
async function fetchFreeDictionaryFromCom(word, langCode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://freedictionaryapi.com/api/v1/entries/${langCode}/${encodeURIComponent(word)}?translations=true`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/1.0.1 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      return data;
    }
  } catch (e) {
    clearTimeout(timeoutId);
    if (e?.name === "AbortError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn(`[FreeDictAPI] Timeout for word "${word}" (${langCode})`);
    } else {
      console.warn(`[FreeDictAPI] Failed for word "${word}":`, e?.message || e);
    }
  }
  return null;
}
async function fetchFreeDictionary(word, langCode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/1.0.1 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch (e) {
    clearTimeout(timeoutId);
    if (e?.name === "AbortError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn(`[DictionaryAPI.dev] Timeout for word "${word}" (${langCode})`);
    } else {
      console.warn(`[DictionaryAPI.dev] Failed for word "${word}":`, e?.message || e);
    }
  }
  return null;
}
async function fetchWiktionarySingle(word, lang = "en") {
  const cleanWord = word.trim().toLowerCase();
  const endpoint = `https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(cleanWord)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/1.0.1 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError" || error?.code === "UND_ERR_CONNECT_TIMEOUT" || error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn(`[Wiktionary] Timeout for word "${cleanWord}" (${lang}) \u2014 skipping definition.`);
    } else {
      console.warn(`[Wiktionary] Failed to fetch "${cleanWord}" (${lang}): ${error?.message || error}`);
    }
    return null;
  }
}
async function fetchWiktionary(word, langCode) {
  const primaryResult = await fetchWiktionarySingle(word, "en");
  if (primaryResult) return primaryResult;
  if (langCode && langCode !== "en") {
    return await fetchWiktionarySingle(word, langCode);
  }
  return null;
}
async function fetchGoogleTranslate(text, fromLang, toLang, getAlternatives = false) {
  try {
    const dtParams = getAlternatives ? "dt=t&dt=at&dt=bd" : "dt=t";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&${dtParams}&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;
    let primary = "";
    if (data[0] && Array.isArray(data[0])) {
      primary = data[0].map((x) => x[0]).join("").trim();
    }
    if (getAlternatives) {
      const nounTerms = [];
      const adjTerms = [];
      const otherTerms = [];
      if (data[1] && Array.isArray(data[1])) {
        for (const posBlock of data[1]) {
          const pos = (posBlock[0] || "").toLowerCase();
          if (posBlock && Array.isArray(posBlock[1])) {
            for (const word of posBlock[1]) {
              if (typeof word === "string" && word.trim()) {
                const clean = word.trim();
                if (pos === "noun" || pos.includes("noun") || pos.includes("\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435")) {
                  nounTerms.push(clean);
                } else if (pos === "adjective" || pos.includes("adj") || pos.includes("\u043F\u0440\u0438\u043B\u0430\u0433\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435")) {
                  adjTerms.push(clean);
                } else {
                  otherTerms.push(clean);
                }
              }
            }
          }
        }
      }
      if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
        for (const item of data[5][0][2]) {
          if (item && typeof item[0] === "string" && item[0].trim()) {
            otherTerms.push(item[0].trim());
          }
        }
      }
      const allVariants = [primary, ...nounTerms, ...adjTerms, ...otherTerms].filter(Boolean);
      const seen = /* @__PURE__ */ new Set();
      const unique = [];
      for (const term of allVariants) {
        const lower = term.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          unique.push(term);
        }
      }
      if (unique.length > 0) {
        return unique.slice(0, 4).join(", ");
      }
    }
    return primary || null;
  } catch (e) {
    console.error("Google Translate fetch failed:", e);
  }
  return null;
}
async function handleDictionaryExplain(req, res) {
  const { word, context, targetLanguage, translationLanguage, source } = req.body;
  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }
  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");
  const langCode = getLangCode(targetLanguage);
  let ipa = "";
  let grammar = "";
  let translation = "";
  const examples = [];
  let contextRelation = "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0438\u0437 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0445 \u0441\u043B\u043E\u0432\u0430\u0440\u0435\u0439 (Free Dictionary + Wiktionary).";
  let freeDictResult = null;
  let comDictResult = null;
  let wiktionaryResult = null;
  const isMonolingual = getLangCode(translationLanguage) === getLangCode(targetLanguage);
  if (!isMonolingual && (source === "google" || translationLanguage && translationLanguage !== "mono")) {
    const sourceLangCode = getLangCode(targetLanguage);
    const destLangCode = getLangCode(translationLanguage || "ru");
    const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
    if (googleTrans) {
      translation = googleTrans;
    }
  }
  if (isMonolingual || source === "free_dictionary" || source === "hybrid" || !source || source === "google" && !translation) {
    comDictResult = await fetchFreeDictionaryFromCom(cleanWord, langCode);
    if (!comDictResult) {
      freeDictResult = await fetchFreeDictionary(cleanWord, langCode);
    }
  }
  if (isMonolingual || source === "wiktionary" || source === "hybrid" || !source || source === "google" && !translation) {
    wiktionaryResult = await fetchWiktionary(cleanWord, langCode);
  }
  if (comDictResult && comDictResult.entries && Array.isArray(comDictResult.entries) && comDictResult.entries.length > 0) {
    const mainEntry = comDictResult.entries[0];
    grammar = mainEntry.partOfSpeech || "";
    if (mainEntry.pronunciations && Array.isArray(mainEntry.pronunciations)) {
      const ipaObj = mainEntry.pronunciations.find((p) => p.type === "ipa" && p.text);
      if (ipaObj) {
        ipa = ipaObj.text;
      }
    }
    if (mainEntry.senses && Array.isArray(mainEntry.senses) && mainEntry.senses.length > 0) {
      const meaningsList = [];
      mainEntry.senses.forEach((s) => {
        if (s.definition) {
          const part = mainEntry.partOfSpeech ? `(${mainEntry.partOfSpeech}) ` : "";
          meaningsList.push(`${part}${s.definition}`);
        }
        if (s.examples && Array.isArray(s.examples)) {
          s.examples.slice(0, 3).forEach((ex) => {
            if (ex && typeof ex === "string") {
              examples.push({
                text: ex,
                translation: "\u041F\u0440\u0438\u043C\u0435\u0440 \u0438\u0437 Free Dictionary"
              });
            }
          });
        }
      });
      if (meaningsList.length > 0) {
        translation = meaningsList.slice(0, 3).join("; ");
      }
    }
    contextRelation = "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0438\u0437 \u0431\u0430\u0437\u044B freedictionaryapi.com + Wiktionary.";
  }
  if (freeDictResult) {
    if (freeDictResult.phonetic) {
      ipa = freeDictResult.phonetic;
    } else if (freeDictResult.phonetics && Array.isArray(freeDictResult.phonetics)) {
      const validPhonetic = freeDictResult.phonetics.find((p) => p.text);
      if (validPhonetic) {
        ipa = validPhonetic.text;
      }
    }
    if (freeDictResult.meanings && Array.isArray(freeDictResult.meanings) && freeDictResult.meanings.length > 0) {
      const meaningsList = [];
      const firstMeaning = freeDictResult.meanings[0];
      grammar = firstMeaning.partOfSpeech || "";
      freeDictResult.meanings.forEach((m) => {
        const part = m.partOfSpeech ? `(${m.partOfSpeech}) ` : "";
        if (m.definitions && Array.isArray(m.definitions)) {
          m.definitions.slice(0, 2).forEach((d) => {
            if (d.definition) {
              meaningsList.push(`${part}${d.definition}`);
            }
            if (d.example) {
              examples.push({
                text: d.example,
                translation: "\u041F\u0440\u0438\u043C\u0435\u0440 \u0438\u0437 \u0441\u043B\u043E\u0432\u0430\u0440\u044F (\u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442)"
              });
            }
          });
        }
      });
      if (meaningsList.length > 0) {
        translation = meaningsList.slice(0, 3).join("; ");
      }
    }
  }
  if (wiktionaryResult) {
    const sections = Object.keys(wiktionaryResult);
    const validParts = [];
    sections.forEach((sec) => {
      const partOfSpeeches = wiktionaryResult[sec];
      if (Array.isArray(partOfSpeeches)) {
        partOfSpeeches.forEach((pos) => {
          if (pos.partOfSpeech && !grammar) {
            grammar = pos.partOfSpeech;
          }
          if (pos.definitions && Array.isArray(pos.definitions)) {
            pos.definitions.slice(0, 3).forEach((d) => {
              const cleanDef = d.definition ? d.definition.replace(/<[^>]+>/g, "").trim() : "";
              if (cleanDef) {
                validParts.push(`${pos.partOfSpeech ? `(${pos.partOfSpeech}) ` : ""}${cleanDef}`);
              }
              if (d.examples && Array.isArray(d.examples)) {
                d.examples.slice(0, 2).forEach((ex) => {
                  const cleanEx = ex.text ? ex.text.replace(/<[^>]+>/g, "").trim() : "";
                  if (cleanEx && !examples.some((item) => item.text.toLowerCase() === cleanEx.toLowerCase())) {
                    examples.push({
                      text: cleanEx,
                      translation: "\u041F\u0440\u0438\u043C\u0435\u0440 \u0443\u043F\u043E\u0442\u0440\u0435\u0431\u043B\u0435\u043D\u0438\u044F"
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
    if (validParts.length > 0) {
      if (!translation) {
        translation = validParts.slice(0, 3).join("; ");
      } else if (source === "hybrid") {
        translation += " | Wiktionary: " + validParts.slice(0, 2).join("; ");
      }
    }
  }
  if (source === "google") {
    const sourceLangCode = getLangCode(targetLanguage);
    const destLangCode = getLangCode(translationLanguage);
    if (sourceLangCode !== destLangCode) {
      const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
      if (googleTrans) {
        translation = googleTrans;
      }
    }
    if (examples.length > 0) {
      for (const ex of examples) {
        if (ex.text) {
          const transEx = await fetchGoogleTranslate(ex.text, sourceLangCode, destLangCode);
          if (transEx) {
            ex.translation = transEx;
          }
        }
      }
    }
    if (context && context.trim() !== cleanWord) {
      const transContext = await fetchGoogleTranslate(context, sourceLangCode, destLangCode);
      if (transContext) {
        contextRelation = `\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430: "${transContext}" (Google Translate)`;
      } else {
        contextRelation = `\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0438\u0437 Google Translate (\u0431\u0435\u0437 \u0418\u0418).`;
      }
    } else {
      contextRelation = `\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0438\u0437 Google Translate (\u0431\u0435\u0437 \u0418\u0418).`;
    }
  } else {
    if (!translation) {
      translation = `\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u0441\u043B\u043E\u0432\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C \u0441\u043B\u043E\u0432\u0430\u0440\u0435.`;
      contextRelation = `\u041C\u044B \u043F\u044B\u0442\u0430\u043B\u0438\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0441\u043B\u043E\u0432\u043E "${cleanWord}" \u0432 Free Dictionary \u0438 Wiktionary, \u043D\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u043D\u0435\u0442. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043F\u043E\u0438\u0441\u043A \u0447\u0435\u0440\u0435\u0437 \u0418\u0418 (AI)!`;
    } else {
      contextRelation = `\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E \u0438\u0437 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430: ${source === "free_dictionary" ? "Free Dictionary API" : source === "wiktionary" ? "Wiktionary REST API" : "\u0421\u043C\u0435\u0448\u0430\u043D\u043D\u044B\u0439 \u043F\u043E\u0438\u0441\u043A (Hybrid)"}.`;
    }
  }
  if (examples.length === 0) {
    examples.push({
      text: `Let's use "${cleanWord}" in a text context.`,
      translation: `\u0414\u0430\u0432\u0430\u0439\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u043C \u0441\u043B\u043E\u0432\u043E "${cleanWord}" \u0432 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0438.`
    });
  }
  return res.json({
    word: cleanWord,
    translation,
    ipa: ipa || `[${cleanWord}]`,
    grammar: grammar || "Word",
    contextRelation,
    examples: examples.slice(0, 3)
  });
}

// routes/vocabRoutes.ts
var import_express5 = require("express");

// src/db.ts
var import_localforage = __toESM(require("localforage"), 1);
var storeOptions = {
  name: "LecturaDB",
  version: 1
};
var lessonsStore = import_localforage.default.createInstance({ ...storeOptions, storeName: "lessons" });
var playlistsStore = import_localforage.default.createInstance({ ...storeOptions, storeName: "playlists" });
var vocabStore = import_localforage.default.createInstance({ ...storeOptions, storeName: "vocab" });
var settingsStore = import_localforage.default.createInstance({ ...storeOptions, storeName: "settings" });
var translationsStore = import_localforage.default.createInstance({ ...storeOptions, storeName: "sentence_translations" });

// src/utils.ts
function getLanguageCode(languageName) {
  const norm = (languageName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439") return "en";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "\u0438\u0441\u043F\u0430\u043D\u0441\u043A\u0438\u0439") return "es";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "\u0444\u0440\u0430\u043D\u0446\u0443\u0437\u0441\u043A\u0438\u0439") return "fr";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u0439") return "de";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "\u0438\u0442\u0430\u043B\u044C\u044F\u043D\u0441\u043A\u0438\u0439") return "it";
  if (norm.startsWith("ru") || norm === "\u0440\u0443\u0441\u0441\u043A\u0438\u0439") return "ru";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B\u044C\u0441\u043A\u0438\u0439") return "pt";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "\u0442\u0443\u0440\u0435\u0446\u043A\u0438\u0439") return "tr";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "\u044F\u043F\u043E\u043D\u0441\u043A\u0438\u0439") return "ja";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "\u043A\u0438\u0442\u0430\u0439\u0441\u043A\u0438\u0439") return "zh";
  if (norm.startsWith("ar") || norm === "\u0430\u0440\u0430\u0431\u0441\u043A\u0438\u0439") return "ar";
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "\u0443\u043A\u0440\u0430\u0438\u043D\u0441\u043A\u0438\u0439" || norm === "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430" || norm === "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0438\u0439") return "uk";
  if (norm.startsWith("kk") || norm.startsWith("kaz") || norm === "\u043A\u0430\u0437\u0430\u0445\u0441\u043A\u0438\u0439" || norm === "\u049B\u0430\u0437\u0430\u049B\u0448\u0430" || norm === "\u049B\u0430\u0437\u0430\u049B \u0442\u0456\u043B\u0456") return "kk";
  if (norm.length >= 2 && /^[a-z]+$/.test(norm.substring(0, 2))) {
    return norm.substring(0, 2);
  }
  return "en";
}
var ENGLISH_NEGATIONS = {
  "can't": "can",
  "cannot": "can",
  "won't": "will",
  "shan't": "shall",
  "ain't": "be",
  "don't": "do",
  "doesn't": "does",
  "didn't": "did",
  "isn't": "is",
  "aren't": "are",
  "wasn't": "was",
  "weren't": "were",
  "haven't": "have",
  "hasn't": "has",
  "hadn't": "had",
  "wouldn't": "would",
  "couldn't": "could",
  "shouldn't": "should",
  "mustn't": "must"
};
function normalizeContraction(w, targetLanguage) {
  if (!w) return "";
  let lower = w.toLowerCase().replace(/[’‘ʻʼ´`]/g, "'").trim();
  const langCode = getLanguageCode(targetLanguage);
  if (langCode === "es") {
    return lower;
  }
  if (langCode === "en" || !langCode) {
    if (ENGLISH_NEGATIONS[lower]) {
      return ENGLISH_NEGATIONS[lower];
    }
    if (lower.endsWith("'") && lower.length > 2) {
      lower = lower.slice(0, -1);
    }
    if (lower.endsWith("'s")) return lower.slice(0, -2);
    if (lower.endsWith("'ve")) return lower.slice(0, -3);
    if (lower.endsWith("'re")) return lower.slice(0, -3);
    if (lower.endsWith("'m")) return lower.slice(0, -2);
    if (lower.endsWith("'ll")) return lower.slice(0, -3);
    if (lower.endsWith("'d")) return lower.slice(0, -2);
  } else if (langCode === "fr") {
    if (lower.startsWith("l'")) return lower.slice(2);
    if (lower.startsWith("d'")) return lower.slice(2);
    if (lower.startsWith("j'")) return lower.slice(2);
    if (lower.startsWith("qu'")) return lower.slice(3);
    if (lower.startsWith("m'")) return lower.slice(2);
    if (lower.startsWith("t'")) return lower.slice(2);
    if (lower.startsWith("s'")) return lower.slice(2);
    if (lower.startsWith("c'")) return lower.slice(2);
    if (lower.startsWith("n'")) return lower.slice(2);
  } else if (langCode === "it") {
    if (lower.startsWith("l'")) return lower.slice(2);
    if (lower.startsWith("d'")) return lower.slice(2);
    if (lower.startsWith("un'")) return lower.slice(3);
    if (lower.startsWith("c'")) return lower.slice(2);
  }
  return lower;
}
function normalizePossessiveSuffix(token) {
  if (!token) return "";
  const trimmed = token.trim();
  if (trimmed === "'s" || trimmed === "\u2019s") return trimmed;
  const cleanTrail = trimmed.replace(/[.,;:!?”"')»\]]+$/g, "");
  const stripped = cleanTrail.replace(/['’]s$/i, "");
  return stripped.trim() ? stripped.trim() : trimmed;
}
function migrateLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const keys = [
    "words",
    "translation_source",
    "custom_tags",
    "lessons",
    "lessontypes",
    "listening",
    "aliases",
    "language_flags",
    "focus_mode",
    "layout_width",
    "reader_settings",
    "interface_zoom",
    "local_user",
    "storage_mode",
    "daily_word_goal",
    "last_active_lesson_id",
    "reading_history"
  ];
  keys.forEach((k) => {
    const oldKey = `lingq_clone_${k}`;
    const newKey = `vocab_clone_${k}`;
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        try {
          localStorage.setItem(newKey, oldVal);
        } catch (e) {
          console.warn("Quota exceeded on " + newKey);
        }
      }
    }
  });
  const exactKeys = [
    "lingq_default_target_language",
    "lingq_default_translation_language",
    "lingq_books_per_row"
  ];
  exactKeys.forEach((oldKey) => {
    const newKey = oldKey.replace("lingq_", "vocab_");
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        try {
          localStorage.setItem(newKey, oldVal);
        } catch (e) {
          console.warn("Quota exceeded on " + newKey);
        }
      }
    }
  });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      if (key.startsWith("lingq_clone_dicts_")) {
        const newKey = key.replace("lingq_clone_dicts_", "vocab_clone_dicts_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(key));
        }
      } else if (key.startsWith("lingq_progress_")) {
        const newKey = key.replace("lingq_progress_", "vocab_progress_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(key));
        }
      }
    }
  }
}
migrateLocalStorage();

// src/data/ignoreLists/universal/gaming.json
var gaming_default = [
  "nintendo",
  "playstation",
  "xbox",
  "atari",
  "capcom",
  "konami",
  "ubisoft",
  "bethesda",
  "bioware",
  "insomniac",
  "bungie",
  "fromsoftware",
  "mojang",
  "supercell",
  "gamecube",
  "gameboy",
  "dualshock",
  "dualsense",
  "joycon",
  "psp",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
  "ps5",
  "oculus",
  "zelda",
  "pokemon",
  "pok\xE9mon",
  "minecraft",
  "fortnite",
  "roblox",
  "cyberpunk",
  "skyrim",
  "bloodborne",
  "sekiro",
  "valorant",
  "splatoon",
  "tekken",
  "terraria",
  "genshin",
  "honkai"
];

// src/data/ignoreLists/universal/tech.json
var tech_default = [
  "google",
  "microsoft",
  "nvidia",
  "amd",
  "qualcomm",
  "snapdragon",
  "asus",
  "acer",
  "lenovo",
  "samsung",
  "xiaomi",
  "huawei",
  "logitech",
  "razer",
  "corsair",
  "toshiba",
  "hitachi",
  "nikon",
  "tiktok",
  "twitch",
  "netflix",
  "spotify",
  "reddit",
  "github",
  "gitlab",
  "linkedin",
  "whatsapp",
  "android",
  "macos",
  "ubuntu",
  "debian",
  "kubernetes",
  "oled",
  "amoled",
  "qled",
  "nvme",
  "pcie",
  "uefi",
  "gigabyte",
  "megabyte",
  "terabyte",
  "gigahertz",
  "megahertz",
  "bluetooth",
  "wifi",
  "hdmi",
  "displayport",
  "ethernet",
  "vpn",
  "http",
  "https",
  "json",
  "xml",
  "html",
  "css",
  "sql"
];

// src/data/ignoreLists/universal/music.json
var music_default = [
  "acdc",
  "beatles",
  "beyonce",
  "coldplay",
  "daftpunk",
  "depechemode",
  "eminem",
  "gorillaz",
  "ledzeppelin",
  "linkinpark",
  "maroon5",
  "megadeth",
  "metallica",
  "nirvana",
  "pinkfloyd",
  "queen",
  "radiohead",
  "rammstein",
  "shakira",
  "slipknot"
];

// src/data/ignoreLists/universal/cinema.json
var cinema_default = [
  "aragorn",
  "avatar",
  "batman",
  "darthvader",
  "dumbledore",
  "frodo",
  "gandalf",
  "godzilla",
  "gollum",
  "hobbit",
  "hogwarts",
  "jurassic",
  "legolas",
  "marvel",
  "matrix",
  "moriarty",
  "sauron",
  "sherlock",
  "skywalker",
  "spiderman",
  "superman",
  "terminator",
  "thanos",
  "voldemort",
  "yoda"
];

// src/data/ignoreLists/universal/brands.json
var brands_default = [
  "4jstudios",
  "accenture",
  "adidas",
  "armani",
  "audi",
  "balenciaga",
  "bmw",
  "casio",
  "chanel",
  "coca",
  "cocacola",
  "cola",
  "dazs",
  "fanta",
  "ferrari",
  "gucci",
  "honda",
  "hyundai",
  "h\xE4agen",
  "ikea",
  "jeep",
  "kia",
  "kitkat",
  "kodak",
  "lamborghini",
  "lego",
  "lg",
  "louisvuitton",
  "mercedes",
  "mondelez",
  "monsterenergy",
  "nike",
  "nissan",
  "nutella",
  "oreo",
  "pepsi",
  "porsche",
  "prada",
  "puma",
  "redbull",
  "reebok",
  "rolex",
  "samsung",
  "seiko",
  "snickers",
  "spotify",
  "sprite",
  "tcl",
  "tesla",
  "toyota",
  "verizon",
  "versace",
  "volkswagen",
  "volvo",
  "wordpress",
  "zara"
];

// src/data/ignoreLists/universal/cities.json
var cities_default = [
  "amsterdam",
  "athens",
  "bangkok",
  "barcelona",
  "beijing",
  "berlin",
  "budapest",
  "chicago",
  "copenhagen",
  "dubai",
  "dublin",
  "florence",
  "frankfurt",
  "geneva",
  "helsinki",
  "istanbul",
  "jakarta",
  "kyoto",
  "lisbon",
  "london",
  "madrid",
  "miami",
  "milan",
  "moscow",
  "munich",
  "oslo",
  "paris",
  "prague",
  "rome",
  "seoul",
  "seville",
  "shanghai",
  "singapore",
  "stockholm",
  "sydney",
  "tehran",
  "tokyo",
  "toronto",
  "valencia",
  "venice",
  "vienna",
  "warsaw",
  "zurich"
];

// src/data/ignoreLists/universal/names.json
var names_default = [
  "aaden",
  "aaliyah",
  "aarav",
  "aaron",
  "abagail",
  "abbigail",
  "abigail",
  "abigale",
  "abigayle",
  "acey",
  "achsah",
  "acie",
  "acy",
  "adah",
  "adalyn",
  "adalynn",
  "adam",
  "adamaris",
  "addisyn",
  "addyson",
  "adelard",
  "adell",
  "adella",
  "adelle",
  "adelyn",
  "adilene",
  "adison",
  "aditya",
  "adline",
  "adrain",
  "adrian",
  "adrianna",
  "adrianne",
  "adron",
  "adyson",
  "aedan",
  "affie",
  "afton",
  "agness",
  "agusta",
  "agustus",
  "aidyn",
  "ailene",
  "aili",
  "ainsley",
  "aiyana",
  "aja",
  "akeelah",
  "akeem",
  "alaina",
  "alan",
  "alanna",
  "alannah",
  "alanzo",
  "alayna",
  "albert",
  "albertha",
  "alberto",
  "albertus",
  "alby",
  "alcee",
  "alcie",
  "aldona",
  "aleah",
  "alease",
  "alecia",
  "aleck",
  "aleen",
  "aleena",
  "alejandro",
  "alene",
  "alesha",
  "alesia",
  "aletha",
  "alethea",
  "alexande",
  "alexander",
  "alexandr",
  "alexandrea",
  "alexus",
  "alexys",
  "alexzander",
  "alferd",
  "alfie",
  "alfonse",
  "algernon",
  "algot",
  "aliana",
  "alice",
  "alijah",
  "alisson",
  "alivia",
  "aliya",
  "aliza",
  "alize",
  "allean",
  "alleen",
  "allena",
  "allene",
  "alline",
  "allisson",
  "allyn",
  "allyssa",
  "almedia",
  "almer",
  "almina",
  "almira",
  "almon",
  "almus",
  "almyra",
  "alois",
  "aloma",
  "alonso",
  "alonza",
  "aloys",
  "aloysius",
  "alpheus",
  "alphons",
  "alphonsine",
  "alphonsus",
  "altha",
  "altie",
  "alvah",
  "alvan",
  "alvaro",
  "alver",
  "alvera",
  "alverda",
  "alverta",
  "alvia",
  "alvie",
  "alvis",
  "alvy",
  "alwilda",
  "alwin",
  "alwina",
  "alwine",
  "alycia",
  "alys",
  "alysa",
  "alyse",
  "alysha",
  "alysia",
  "alyssia",
  "alyvia",
  "alzina",
  "amanda",
  "amarion",
  "amaris",
  "amaya",
  "amberly",
  "ambers",
  "amelia",
  "amelie",
  "amey",
  "amiah",
  "amirah",
  "amit",
  "amiya",
  "amiyah",
  "amma",
  "ammie",
  "ammon",
  "amon",
  "amy",
  "amya",
  "anabella",
  "anabelle",
  "anahi",
  "anais",
  "anastacia",
  "anastacio",
  "anders",
  "andon",
  "andra",
  "andrae",
  "andrea",
  "andrew",
  "anfernee",
  "angela",
  "angella",
  "anie",
  "anika",
  "aniya",
  "aniyah",
  "anjali",
  "anjanette",
  "anjelica",
  "ann",
  "anna",
  "annabell",
  "annalise",
  "annamae",
  "annamarie",
  "anneliese",
  "annemarie",
  "anner",
  "annetta",
  "annice",
  "annika",
  "annis",
  "ansley",
  "anson",
  "anthoney",
  "anthony",
  "antione",
  "antionette",
  "anton",
  "antonetta",
  "antonette",
  "antonio",
  "antwain",
  "antwon",
  "anwar",
  "anya",
  "aracely",
  "arah",
  "araminta",
  "arbie",
  "ardath",
  "ardelia",
  "ardell",
  "ardella",
  "ardelle",
  "ardeth",
  "ardis",
  "ardith",
  "ardyce",
  "arely",
  "aretha",
  "argie",
  "aric",
  "arie",
  "ariella",
  "arjun",
  "arkie",
  "arla",
  "arlan",
  "arland",
  "arleen",
  "arlen",
  "arleth",
  "arletta",
  "arley",
  "arlie",
  "arlin",
  "arlis",
  "arlo",
  "arly",
  "arlyn",
  "arlyne",
  "arman",
  "arminda",
  "arminta",
  "armond",
  "armstead",
  "arnav",
  "arnett",
  "arrie",
  "artelia",
  "arther",
  "arthor",
  "arthur",
  "artis",
  "arvel",
  "arvid",
  "arvil",
  "arvin",
  "arvo",
  "aryana",
  "aryanna",
  "asberry",
  "asbury",
  "asha",
  "ashby",
  "ashely",
  "asher",
  "ashlea",
  "ashley",
  "ashli",
  "ashlie",
  "ashly",
  "ashlyn",
  "ashlynn",
  "ashton",
  "ashtyn",
  "ason",
  "atha",
  "atticus",
  "attie",
  "aubra",
  "aubree",
  "aubrie",
  "audie",
  "audley",
  "audrey",
  "audriana",
  "audrianna",
  "audrina",
  "audry",
  "audy",
  "aurilla",
  "aurthur",
  "austin",
  "auston",
  "austyn",
  "auther",
  "authur",
  "autry",
  "avah",
  "averi",
  "averie",
  "avie",
  "ayaan",
  "ayana",
  "ayanna",
  "aydan",
  "ayden",
  "aydin",
  "ayesha",
  "ayla",
  "aylin",
  "azalee",
  "azzie",
  "babette",
  "babyboy",
  "bailee",
  "bama",
  "barbara",
  "barnie",
  "bartley",
  "bascom",
  "bayard",
  "baylee",
  "baylie",
  "bea",
  "beadie",
  "beaulah",
  "beckham",
  "beckie",
  "beda",
  "bedford",
  "belen",
  "belia",
  "belton",
  "bena",
  "benard",
  "benjaman",
  "benjamen",
  "benjamin",
  "benjamine",
  "benji",
  "benjiman",
  "benjman",
  "berdie",
  "berkley",
  "bernardine",
  "berneice",
  "bernetta",
  "berniece",
  "bernita",
  "bertina",
  "berton",
  "besse",
  "betha",
  "bethann",
  "bethel",
  "bethzy",
  "betsey",
  "betty",
  "bettyjane",
  "bettylou",
  "beula",
  "bev",
  "beverlee",
  "beyonce",
  "biddie",
  "bieber",
  "billy",
  "billye",
  "bina",
  "birdella",
  "birt",
  "birtha",
  "birtie",
  "bjorn",
  "blain",
  "blanchie",
  "blane",
  "bluford",
  "bobby",
  "bobbye",
  "bolden",
  "boyce",
  "boysie",
  "braden",
  "bradley",
  "bradyn",
  "braeden",
  "braedon",
  "braelyn",
  "braiden",
  "brandan",
  "brandee",
  "brandin",
  "brandon",
  "brandyn",
  "brannon",
  "branson",
  "brantley",
  "brayan",
  "brayden",
  "braydon",
  "braylen",
  "braylon",
  "breana",
  "breann",
  "breanna",
  "breanne",
  "bree",
  "brenda",
  "brenden",
  "brendon",
  "brennen",
  "brennon",
  "breonna",
  "bria",
  "brian",
  "brianda",
  "brianne",
  "brielle",
  "brien",
  "brigette",
  "briley",
  "brinda",
  "brion",
  "brionna",
  "britany",
  "britni",
  "britny",
  "britta",
  "brittaney",
  "brittani",
  "brittanie",
  "brittnay",
  "brittnee",
  "brittni",
  "brittnie",
  "brittny",
  "britton",
  "broderick",
  "brodie",
  "brody",
  "brooklynn",
  "bruce",
  "bryan",
  "bryana",
  "bryanna",
  "brycen",
  "brylee",
  "bryn",
  "brynlee",
  "brynn",
  "bryson",
  "bryton",
  "budd",
  "buddie",
  "buel",
  "buelah",
  "buell",
  "bulah",
  "burdette",
  "buren",
  "burk",
  "burleigh",
  "burley",
  "burnell",
  "burney",
  "burnice",
  "burnie",
  "burrel",
  "burrell",
  "bynum",
  "byrdie",
  "caden",
  "cael",
  "caiden",
  "cailyn",
  "caitlynn",
  "caldonia",
  "caleigh",
  "calista",
  "callum",
  "cami",
  "camila",
  "camisha",
  "cammie",
  "camren",
  "camron",
  "camryn",
  "candis",
  "candyce",
  "cannie",
  "capitola",
  "cappie",
  "carin",
  "carisa",
  "carl",
  "carlee",
  "carleen",
  "carleigh",
  "carleton",
  "carley",
  "carli",
  "carlie",
  "carlos",
  "carlyn",
  "carma",
  "carnell",
  "carolann",
  "carolee",
  "carolyn",
  "carolyne",
  "carolynn",
  "carsen",
  "caryl",
  "caryn",
  "casie",
  "casimer",
  "cason",
  "casper",
  "cass",
  "cassondra",
  "caswell",
  "catharine",
  "catherine",
  "cathern",
  "cathey",
  "cathi",
  "cathie",
  "cathrine",
  "catrina",
  "cayden",
  "cayla",
  "caylee",
  "ceasar",
  "cedrick",
  "ceil",
  "celena",
  "celestia",
  "celestine",
  "ceola",
  "cephus",
  "chace",
  "chadd",
  "chadrick",
  "chaka",
  "chalmer",
  "chalmers",
  "chancey",
  "chanelle",
  "chanie",
  "channie",
  "channing",
  "chante",
  "chantelle",
  "charissa",
  "charisse",
  "charle",
  "charlee",
  "charleen",
  "charles",
  "charlize",
  "charlotta",
  "charlotte",
  "charlottie",
  "charls",
  "charlsie",
  "charlton",
  "charolette",
  "chauncy",
  "chaya",
  "chaz",
  "chelsey",
  "chelsi",
  "chelsie",
  "chelsy",
  "cherelle",
  "cherilyn",
  "cherise",
  "cherrelle",
  "cherri",
  "cherrie",
  "cherryl",
  "cheryl",
  "cheryle",
  "cheryll",
  "chesley",
  "chessie",
  "chestina",
  "chet",
  "cheyanne",
  "chimere",
  "chloie",
  "chrissie",
  "chrissy",
  "christal",
  "christeen",
  "christena",
  "christene",
  "christian",
  "christin",
  "christina",
  "christine",
  "christion",
  "christop",
  "christy",
  "chyna",
  "chynna",
  "ciara",
  "ciarra",
  "cicely",
  "ciera",
  "cierra",
  "ciji",
  "cinda",
  "cindi",
  "cinthia",
  "citlali",
  "citlalli",
  "clabe",
  "claire",
  "clarabelle",
  "clarance",
  "claribel",
  "clarinda",
  "clarnce",
  "classie",
  "claud",
  "clearence",
  "cleda",
  "clell",
  "clella",
  "clemence",
  "clemie",
  "clemma",
  "clemmie",
  "clemon",
  "cleola",
  "cleon",
  "cleone",
  "cleora",
  "cleta",
  "cletus",
  "cleva",
  "cleve",
  "clevie",
  "cliffie",
  "cloe",
  "clora",
  "clotilda",
  "cloyd",
  "clyda",
  "clydie",
  "clytie",
  "coby",
  "codey",
  "codi",
  "codie",
  "coen",
  "coleton",
  "coletta",
  "colie",
  "collette",
  "collis",
  "colten",
  "colter",
  "colton",
  "colvin",
  "conard",
  "conor",
  "consuela",
  "contina",
  "coraima",
  "corbett",
  "cordaro",
  "cordell",
  "cordia",
  "cordie",
  "corean",
  "corene",
  "coretta",
  "corie",
  "corliss",
  "cornel",
  "cornelious",
  "cornie",
  "corry",
  "cortney",
  "courtland",
  "creola",
  "cressie",
  "crissie",
  "crissy",
  "cristen",
  "cristi",
  "cristin",
  "cristobal",
  "cristofer",
  "cristopher",
  "cristy",
  "crysta",
  "curley",
  "curtiss",
  "cydney",
  "cyndi",
  "cyntha",
  "cynthia",
  "dabney",
  "dagny",
  "daija",
  "daijah",
  "daisey",
  "daisha",
  "daisie",
  "daisye",
  "daja",
  "dakoda",
  "dakotah",
  "dallin",
  "dalvin",
  "damarcus",
  "damari",
  "damarion",
  "damaris",
  "dameon",
  "damond",
  "dandre",
  "daneen",
  "danelle",
  "danette",
  "dangelo",
  "dani",
  "dania",
  "danica",
  "daniel",
  "danika",
  "danita",
  "dann",
  "danniel",
  "dannielle",
  "danyel",
  "danyell",
  "danyelle",
  "daquan",
  "darcie",
  "darell",
  "darian",
  "darien",
  "darion",
  "darl",
  "darleen",
  "darline",
  "darlyne",
  "darold",
  "darrian",
  "darrick",
  "darrien",
  "darrion",
  "darrius",
  "darron",
  "darry",
  "darryle",
  "darryll",
  "darryn",
  "darwyn",
  "daryle",
  "daryn",
  "dashawn",
  "dasia",
  "daulton",
  "daunte",
  "davante",
  "davey",
  "davian",
  "david",
  "davie",
  "davin",
  "davion",
  "davon",
  "davonta",
  "davonte",
  "dawna",
  "dawne",
  "daxton",
  "dayami",
  "dayana",
  "dayanara",
  "dayle",
  "dayna",
  "dayne",
  "deandra",
  "deane",
  "deangelo",
  "deante",
  "deasia",
  "debbi",
  "debbra",
  "debera",
  "debi",
  "deborah",
  "deborrah",
  "debra",
  "debrah",
  "debroah",
  "declan",
  "dedra",
  "dedric",
  "dedrick",
  "deeann",
  "deedee",
  "deegan",
  "deetta",
  "deforest",
  "deidra",
  "deion",
  "dejah",
  "dejon",
  "dejuan",
  "delcie",
  "deliah",
  "delina",
  "delinda",
  "delisa",
  "dellar",
  "delle",
  "dellia",
  "dellie",
  "delmas",
  "delmus",
  "delois",
  "delora",
  "delpha",
  "delphia",
  "delphin",
  "delsie",
  "delton",
  "delvin",
  "dema",
  "demarco",
  "demarcus",
  "demario",
  "demarion",
  "demetri",
  "demetric",
  "demetrios",
  "demian",
  "demond",
  "demonte",
  "deneen",
  "denese",
  "denine",
  "denis",
  "denisha",
  "denisse",
  "denita",
  "dennie",
  "dennis",
  "denton",
  "denzel",
  "denzell",
  "denzil",
  "deondre",
  "deonta",
  "deontae",
  "deonte",
  "dequan",
  "derald",
  "dereck",
  "dereon",
  "deric",
  "derik",
  "derl",
  "deron",
  "derrek",
  "derrell",
  "derwin",
  "deryl",
  "desean",
  "deshaun",
  "deshawn",
  "desi",
  "desirae",
  "dessa",
  "destany",
  "destinee",
  "destiney",
  "destini",
  "destry",
  "devan",
  "devante",
  "devaughn",
  "deven",
  "devonta",
  "devontae",
  "devonte",
  "devyn",
  "deward",
  "deyanira",
  "dezzie",
  "diallo",
  "diandra",
  "diane",
  "dicie",
  "dickie",
  "dicy",
  "diego",
  "dillan",
  "dillie",
  "dillion",
  "dimitrios",
  "dionicio",
  "dionte",
  "diya",
  "djuana",
  "djuna",
  "docia",
  "dola",
  "dollye",
  "doloris",
  "dolph",
  "dolphus",
  "domenic",
  "domenick",
  "dominik",
  "dominque",
  "domonique",
  "donal",
  "donald",
  "donat",
  "donavan",
  "donavon",
  "dondre",
  "donell",
  "donie",
  "donita",
  "donna",
  "donta",
  "dontae",
  "dorathea",
  "dorathy",
  "dorene",
  "doretha",
  "dori",
  "doris",
  "dorla",
  "dorman",
  "dorotha",
  "dorothy",
  "dorr",
  "dorris",
  "dortha",
  "dorthea",
  "dorthey",
  "dosha",
  "doshia",
  "doshie",
  "dosia",
  "dossie",
  "dottie",
  "douglas",
  "dovie",
  "dozier",
  "draven",
  "drema",
  "drucilla",
  "drury",
  "duard",
  "durell",
  "durrell",
  "durward",
  "durwood",
  "dustan",
  "duwayne",
  "dwain",
  "dwaine",
  "dwan",
  "dwane",
  "dwyane",
  "dyan",
  "dylan",
  "dyllan",
  "dylon",
  "ean",
  "earlean",
  "earley",
  "earlie",
  "eartha",
  "easton",
  "eathel",
  "ebba",
  "ebbie",
  "ebenezer",
  "eboni",
  "eda",
  "edd",
  "edie",
  "edla",
  "edmon",
  "edmonia",
  "ednah",
  "edra",
  "edrie",
  "edris",
  "eduardo",
  "edw",
  "edward",
  "edyth",
  "edythe",
  "effa",
  "egbert",
  "einar",
  "eino",
  "eithel",
  "ela",
  "elaina",
  "elana",
  "elayne",
  "elberta",
  "elbridge",
  "elby",
  "elden",
  "eldora",
  "eldred",
  "eldridge",
  "eleanora",
  "eleanore",
  "elease",
  "electa",
  "elena",
  "elenor",
  "elenora",
  "elenore",
  "elex",
  "elfie",
  "elfrieda",
  "elgie",
  "elgin",
  "elian",
  "elianna",
  "elick",
  "elida",
  "elie",
  "eliga",
  "eligah",
  "elige",
  "elihu",
  "elinore",
  "elizabet",
  "elizabeth",
  "elizah",
  "elizbeth",
  "elizebeth",
  "ellamae",
  "ellar",
  "eller",
  "ellery",
  "elliana",
  "ellsworth",
  "ellwood",
  "ellyn",
  "elmina",
  "elmira",
  "elmire",
  "elmore",
  "elmyra",
  "elna",
  "elodie",
  "elois",
  "elon",
  "elonzo",
  "elouise",
  "elsworth",
  "elta",
  "elvera",
  "elvie",
  "elwanda",
  "elwin",
  "elwyn",
  "ely",
  "elyse",
  "elyssa",
  "elzada",
  "elzie",
  "elzy",
  "ema",
  "emaline",
  "emelie",
  "emeline",
  "emely",
  "emett",
  "emilee",
  "emiliano",
  "emilie",
  "emily",
  "emma",
  "emmalee",
  "emmaline",
  "emmer",
  "emmet",
  "emmie",
  "emmit",
  "emmitt",
  "emmons",
  "emogene",
  "emry",
  "ennis",
  "enola",
  "enrique",
  "eola",
  "ephram",
  "ephriam",
  "eppie",
  "epsie",
  "erastus",
  "erby",
  "eric",
  "erla",
  "erland",
  "erle",
  "erlene",
  "erline",
  "erling",
  "ermina",
  "erving",
  "erykah",
  "eryn",
  "esequiel",
  "esker",
  "esley",
  "essa",
  "estefani",
  "estefania",
  "estefany",
  "estel",
  "estell",
  "estevan",
  "estie",
  "estill",
  "eston",
  "etha",
  "ethan",
  "ethelbert",
  "ethelene",
  "ethelyn",
  "ethen",
  "ethie",
  "ethyle",
  "etter",
  "ettie",
  "eudora",
  "eugene",
  "eulah",
  "euna",
  "euphemia",
  "eura",
  "eustace",
  "evalena",
  "evalyn",
  "evander",
  "evelena",
  "evelin",
  "evelyn",
  "evelyne",
  "everet",
  "evertt",
  "evette",
  "evia",
  "evie",
  "evon",
  "evonne",
  "ewald",
  "ewart",
  "ewell",
  "ewin",
  "exie",
  "ezell",
  "ezzard",
  "fae",
  "falon",
  "fannye",
  "faron",
  "farrah",
  "farris",
  "felicie",
  "felicitas",
  "felipa",
  "felisha",
  "felton",
  "ferd",
  "ferman",
  "fernando",
  "ferne",
  "festus",
  "fidencio",
  "fitzhugh",
  "fleda",
  "fleeta",
  "flem",
  "flonnie",
  "florance",
  "florene",
  "floretta",
  "florrie",
  "floy",
  "foy",
  "frances",
  "francies",
  "francina",
  "francisco",
  "francisqui",
  "franklin",
  "franklyn",
  "frederick",
  "fredericka",
  "fredie",
  "fredy",
  "freeda",
  "frona",
  "fronia",
  "fronie",
  "fronnie",
  "fumiko",
  "furman",
  "gabriel",
  "gabriella",
  "gaige",
  "gaither",
  "gannon",
  "garett",
  "garey",
  "garnett",
  "garold",
  "garvin",
  "gary",
  "gasper",
  "gaven",
  "gavyn",
  "gaye",
  "gayla",
  "gaylen",
  "gaylene",
  "gaylon",
  "gaylord",
  "gaynell",
  "gearld",
  "gearldine",
  "geary",
  "genevra",
  "gennie",
  "georganna",
  "george",
  "georgeann",
  "georgeanna",
  "georgetta",
  "georgiana",
  "georgiann",
  "georgianna",
  "georgie",
  "geovanni",
  "gerald",
  "geralyn",
  "gerhardt",
  "geri",
  "gerold",
  "gerri",
  "gerrit",
  "gertha",
  "gertie",
  "giana",
  "gianna",
  "gidget",
  "gifford",
  "gigi",
  "gilford",
  "gilman",
  "gilmer",
  "giovani",
  "giovanny",
  "girtha",
  "gisselle",
  "gladis",
  "gladyce",
  "glendon",
  "glendora",
  "glennie",
  "glennis",
  "glenwood",
  "glinda",
  "glynda",
  "glynis",
  "glynn",
  "godfrey",
  "goebel",
  "goldia",
  "gonzalo",
  "gorden",
  "gottlieb",
  "gracelyn",
  "grayce",
  "graydon",
  "grayling",
  "grayson",
  "greggory",
  "gregory",
  "gretta",
  "greyson",
  "grisel",
  "guilford",
  "guillermo",
  "gunda",
  "gunnar",
  "guss",
  "gussie",
  "gusta",
  "gustaf",
  "gustie",
  "gwenda",
  "hadassah",
  "haden",
  "hadley",
  "haiden",
  "hailee",
  "hailey",
  "hailie",
  "hakeem",
  "halbert",
  "haleigh",
  "halie",
  "hamp",
  "hannah",
  "hansford",
  "hardie",
  "harl",
  "harland",
  "harlen",
  "harlene",
  "harlie",
  "harlon",
  "harman",
  "harold",
  "harper",
  "harrie",
  "harriette",
  "harrold",
  "hartley",
  "hartwell",
  "haruko",
  "harve",
  "harvie",
  "harvy",
  "hasan",
  "hasel",
  "hassie",
  "haylee",
  "hayleigh",
  "hayley",
  "haylie",
  "hazelle",
  "hazen",
  "heather",
  "heber",
  "hedwig",
  "hedy",
  "heidy",
  "helen",
  "hellen",
  "helmer",
  "helyn",
  "henery",
  "hennie",
  "henretta",
  "henry",
  "hermina",
  "hermon",
  "hernan",
  "hershell",
  "hertha",
  "hervey",
  "hessie",
  "hetty",
  "heyward",
  "hezzie",
  "hilah",
  "hildegard",
  "hildred",
  "hildur",
  "hillard",
  "hillery",
  "hilliard",
  "hilma",
  "hilmer",
  "hjalmar",
  "hjalmer",
  "hobert",
  "hobson",
  "holli",
  "honora",
  "hortencia",
  "hosie",
  "hosteen",
  "hoyt",
  "hughey",
  "hughie",
  "huldah",
  "hurbert",
  "hyman",
  "hyrum",
  "icey",
  "icie",
  "idabelle",
  "idamae",
  "idell",
  "idella",
  "iesha",
  "ieshia",
  "ignacio",
  "ignatz",
  "ilah",
  "illa",
  "illya",
  "imani",
  "imanol",
  "inell",
  "ingeborg",
  "inger",
  "iola",
  "iona",
  "iridian",
  "irine",
  "irva",
  "irven",
  "isaak",
  "isabell",
  "isabella",
  "isadore",
  "isai",
  "isaias",
  "isam",
  "ishaan",
  "isham",
  "isidor",
  "isom",
  "isreal",
  "ivah",
  "ivan",
  "iver",
  "iverson",
  "ivey",
  "ivie",
  "ivor",
  "iyana",
  "iyanna",
  "izabella",
  "izabelle",
  "izaiah",
  "izayah",
  "izetta",
  "izola",
  "izora",
  "jabbar",
  "jabez",
  "jacalyn",
  "jace",
  "jacey",
  "jacki",
  "jacob",
  "jacoby",
  "jacque",
  "jacquelin",
  "jacqueline",
  "jacquelynn",
  "jacquline",
  "jacqulyn",
  "jada",
  "jaden",
  "jadon",
  "jadyn",
  "jaeda",
  "jaeden",
  "jaelyn",
  "jaelynn",
  "jaheem",
  "jaheim",
  "jahiem",
  "jahir",
  "jaida",
  "jaiden",
  "jaidyn",
  "jailene",
  "jailyn",
  "jaimee",
  "jaimie",
  "jajuan",
  "jakayla",
  "jakob",
  "jakobe",
  "jaleel",
  "jaleesa",
  "jalen",
  "jalisa",
  "jalissa",
  "jaliyah",
  "jalyn",
  "jalynn",
  "jamarcus",
  "jamarion",
  "jameel",
  "james",
  "jameson",
  "jamey",
  "jamin",
  "jamison",
  "jamiya",
  "jammie",
  "jamya",
  "janae",
  "janay",
  "janeen",
  "janel",
  "janene",
  "janessa",
  "janet",
  "janey",
  "janiah",
  "janice",
  "janiya",
  "janiyah",
  "jann",
  "jannette",
  "janyce",
  "jaquan",
  "jaquelin",
  "jaquez",
  "jarad",
  "jaren",
  "jaret",
  "jarett",
  "jarod",
  "jaron",
  "jarrad",
  "jarrell",
  "jase",
  "jasen",
  "jasiah",
  "jaslene",
  "jaslyn",
  "jasmyn",
  "jasmyne",
  "jason",
  "javen",
  "javier",
  "javion",
  "javon",
  "javonte",
  "jax",
  "jaxon",
  "jaxson",
  "jayce",
  "jaycie",
  "jayda",
  "jaydan",
  "jayde",
  "jayden",
  "jaydin",
  "jaydon",
  "jaye",
  "jayla",
  "jaylah",
  "jaylan",
  "jaylee",
  "jayleen",
  "jaylen",
  "jaylene",
  "jaylin",
  "jaylon",
  "jaylyn",
  "jaylynn",
  "jaymes",
  "jayvion",
  "jayvon",
  "jazlene",
  "jazlyn",
  "jazlynn",
  "jazmin",
  "jazmine",
  "jazmyn",
  "jazmyne",
  "jean",
  "jeana",
  "jeane",
  "jeanetta",
  "jeanmarie",
  "jeanna",
  "jeb",
  "jedediah",
  "jedidiah",
  "jeffie",
  "jeffrey",
  "jelani",
  "jena",
  "jenelle",
  "jenilee",
  "jennette",
  "jenni",
  "jennifer",
  "jenniffer",
  "jep",
  "jeptha",
  "jerad",
  "jeraldine",
  "jeramiah",
  "jeramie",
  "jeramy",
  "jere",
  "jered",
  "jerel",
  "jereme",
  "jeremey",
  "jeremie",
  "jeremy",
  "jerica",
  "jerilyn",
  "jerilynn",
  "jerimiah",
  "jerimy",
  "jermain",
  "jermey",
  "jerod",
  "jeromy",
  "jerrad",
  "jerrel",
  "jerrell",
  "jerrica",
  "jerrie",
  "jerrilyn",
  "jerry",
  "jerusha",
  "jeryl",
  "jesenia",
  "jesica",
  "jesse",
  "jessee",
  "jessenia",
  "jessi",
  "jessica",
  "jessika",
  "jessye",
  "jethro",
  "jett",
  "jetta",
  "jettie",
  "jevon",
  "jiles",
  "jimena",
  "jinnie",
  "joan",
  "joana",
  "joaquin",
  "jobe",
  "jocelynn",
  "joe",
  "joell",
  "joella",
  "joelle",
  "joellen",
  "joeseph",
  "joetta",
  "joette",
  "johana",
  "johannah",
  "johathan",
  "john",
  "johney",
  "johnna",
  "johnny",
  "johnpaul",
  "johny",
  "joi",
  "joleen",
  "jolette",
  "jolie",
  "joline",
  "jonatan",
  "jonathan",
  "jonell",
  "jonna",
  "jonnie",
  "jordan",
  "jorden",
  "jordin",
  "jordon",
  "jordy",
  "jordyn",
  "joretta",
  "jorge",
  "jorja",
  "jory",
  "jose",
  "joselin",
  "joseluis",
  "joselyn",
  "joseph",
  "joshua",
  "joshuah",
  "josiephine",
  "joslyn",
  "jossie",
  "jovan",
  "jovani",
  "jovanni",
  "jovanny",
  "jovany",
  "joyce",
  "joycelyn",
  "joye",
  "juan",
  "judi",
  "judie",
  "judith",
  "judy",
  "judyth",
  "julia",
  "juliann",
  "julie",
  "julious",
  "julisa",
  "julissa",
  "juluis",
  "junia",
  "junie",
  "junious",
  "junius",
  "justen",
  "justin",
  "justina",
  "juston",
  "justus",
  "justyn",
  "juwan",
  "kaaren",
  "kaci",
  "kacie",
  "kacy",
  "kade",
  "kadeem",
  "kaden",
  "kadence",
  "kadijah",
  "kadin",
  "kadyn",
  "kaeden",
  "kael",
  "kaela",
  "kaelyn",
  "kahlil",
  "kai",
  "kaia",
  "kaiden",
  "kaila",
  "kailee",
  "kailey",
  "kailyn",
  "kaitlynn",
  "kaiya",
  "kala",
  "kaleb",
  "kaleena",
  "kaleigh",
  "kalen",
  "kalene",
  "kaley",
  "kalie",
  "kaliyah",
  "kallie",
  "kalvin",
  "kalyn",
  "kamari",
  "kamden",
  "kameron",
  "kamila",
  "kamilah",
  "kamora",
  "kamren",
  "kamron",
  "kamryn",
  "kandace",
  "kandi",
  "kandice",
  "kandy",
  "kanesha",
  "kanisha",
  "kanye",
  "karan",
  "kareen",
  "karen",
  "karie",
  "karis",
  "karissa",
  "karlee",
  "karlene",
  "karley",
  "karli",
  "karlie",
  "karly",
  "karolyn",
  "karon",
  "karren",
  "karri",
  "karrie",
  "karson",
  "karsyn",
  "karter",
  "karyl",
  "karyme",
  "kasandra",
  "kasen",
  "kash",
  "kasie",
  "kason",
  "kassandra",
  "kassidy",
  "kassie",
  "katarina",
  "katelin",
  "katelynn",
  "katerina",
  "kathaleen",
  "katharina",
  "katharyn",
  "katherin",
  "katherine",
  "kathern",
  "kathey",
  "kathi",
  "kathleen",
  "kathlene",
  "kathlyn",
  "kathryn",
  "kathryne",
  "kathyrn",
  "kati",
  "katlin",
  "katlyn",
  "katlynn",
  "kattie",
  "kavon",
  "kaya",
  "kaycee",
  "kayden",
  "kaydence",
  "kaylah",
  "kaylan",
  "kayleigh",
  "kaylen",
  "kaylene",
  "kayley",
  "kayli",
  "kaylie",
  "kaylin",
  "kaylyn",
  "kaylynn",
  "kazuko",
  "kazuo",
  "keagan",
  "keandre",
  "keanna",
  "keano",
  "keanu",
  "keara",
  "kecia",
  "keegan",
  "keeley",
  "keely",
  "keena",
  "keenen",
  "keesha",
  "kegan",
  "keifer",
  "keila",
  "keion",
  "keith",
  "kelan",
  "kelby",
  "kelcie",
  "keli",
  "kelis",
  "kellan",
  "kellee",
  "kellen",
  "kelly",
  "kelsea",
  "kelsi",
  "kelsie",
  "kelton",
  "kem",
  "kenan",
  "kendal",
  "kendell",
  "kenisha",
  "kenji",
  "kenley",
  "kenna",
  "kennard",
  "kennedi",
  "kenneth",
  "kenney",
  "kennth",
  "kenzie",
  "keon",
  "kerwin",
  "kesha",
  "keshaun",
  "keshawn",
  "keshia",
  "kevan",
  "kevin",
  "kevon",
  "keyla",
  "keyon",
  "keyshawn",
  "khadijah",
  "khalilah",
  "khari",
  "khiry",
  "khloe",
  "kian",
  "kiana",
  "kianna",
  "kiara",
  "kiarra",
  "kiefer",
  "kieran",
  "kierra",
  "kiersten",
  "kiley",
  "kimball",
  "kimber",
  "kimberely",
  "kimberlee",
  "kimberli",
  "kimberlie",
  "kimberly",
  "kimora",
  "kindra",
  "kinley",
  "kinsley",
  "kinte",
  "kipp",
  "kirstie",
  "kirstin",
  "kirt",
  "kisha",
  "kittie",
  "kiya",
  "kiyoko",
  "kiyoshi",
  "kizzie",
  "kizzy",
  "knute",
  "koby",
  "koda",
  "kody",
  "koen",
  "kolby",
  "kole",
  "kolten",
  "kolton",
  "konner",
  "konnor",
  "korbin",
  "kordell",
  "korey",
  "kori",
  "kortney",
  "kourtney",
  "kraig",
  "krish",
  "krissy",
  "kristal",
  "kristan",
  "kristian",
  "kristofer",
  "kristyn",
  "krysta",
  "krysten",
  "krystin",
  "krystina",
  "krystle",
  "kunta",
  "kwame",
  "kya",
  "kyan",
  "kyara",
  "kyla",
  "kylah",
  "kylan",
  "kyle",
  "kylee",
  "kyleigh",
  "kylene",
  "kyler",
  "kymani",
  "kyra",
  "kyree",
  "kyson",
  "laci",
  "lacie",
  "ladarius",
  "lafe",
  "lahoma",
  "lailah",
  "lainey",
  "laisha",
  "laken",
  "lakendra",
  "lakesha",
  "lakeshia",
  "lalla",
  "lamarcus",
  "lamonte",
  "landan",
  "landin",
  "landyn",
  "lanette",
  "laney",
  "lani",
  "lanie",
  "lanita",
  "lannie",
  "laquan",
  "laquita",
  "larae",
  "laraine",
  "larkin",
  "laron",
  "larry",
  "larue",
  "lary",
  "lashanda",
  "lashawn",
  "lashonda",
  "lashunda",
  "lasonya",
  "latanya",
  "latarsha",
  "latesha",
  "latifah",
  "latonia",
  "latoria",
  "latosha",
  "latoyia",
  "latrell",
  "latricia",
  "laura",
  "laurance",
  "lauren",
  "laurene",
  "lauryn",
  "lavelle",
  "lavenia",
  "lavera",
  "laverna",
  "lavon",
  "lavona",
  "lavonda",
  "lavonia",
  "lawerence",
  "lawrance",
  "lawrence",
  "lawton",
  "laylah",
  "layne",
  "layton",
  "leala",
  "leamon",
  "leaner",
  "leatha",
  "leatrice",
  "leeann",
  "leeroy",
  "leesa",
  "leia",
  "leighton",
  "leilani",
  "leisa",
  "leisha",
  "leitha",
  "lelah",
  "lelar",
  "lem",
  "lemmie",
  "lempi",
  "lennie",
  "lenon",
  "lenord",
  "lenwood",
  "leoma",
  "leonce",
  "leonie",
  "leonore",
  "leontine",
  "leora",
  "leota",
  "lesia",
  "leslee",
  "lesli",
  "lesly",
  "lesta",
  "lethia",
  "letta",
  "lettie",
  "letty",
  "levern",
  "levie",
  "levin",
  "levina",
  "levon",
  "lexi",
  "libbie",
  "lida",
  "liddie",
  "lidie",
  "lilah",
  "lilburn",
  "lilianna",
  "lilie",
  "lillard",
  "liller",
  "lillia",
  "lilliana",
  "lillianna",
  "lillis",
  "lilyan",
  "lilyana",
  "lim",
  "linda",
  "lindell",
  "linn",
  "linna",
  "linnea",
  "linnie",
  "linsey",
  "linzy",
  "lisa",
  "lish",
  "lisha",
  "lissette",
  "lissie",
  "lita",
  "litha",
  "littie",
  "littleton",
  "litzy",
  "lizabeth",
  "lizeth",
  "lizette",
  "lockie",
  "loda",
  "logan",
  "lollie",
  "londyn",
  "loney",
  "loni",
  "lonie",
  "lonna",
  "lonny",
  "lonzo",
  "lorayne",
  "lorean",
  "loree",
  "loreen",
  "lorelai",
  "loretto",
  "loria",
  "loriann",
  "lorin",
  "lorine",
  "loring",
  "lorne",
  "lorrayne",
  "lorri",
  "lossie",
  "lotta",
  "louann",
  "louanna",
  "louetta",
  "louis",
  "loula",
  "louvenia",
  "lovell",
  "lovett",
  "lovie",
  "lovina",
  "lovisa",
  "loy",
  "loyce",
  "luanne",
  "luberta",
  "lucas",
  "luciano",
  "lucindy",
  "lucious",
  "luda",
  "ludie",
  "lue",
  "luetta",
  "lugenia",
  "luis",
  "lulah",
  "lular",
  "lulie",
  "lulla",
  "lum",
  "lura",
  "lurana",
  "lurena",
  "lurline",
  "lutie",
  "luvenia",
  "luverne",
  "luvinia",
  "lyda",
  "lydell",
  "lyla",
  "lyn",
  "lyndia",
  "lyndsay",
  "lyndsey",
  "lynsey",
  "lynwood",
  "mabell",
  "mabelle",
  "macel",
  "macey",
  "machelle",
  "maci",
  "macie",
  "madaline",
  "madalyn",
  "madalynn",
  "maddison",
  "madelene",
  "madelynn",
  "madie",
  "madilyn",
  "madilynn",
  "madisen",
  "madison",
  "madisyn",
  "madlyn",
  "madora",
  "madyson",
  "maebell",
  "maebelle",
  "maegan",
  "maeve",
  "magan",
  "magdalen",
  "magen",
  "mahala",
  "mahalia",
  "mahalie",
  "mahlon",
  "maia",
  "maira",
  "maiya",
  "makai",
  "makaila",
  "makala",
  "makayla",
  "makena",
  "makenna",
  "makenzie",
  "makhi",
  "malakai",
  "malaki",
  "malcom",
  "maleah",
  "malissa",
  "malissie",
  "maliyah",
  "mallie",
  "mallorie",
  "malorie",
  "malvin",
  "mammie",
  "mandie",
  "manerva",
  "manervia",
  "manford",
  "mannie",
  "manuel",
  "manuelita",
  "maralyn",
  "maranda",
  "marcelina",
  "marcellus",
  "marchello",
  "mardell",
  "mareli",
  "marely",
  "maren",
  "margaret",
  "margaretha",
  "margarett",
  "margaretta",
  "margarette",
  "margene",
  "margeret",
  "marget",
  "margrett",
  "margretta",
  "margueritta",
  "margurite",
  "margy",
  "maria",
  "mariah",
  "marianita",
  "mariann",
  "maribeth",
  "marilee",
  "marilla",
  "marilynn",
  "marinda",
  "mario",
  "marisela",
  "mariyah",
  "markel",
  "markell",
  "markita",
  "markus",
  "marlana",
  "marland",
  "marlee",
  "marleen",
  "marlen",
  "marlena",
  "marlie",
  "marlo",
  "marlyn",
  "marlys",
  "marni",
  "marnita",
  "marolyn",
  "marrion",
  "martell",
  "martez",
  "martha",
  "marti",
  "martika",
  "mary",
  "marybelle",
  "marybeth",
  "maryjane",
  "maryjo",
  "marylee",
  "marylin",
  "marylouise",
  "marylyn",
  "masako",
  "masao",
  "mateo",
  "matias",
  "matie",
  "matthew",
  "mattye",
  "maudie",
  "maury",
  "maxie",
  "maxim",
  "maximillian",
  "maximo",
  "maximus",
  "maya",
  "maybell",
  "maybelle",
  "mayme",
  "maymie",
  "mazie",
  "mcarthur",
  "mckayla",
  "meaghan",
  "mearl",
  "mechelle",
  "medora",
  "megan",
  "meggan",
  "meghann",
  "mekhi",
  "melany",
  "melissa",
  "melissia",
  "mell",
  "mellie",
  "mellisa",
  "mellissa",
  "melodee",
  "melodie",
  "melonie",
  "melony",
  "melvina",
  "melvyn",
  "menachem",
  "mendy",
  "merilyn",
  "merl",
  "merlene",
  "merlyn",
  "merna",
  "merri",
  "merrie",
  "merrilee",
  "mertie",
  "mervyn",
  "merwin",
  "metha",
  "metta",
  "mettie",
  "mia",
  "miah",
  "micayla",
  "michael",
  "michaela",
  "michaele",
  "michal",
  "michale",
  "michell",
  "michelle",
  "michial",
  "miesha",
  "migdalia",
  "miguel",
  "miguelangel",
  "mikaela",
  "mikaila",
  "mikal",
  "mikala",
  "mikalah",
  "mikayla",
  "mikeal",
  "mikel",
  "mikhail",
  "milas",
  "milburn",
  "milda",
  "miley",
  "milissa",
  "milly",
  "mima",
  "mindi",
  "minervia",
  "minna",
  "minta",
  "mintie",
  "mireya",
  "miriah",
  "mirtie",
  "missie",
  "misti",
  "mistie",
  "mittie",
  "miya",
  "moesha",
  "monika",
  "monnie",
  "monserrat",
  "montie",
  "montrell",
  "mordechai",
  "moriah",
  "mose",
  "moshe",
  "mossie",
  "mozell",
  "mozella",
  "mozelle",
  "murdock",
  "murl",
  "murry",
  "mya",
  "myah",
  "mychal",
  "myer",
  "mykel",
  "myla",
  "mylee",
  "mylie",
  "myranda",
  "myrl",
  "myrle",
  "myrta",
  "myrtice",
  "myrtie",
  "myrtis",
  "naima",
  "najee",
  "nakia",
  "nakisha",
  "nakita",
  "nallely",
  "namon",
  "nancie",
  "nancy",
  "nanie",
  "nannette",
  "naoma",
  "naomi",
  "natalee",
  "natalya",
  "nathalia",
  "nathaly",
  "nathan",
  "nathanael",
  "nathanial",
  "nathen",
  "natosha",
  "nautica",
  "nayeli",
  "nayely",
  "nealie",
  "nealy",
  "nedra",
  "needham",
  "neely",
  "neha",
  "nelia",
  "nelie",
  "nelle",
  "nels",
  "neola",
  "neoma",
  "neppie",
  "nery",
  "neta",
  "netta",
  "nevaeh",
  "neveah",
  "nevin",
  "newell",
  "nia",
  "nichelle",
  "nichol",
  "nicholas",
  "nicholaus",
  "nicki",
  "nicolas",
  "nicole",
  "nicolle",
  "nikhil",
  "niki",
  "nikia",
  "nikko",
  "niko",
  "nikolai",
  "nikolas",
  "nikole",
  "nila",
  "nilda",
  "niles",
  "ninnie",
  "nira",
  "noah",
  "nobie",
  "noemie",
  "nohely",
  "nolen",
  "nolia",
  "nolie",
  "nonie",
  "norah",
  "norene",
  "noreta",
  "noretta",
  "norine",
  "norita",
  "norval",
  "norwood",
  "nya",
  "nyah",
  "nyasia",
  "nyla",
  "nylah",
  "nyree",
  "obe",
  "obie",
  "ocie",
  "octavie",
  "odalis",
  "odalys",
  "oddie",
  "odelia",
  "odie",
  "odus",
  "offie",
  "okey",
  "olan",
  "oland",
  "olar",
  "olena",
  "olene",
  "oleta",
  "olevia",
  "oley",
  "olie",
  "oline",
  "olivia",
  "olof",
  "oma",
  "omari",
  "omarion",
  "omer",
  "omie",
  "ona",
  "oney",
  "onie",
  "onnie",
  "opha",
  "orah",
  "oralia",
  "orelia",
  "orene",
  "orie",
  "oris",
  "orland",
  "orlena",
  "orley",
  "orlin",
  "orlo",
  "orpha",
  "orra",
  "orren",
  "orrie",
  "orrin",
  "orvel",
  "orvil",
  "orvin",
  "orvis",
  "osbaldo",
  "oscar",
  "osie",
  "ossie",
  "otelia",
  "otha",
  "othel",
  "otho",
  "ott",
  "ottie",
  "ottis",
  "ouida",
  "ovila",
  "ozell",
  "ozie",
  "pablo",
  "pairlee",
  "paityn",
  "pallie",
  "pamala",
  "pamela",
  "pamelia",
  "pamella",
  "paralee",
  "parlee",
  "parthenia",
  "patric",
  "patrick",
  "paul",
  "pauletta",
  "paxton",
  "payten",
  "payton",
  "pearla",
  "pearle",
  "pearlene",
  "pearley",
  "pearline",
  "peggie",
  "penni",
  "perley",
  "permelia",
  "pernell",
  "perri",
  "peter",
  "peyton",
  "phebe",
  "pheobe",
  "philip",
  "phillis",
  "philomena",
  "philomene",
  "phylicia",
  "phylis",
  "phyliss",
  "pinkey",
  "pinkney",
  "pleas",
  "ples",
  "pollie",
  "porsha",
  "posey",
  "pranav",
  "prentiss",
  "pricilla",
  "prudie",
  "qiana",
  "queenie",
  "quiana",
  "quinten",
  "quintin",
  "racheal",
  "rachel",
  "racquel",
  "raegan",
  "raekwon",
  "raelynn",
  "rafael",
  "ragna",
  "raheem",
  "rahn",
  "rahsaan",
  "rahul",
  "raiden",
  "raina",
  "rakeem",
  "ralph",
  "randel",
  "randle",
  "randolf",
  "randy",
  "raquan",
  "rashaad",
  "rashaan",
  "rashad",
  "rashawn",
  "rasheed",
  "rashida",
  "raul",
  "rayfield",
  "rayford",
  "raymon",
  "raymond",
  "rayna",
  "raynard",
  "rayne",
  "rayshawn",
  "reanna",
  "reatha",
  "rebecca",
  "reece",
  "regan",
  "regena",
  "regenia",
  "reginal",
  "rella",
  "renada",
  "renae",
  "renea",
  "renita",
  "rennie",
  "ressie",
  "reta",
  "retha",
  "retta",
  "rettie",
  "reubin",
  "rexford",
  "reynold",
  "rheta",
  "rhett",
  "rhianna",
  "rhona",
  "rhys",
  "rian",
  "rianna",
  "richard",
  "richelle",
  "ricki",
  "rihanna",
  "rikki",
  "rilla",
  "rillie",
  "rinda",
  "rishi",
  "riya",
  "robb",
  "robert",
  "robley",
  "roby",
  "roddy",
  "roderic",
  "rodolfina",
  "rodolfito",
  "rodrigo",
  "roena",
  "roger",
  "rolanda",
  "rolf",
  "rollie",
  "rollin",
  "romello",
  "romie",
  "romona",
  "rona",
  "ronal",
  "ronald",
  "rondal",
  "ronin",
  "ronna",
  "rosabelle",
  "rosalee",
  "rosamond",
  "rosann",
  "rosco",
  "roseanna",
  "roseanne",
  "roselyn",
  "rosena",
  "rosevelt",
  "rosey",
  "rosia",
  "rossie",
  "roxann",
  "roxanna",
  "roy",
  "rozanne",
  "rozella",
  "ruben",
  "rubie",
  "rubye",
  "rueben",
  "ruel",
  "ruffin",
  "ruffus",
  "ruie",
  "russell",
  "rustin",
  "ruth",
  "rutha",
  "ruthann",
  "ruthanne",
  "ruthe",
  "ryan",
  "ryann",
  "ryker",
  "rylan",
  "ryland",
  "rylee",
  "ryleigh",
  "ryley",
  "rylie",
  "ryne",
  "sabastian",
  "sada",
  "sadie",
  "sadye",
  "saige",
  "salena",
  "sam",
  "samantha",
  "samatha",
  "samie",
  "samual",
  "samuel",
  "sanai",
  "sandi",
  "sandie",
  "sandra",
  "saniya",
  "saniyah",
  "sanjuanita",
  "sannie",
  "santiago",
  "sara",
  "sarah",
  "sarahi",
  "sariah",
  "sarrah",
  "savanah",
  "savilla",
  "savion",
  "schley",
  "scott",
  "scotty",
  "seaborn",
  "sean",
  "sebastian",
  "sebrina",
  "sedrick",
  "selah",
  "seldon",
  "selmer",
  "semaj",
  "sergio",
  "severt",
  "shae",
  "shafter",
  "shaina",
  "shalon",
  "shalonda",
  "shamar",
  "shameka",
  "shamika",
  "shan",
  "shanae",
  "shanda",
  "shandra",
  "shaneka",
  "shanell",
  "shanelle",
  "shanequa",
  "shani",
  "shania",
  "shanice",
  "shaniece",
  "shanika",
  "shaniqua",
  "shanita",
  "shaniya",
  "shannan",
  "shannen",
  "shanon",
  "shanta",
  "shante",
  "shantel",
  "shantell",
  "shaquan",
  "shaquana",
  "shaquille",
  "shaquita",
  "shara",
  "shardae",
  "sharday",
  "sharde",
  "sharee",
  "sharen",
  "sharita",
  "sharla",
  "sharleen",
  "sharman",
  "sharon",
  "sharonda",
  "sharyl",
  "sharyn",
  "shatara",
  "shaunna",
  "shavon",
  "shavonne",
  "shawanda",
  "shawnda",
  "shawnna",
  "shawnte",
  "shayla",
  "shaylee",
  "shayna",
  "shayne",
  "shedrick",
  "sheilah",
  "shelba",
  "shelbi",
  "shelbie",
  "shelli",
  "shellie",
  "shelva",
  "shelvia",
  "shelvie",
  "shemar",
  "shena",
  "shenna",
  "shep",
  "sherie",
  "sherilyn",
  "sherita",
  "sherlyn",
  "sheron",
  "sherree",
  "sherrill",
  "sherron",
  "sherryl",
  "sherwin",
  "sheryll",
  "sheyla",
  "shianne",
  "shiela",
  "shira",
  "shirl",
  "shirlee",
  "shirleen",
  "shirlene",
  "shirley",
  "shirleyann",
  "shirlie",
  "shoji",
  "shon",
  "shonda",
  "shonna",
  "shreya",
  "shyann",
  "shyanne",
  "shyheim",
  "shyla",
  "sibbie",
  "siddie",
  "sie",
  "sigrid",
  "silvester",
  "simeon",
  "simmie",
  "sinda",
  "skyla",
  "skylar",
  "skyler",
  "slade",
  "soloman",
  "somer",
  "sonji",
  "sophia",
  "sophronia",
  "spurgeon",
  "stacia",
  "stanislaus",
  "starla",
  "stasia",
  "stefani",
  "stephaine",
  "stephani",
  "stephania",
  "stephanie",
  "stephany",
  "stephen",
  "stephenie",
  "stephon",
  "stevan",
  "stoney",
  "sudie",
  "suellen",
  "susan",
  "susann",
  "sussie",
  "suzan",
  "suzann",
  "suzanna",
  "suzie",
  "sybilla",
  "syble",
  "sydell",
  "sydnee",
  "sydni",
  "sydnie",
  "syed",
  "sylva",
  "sylvania",
  "sylvanus",
  "symone",
  "syreeta",
  "tabetha",
  "tahj",
  "takisha",
  "talan",
  "talen",
  "taliyah",
  "tallie",
  "talmadge",
  "talmage",
  "tamala",
  "tamatha",
  "tambra",
  "tamekia",
  "tamela",
  "tamica",
  "tamie",
  "tamiko",
  "tamisha",
  "tamya",
  "tandy",
  "tanesha",
  "tangela",
  "tanika",
  "taniya",
  "taniyah",
  "tanja",
  "tarah",
  "tariq",
  "tarsha",
  "taryn",
  "tashina",
  "tasia",
  "tatia",
  "tatianna",
  "tatsuo",
  "tatyana",
  "tatyanna",
  "taurean",
  "tavaris",
  "tavian",
  "tavion",
  "tavon",
  "tawana",
  "tawanda",
  "tawanna",
  "tawnya",
  "taya",
  "tayla",
  "tayler",
  "tayshaun",
  "teagan",
  "teddie",
  "teela",
  "teena",
  "tegan",
  "tella",
  "tempie",
  "tenika",
  "tenisha",
  "tennie",
  "tennille",
  "terance",
  "terell",
  "teresa",
  "terese",
  "teressa",
  "terrill",
  "terry",
  "tevin",
  "texanna",
  "texie",
  "theadore",
  "theda",
  "thedore",
  "thekla",
  "theo",
  "theodis",
  "theodocia",
  "theodosia",
  "theola",
  "theophile",
  "theresia",
  "therman",
  "thomas",
  "thomasina",
  "thorwald",
  "thos",
  "thresa",
  "thurlow",
  "thursa",
  "thurston",
  "thyra",
  "tiana",
  "tianna",
  "tiarra",
  "tiera",
  "tiesha",
  "tiffani",
  "tiffanie",
  "tilda",
  "tilden",
  "tilman",
  "timmie",
  "timmothy",
  "timothy",
  "tiney",
  "tinie",
  "tinnie",
  "tisa",
  "tishie",
  "tobi",
  "toccara",
  "toivo",
  "tolbert",
  "tollie",
  "tomas",
  "tomasa",
  "tomeka",
  "tomie",
  "tomika",
  "toney",
  "tonja",
  "torey",
  "toriano",
  "torie",
  "torrey",
  "torrie",
  "torry",
  "tosha",
  "toshiko",
  "toshio",
  "towanda",
  "toya",
  "tracee",
  "trae",
  "travon",
  "trayvon",
  "treena",
  "tremaine",
  "tremayne",
  "trenten",
  "tresa",
  "tressa",
  "tressie",
  "treva",
  "trever",
  "trevin",
  "trevion",
  "trevon",
  "treyton",
  "treyvon",
  "tripp",
  "tristen",
  "tristian",
  "tristin",
  "triston",
  "trudi",
  "trudie",
  "trula",
  "trumaine",
  "trystan",
  "tuan",
  "twyla",
  "tye",
  "tyesha",
  "tyler",
  "tylor",
  "tyquan",
  "tyra",
  "tyreek",
  "tyreese",
  "tyrek",
  "tyreke",
  "tyrel",
  "tyrell",
  "tyrese",
  "tyrik",
  "tyrin",
  "tyriq",
  "tyrique",
  "tyron",
  "tyrus",
  "tyshawn",
  "ula",
  "unnamed",
  "urijah",
  "valinda",
  "vallie",
  "valorie",
  "vander",
  "vannie",
  "vashon",
  "vashti",
  "vassie",
  "velda",
  "vella",
  "velva",
  "venessa",
  "venie",
  "venita",
  "vennie",
  "veola",
  "verda",
  "verdell",
  "verdie",
  "vere",
  "vergie",
  "vergil",
  "verl",
  "verla",
  "verle",
  "verlene",
  "verlie",
  "verlin",
  "verlon",
  "verlyn",
  "vernell",
  "verner",
  "vernetta",
  "vernia",
  "vernie",
  "vernita",
  "versa",
  "versie",
  "vertie",
  "vester",
  "veva",
  "vicie",
  "vick",
  "vickey",
  "vicy",
  "vikki",
  "vincent",
  "viney",
  "vinie",
  "vinnie",
  "vinton",
  "virdie",
  "virge",
  "virgel",
  "virgia",
  "virginia",
  "virgle",
  "viridiana",
  "vlasta",
  "vollie",
  "volney",
  "vonetta",
  "vonnie",
  "waino",
  "walter",
  "waneta",
  "wanita",
  "wardell",
  "wava",
  "waverly",
  "wayde",
  "wayland",
  "waylon",
  "wayman",
  "waymon",
  "wayne",
  "welton",
  "wende",
  "wendel",
  "wenzel",
  "werner",
  "wes",
  "wess",
  "westley",
  "wilhelmine",
  "wiliam",
  "wilkie",
  "willaim",
  "willam",
  "willene",
  "willia",
  "william",
  "willian",
  "williard",
  "willie",
  "williemae",
  "willodean",
  "windell",
  "winfield",
  "winford",
  "winnifred",
  "winona",
  "winton",
  "wirt",
  "woodie",
  "woodroe",
  "woodson",
  "worley",
  "wyman",
  "wynona",
  "xena",
  "xiomara",
  "xzavier",
  "yaakov",
  "yadiel",
  "yadira",
  "yael",
  "yahaira",
  "yahir",
  "yair",
  "yajaira",
  "yamilet",
  "yamilex",
  "yancy",
  "yandel",
  "yareli",
  "yaretzi",
  "yaritza",
  "yasmeen",
  "yasmin",
  "yazmin",
  "yee",
  "yehuda",
  "yessenia",
  "yetta",
  "yoel",
  "yolonda",
  "yosef",
  "yoselin",
  "yoshiko",
  "yoshio",
  "yulisa",
  "yulissa",
  "yurem",
  "yuridia",
  "yusuf",
  "zachary",
  "zackary",
  "zackery",
  "zada",
  "zadie",
  "zaid",
  "zaiden",
  "zakary",
  "zander",
  "zandra",
  "zaniyah",
  "zaria",
  "zariah",
  "zavier",
  "zayden",
  "zayne",
  "zeb",
  "zebulon",
  "zela",
  "zella",
  "zelpha",
  "zenas",
  "zettie",
  "zhane",
  "zigmund",
  "zillah",
  "zilpah",
  "zilpha",
  "zoa",
  "zoie",
  "zollie",
  "zora",
  "zula"
];

// src/data/ignoreLists/universal/misc.json
var misc_default = [];

// src/data/ignoreLists/universal/typos.json
var typos_default = [
  "ahhh",
  "ehhh",
  "ohhh",
  "uhhh",
  "ummm",
  "wooo"
];

// src/data/ignoreLists/es/gaming.json
var gaming_default2 = [
  "advance",
  "akira",
  "alien",
  "aliens",
  "amongos",
  "animal",
  "arcane",
  "autosave",
  "awakening",
  "bakug\xE1n",
  "ball",
  "batman",
  "battle",
  "berserk",
  "between",
  "bongi",
  "boruto",
  "bossfight",
  "boy",
  "breath",
  "bros",
  "buff",
  "build",
  "call",
  "camper",
  "cast",
  "checkpoint",
  "chijiro",
  "clank",
  "club",
  "clutch",
  "colossus",
  "combo",
  "cooking",
  "cooldown",
  "coop",
  "crafting",
  "crash",
  "crossing",
  "cube",
  "cup",
  "cutscene",
  "dance",
  "dantes",
  "deck",
  "dlc",
  "dodge",
  "doom",
  "down",
  "dps",
  "dragon",
  "drift",
  "droprate",
  "ds",
  "duty",
  "eseme",
  "esport",
  "esports",
  "evangelion",
  "evil",
  "f91w",
  "fall",
  "falls",
  "farm",
  "fifa",
  "forza",
  "foss",
  "fps",
  "framerate",
  "funko",
  "gacha",
  "game",
  "gameplay",
  "ghost",
  "glitch",
  "goku",
  "gravity",
  "grind",
  "gsock",
  "gt",
  "gta",
  "guyas",
  "halo",
  "hawk",
  "hawks",
  "hayumi",
  "headshot",
  "hirul",
  "hitbox",
  "hollywoodense",
  "horizon",
  "hot",
  "hotfix",
  "iframe",
  "inferno",
  "infinite",
  "inquisition",
  "inventory",
  "juice",
  "kart",
  "kikas",
  "killstreak",
  "kingdom",
  "kratos",
  "kuni",
  "kurama",
  "lag",
  "last",
  "league",
  "legacy",
  "legends",
  "levelup",
  "light",
  "linkito",
  "links",
  "lobby",
  "lootbox",
  "lovecraft",
  "mask",
  "masterchief",
  "matchmaking",
  "mayoras",
  "mayura",
  "meta",
  "metroid",
  "metroidvania",
  "midnight",
  "minish",
  "mmo",
  "mmorpg",
  "moba",
  "multiplayer",
  "naruto",
  "neo",
  "nerf",
  "ninja",
  "nohit",
  "noob",
  "npc",
  "ocarine",
  "omnitrix",
  "one",
  "orean",
  "pac-man",
  "pacman",
  "parry",
  "patch",
  "pc",
  "pcp",
  "perk",
  "permadeath",
  "pes",
  "pikachu",
  "ping",
  "playstation",
  "playthrough",
  "pokebola",
  "pok\xE9mon",
  "prime",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
  "psp",
  "pve",
  "pvp",
  "qte",
  "quest",
  "quicksave",
  "racing",
  "ragequit",
  "ratchet",
  "raytracing",
  "resident",
  "respawn",
  "return",
  "revelations",
  "rider",
  "rips",
  "roguelike",
  "roguelite",
  "rpg",
  "rts",
  "samo",
  "sandbox",
  "savepoint",
  "selna",
  "shader",
  "shadow",
  "shuna",
  "sidequest",
  "sifu",
  "singleplayer",
  "skem",
  "skemale",
  "skemi",
  "smurf",
  "sony",
  "soulslike",
  "spawn",
  "speedrun",
  "speedrunner",
  "speedrunning",
  "star",
  "stealth",
  "storm",
  "streamer",
  "tears",
  "tech",
  "ternurines",
  "timex",
  "tintom",
  "tomb",
  "tps",
  "tryhard",
  "tunic",
  "tushima",
  "ultimate",
  "uncharted",
  "vita",
  "walkthrough",
  "wars",
  "wheel",
  "wheels",
  "wii",
  "wild",
  "wisdom",
  "world",
  "worlds",
  "xo",
  "yasaki",
  "zero"
];

// src/data/ignoreLists/es/tech.json
var tech_default2 = [
  "backend",
  "bandwidth",
  "bitrate",
  "broadband",
  "browser",
  "bug",
  "cache",
  "cookie",
  "cookies",
  "database",
  "devops",
  "domain",
  "downtime",
  "firewall",
  "firmware",
  "fix",
  "frontend",
  "gadget",
  "geforce",
  "gigabit",
  "hardware",
  "hosting",
  "latency",
  "livestream",
  "megabit",
  "modem",
  "mousepad",
  "offline",
  "online",
  "patreon",
  "pdf",
  "pixel",
  "pixels",
  "plugin",
  "router",
  "setup",
  "smartphone",
  "smartwatch",
  "software",
  "streaming",
  "subdomain",
  "sysadmin",
  "uptime",
  "webhook",
  "webinar",
  "wireless"
];

// src/data/ignoreLists/es/music.json
var music_default2 = [
  "badbunny",
  "daddyyankee",
  "estopa",
  "heroesdelsilencio",
  "maluma",
  "magoz",
  "mecano",
  "ozuna",
  "quevedo",
  "rosalia",
  "rosal\xEDa"
];

// src/data/ignoreLists/es/cinema.json
var cinema_default2 = [
  "almodovar",
  "almod\xF3var",
  "berlin",
  "denver",
  "lacasadepapel",
  "nairobi",
  "oslo",
  "rio",
  "tokio",
  "torrente"
];

// src/data/ignoreLists/es/brands.json
var brands_default2 = [
  "aliexpress",
  "bershka",
  "elcorteingles",
  "instagram",
  "mango",
  "mercadona",
  "pullandbear",
  "santander",
  "seat",
  "stradivarius",
  "telefonica",
  "telef\xF3nica",
  "tiktok"
];

// src/data/ignoreLists/es/cities.json
var cities_default2 = [
  "madrid",
  "barcelona",
  "valencia",
  "seville",
  "sevilla",
  "zaragoza",
  "malaga",
  "m\xE1laga",
  "bilbao",
  "bogota",
  "bogot\xE1",
  "santiago",
  "caracas",
  "quito",
  "montevideo",
  "asuncion",
  "asunci\xF3n",
  "brasilia",
  "tokyo",
  "london",
  "paris",
  "berlin",
  "beijing",
  "washington",
  "chicago",
  "sydney",
  "toronto",
  "seoul",
  "amsterdam",
  "vienna",
  "prague",
  "warsaw",
  "lisbon",
  "dublin",
  "oslo",
  "stockholm",
  "helsinki",
  "copenhagen",
  "brussels",
  "budapest",
  "bucharest",
  "cairo",
  "bangkok",
  "singapore",
  "jakarta",
  "melbourne",
  "montreal",
  "boston",
  "houston",
  "miami",
  "philadelphia",
  "atlanta",
  "dallas",
  "seattle",
  "denver",
  "phoenix",
  "kyoto",
  "osaka",
  "yokohama",
  "nagoya",
  "sapporo",
  "milan",
  "venice",
  "florence",
  "naples",
  "munich",
  "hamburg",
  "frankfurt",
  "cologne",
  "stuttgart",
  "marseille",
  "lyon",
  "toulouse",
  "bordeaux",
  "vancouver",
  "calgary",
  "ottawa",
  "manchester",
  "liverpool",
  "birmingham",
  "edinburgh",
  "glasgow"
];

// src/data/ignoreLists/es/names.json
var names_default2 = [
  "adrian",
  "adri\xE1n",
  "alberto",
  "alejandro",
  "alfonso",
  "alvaro",
  "andres",
  "andr\xE9s",
  "antonio",
  "arturo",
  "bruno",
  "carlos",
  "diego",
  "eduardo",
  "emilio",
  "enrique",
  "felipe",
  "fernando",
  "francisco",
  "gabriel",
  "gonzalo",
  "guillermo",
  "gustavo",
  "hector",
  "hugo",
  "h\xE9ctor",
  "ignacio",
  "ivan",
  "iv\xE1n",
  "javier",
  "joaquin",
  "joaqu\xEDn",
  "jorge",
  "juan",
  "leonardo",
  "lucas",
  "luis",
  "manuel",
  "marcos",
  "mario",
  "mateo",
  "miguel",
  "oscar",
  "pablo",
  "pedro",
  "rafael",
  "ramon",
  "ram\xF3n",
  "raul",
  "ra\xFAl",
  "ricardo",
  "roberto",
  "rodrigo",
  "ruben",
  "rub\xE9n",
  "sebastian",
  "sebasti\xE1n",
  "sergio",
  "\xE1lvaro",
  "\xF3scar"
];

// src/data/ignoreLists/es/misc.json
var misc_default2 = [];

// src/data/ignoreLists/es/typos.json
var typos_default2 = [
  "laasterizaci\xF3n",
  "never",
  "of",
  "telastopos",
  "the"
];

// src/data/ignoreLists/en/music.json
var music_default3 = [
  "drake",
  "dualipa",
  "katyperry",
  "ladygaga",
  "rihanna"
];

// src/data/ignoreLists/en/cinema.json
var cinema_default3 = [
  "disney",
  "netflix",
  "pixar",
  "universalstudios",
  "warnerbros"
];

// src/data/ignoreLists/en/brands.json
var brands_default3 = [
  "pepsico",
  "starbucks"
];

// src/data/ignoreLists/en/cities.json
var cities_default3 = [
  "madrid",
  "paris",
  "tokyo",
  "rome",
  "berlin",
  "beijing",
  "moscow",
  "seoul",
  "amsterdam",
  "vienna",
  "prague",
  "warsaw",
  "lisbon",
  "dublin",
  "oslo",
  "stockholm",
  "helsinki",
  "copenhagen",
  "brussels",
  "budapest",
  "bucharest",
  "cairo",
  "bangkok",
  "singapore",
  "jakarta",
  "melbourne",
  "montreal",
  "boston",
  "houston",
  "miami",
  "philadelphia",
  "atlanta",
  "dallas",
  "seattle",
  "denver",
  "phoenix",
  "kyoto",
  "osaka",
  "yokohama",
  "nagoya",
  "sapporo",
  "milan",
  "venice",
  "florence",
  "naples",
  "munich",
  "hamburg",
  "frankfurt",
  "cologne",
  "stuttgart",
  "marseille",
  "lyon",
  "toulouse",
  "bordeaux",
  "vancouver",
  "calgary",
  "ottawa",
  "manchester",
  "liverpool",
  "birmingham",
  "edinburgh",
  "glasgow"
];

// src/data/ignoreLists/en/names.json
var names_default3 = [
  "aaron",
  "adam",
  "alexander",
  "amanda",
  "andrew",
  "arthur",
  "ashley",
  "austin",
  "benjamin",
  "brandon",
  "brian",
  "carl",
  "charles",
  "christian",
  "christopher",
  "clarice",
  "dalia",
  "daniel",
  "danielle",
  "david",
  "denise",
  "dennis",
  "douglas",
  "edward",
  "elizabeth",
  "emily",
  "eric",
  "flinderson",
  "flindersons",
  "gary",
  "gerald",
  "gregory",
  "gunston",
  "gunstons",
  "harold",
  "henderson",
  "hendersons",
  "henry",
  "james",
  "jason",
  "jeffrey",
  "jennifer",
  "jeremy",
  "jerry",
  "jessica",
  "joseph",
  "joshua",
  "justin",
  "kayla",
  "keith",
  "kevin",
  "kyle",
  "larry",
  "lauren",
  "lawrence",
  "lily",
  "lombardo",
  "luke",
  "manny",
  "matthew",
  "megan",
  "michael",
  "nathan",
  "nicholas",
  "patrick",
  "peter",
  "phil",
  "rachel",
  "robert",
  "ronald",
  "ryan",
  "sal",
  "samantha",
  "samuel",
  "sarah",
  "scott",
  "sean",
  "simone",
  "stephanie",
  "stephen",
  "steven",
  "terry",
  "thomas",
  "tim",
  "timothy",
  "tony",
  "tyler",
  "valerie",
  "walter",
  "zachary",
  "zoe"
];

// src/data/ignoreLists/en/misc.json
var misc_default3 = [];

// src/data/ignoreLists/en/typos.json
var typos_default3 = [];

// src/data/ignoreLists/fr/gaming.json
var gaming_default3 = [
  "gameplay",
  "speedrun",
  "speedrunner",
  "walkthrough",
  "playthrough",
  "boss",
  "bossfight",
  "npc",
  "rpg",
  "fps",
  "mmo",
  "mmorpg",
  "moba",
  "rts",
  "pvp",
  "pve",
  "dps",
  "nerf",
  "buff",
  "drop",
  "loot",
  "lootbox",
  "cooldown",
  "respawn",
  "spawn",
  "checkpoint",
  "glitch",
  "patch",
  "dlc",
  "gacha",
  "grind",
  "farm",
  "hitbox",
  "framerate",
  "ping",
  "lag",
  "matchmaking",
  "lobby",
  "multiplayer",
  "singleplayer",
  "coop",
  "roguelike",
  "metroidvania",
  "soulslike",
  "sandbox",
  "cutscene",
  "crafting",
  "build",
  "meta",
  "combo",
  "parry",
  "dodge",
  "stealth",
  "noob",
  "tryhard",
  "headshot",
  "esports",
  "streamer",
  "stream",
  "speedrunning",
  "permadeath"
];

// src/data/ignoreLists/fr/music.json
var music_default4 = [];

// src/data/ignoreLists/fr/cinema.json
var cinema_default4 = [];

// src/data/ignoreLists/fr/brands.json
var brands_default4 = [];

// src/data/ignoreLists/fr/cities.json
var cities_default4 = [
  "madrid",
  "tokyo",
  "berlin",
  "londres",
  "rome",
  "beijing",
  "washington",
  "seoul",
  "amsterdam",
  "vienne",
  "prague",
  "varsovie",
  "lisbonne",
  "dublin",
  "oslo",
  "stockholm",
  "helsinki",
  "copenhague",
  "bruxelles",
  "budapest",
  "bucarest",
  "bangkok",
  "singapour",
  "jakarta",
  "melbourne",
  "montreal",
  "boston",
  "houston",
  "miami",
  "philadelphie",
  "atlanta",
  "dallas",
  "seattle",
  "denver",
  "phoenix",
  "kyoto",
  "osaka",
  "yokohama",
  "nagoya",
  "sapporo",
  "milan",
  "venise",
  "florence",
  "naples",
  "munich",
  "hambourg",
  "francfort",
  "cologne",
  "stuttgart",
  "marseille",
  "lyon",
  "toulouse",
  "bordeaux",
  "nantes",
  "strasbourg",
  "montpellier",
  "rennes",
  "reims"
];

// src/data/ignoreLists/fr/names.json
var names_default4 = [
  "alain",
  "alexandre",
  "antoine",
  "christophe",
  "guillaume",
  "jean",
  "julien",
  "laurent",
  "maxime",
  "michel",
  "nicolas",
  "philippe",
  "sebastien"
];

// src/data/ignoreLists/fr/misc.json
var misc_default4 = [];

// src/data/ignoreLists/fr/typos.json
var typos_default4 = [];

// src/data/ignoreLists/de/gaming.json
var gaming_default4 = [
  "gameplay",
  "speedrun",
  "speedrunner",
  "walkthrough",
  "playthrough",
  "boss",
  "bossfight",
  "npc",
  "rpg",
  "fps",
  "mmo",
  "mmorpg",
  "moba",
  "rts",
  "pvp",
  "pve",
  "dps",
  "nerf",
  "buff",
  "drop",
  "loot",
  "lootbox",
  "cooldown",
  "respawn",
  "spawn",
  "checkpoint",
  "glitch",
  "patch",
  "dlc",
  "gacha",
  "grind",
  "farm",
  "hitbox",
  "framerate",
  "ping",
  "lag",
  "matchmaking",
  "lobby",
  "multiplayer",
  "singleplayer",
  "coop",
  "roguelike",
  "metroidvania",
  "soulslike",
  "sandbox",
  "cutscene",
  "crafting",
  "build",
  "meta",
  "combo",
  "parry",
  "dodge",
  "stealth",
  "noob",
  "pro",
  "tryhard",
  "headshot",
  "esports",
  "streamer",
  "stream",
  "speedrunning",
  "permadeath"
];

// src/data/ignoreLists/de/music.json
var music_default5 = [];

// src/data/ignoreLists/de/cinema.json
var cinema_default5 = [];

// src/data/ignoreLists/de/brands.json
var brands_default5 = [];

// src/data/ignoreLists/de/cities.json
var cities_default5 = [
  "madrid",
  "tokyo",
  "paris",
  "london",
  "rom",
  "beijing",
  "washington",
  "seoul",
  "amsterdam",
  "wien",
  "prag",
  "warschau",
  "lissabon",
  "dublin",
  "oslo",
  "stockholm",
  "helsinki",
  "kopenhagen",
  "br\xFCssel",
  "budapest",
  "bukarest",
  "kairo",
  "bangkok",
  "singapur",
  "jakarta",
  "melbourne",
  "montreal",
  "boston",
  "houston",
  "miami",
  "philadelphia",
  "atlanta",
  "dallas",
  "seattle",
  "denver",
  "phoenix",
  "kyoto",
  "osaka",
  "yokohama",
  "nagoya",
  "sapporo",
  "mailand",
  "venedig",
  "florenz",
  "neapel",
  "m\xFCnchen",
  "hamburg",
  "frankfurt",
  "k\xF6ln",
  "stuttgart",
  "d\xFCsseldorf",
  "leipzig",
  "dortmund",
  "dresden",
  "hannover",
  "n\xFCrnberg"
];

// src/data/ignoreLists/de/names.json
var names_default5 = [
  "alexander",
  "andreas",
  "christian",
  "florian",
  "hans",
  "j\xFCrgen",
  "klaus",
  "maximilian",
  "michael",
  "sebastian",
  "stefan",
  "thomas",
  "wolfgang"
];

// src/data/ignoreLists/de/misc.json
var misc_default5 = [];

// src/data/ignoreLists/de/typos.json
var typos_default5 = [];

// src/data/ignoreLists/ru/gaming.json
var gaming_default5 = [
  "gameplay",
  "\u0433\u0435\u0439\u043C\u043F\u043B\u0435\u0439",
  "\u0441\u043F\u0438\u0434\u0440\u0430\u043D",
  "\u0441\u043F\u0438\u0434\u0440\u0430\u043D\u043D\u0435\u0440",
  "speedrun",
  "speedrunner",
  "\u043B\u0435\u0442\u0441\u043F\u043B\u0435\u0439",
  "walkthrough",
  "playthrough",
  "\u0431\u043E\u0441\u0441",
  "\u0431\u043E\u0441\u0441\u0444\u0430\u0439\u0442",
  "boss",
  "bossfight",
  "\u043D\u043F\u0441",
  "npc",
  "\u0440\u043F\u0433",
  "rpg",
  "\u0444\u043F\u0441",
  "fps",
  "\u043C\u043C\u043E",
  "\u043C\u043C\u043E\u0440\u043F\u0433",
  "mmo",
  "mmorpg",
  "\u043C\u043E\u0431\u0430",
  "moba",
  "\u0440\u0442\u0441",
  "rts",
  "\u043F\u0432\u043F",
  "\u043F\u0432\u0435",
  "pvp",
  "pve",
  "\u0434\u043F\u0441",
  "dps",
  "\u043D\u0435\u0440\u0444",
  "\u0431\u0430\u0444\u0444",
  "\u043F\u043E\u043D\u0435\u0440\u0444\u0438\u043B\u0438",
  "\u0430\u043F\u043D\u0443\u043B\u0438",
  "nerf",
  "buff",
  "\u0434\u0440\u043E\u043F",
  "\u0434\u0440\u043E\u043F\u0440\u0435\u0439\u0442",
  "drop",
  "\u043B\u0443\u0442",
  "\u043B\u0443\u0442\u0431\u043E\u043A\u0441",
  "loot",
  "lootbox",
  "\u043A\u0443\u043B\u0434\u0430\u0443\u043D",
  "cooldown",
  "\u0440\u0435\u0441\u043F\u0430\u0432\u043D",
  "\u0441\u043F\u0430\u0432\u043D",
  "respawn",
  "\u0447\u0435\u043A\u043F\u043E\u0438\u043D\u0442",
  "\u0441\u0435\u0439\u0432\u043F\u043E\u0438\u043D\u0442",
  "checkpoint",
  "\u0430\u0432\u0442\u043E\u0441\u0435\u0439\u0432",
  "autosave",
  "\u043A\u0432\u0438\u043A\u0441\u0435\u0439\u0432",
  "\u0433\u043B\u0438\u0442\u0447",
  "glitch",
  "\u043F\u0430\u0442\u0447",
  "\u043F\u0430\u0442\u0447\u043D\u043E\u0443\u0442",
  "\u0445\u043E\u0442\u0444\u0438\u043A\u0441",
  "patch",
  "\u0434\u043B\u0441",
  "dlc",
  "\u0433\u0430\u0447\u0430",
  "gacha",
  "\u0433\u0440\u0438\u043D\u0434",
  "\u0444\u0430\u0440\u043C",
  "grind",
  "farm",
  "\u0445\u0438\u0442\u0431\u043E\u043A\u0441",
  "hitbox",
  "\u0444\u0440\u0435\u0439\u043C\u0440\u0435\u0439\u0442",
  "\u0440\u0435\u0439\u0442\u0440\u0435\u0439\u0441\u0438\u043D\u0433",
  "\u0448\u0435\u0439\u0434\u0435\u0440",
  "\u043F\u0438\u043D\u0433",
  "\u043B\u0430\u0433",
  "ping",
  "lag",
  "\u043C\u0430\u0442\u0447\u043C\u0435\u0439\u043A\u0438\u043D\u0433",
  "\u043B\u043E\u0431\u0431\u0438",
  "\u043C\u0443\u043B\u044C\u0442\u0438\u043F\u043B\u0435\u0435\u0440",
  "\u0441\u0438\u043D\u0433\u043B\u043F\u043B\u0435\u0435\u0440",
  "\u043A\u043E\u043E\u043F",
  "\u0440\u043E\u0433\u0430\u043B\u0438\u043A",
  "roguelike",
  "roguelite",
  "\u043C\u0435\u0442\u0440\u043E\u0438\u0434\u0432\u0430\u043D\u0438\u044F",
  "metroidvania",
  "\u0441\u043E\u0443\u043B\u0441\u043B\u0430\u0439\u043A",
  "soulslike",
  "\u043A\u0430\u0442\u0441\u0446\u0435\u043D\u0430",
  "\u0441\u0430\u0439\u0434\u043A\u0432\u0435\u0441\u0442",
  "\u043A\u0440\u0430\u0444\u0442",
  "\u043F\u0435\u0440\u043A",
  "\u0431\u0438\u043B\u0434",
  "build",
  "\u043C\u0435\u0442\u0430",
  "\u043A\u043E\u043C\u0431\u043E",
  "\u043F\u0430\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
  "\u0441\u0442\u0435\u043B\u0441",
  "\u0440\u0435\u0439\u0434\u0436\u043A\u0432\u0438\u0442",
  "\u043A\u043B\u0430\u0442\u0447",
  "\u043D\u0443\u0431",
  "\u0442\u0440\u0430\u0439\u0445\u0430\u0440\u0434",
  "\u0441\u043C\u0443\u0440\u0444",
  "\u043A\u0435\u043C\u043F\u0435\u0440",
  "\u0445\u044D\u0434\u0448\u043E\u0442",
  "\u043A\u0438\u043B\u043B\u0441\u0442\u0440\u0438\u043A",
  "\u043A\u0438\u0431\u0435\u0440\u0441\u043F\u043E\u0440\u0442",
  "esports",
  "\u0441\u0442\u0440\u0438\u043C\u0435\u0440",
  "\u0441\u0442\u0440\u0438\u043C",
  "streamer"
];

// src/data/ignoreLists/ru/tech.json
var tech_default3 = [
  "cloud",
  "\u043A\u043B\u0430\u0443\u0434",
  "\u043F\u0440\u043E\u0448\u0438\u0432\u043A\u0430",
  "\u0441\u0435\u0440\u0432\u0435\u0440",
  "server",
  "\u0444\u0440\u043E\u043D\u0442\u0435\u043D\u0434",
  "frontend",
  "\u0431\u044D\u043A\u0435\u043D\u0434",
  "backend",
  "\u043E\u043D\u043B\u0430\u0439\u043D",
  "\u043E\u0444\u043B\u0430\u0439\u043D",
  "online",
  "offline",
  "\u043B\u0430\u0439\u0432\u0441\u0442\u0440\u0438\u043C",
  "\u0441\u0442\u0440\u0438\u043C\u0438\u043D\u0433",
  "\u0432\u0435\u0431\u0438\u043D\u0430\u0440",
  "\u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D",
  "\u0441\u043C\u0430\u0440\u0442\u0447\u0430\u0441\u044B",
  "\u0433\u0430\u0434\u0436\u0435\u0442",
  "\u0431\u0440\u0430\u0443\u0437\u0435\u0440",
  "\u043F\u043B\u0430\u0433\u0438\u043D",
  "\u0444\u0430\u0439\u0440\u0432\u043E\u043B",
  "\u0440\u043E\u0443\u0442\u0435\u0440",
  "\u043C\u043E\u0434\u0435\u043C",
  "\u043F\u0438\u043A\u0441\u0435\u043B\u044C",
  "\u043F\u0438\u043A\u0441\u0435\u043B\u0438",
  "\u0431\u0438\u0442\u0440\u0435\u0439\u0442",
  "\u0445\u043E\u0441\u0442\u0438\u043D\u0433",
  "\u0434\u043E\u043C\u0435\u043D",
  "\u0432\u0435\u0431\u0445\u0443\u043A",
  "\u0434\u0435\u0432\u043E\u043F\u0441"
];

// src/data/ignoreLists/ru/music.json
var music_default6 = [
  "\u0431\u04382",
  "\u0437\u0435\u043C\u0444\u0438\u0440\u0430",
  "\u043A\u0438\u043D\u043E",
  "\u043A\u043E\u0440\u043E\u043B\u044C\u0438\u0448\u0443\u0442",
  "\u043B\u0435\u043D\u0438\u043D\u0433\u0440\u0430\u0434",
  "\u043C\u043E\u0440\u0433\u0435\u043D\u0448\u0442\u0435\u0440\u043D",
  "\u043C\u0443\u043C\u0438\u0439\u0442\u0440\u043E\u043B\u043B\u044C",
  "\u043E\u043A\u0441\u0438\u043C\u0438\u0440\u043E\u043D",
  "\u0441\u043F\u043B\u0438\u043D"
];

// src/data/ignoreLists/ru/cinema.json
var cinema_default6 = [
  "\u0431\u043E\u0433\u0430\u0442\u044B\u0440\u0438",
  "\u0432\u043E\u043B\u0430\u043D\u0434\u0435\u043C\u043E\u0440\u0442",
  "\u0433\u0430\u0440\u0440\u0438\u043F\u043E\u0442\u0442\u0435\u0440",
  "\u0434\u0430\u0440\u0442\u0432\u0435\u0439\u0434\u0435\u0440",
  "\u043B\u0443\u043D\u0442\u0438\u043A",
  "\u0441\u043C\u0435\u0448\u0430\u0440\u0438\u043A\u0438",
  "\u0447\u0435\u0431\u0443\u0440\u0430\u0448\u043A\u0430"
];

// src/data/ignoreLists/ru/brands.json
var brands_default6 = [
  "\u0430\u0432\u0442\u043E\u0432\u0430\u0437",
  "\u0433\u0430\u0437\u043F\u0440\u043E\u043C",
  "\u043B\u0430\u043C\u043E\u0434\u0430",
  "\u043B\u0443\u043A\u043E\u0439\u043B",
  "\u043E\u0437\u043E\u043D",
  "\u0441\u0431\u0435\u0440\u0431\u0430\u043D\u043A",
  "\u0442\u0438\u043D\u044C\u043A\u043E\u0444\u0444",
  "\u044F\u043D\u0434\u0435\u043A\u0441"
];

// src/data/ignoreLists/ru/cities.json
var cities_default6 = [
  "\u043C\u043E\u0441\u043A\u0432\u0430",
  "\u043F\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433",
  "\u0442\u043E\u043A\u0438\u043E",
  "\u043B\u043E\u043D\u0434\u043E\u043D",
  "\u043F\u0430\u0440\u0438\u0436",
  "\u0431\u0435\u0440\u043B\u0438\u043D",
  "\u043F\u0435\u043A\u0438\u043D",
  "\u0432\u0430\u0448\u0438\u043D\u0433\u0442\u043E\u043D",
  "\u0441\u0435\u0443\u043B",
  "\u0430\u043C\u0441\u0442\u0435\u0440\u0434\u0430\u043C",
  "\u0432\u0435\u043D\u0430",
  "\u043F\u0440\u0430\u0433\u0430",
  "\u0432\u0430\u0440\u0448\u0430\u0432\u0430",
  "\u043B\u0438\u0441\u0441\u0430\u0431\u043E\u043D",
  "\u0434\u0443\u0431\u043B\u0438\u043D",
  "\u043E\u0441\u043B\u043E",
  "\u0441\u0442\u043E\u043A\u0433\u043E\u043B\u044C\u043C",
  "\u0445\u0435\u043B\u044C\u0441\u0438\u043D\u043A\u0438",
  "\u043A\u043E\u043F\u0435\u043D\u0433\u0430\u0433\u0435\u043D",
  "\u0431\u0440\u044E\u0441\u0441\u0435\u043B\u044C",
  "\u0431\u0443\u0434\u0430\u043F\u0435\u0448\u0442",
  "\u0431\u0443\u0445\u0430\u0440\u0435\u0441\u0442",
  "\u043A\u0430\u0438\u0440",
  "\u0431\u0430\u043D\u0433\u043A\u043E\u043A",
  "\u0441\u0438\u043D\u0433\u0430\u043F\u0443\u0440",
  "\u0434\u0436\u0430\u043A\u0430\u0440\u0442\u0430",
  "\u043C\u0435\u043B\u044C\u0431\u0443\u0440\u043D",
  "\u043C\u043E\u043D\u0440\u0435\u0430\u043B\u044C",
  "\u0431\u043E\u0441\u0442\u043E\u043D",
  "\u0445\u044C\u044E\u0441\u0442\u043E\u043D",
  "\u043C\u0430\u0439\u0430\u043C\u0438",
  "\u0444\u0438\u043B\u0430\u0434\u0435\u043B\u044C\u0444\u0438\u044F",
  "\u0430\u0442\u043B\u0430\u043D\u0442\u0430",
  "\u0434\u0430\u043B\u043B\u0430\u0441",
  "\u0441\u0438\u044D\u0442\u043B",
  "\u0434\u0435\u043D\u0432\u0435\u0440",
  "\u0444\u0435\u043D\u0438\u043A\u0441",
  "\u043A\u0438\u043E\u0442\u043E",
  "\u043E\u0441\u0430\u043A\u0430",
  "\u043C\u0438\u043B\u0430\u043D",
  "\u0432\u0435\u043D\u0435\u0446\u0438\u044F",
  "\u0444\u043B\u043E\u0440\u0435\u043D\u0446\u0438\u044F",
  "\u043D\u0435\u0430\u043F\u043E\u043B\u044C",
  "\u043C\u044E\u043D\u0445\u0435\u043D",
  "\u0433\u0430\u043C\u0431\u0443\u0440\u0433",
  "\u0444\u0440\u0430\u043D\u043A\u0444\u0443\u0440\u0442",
  "\u043A\u0451\u043B\u044C\u043D",
  "\u0448\u0442\u0443\u0442\u0433\u0430\u0440\u0442",
  "\u043C\u0430\u0440\u0441\u0435\u043B\u044C",
  "\u043B\u0438\u043E\u043D",
  "\u0442\u0443\u043B\u0443\u0437\u0430",
  "\u0431\u043E\u0440\u0434\u043E",
  "\u0432\u0430\u043D\u043A\u0443\u0432\u0435\u0440",
  "\u043A\u0430\u043B\u0433\u0430\u0440\u0438",
  "\u043E\u0442\u0442\u0430\u0432\u0430",
  "\u043C\u0430\u043D\u0447\u0435\u0441\u0442\u0435\u0440",
  "\u043B\u0438\u0432\u0435\u0440\u043F\u0443\u043B\u044C",
  "\u0431\u0438\u0440\u043C\u0438\u043D\u0433\u0435\u043C",
  "\u044D\u0434\u0438\u043D\u0431\u0443\u0440\u0433",
  "\u0433\u043B\u0430\u0437\u0433\u043E"
];

// src/data/ignoreLists/ru/names.json
var names_default6 = [
  "\u0430\u043B\u0435\u043A\u0441\u0430\u043D\u0434\u0440",
  "\u0430\u043B\u0435\u043A\u0441\u0435\u0439",
  "\u0431\u043E\u0440\u0438\u0441",
  "\u0432\u0430\u043B\u0435\u0440\u0438\u0439",
  "\u0432\u043B\u0430\u0434\u0438\u043C\u0438\u0440",
  "\u0434\u043C\u0438\u0442\u0440\u0438\u0439",
  "\u0435\u043A\u0430\u0442\u0435\u0440\u0438\u043D\u0430",
  "\u0435\u043B\u0435\u043D\u0430",
  "\u0438\u0433\u043E\u0440\u044C",
  "\u043C\u0438\u0445\u0430\u0438\u043B",
  "\u043D\u0430\u0442\u0430\u043B\u044C\u044F",
  "\u043D\u0438\u043A\u043E\u043B\u0430\u0439",
  "\u043E\u043B\u044C\u0433\u0430",
  "\u0441\u0432\u0435\u0442\u043B\u0430\u043D\u0430",
  "\u0441\u0435\u0440\u0433\u0435\u0439",
  "\u0442\u0430\u0442\u044C\u044F\u043D\u0430",
  "\u044E\u0440\u0438\u0439"
];

// src/data/ignoreLists/ru/misc.json
var misc_default6 = [];

// src/data/ignoreLists/ru/typos.json
var typos_default6 = [];

// src/data/ignoreLists/it/gaming.json
var gaming_default6 = [
  "gameplay",
  "speedrun",
  "speedrunner",
  "walkthrough",
  "playthrough",
  "boss",
  "bossfight",
  "npc",
  "rpg",
  "fps",
  "mmo",
  "mmorpg",
  "moba",
  "rts",
  "pvp",
  "pve",
  "dps",
  "nerf",
  "buff",
  "drop",
  "loot",
  "lootbox",
  "cooldown",
  "respawn",
  "spawn",
  "checkpoint",
  "glitch",
  "patch",
  "dlc",
  "gacha",
  "grind",
  "farm",
  "hitbox",
  "framerate",
  "ping",
  "lag",
  "lobby",
  "multiplayer",
  "singleplayer",
  "coop",
  "roguelike",
  "metroidvania",
  "soulslike",
  "sandbox",
  "cutscene",
  "crafting",
  "build",
  "meta",
  "combo",
  "parry",
  "dodge",
  "stealth",
  "noob",
  "headshot",
  "esports",
  "streamer"
];

// src/data/ignoreLists/it/music.json
var music_default7 = [];

// src/data/ignoreLists/it/cinema.json
var cinema_default7 = [];

// src/data/ignoreLists/it/brands.json
var brands_default7 = [];

// src/data/ignoreLists/it/cities.json
var cities_default7 = [
  "madrid",
  "tokyo",
  "paris",
  "londra",
  "berlino",
  "pechino",
  "washington",
  "seul",
  "amsterdam",
  "vienna",
  "praga",
  "varsavia",
  "lisbona",
  "dublino",
  "oslo",
  "stoccolma",
  "helsinki",
  "copenaghen",
  "bruxelles",
  "budapest",
  "bucarest",
  "bangkok",
  "singapore",
  "giakarta",
  "melbourne",
  "montreal",
  "boston",
  "houston",
  "miami",
  "filadelfia",
  "atlanta",
  "dallas",
  "seattle",
  "denver",
  "phoenix",
  "kyoto",
  "osaka",
  "torino",
  "palermo",
  "genova",
  "bologna",
  "bari",
  "catania",
  "verona",
  "messina",
  "padova",
  "trieste",
  "taranto",
  "brescia",
  "parma",
  "modena"
];

// src/data/ignoreLists/it/names.json
var names_default7 = [
  "alessandro",
  "andrea",
  "antonio",
  "davide",
  "francesco",
  "giovanni",
  "giuseppe",
  "luigi",
  "marco",
  "mario",
  "matteo",
  "roberto",
  "salvatore",
  "stefano"
];

// src/data/ignoreLists/it/misc.json
var misc_default7 = [];

// src/data/ignoreLists/it/typos.json
var typos_default7 = [];

// src/data/ignoreLists/pt/gaming.json
var gaming_default7 = [
  "gameplay",
  "speedrun",
  "speedrunner",
  "walkthrough",
  "playthrough",
  "boss",
  "bossfight",
  "npc",
  "rpg",
  "fps",
  "mmo",
  "mmorpg",
  "moba",
  "rts",
  "pvp",
  "pve",
  "dps",
  "nerf",
  "buff",
  "drop",
  "loot",
  "lootbox",
  "cooldown",
  "respawn",
  "spawn",
  "checkpoint",
  "glitch",
  "patch",
  "dlc",
  "gacha",
  "grind",
  "farm",
  "hitbox",
  "framerate",
  "ping",
  "lag",
  "lobby",
  "multiplayer",
  "singleplayer",
  "coop",
  "roguelike",
  "metroidvania",
  "soulslike",
  "sandbox",
  "cutscene",
  "crafting",
  "build",
  "meta",
  "combo",
  "parry",
  "dodge",
  "stealth",
  "noob",
  "headshot",
  "esports",
  "streamer"
];

// src/data/ignoreLists/pt/music.json
var music_default8 = [];

// src/data/ignoreLists/pt/cinema.json
var cinema_default8 = [];

// src/data/ignoreLists/pt/brands.json
var brands_default8 = [];

// src/data/ignoreLists/pt/cities.json
var cities_default8 = [
  "madrid",
  "tokyo",
  "paris",
  "londres",
  "berlim",
  "pequim",
  "washington",
  "seul",
  "amsterda",
  "amsterd\xE3",
  "viena",
  "praga",
  "varsovia",
  "vars\xF3via",
  "lisboa",
  "dublin",
  "oslo",
  "estocolmo",
  "helsinque",
  "copenhague",
  "bruxelas",
  "budapeste",
  "bucareste",
  "bangkok",
  "singapura",
  "jacarta",
  "melbourne",
  "montreal",
  "boston",
  "houston",
  "miami",
  "filadelfia",
  "filad\xE9lfia",
  "atlanta",
  "dallas",
  "seattle",
  "denver",
  "phoenix",
  "kyoto",
  "osaka",
  "porto",
  "coimbra",
  "braga",
  "funchal",
  "setubal",
  "set\xFAbal",
  "aveiro",
  "evora",
  "\xE9vora",
  "faro"
];

// src/data/ignoreLists/pt/names.json
var names_default8 = [
  "antonio",
  "ant\xF3nio",
  "carlos",
  "francisco",
  "gabriel",
  "joao",
  "jose",
  "jos\xE9",
  "jo\xE3o",
  "lucas",
  "manuel",
  "mateus",
  "paulo",
  "pedro",
  "rodrigo",
  "tiago"
];

// src/data/ignoreLists/pt/misc.json
var misc_default8 = [];

// src/data/ignoreLists/pt/typos.json
var typos_default8 = [];

// src/data/ignoreLists/ignoreService.ts
var PROTECTED_WORDS_BLACKLIST = /* @__PURE__ */ new Set([
  // English common words (fruits, verbs, nouns, adjectives)
  "apple",
  "zoom",
  "nice",
  "valve",
  "blizzard",
  "steam",
  "switch",
  "hades",
  "celeste",
  "canon",
  "safari",
  "docker",
  "chrome",
  "edge",
  "opera",
  "led",
  "ram",
  "war",
  "god",
  "boss",
  "drop",
  "loot",
  "cool",
  "like",
  "link",
  "chat",
  "cloud",
  "server",
  "stream",
  "style",
  "team",
  "party",
  "test",
  "brand",
  "meeting",
  "deadline",
  "target",
  "gap",
  "shell",
  "oracle",
  "subway",
  "chase",
  "bell",
  "deal",
  "dell",
  "reading",
  "bath",
  "split",
  "intel",
  "discord",
  "fedora",
  "overwatch",
  "insomniac",
  "play",
  "tree",
  "skill",
  "music",
  "guerra",
  "box",
  "boxes",
  "boxing",
  // English homonym names
  "will",
  "may",
  "bill",
  "grace",
  "hope",
  "rose",
  "mark",
  "rich",
  "faith",
  "joy",
  "art",
  "bob",
  "rob",
  "sue",
  "pat",
  "gene",
  "frank",
  "guy",
  "penny",
  "sandy",
  "rusty",
  "amber",
  "cliff",
  "daisy",
  "dawn",
  "lily",
  "ruby",
  "victor",
  "miles",
  "grant",
  "wade",
  "hunter",
  "mason",
  "archer",
  "cooper",
  "fisher",
  "cook",
  "baker",
  "smith",
  "taylor",
  "brown",
  "white",
  "black",
  "green",
  "wood",
  "stone",
  "king",
  "prince",
  "knight",
  "lord",
  "bishop",
  "bush",
  "church",
  "fox",
  "wolf",
  "bird",
  "young",
  "long",
  "short",
  "little",
  "small",
  "sharp",
  "quick",
  "smart",
  "bright",
  "sweet",
  "fair",
  "best",
  "well",
  "early",
  "daily",
  "page",
  "major",
  "general",
  "ford",
  "carter",
  "barr",
  // Spanish homonym names & vocabulary words
  "alma",
  "rosa",
  "blanca",
  "dolores",
  "esperanza",
  "sol",
  "victoria",
  "cruz",
  "angel",
  "\xE1ngel",
  "flor",
  "mercedes",
  "carmen",
  "gloria",
  "luz",
  "pilar",
  "consuelo",
  "paz",
  "soledad",
  "amparo",
  "rocio",
  "roc\xEDo",
  "aurora",
  "paloma",
  "estrella",
  "felix",
  "f\xE9lix",
  "salvador",
  "roman",
  "rom\xE1n",
  "domingo",
  "julio",
  "agosto",
  "martin",
  "mart\xEDn",
  "leon",
  "le\xF3n",
  "franco",
  "marina",
  "clara",
  "reina",
  "candela",
  "milagros",
  "inmaculada",
  "socorro",
  "concepcion",
  "concepci\xF3n",
  "dulce",
  "gracia",
  "fidel",
  "maximo",
  "m\xE1ximo",
  "justo",
  "modesto",
  "prudencio",
  "lima",
  "huevo",
  "santo",
  "cura",
  "nieve",
  "m\xFAsica",
  "musica",
  "risas",
  "aplausos",
  "farmear",
  "craftear",
  "grindeo",
  "nerfeado",
  "buffeado",
  "cielo",
  "mar",
  "rio",
  "r\xEDo",
  "valle",
  "monte",
  "sierra",
  "pena",
  "pe\xF1a",
  "castillo",
  "torre",
  "fuente",
  "iglesia",
  "rey",
  "conde",
  "duque",
  "caballero",
  "pastor",
  "bello",
  "hermoso",
  "lindo",
  "bueno",
  "leal",
  "fiel",
  "bravo",
  "fuerte",
  "valiente",
  "grande",
  "chico",
  "alto",
  "bajo",
  "gordo",
  "flaco",
  "rubio",
  "moreno",
  "serena",
  "valentin",
  "valent\xEDn",
  "nieves",
  "asuncion",
  "asunci\xF3n",
  "encarnacion",
  "encarnaci\xF3n",
  "trinidad",
  "santos",
  "almond",
  // French / Italian / German homonym names & words
  "sega",
  "bella",
  "bello",
  "blanc",
  "merci",
  "stein",
  "berg",
  "mann",
  // Countries in Spanish, English, French, German, Russian, etc.
  "spain",
  "espa\xF1a",
  "espana",
  "germany",
  "alemania",
  "deutschland",
  "france",
  "francia",
  "frankreich",
  "italy",
  "italia",
  "italien",
  "russia",
  "rusia",
  "russland",
  "\u0440\u043E\u0441\u0441\u0438\u044F",
  "china",
  "japan",
  "jap\xF3n",
  "japon",
  "mexico",
  "m\xE9xico",
  "usa",
  "england",
  "inglaterra",
  "uk",
  "canada",
  "canad\xE1",
  "brazil",
  "brasil",
  "argentina",
  "colombia",
  "peru",
  "per\xFA",
  "chile",
  "cuba",
  "poland",
  "polonia",
  "ukraine",
  "ucrania",
  "turkey",
  "turqu\xEDa",
  "egypt",
  "egipto",
  "greece",
  "grecia",
  "sweden",
  "suecia",
  "norway",
  "noruega",
  "finland",
  "finlandia",
  "portugal",
  "holland",
  "netherlands",
  "pa\xEDses bajos",
  "belgium",
  "b\xE9lgica",
  "switzerland",
  "suiza",
  "austria",
  "india",
  "korea",
  "corea",
  "australia"
]);

// src/services/ignoreListService.ts
var IGNORE_CATEGORIES_CONFIG = {
  gaming: {
    id: "gaming",
    icon: "\u{1F3AE}",
    nameKey: "ignore_lists.category_gaming",
    defaultNameRu: "\u0413\u0435\u0439\u043C\u0438\u043D\u0433 \u0438 \u043A\u043E\u043D\u0441\u043E\u043B\u0438",
    defaultNameEn: "Gaming & Platforms",
    shortNameKey: "ignore_lists.badge_gaming",
    shortNameRu: "\u0413\u0435\u0439\u043C\u0438\u043D\u0433",
    shortNameEn: "Gaming",
    descKey: "ignore_lists.category_gaming_desc",
    defaultDescRu: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u044F \u0438\u0433\u0440, \u043A\u043E\u043D\u0441\u043E\u043B\u0435\u0439 \u0438 \u0444\u0440\u0430\u043D\u0448\u0438\u0437 (Nintendo, PlayStation, Xbox, Zelda, Roblox, Skyrim)",
    defaultDescEn: "Game consoles, platforms, and franchise titles (Nintendo, PlayStation, Xbox, Zelda, Roblox, Skyrim)"
  },
  tech_brands: {
    id: "tech_brands",
    icon: "\u{1F4BB}",
    nameKey: "ignore_lists.category_tech_brands",
    defaultNameRu: "IT \u0438 \u0442\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0438\u0438",
    defaultNameEn: "IT & Tech",
    shortNameKey: "ignore_lists.badge_tech",
    shortNameRu: "IT",
    shortNameEn: "IT",
    descKey: "ignore_lists.category_tech_brands_desc",
    defaultDescRu: "IT-\u0431\u0440\u0435\u043D\u0434\u044B, \u0430\u043F\u043F\u0430\u0440\u0430\u0442\u043D\u044B\u0435 \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u044B \u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B (Google, Microsoft, Nvidia, Asus, Xiaomi, Bluetooth, WiFi, HDMI)",
    defaultDescEn: "Tech brands, hardware standards, and protocols (Google, Microsoft, Nvidia, Asus, Xiaomi, Bluetooth, WiFi, HDMI)"
  },
  music: {
    id: "music",
    icon: "\u{1F3B5}",
    nameKey: "ignore_lists.category_music",
    defaultNameRu: "\u041C\u0443\u0437\u044B\u043A\u0430 \u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438",
    defaultNameEn: "Music & Artists",
    shortNameKey: "ignore_lists.badge_music",
    shortNameRu: "\u041C\u0443\u0437\u044B\u043A\u0430",
    shortNameEn: "Music",
    descKey: "ignore_lists.category_music_desc",
    defaultDescRu: "\u041C\u0443\u0437\u044B\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0433\u0440\u0443\u043F\u043F\u044B \u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438 (Radiohead, Metallica, Coldplay, Rammstein, Nirvana, Shakira)",
    defaultDescEn: "Music bands, artists, and groups (Radiohead, Metallica, Coldplay, Rammstein, Nirvana, Shakira)"
  },
  cinema: {
    id: "cinema",
    icon: "\u{1F3AC}",
    nameKey: "ignore_lists.category_cinema",
    defaultNameRu: "\u041A\u0438\u043D\u043E \u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438",
    defaultNameEn: "Cinema & Characters",
    shortNameKey: "ignore_lists.badge_cinema",
    shortNameRu: "\u041A\u0438\u043D\u043E",
    shortNameEn: "Cinema",
    descKey: "ignore_lists.category_cinema_desc",
    defaultDescRu: "\u0424\u0438\u043B\u044C\u043C\u044B, \u0441\u0435\u0440\u0438\u0430\u043B\u044B \u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438 (Hogwarts, Marvel, Batman, Superman, Gandalf, Skywalker)",
    defaultDescEn: "Movies, franchises, and characters (Hogwarts, Marvel, Batman, Superman, Gandalf, Skywalker)"
  },
  brands: {
    id: "brands",
    icon: "\u{1F3F7}\uFE0F",
    nameKey: "ignore_lists.category_brands",
    defaultNameRu: "\u041C\u0438\u0440\u043E\u0432\u044B\u0435 \u0431\u0440\u0435\u043D\u0434\u044B",
    defaultNameEn: "Global Brands",
    shortNameKey: "ignore_lists.badge_brands",
    shortNameRu: "\u0411\u0440\u0435\u043D\u0434\u044B",
    shortNameEn: "Brands",
    descKey: "ignore_lists.category_brands_desc",
    defaultDescRu: "\u0411\u0440\u0435\u043D\u0434\u044B \u0430\u0432\u0442\u043E, \u043E\u0434\u0435\u0436\u0434\u044B \u0438 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u043E\u0432 (Nike, Adidas, Toyota, Tesla, Pepsi, Lego, Zara)",
    defaultDescEn: "Auto, apparel, and consumer brands (Nike, Adidas, Toyota, Tesla, Pepsi, Lego, Zara)"
  },
  names_cities: {
    id: "names_cities",
    icon: "\u{1F3D9}\uFE0F",
    nameKey: "ignore_lists.category_names_cities",
    defaultNameRu: "\u0413\u043E\u0440\u043E\u0434\u0430 \u0438 \u0438\u043C\u0435\u043D\u0430",
    defaultNameEn: "Cities & Names",
    shortNameKey: "ignore_lists.badge_cities",
    shortNameRu: "\u0413\u043E\u0440\u043E\u0434\u0430 \u0438 \u0438\u043C\u0435\u043D\u0430",
    shortNameEn: "Cities & Names",
    descKey: "ignore_lists.category_names_cities_desc",
    defaultDescRu: "\u041C\u0438\u0440\u043E\u0432\u044B\u0435 \u0441\u0442\u043E\u043B\u0438\u0446\u044B, \u0433\u043E\u0440\u043E\u0434\u0430 \u0438 \u0438\u043C\u0435\u043D\u0430 (Tokyo, Madrid, London, Paris, Berlin, Carlos, Michael).",
    defaultDescEn: "World capitals, cities, and personal names (Tokyo, Madrid, London, Paris, Berlin, Carlos, Michael)."
  },
  anglicisms: {
    id: "anglicisms",
    icon: "\u{1F5E3}\uFE0F",
    nameKey: "ignore_lists.category_anglicisms",
    defaultNameRu: "\u041E\u0431\u0449\u0438\u0435 \u0430\u043D\u0433\u043B\u0438\u0446\u0438\u0437\u043C\u044B",
    defaultNameEn: "Common Anglicisms",
    shortNameKey: "ignore_lists.badge_anglicism",
    shortNameRu: "\u0410\u043D\u0433\u043B\u0438\u0446\u0438\u0437\u043C",
    shortNameEn: "Anglicism",
    descKey: "ignore_lists.category_anglicisms_desc",
    defaultDescRu: "\u0417\u0430\u0438\u043C\u0441\u0442\u0432\u043E\u0432\u0430\u043D\u0438\u044F \u0432 \u043D\u0435-\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0445 \u0442\u0435\u043A\u0441\u0442\u0430\u0445. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043F\u0440\u0438 \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u0438 \u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u043E\u0433\u043E.",
    defaultDescEn: "English loanwords in foreign texts. Automatically disabled when studying English."
  }
};
var DEFAULT_IGNORE_CATEGORIES = {
  gaming: true,
  tech_brands: true,
  music: true,
  cinema: true,
  brands: true,
  names_cities: true,
  anglicisms: true
};
var IgnoreListManager = class {
  constructor() {
    // Key format: `${langCode}_${catId}`
    this.cache = /* @__PURE__ */ new Map();
    this.precompile();
  }
  precompile() {
    const supportedLangs = ["es", "fr", "de", "ru", "it", "pt", "en"];
    const langData = {
      es: { gaming: gaming_default2, tech: tech_default2, music: music_default2, cinema: cinema_default2, brands: brands_default2, cities: cities_default2, names: names_default2, misc: misc_default2, typos: typos_default2 },
      en: { gaming: [], tech: [], music: music_default3, cinema: cinema_default3, brands: brands_default3, cities: cities_default3, names: names_default3, misc: misc_default3, typos: typos_default3 },
      fr: { gaming: gaming_default3, tech: [], music: music_default4, cinema: cinema_default4, brands: brands_default4, cities: cities_default4, names: names_default4, misc: misc_default4, typos: typos_default4 },
      de: { gaming: gaming_default4, tech: [], music: music_default5, cinema: cinema_default5, brands: brands_default5, cities: cities_default5, names: names_default5, misc: misc_default5, typos: typos_default5 },
      ru: { gaming: gaming_default5, tech: tech_default3, music: music_default6, cinema: cinema_default6, brands: brands_default6, cities: cities_default6, names: names_default6, misc: misc_default6, typos: typos_default6 },
      it: { gaming: gaming_default6, tech: [], music: music_default7, cinema: cinema_default7, brands: brands_default7, cities: cities_default7, names: names_default7, misc: misc_default7, typos: typos_default7 },
      pt: { gaming: gaming_default7, tech: [], music: music_default8, cinema: cinema_default8, brands: brands_default8, cities: cities_default8, names: names_default8, misc: misc_default8, typos: typos_default8 }
    };
    supportedLangs.forEach((langCode) => {
      const data = langData[langCode] || { gaming: [], tech: [], music: [], cinema: [], brands: [], cities: [], names: [], misc: [], typos: [] };
      const buildSet = (universalArr, langArr) => {
        const s = /* @__PURE__ */ new Set();
        universalArr.forEach((w) => {
          const c = w.trim().toLowerCase();
          if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) s.add(c);
        });
        langArr.forEach((w) => {
          const c = w.trim().toLowerCase();
          if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) s.add(c);
        });
        return s;
      };
      this.cache.set(`${langCode}_gaming`, buildSet(gaming_default, data.gaming));
      this.cache.set(`${langCode}_tech_brands`, buildSet(tech_default, data.tech));
      this.cache.set(`${langCode}_music`, buildSet(music_default, data.music));
      this.cache.set(`${langCode}_cinema`, buildSet(cinema_default, data.cinema));
      this.cache.set(`${langCode}_brands`, buildSet(brands_default, data.brands));
      const namesCitiesSet = /* @__PURE__ */ new Set();
      cities_default.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      names_default.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      data.cities.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      data.names.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      this.cache.set(`${langCode}_names_cities`, namesCitiesSet);
      const anglicismsSet = /* @__PURE__ */ new Set();
      if (langCode !== "en") {
        data.gaming.forEach((w) => {
          const c = w.trim().toLowerCase();
          if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) anglicismsSet.add(c);
        });
      }
      this.cache.set(`${langCode}_anglicisms`, anglicismsSet);
      this.cache.set(`${langCode}_misc`, buildSet(misc_default, data.misc));
      this.cache.set(`${langCode}_typos`, buildSet(typos_default, data.typos));
    });
  }
  /**
   * Returns total words count for a category in a specific language
   */
  getCategoryWordCount(catId, targetLanguage = "Spanish") {
    const langCode = getLanguageCode(targetLanguage);
    const cacheKey = `${langCode}_${catId}`;
    const set = this.cache.get(cacheKey);
    return set ? set.size : 0;
  }
  /**
   * Fast O(1) language-aware auto-ignore lookup.
   */
  checkAutoIgnore(cleanWord, settings, targetLanguage = "Spanish") {
    if (!cleanWord) {
      return {
        isIgnored: false,
        categoryId: null,
        nameKey: "",
        shortNameKey: "",
        categoryLabelRu: "",
        categoryLabelEn: "",
        shortNameRu: "",
        shortNameEn: "",
        icon: ""
      };
    }
    const lower = cleanWord.trim().toLowerCase();
    if (PROTECTED_WORDS_BLACKLIST.has(lower)) {
      return {
        isIgnored: false,
        categoryId: null,
        nameKey: "",
        shortNameKey: "",
        categoryLabelRu: "",
        categoryLabelEn: "",
        shortNameRu: "",
        shortNameEn: "",
        icon: ""
      };
    }
    const langCode = getLanguageCode(targetLanguage);
    const categorySettings = {
      ...DEFAULT_IGNORE_CATEGORIES,
      ...settings?.ignoreCategories || {}
    };
    for (const catId of Object.keys(IGNORE_CATEGORIES_CONFIG)) {
      if (!categorySettings[catId]) continue;
      const cacheKey = `${langCode}_${catId}`;
      const set = this.cache.get(cacheKey);
      const baseLower = normalizePossessiveSuffix(lower);
      if (set && (set.has(lower) || set.has(baseLower))) {
        const meta = IGNORE_CATEGORIES_CONFIG[catId];
        return {
          isIgnored: true,
          categoryId: catId,
          nameKey: meta.nameKey,
          shortNameKey: meta.shortNameKey,
          categoryLabelRu: meta.defaultNameRu,
          categoryLabelEn: meta.defaultNameEn,
          shortNameRu: meta.shortNameRu,
          shortNameEn: meta.shortNameEn,
          icon: meta.icon
        };
      }
    }
    const miscSet = this.cache.get(`${langCode}_misc`);
    if (miscSet && miscSet.has(lower)) {
      return {
        isIgnored: true,
        categoryId: null,
        nameKey: "ignore_lists.badge_misc",
        shortNameKey: "ignore_lists.badge_misc",
        categoryLabelRu: "\u0420\u0430\u0437\u043D\u043E\u0435",
        categoryLabelEn: "Misc",
        shortNameRu: "\u0420\u0430\u0437\u043D\u043E\u0435",
        shortNameEn: "Misc",
        icon: "\u{1F9E9}"
      };
    }
    const typosSet = this.cache.get(`${langCode}_typos`);
    if (typosSet && typosSet.has(lower)) {
      return {
        isIgnored: true,
        categoryId: null,
        nameKey: "ignore_lists.auto_ignored_badge",
        shortNameKey: "ignore_lists.auto_ignored_badge",
        categoryLabelRu: "\u0418\u0433\u043D\u043E\u0440",
        categoryLabelEn: "Ignore",
        shortNameRu: "\u0418\u0433\u043D\u043E\u0440",
        shortNameEn: "Ignore",
        icon: "\u{1F6AB}"
      };
    }
    return {
      isIgnored: false,
      categoryId: null,
      nameKey: "",
      shortNameKey: "",
      categoryLabelRu: "",
      categoryLabelEn: "",
      shortNameRu: "",
      shortNameEn: "",
      icon: ""
    };
  }
};
var ignoreListManager = new IgnoreListManager();

// routes/vocabRoutes.ts
var router5 = (0, import_express5.Router)();
router5.post("/words", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const {
    word,
    translation,
    definition,
    ipa,
    grammar,
    contextRelation,
    status,
    examples,
    contextSentence,
    contextTranslation,
    targetLanguage,
    language,
    language_code,
    tags,
    imageUrl
  } = req.body;
  const rawWord = (word || "").trim();
  if (!rawWord) {
    return res.status(400).json({ error: "Word is required" });
  }
  const rawLang = (language_code || targetLanguage || language || "English").trim();
  const langName = normalizeLang(rawLang);
  const langLower = langName.toLowerCase();
  const wordStatus = String(status || "1");
  let wordTranslation = (translation || "").trim();
  const invalidPlaceholders = ["translating...", "loading...", "\u2014", "\u2014 (\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)", "\u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D"];
  if (invalidPlaceholders.includes(wordTranslation.toLowerCase()) || wordTranslation.toLowerCase() === rawWord.toLowerCase()) {
    wordTranslation = "";
  }
  const hasDefinition = definition !== void 0;
  const wordDefinition = hasDefinition ? definition ? String(definition).trim() : null : null;
  const wordIpa = ipa ? String(ipa).trim() : "";
  const wordGrammar = grammar ? String(grammar).trim() : "";
  const wordContext = contextRelation ? String(contextRelation).trim() : contextSentence ? String(contextSentence).trim() : "";
  let exampleList = [];
  if (Array.isArray(examples) && examples.length > 0) {
    exampleList = examples;
  } else if (contextSentence && String(contextSentence).trim()) {
    exampleList = [{
      text: String(contextSentence).trim(),
      translation: contextTranslation ? String(contextTranslation).trim() : ""
    }];
  }
  const examplesJson = JSON.stringify(exampleList);
  const tagsJson = tags ? Array.isArray(tags) ? JSON.stringify(tags) : String(tags) : JSON.stringify([]);
  const now = Date.now();
  try {
    const db = getDbConnection(userId);
    db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `).run(langName, langName);
    const newWordId = `${userId}_${langLower}_${rawWord.toLowerCase()}`;
    const existing = db.prepare("SELECT id, translation FROM words WHERE user_id = ? AND language_code = ? AND word = ?").get(userId, langName, rawWord);
    if (existing) {
      db.prepare(`
        UPDATE words SET
          translation = CASE WHEN ? != '' THEN ? ELSE words.translation END,
          definition = CASE WHEN ? = 1 THEN ? ELSE definition END,
          ipa = CASE WHEN ? != '' THEN ? ELSE ipa END,
          grammar = CASE WHEN ? != '' THEN ? ELSE grammar END,
          contextRelation = CASE WHEN ? != '' THEN ? ELSE contextRelation END,
          status = ?,
          tags = ?,
          imageUrl = COALESCE(?, imageUrl),
          examples = CASE WHEN ? != '[]' THEN ? ELSE examples END
        WHERE user_id = ? AND language_code = ? AND word = ?
      `).run(
        wordTranslation,
        wordTranslation,
        hasDefinition ? 1 : 0,
        wordDefinition,
        wordIpa,
        wordIpa,
        wordGrammar,
        wordGrammar,
        wordContext,
        wordContext,
        wordStatus,
        tagsJson,
        imageUrl || null,
        examplesJson,
        examplesJson,
        userId,
        langName,
        rawWord
      );
    } else {
      db.prepare(`
        INSERT INTO words (
          id, user_id, language_code, word, translation, definition,
          ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          examples = CASE WHEN excluded.examples != '[]' THEN excluded.examples ELSE words.examples END,
          imageUrl = COALESCE(excluded.imageUrl, words.imageUrl)
      `).run(
        newWordId,
        userId,
        langName,
        rawWord,
        wordTranslation,
        wordDefinition,
        wordIpa,
        wordGrammar,
        wordContext,
        wordStatus,
        now,
        tagsJson,
        imageUrl || null,
        examplesJson
      );
    }
    console.log(`[EXTENSION API] Word saved: '${rawWord}' -> '${wordTranslation}' (${wordStatus}) [${langName}] for user "${userId}"`);
    return res.json({
      status: "success",
      userId,
      word: rawWord,
      language: langName,
      wordStatus,
      translation: wordTranslation
    });
  } catch (err) {
    console.error("[POST /api/words] Error saving word:", err);
    return res.status(500).json({ error: "Failed to save word: " + err.message });
  }
});
router5.get("/words", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const rawLang = (req.query.lang || req.query.language || req.query.language_code || "").toString().trim();
  const statusFilter = req.query.status ? String(req.query.status).trim() : null;
  try {
    const db = getDbConnection(userId);
    let query = "SELECT word, translation, status, language_code, ipa, grammar, examples, createdAt FROM words WHERE user_id = ?";
    const params = [userId];
    if (rawLang) {
      const canonicalLang = normalizeLang(rawLang);
      query += " AND (lower(language_code) = ? OR lower(language_code) = ?)";
      params.push(canonicalLang.toLowerCase(), rawLang.toLowerCase());
    }
    if (statusFilter) {
      query += " AND status = ?";
      params.push(statusFilter);
    }
    query += " ORDER BY createdAt DESC";
    const rows = db.prepare(query).all(...params);
    const map = {};
    for (const r of rows) {
      if (r.word) {
        const cleanWord = r.word.toLowerCase().trim();
        let trans = (r.translation || "").trim();
        const invalidPlaceholders = ["translating...", "loading...", "\u2014", "\u2014 (\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)", "\u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D"];
        if (invalidPlaceholders.includes(trans.toLowerCase()) || trans.toLowerCase() === cleanWord) {
          trans = "";
        }
        map[cleanWord] = {
          status: r.status,
          translation: trans,
          ipa: r.ipa || "",
          language: r.language_code || ""
        };
      }
    }
    console.log(`[GET /api/words] Returned ${rows.length} words for user "${userId}" (lang filter: "${rawLang || "ALL"}")`);
    return res.json({
      status: "ok",
      count: rows.length,
      userId,
      words: rows,
      map
    });
  } catch (err) {
    console.error("[GET /api/words] Error fetching words:", err);
    return res.status(500).json({ error: "Failed to fetch words: " + err.message });
  }
});
router5.post("/words/batch-status", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { words, language, language_code, targetLanguage } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.json({ status: "ok", results: {}, map: {} });
  }
  const rawLang = (language_code || targetLanguage || language || "English").trim();
  const canonicalLang = normalizeLang(rawLang);
  const cleanWords = Array.from(
    new Set(
      words.map((w) => String(w || "").trim().toLowerCase().replace(/[’‘ʻʼ´`]/g, "'")).filter(Boolean)
    )
  );
  if (cleanWords.length === 0) {
    return res.json({ status: "ok", results: {}, map: {} });
  }
  try {
    const db = getDbConnection(userId);
    const chunkSize = 400;
    const map = {};
    for (let i = 0; i < cleanWords.length; i += chunkSize) {
      const chunk = cleanWords.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const query = `
        SELECT word, translation, status, language_code, ipa
        FROM words
        WHERE user_id = ?
          AND (lower(language_code) = ? OR lower(language_code) = ?)
          AND lower(word) IN (${placeholders})
      `;
      const params = [userId, canonicalLang.toLowerCase(), rawLang.toLowerCase(), ...chunk];
      const rows = db.prepare(query).all(...params);
      for (const r of rows) {
        if (r.word) {
          const wLower = r.word.toLowerCase().replace(/[’‘ʻʼ´`]/g, "'").trim();
          let trans = (r.translation || "").trim();
          const invalidPlaceholders = ["translating...", "loading...", "\u2014", "\u2014 (\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)", "\u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D"];
          if (invalidPlaceholders.includes(trans.toLowerCase()) || trans.toLowerCase() === wLower) {
            trans = "";
          }
          map[wLower] = {
            status: r.status,
            translation: trans,
            ipa: r.ipa || "",
            language: r.language_code || canonicalLang
          };
        }
      }
    }
    const missingContractions = [];
    for (const w of cleanWords) {
      if (!map[w]) {
        const base = normalizeContraction(w, canonicalLang);
        if (base && base !== w) {
          if (map[base]) {
            map[w] = {
              ...map[base],
              lemma: base
            };
          } else {
            missingContractions.push({ original: w, base });
          }
        }
      }
    }
    if (missingContractions.length > 0) {
      const uniqueBases = Array.from(new Set(missingContractions.map((mc) => mc.base)));
      for (let i = 0; i < uniqueBases.length; i += chunkSize) {
        const chunk = uniqueBases.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const query = `
          SELECT word, translation, status, language_code, ipa
          FROM words
          WHERE user_id = ?
            AND (lower(language_code) = ? OR lower(language_code) = ?)
            AND lower(word) IN (${placeholders})
        `;
        const params = [userId, canonicalLang.toLowerCase(), rawLang.toLowerCase(), ...chunk];
        const rows = db.prepare(query).all(...params);
        for (const r of rows) {
          if (r.word) {
            const baseLower = r.word.toLowerCase().replace(/[’‘ʻʼ´`]/g, "'").trim();
            let trans = (r.translation || "").trim();
            const invalidPlaceholders = ["translating...", "loading...", "\u2014", "\u2014 (\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)", "\u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D"];
            if (invalidPlaceholders.includes(trans.toLowerCase()) || trans.toLowerCase() === baseLower) {
              trans = "";
            }
            const baseEntry = {
              status: r.status,
              translation: trans,
              ipa: r.ipa || "",
              language: r.language_code || canonicalLang
            };
            map[baseLower] = baseEntry;
            for (const mc of missingContractions) {
              if (mc.base === baseLower && !map[mc.original]) {
                map[mc.original] = {
                  ...baseEntry,
                  lemma: baseLower
                };
              }
            }
          }
        }
      }
    }
    for (const w of cleanWords) {
      if (!map[w]) {
        let autoRes = ignoreListManager.checkAutoIgnore(w, void 0, canonicalLang);
        let matchedWord = w;
        if (!autoRes.isIgnored) {
          const base = normalizeContraction(w, canonicalLang);
          if (base && base !== w) {
            autoRes = ignoreListManager.checkAutoIgnore(base, void 0, canonicalLang);
            matchedWord = base;
          }
        }
        if (autoRes.isIgnored) {
          map[w] = {
            status: "ignored",
            translation: "",
            ipa: "",
            language: canonicalLang,
            isAutoIgnored: true,
            ignoreCategory: autoRes.categoryLabelEn,
            ignoreBadge: autoRes.shortNameEn,
            ignoreIcon: autoRes.icon,
            ignoreCategoryId: autoRes.categoryId,
            lemma: matchedWord !== w ? matchedWord : void 0
          };
        }
      }
    }
    console.log(`[POST /api/words/batch-status] Checked ${cleanWords.length} words for user "${userId}" [${canonicalLang}] -> matched ${Object.keys(map).length}`);
    return res.json({
      status: "ok",
      language: canonicalLang,
      count: Object.keys(map).length,
      map,
      results: map
    });
  } catch (err) {
    console.error("[POST /api/words/batch-status] Error:", err);
    return res.status(500).json({ error: "Failed to batch lookup words: " + err.message });
  }
});
router5.post("/word-links", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { word_from, word_to, from, to, language, language_code } = req.body;
  const sourceWord = String(word_from || from || "").trim().toLowerCase();
  const targetWord = String(word_to || to || "").trim().toLowerCase();
  const rawLang = String(language_code || language || "English").trim();
  const langName = normalizeLang(rawLang);
  const langLower = langName.toLowerCase();
  if (!sourceWord || !targetWord) {
    return res.status(400).json({ error: "word_from and word_to are required" });
  }
  if (sourceWord === targetWord) {
    return res.json({ status: "noop", message: "Source and target words are identical" });
  }
  try {
    const db = getDbConnection(userId);
    db.prepare(`
      INSERT OR REPLACE INTO word_links (user_id, language_code, word_from, word_to)
      VALUES (?, ?, ?, ?)
    `).run(userId, langName, sourceWord, targetWord);
    const parentRow = db.prepare(`
      SELECT status, translation, definition, ipa, grammar FROM words
      WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?) AND lower(word) = ?
    `).get(userId, langLower, rawLang.toLowerCase(), targetWord);
    let inheritedStatus = parentRow?.status || "new";
    let inheritedTranslation = parentRow?.translation || "";
    if (parentRow) {
      const existingChild = db.prepare(`
        SELECT id FROM words
        WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?) AND lower(word) = ?
      `).get(userId, langLower, rawLang.toLowerCase(), sourceWord);
      if (existingChild) {
        db.prepare(`
          UPDATE words SET
            status = ?,
            translation = CASE WHEN translation = '' OR translation IS NULL THEN ? ELSE translation END
          WHERE user_id = ? AND id = ?
        `).run(parentRow.status, parentRow.translation || "", userId, existingChild.id);
      } else {
        const newChildId = `${userId}_${langLower}_${sourceWord}`;
        db.prepare(`
          INSERT INTO words (
            id, user_id, language_code, word, translation, definition, ipa, grammar,
            contextRelation, status, createdAt, tags, imageUrl, examples
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]')
          ON CONFLICT(id) DO UPDATE SET status = excluded.status
        `).run(
          newChildId,
          userId,
          langName,
          sourceWord,
          parentRow.translation || "",
          parentRow.definition || null,
          parentRow.ipa || null,
          parentRow.grammar || null,
          `\u0424\u043E\u0440\u043C\u0430 \u043E\u0442 \u0431\u0430\u0437\u043E\u0432\u043E\u0433\u043E \u0441\u043B\u043E\u0432\u0430 "${targetWord}"`,
          parentRow.status || "1",
          Date.now(),
          JSON.stringify(["child_form", "morphology"])
        );
      }
    }
    console.log(`[POST /api/word-links] Linked "${sourceWord}" \u2794 "${targetWord}" for user "${userId}" (${langName}), inherited status: "${inheritedStatus}"`);
    return res.json({
      status: "ok",
      from: sourceWord,
      to: targetWord,
      parentStatus: inheritedStatus,
      parentTranslation: inheritedTranslation
    });
  } catch (err) {
    console.error("[POST /api/word-links] Error saving word link:", err);
    return res.status(500).json({ error: "Failed to save word link: " + err.message });
  }
});
router5.get("/word-links", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const rawLang = (req.query.language || req.query.language_code || "").trim();
  try {
    const db = getDbConnection(userId);
    let rows = [];
    if (rawLang) {
      const langName = normalizeLang(rawLang);
      const langLower = langName.toLowerCase();
      rows = db.prepare(`
        SELECT language_code, word_from, word_to FROM word_links
        WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?)
      `).all(userId, langLower, rawLang.toLowerCase());
    } else {
      rows = db.prepare(`
        SELECT language_code, word_from, word_to FROM word_links
        WHERE user_id = ?
      `).all(userId);
    }
    const linksMap = {};
    for (const r of rows) {
      if (r.word_from && r.word_to) {
        linksMap[r.word_from.toLowerCase().trim()] = r.word_to.toLowerCase().trim();
      }
    }
    return res.json({
      status: "ok",
      count: rows.length,
      links: linksMap,
      rawLinks: rows
    });
  } catch (err) {
    console.error("[GET /api/word-links] Error fetching word links:", err);
    return res.status(500).json({ error: "Failed to fetch word links: " + err.message });
  }
});
var vocabRoutes_default = router5;

// routes/db.ts
var router6 = (0, import_express6.Router)();
var DATA_DIR5 = process.env.DATA_DIR || process.cwd();
var AUDIO_STORAGE_DIR = import_path7.default.join(DATA_DIR5, "audio_files");
function saveAudioBase64ToDisk(lessonId, base64OrDataUrl, userId = "default") {
  try {
    if (!import_fs8.default.existsSync(AUDIO_STORAGE_DIR)) {
      import_fs8.default.mkdirSync(AUDIO_STORAGE_DIR, { recursive: true });
    }
    const cleanBase64 = base64OrDataUrl.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (buffer.length === 0) return null;
    let ext = "mp3";
    if (base64OrDataUrl.startsWith("data:audio/wav")) ext = "wav";
    else if (base64OrDataUrl.startsWith("data:audio/ogg")) ext = "ogg";
    else if (base64OrDataUrl.startsWith("data:audio/m4a") || base64OrDataUrl.startsWith("data:audio/mp4")) ext = "m4a";
    const safeUser = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeLessonId = String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = safeUser === "default" ? `${safeLessonId}.${ext}` : `${safeUser}_${safeLessonId}.${ext}`;
    const filePath = import_path7.default.join(AUDIO_STORAGE_DIR, fileName);
    import_fs8.default.writeFileSync(filePath, buffer);
    return `/api/audio-files/${fileName}`;
  } catch (err) {
    console.error(`[saveAudioBase64ToDisk] Failed to save audio for lesson ${lessonId}:`, err);
    return null;
  }
}
function getLocalServerDb(userId = "default") {
  try {
    const db = getDbConnection(userId);
    const listeningRow = db.prepare(
      "SELECT value FROM metadata WHERE user_id = ? AND key = 'listeningSeconds'"
    ).get(userId);
    const listeningSeconds = listeningRow ? parseFloat(listeningRow.value) || 0 : 0;
    const langRows = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL").all();
    const languageFlags = {};
    for (const row of langRows) {
      languageFlags[row.code] = row.flag;
    }
    const userLangFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'languageFlags'").get(userId);
    if (userLangFlagsRow?.value) {
      try {
        const parsed = JSON.parse(userLangFlagsRow.value);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") languageFlags[k] = v;
          }
        }
      } catch (_) {
      }
    }
    const lessonsRows = db.prepare(
      "SELECT *, rowid FROM lessons WHERE user_id = ? AND (length(trim(COALESCE(text, ''))) > 0 OR isBuiltIn = 1 OR (wordTimestamps IS NOT NULL AND length(wordTimestamps) > 2)) ORDER BY COALESCE(createdAt, rowid * 1000) DESC"
    ).all(userId);
    const updateAudioStmt = db.prepare("UPDATE lessons SET audioUrl = ?, audioBase64 = NULL WHERE id = ? AND user_id = ?");
    const lessons = lessonsRows.map((l) => {
      let currentAudioUrl = l.audioUrl;
      let currentAudioBase64 = l.audioBase64;
      if (currentAudioBase64 && typeof currentAudioBase64 === "string" && currentAudioBase64.length > 50) {
        const savedFileUrl = saveAudioBase64ToDisk(l.id, currentAudioBase64, userId);
        if (savedFileUrl) {
          currentAudioUrl = savedFileUrl;
          currentAudioBase64 = null;
          try {
            updateAudioStmt.run(savedFileUrl, l.id, userId);
          } catch (e) {
          }
        }
      }
      let lessonDifficulty = l.difficulty;
      let lessonDifficultyExplanation = l.difficultyExplanation;
      if (!lessonDifficulty && typeof l.text === "string" && l.text.trim().length > 0) {
        try {
          const langCode = (l.targetLanguage || "en").toLowerCase();
          const comp = analyzeTextComplexity(l.text, langCode.startsWith("en") ? "en" : langCode);
          if (comp && comp.cefrOverall) {
            lessonDifficulty = comp.cefrOverall;
            lessonDifficultyExplanation = `A1-A2: ${comp.coverage.a1_a2}%, B1-B2: ${comp.coverage.b1_b2}%, C1-C2: ${comp.coverage.c1_c2}%, Rare: ${comp.coverage.rare}%`;
            try {
              db.prepare("UPDATE lessons SET difficulty = ?, difficultyExplanation = ? WHERE id = ? AND user_id = ?").run(lessonDifficulty, lessonDifficultyExplanation, l.id, userId);
            } catch (_) {
            }
          }
        } catch (_) {
        }
      }
      if (l && typeof l.wordTimestamps === "string") {
        try {
          l.wordTimestamps = JSON.parse(l.wordTimestamps);
        } catch (_) {
          l.wordTimestamps = null;
        }
      }
      return {
        id: l.id,
        title: l.title,
        text: l.text,
        audioUrl: currentAudioUrl,
        audioBase64: null,
        targetLanguage: normalizeLang(l.targetLanguage || "English"),
        translationLanguage: normalizeLang(l.translationLanguage || "Russian"),
        isBuiltIn: l.isBuiltIn === 1,
        isArchived: l.isArchived === 1,
        coverUrl: l.coverUrl,
        youtubeId: l.youtubeId,
        localVideoUrl: l.localVideoUrl || null,
        lessonType: l.lessonType,
        pinned: l.pinned === 1,
        translationText: l.translationText,
        detectedPhrases: l.detectedPhrases ? JSON.parse(l.detectedPhrases) : {},
        difficulty: lessonDifficulty,
        difficultyExplanation: lessonDifficultyExplanation,
        createdAt: l.createdAt ?? (l.rowid ? l.rowid * 1e3 : void 0),
        wordTimestamps: l.wordTimestamps,
        channelName: l.channelName || null,
        channelAvatarUrl: l.channelAvatarUrl || null,
        channelUrl: l.channelUrl || null,
        playlistId: l.playlistId || null,
        images: l.images ? typeof l.images === "string" ? JSON.parse(l.images) : l.images : void 0,
        audioProgress: l.audioProgress || 0,
        duration: l.duration ?? l.durationSeconds ?? (l.youtubeDuration || null),
        durationSeconds: l.durationSeconds ?? l.duration ?? null,
        youtubeDuration: l.youtubeDuration ?? l.duration ?? null,
        audioDuration: l.audioDuration ?? null,
        sourceType: l.sourceType || (l.lessonType === "youtube" ? "youtube" : l.lessonType === "podcast" || l.lessonType === "audio" ? "podcast" : l.lessonType === "article" || l.lessonType === "website" || l.lessonType === "news" ? "article" : l.lessonType === "book" || l.epub || l.pdf ? "book" : l.lessonType || "article"),
        wordCount: l.wordCount ?? null,
        primaryTag: l.primaryTag || void 0,
        tags: l.tags ? typeof l.tags === "string" ? JSON.parse(l.tags) : l.tags : []
      };
    });
    const playlistsRows = db.prepare(
      "SELECT * FROM playlists WHERE user_id = ? ORDER BY COALESCE(pinned, 0) DESC, COALESCE(orderIndex, 0) ASC, COALESCE(createdAt, rowid * 1000) DESC"
    ).all(userId);
    const playlists = playlistsRows.map((p) => {
      const parsedItems = p.items ? typeof p.items === "string" ? JSON.parse(p.items) : p.items : [];
      const cleanItems = deduplicateDbPlaylistItems(parsedItems);
      return {
        id: p.id,
        title: p.title,
        description: p.description || void 0,
        thumbnailUrl: p.thumbnailUrl || "",
        sourceType: p.sourceType || "custom_collection",
        externalUrl: p.externalUrl || void 0,
        channelTitle: p.channelTitle || void 0,
        itemCount: cleanItems.length,
        language: p.language || "en",
        items: cleanItems,
        isArchived: p.isArchived === 1,
        primaryTag: p.primaryTag || void 0,
        tags: p.tags ? typeof p.tags === "string" ? JSON.parse(p.tags) : p.tags : [],
        order: typeof p.orderIndex === "number" ? p.orderIndex : 0,
        pinned: p.pinned === 1,
        createdAt: p.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: p.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    const lessonTypes = db.prepare("SELECT * FROM lesson_types").all();
    const wordsRows = db.prepare("SELECT * FROM words WHERE user_id = ?").all(userId);
    const vocabWords = {};
    for (const w of wordsRows) {
      const lang = (w.language_code || "english").toLowerCase();
      const vocabKey = w.id && w.id.includes("_") && w.id.startsWith(lang + "_") ? w.id : `${lang}_${w.word}`;
      vocabWords[vocabKey] = {
        word: w.word,
        language_code: lang,
        translation: w.translation || "",
        definition: w.definition && typeof w.definition === "string" && w.definition.trim() !== "" ? w.definition.trim() : void 0,
        ipa: w.ipa || "",
        grammar: w.grammar || "",
        contextRelation: w.contextRelation || "",
        status: w.status,
        createdAt: w.createdAt,
        tags: w.tags ? JSON.parse(w.tags) : [],
        imageUrl: w.imageUrl,
        audioClipUrl: w.audioClipUrl,
        examples: w.examples ? JSON.parse(w.examples) : [],
        spellingCorrectCount: w.spellingCorrectCount || 0,
        spellingIncorrectCount: w.spellingIncorrectCount || 0,
        spellingAccentCount: w.spellingAccentCount || 0,
        lastSpelledCorrectly: w.lastSpelledCorrectly === 1 ? true : w.lastSpelledCorrectly === 0 ? false : null,
        lastSpelledWithAccentError: w.lastSpelledWithAccentError === 1,
        spellingExclude: w.spellingExclude === 1,
        srsNextReview: typeof w.srsNextReview === "number" ? w.srsNextReview : void 0,
        srsInterval: typeof w.srsInterval === "number" ? w.srsInterval : void 0,
        srsEaseFactor: typeof w.srsEaseFactor === "number" ? w.srsEaseFactor : void 0,
        srsRepetitions: typeof w.srsRepetitions === "number" ? w.srsRepetitions : void 0
      };
    }
    const linksRows = db.prepare(
      "SELECT language_code, word_from, word_to FROM word_links WHERE user_id = ?"
    ).all(userId);
    const wordLinks = {};
    for (const link of linksRows) {
      const lang = link.language_code;
      if (lang && lang !== "null") {
        wordLinks[`${lang}_${link.word_from}`] = `${lang}_${link.word_to}`;
      }
    }
    let history = [];
    try {
      const historyRows = db.prepare(
        "SELECT * FROM reading_history WHERE user_id = ? ORDER BY timestamp DESC"
      ).all(userId);
      history = historyRows.map((h) => ({
        id: h.id,
        lessonId: h.lessonId,
        lessonTitle: h.lessonTitle,
        lessonType: h.lessonType || "article",
        coverUrl: h.coverUrl || null,
        targetLanguage: h.targetLanguage,
        timestamp: h.timestamp,
        actionType: h.actionType,
        status: h.status || "in_progress",
        durationSeconds: h.durationSeconds || 0,
        duration: h.duration !== null && h.duration !== void 0 ? Number(h.duration) : void 0,
        notes: h.notes || void 0,
        channelName: h.channelName || null,
        channelAvatarUrl: h.channelAvatarUrl || null,
        channelUrl: h.channelUrl || void 0,
        category: h.category || void 0,
        customTitle: h.customTitle || void 0,
        mode: h.mode || void 0,
        tags: h.tags ? typeof h.tags === "string" ? JSON.parse(h.tags) : h.tags : [],
        primaryTag: h.primaryTag || void 0,
        lastPosition: h.lastPosition !== null && h.lastPosition !== void 0 ? Number(h.lastPosition) : void 0,
        audioUrl: h.audioUrl || void 0,
        guid: h.guid || void 0,
        podcastTitle: h.podcastTitle || void 0,
        youtubeId: h.youtubeId || void 0
      }));
    } catch (_) {
    }
    const metadataRows = db.prepare(
      "SELECT key, value FROM metadata WHERE user_id = ?"
    ).all(userId);
    const videoProgress = {};
    const readingProgress = {};
    let readerSettings = null;
    let pinnedLanguages = null;
    let hiddenLanguages = null;
    let selectedTargetLanguage = null;
    let dictionaryPreferences = null;
    let customTags = [];
    let dailyWordGoal = null;
    let lastActiveLessonId = null;
    for (const row of metadataRows) {
      if (row.key.startsWith("youtube_progress_")) {
        videoProgress[row.key.replace("youtube_progress_", "")] = row.value;
      } else if (row.key.startsWith("vocab_progress_")) {
        readingProgress[row.key.replace("vocab_progress_", "")] = row.value;
      } else if (row.key === "readerSettings" && row.value) {
        try {
          readerSettings = JSON.parse(row.value);
        } catch (_) {
        }
      } else if (row.key === "pinnedLanguages" && row.value) {
        try {
          pinnedLanguages = JSON.parse(row.value);
        } catch (_) {
        }
      } else if (row.key === "hiddenLanguages" && row.value) {
        try {
          hiddenLanguages = JSON.parse(row.value);
        } catch (_) {
        }
      } else if (row.key === "selectedTargetLanguage" && row.value) {
        selectedTargetLanguage = row.value;
      } else if (row.key === "dictionaryPreferences" && row.value) {
        try {
          dictionaryPreferences = JSON.parse(row.value);
        } catch (_) {
        }
      } else if (row.key === "customTags" && row.value) {
        try {
          customTags = JSON.parse(row.value);
        } catch (_) {
        }
      } else if (row.key === "dailyWordGoal" && row.value) {
        dailyWordGoal = parseInt(row.value, 10) || null;
      } else if (row.key === "lastActiveLessonId" && row.value) {
        lastActiveLessonId = row.value;
      }
    }
    return {
      lessons,
      playlists,
      lessonTypes,
      vocab: vocabWords,
      wordLinks,
      listeningSeconds,
      languageFlags,
      history,
      videoProgress,
      readingProgress,
      readerSettings,
      pinnedLanguages,
      hiddenLanguages,
      selectedTargetLanguage,
      dictionaryPreferences,
      customTags,
      dailyWordGoal,
      lastActiveLessonId
    };
  } catch (e) {
    console.error("Error loading SQLite database data:", e);
    return null;
  }
}
function saveLocalServerDb(userId = "default", data) {
  try {
    console.log(`[saveLocalServerDb] Attempting to save for userId: "${userId}"`);
    console.log(`[saveLocalServerDb] Data details - lessons: ${(data.lessons || []).length}, vocab words: ${Object.keys(data.vocab || {}).length}`);
    const db = getDbConnection(userId);
    const insertLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET flag=excluded.flag
    `);
    const ensureLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `);
    const insertWord = db.prepare(`
      INSERT OR REPLACE INTO words (
        id, user_id, language_code, word, translation, definition, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, audioClipUrl, examples,
        spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
        srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertWordLink = db.prepare(`
      INSERT OR REPLACE INTO word_links (user_id, language_code, word_from, word_to) VALUES (?, ?, ?, ?)
    `);
    const insertLesson = db.prepare(`
      INSERT INTO lessons (
        id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation, createdAt, wordTimestamps, channelName, channelAvatarUrl, channelUrl, playlistId, images, audioProgress, sourceType, primaryTag, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        title = excluded.title,
        text = excluded.text,
        audioUrl = excluded.audioUrl,
        audioBase64 = excluded.audioBase64,
        targetLanguage = excluded.targetLanguage,
        translationLanguage = excluded.translationLanguage,
        isBuiltIn = excluded.isBuiltIn,
        isArchived = excluded.isArchived,
        coverUrl = excluded.coverUrl,
        youtubeId = excluded.youtubeId,
        localVideoUrl = excluded.localVideoUrl,
        lessonType = excluded.lessonType,
        pinned = excluded.pinned,
        translationText = excluded.translationText,
        detectedPhrases = excluded.detectedPhrases,
        difficulty = COALESCE(excluded.difficulty, lessons.difficulty),
        difficultyExplanation = COALESCE(excluded.difficultyExplanation, lessons.difficultyExplanation),
        createdAt = COALESCE(lessons.createdAt, excluded.createdAt),
        wordTimestamps = excluded.wordTimestamps,
        channelName = COALESCE(excluded.channelName, lessons.channelName),
        channelAvatarUrl = COALESCE(excluded.channelAvatarUrl, lessons.channelAvatarUrl),
        channelUrl = COALESCE(excluded.channelUrl, lessons.channelUrl),
        playlistId = excluded.playlistId,
        images = excluded.images,
        audioProgress = excluded.audioProgress,
        sourceType = excluded.sourceType,
        primaryTag = excluded.primaryTag,
        tags = excluded.tags
    `);
    const insertPlaylist = db.prepare(`
      INSERT OR REPLACE INTO playlists (
        id, user_id, title, description, thumbnailUrl, sourceType, externalUrl, channelTitle, itemCount, language, items, isArchived, createdAt, updatedAt, primaryTag, tags, orderIndex, pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertItemTag = db.prepare(`
      INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)
    `);
    const insertLessonType = db.prepare(`
      INSERT OR REPLACE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)
    `);
    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)
    `);
    let writtenWordsCount = 0;
    let writtenLessonsCount = 0;
    db.transaction(() => {
      const ensuredLangs = /* @__PURE__ */ new Set();
      const ensureLangCached = (lang) => {
        if (!lang || ensuredLangs.has(lang)) return;
        ensuredLangs.add(lang);
        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
      };
      const flags = data.languageFlags || {};
      for (const [lang, flag] of Object.entries(flags)) {
        const name = lang.charAt(0).toUpperCase() + lang.slice(1);
        insertLanguage.run(lang, name, flag);
        ensuredLangs.add(lang);
      }
      if (data.languageFlags && typeof data.languageFlags === "object") {
        insertMetadata.run(userId, "languageFlags", JSON.stringify(data.languageFlags));
      }
      if (Array.isArray(data.deletedWordKeys) && data.deletedWordKeys.length > 0) {
        const delWordByIdStmt = db.prepare("DELETE FROM words WHERE user_id = ? AND id = ?");
        const delWordByLangWordStmt = db.prepare("DELETE FROM words WHERE user_id = ? AND lower(language_code) = ? AND lower(word) = ?");
        for (const rawKey of data.deletedWordKeys) {
          if (!rawKey || typeof rawKey !== "string") continue;
          delWordByIdStmt.run(userId, `${userId}_${rawKey.toLowerCase()}`);
          const m = rawKey.match(/^([a-zA-Z]+)_(.*)$/);
          if (m) {
            delWordByLangWordStmt.run(userId, m[1].toLowerCase(), m[2].toLowerCase());
          }
        }
      }
      const vocabWords = data.vocab || {};
      const incomingVocabKeys = Object.keys(vocabWords);
      const isDeltaSync = Boolean(data.isDelta);
      const existingWordCount = !isDeltaSync ? db.prepare("SELECT COUNT(*) as count FROM words WHERE user_id = ?").get(userId)?.count || 0 : 0;
      if (!isDeltaSync && existingWordCount > 0 && incomingVocabKeys.length === 0) {
        console.warn(`[SAFETY GUARD] Blocked attempt to overwrite ${existingWordCount} words with 0 words for user ${userId}`);
      } else if (incomingVocabKeys.length > 0) {
        const existingWordsMap = /* @__PURE__ */ new Map();
        const selectSingleWordStmt = incomingVocabKeys.length <= 25 ? db.prepare(
          `SELECT id, translation, definition, ipa, grammar, contextRelation, status, tags, imageUrl, audioClipUrl, examples,
                      spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
                      srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
               FROM words WHERE id = ? AND user_id = ?`
        ) : null;
        if (incomingVocabKeys.length > 25) {
          const existingRows = db.prepare(
            `SELECT id, translation, definition, ipa, grammar, contextRelation, status, tags, imageUrl, audioClipUrl, examples,
                    spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
                    srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
             FROM words WHERE user_id = ?`
          ).all(userId);
          for (const row of existingRows) {
            existingWordsMap.set(row.id, row);
          }
        }
        for (const [key, value] of Object.entries(vocabWords)) {
          const match = key.match(/^([a-zA-Z]+)[_:](.*)$/);
          const val = value;
          const lang = (match ? match[1] : val?.language || "english").toLowerCase();
          const wordVal = cleanWordPrefix(val.word || (match ? match[2] : key));
          if (!wordVal || wordVal.length > 80 || /[\r\n\t]/.test(wordVal)) {
            continue;
          }
          const tagsJson = val.tags && Array.isArray(val.tags) && val.tags.length > 0 ? JSON.stringify(val.tags) : null;
          const examplesJson = val.examples && Array.isArray(val.examples) && val.examples.length > 0 ? JSON.stringify(val.examples) : null;
          const wordKey = `${lang}_${wordVal.toLowerCase()}`;
          const wordId = `${userId}_${wordKey}`;
          const nextTranslation = val.translation || "";
          const nextDefinition = val.definition && typeof val.definition === "string" && val.definition.trim() !== "" ? val.definition.trim() : null;
          const nextIpa = val.ipa || "";
          const nextGrammar = val.grammar || "";
          const nextContextRelation = val.contextRelation || "";
          const nextStatus = val.status || "new";
          const nextImageUrl = val.imageUrl || null;
          const nextAudioClipUrl = val.audioClipUrl || null;
          const nextSpellCorrect = val.spellingCorrectCount || 0;
          const nextSpellIncorrect = val.spellingIncorrectCount || 0;
          const nextSpellAccent = val.spellingAccentCount || 0;
          const nextLastSpelled = val.lastSpelledCorrectly === true ? 1 : val.lastSpelledCorrectly === false ? 0 : null;
          const nextLastAccentErr = val.lastSpelledWithAccentError ? 1 : 0;
          const nextSpellExclude = val.spellingExclude ? 1 : 0;
          const nextSrsReview = val.srsNextReview || null;
          const nextSrsInterval = val.srsInterval || null;
          const nextSrsEase = val.srsEaseFactor || null;
          const nextSrsReps = val.srsRepetitions || null;
          const existingW = selectSingleWordStmt ? selectSingleWordStmt.get(wordId, userId) : existingWordsMap.get(wordId);
          if (existingW && existingW.status === nextStatus && existingW.translation === nextTranslation && existingW.definition === nextDefinition && existingW.ipa === nextIpa && existingW.grammar === nextGrammar && existingW.contextRelation === nextContextRelation && existingW.tags === tagsJson && existingW.imageUrl === nextImageUrl && existingW.audioClipUrl === nextAudioClipUrl && existingW.examples === examplesJson && (existingW.spellingCorrectCount || 0) === nextSpellCorrect && (existingW.spellingIncorrectCount || 0) === nextSpellIncorrect && (existingW.spellingAccentCount || 0) === nextSpellAccent && existingW.lastSpelledCorrectly === nextLastSpelled && (existingW.lastSpelledWithAccentError || 0) === nextLastAccentErr && (existingW.spellingExclude || 0) === nextSpellExclude && existingW.srsNextReview === nextSrsReview && existingW.srsInterval === nextSrsInterval && existingW.srsEaseFactor === nextSrsEase && existingW.srsRepetitions === nextSrsReps) {
            continue;
          }
          ensureLangCached(lang);
          insertWord.run(
            wordId,
            userId,
            lang,
            wordVal,
            nextTranslation,
            nextDefinition,
            nextIpa,
            nextGrammar,
            nextContextRelation,
            nextStatus,
            val.createdAt || Date.now(),
            tagsJson,
            nextImageUrl,
            nextAudioClipUrl,
            examplesJson,
            nextSpellCorrect,
            nextSpellIncorrect,
            nextSpellAccent,
            nextLastSpelled,
            nextLastAccentErr,
            nextSpellExclude,
            nextSrsReview,
            nextSrsInterval,
            nextSrsEase,
            nextSrsReps
          );
          writtenWordsCount++;
        }
      }
      const links = data.wordLinks || {};
      const incomingLinkKeys = Object.keys(links);
      const existingLinksCount = !isDeltaSync ? db.prepare("SELECT COUNT(*) as count FROM word_links WHERE user_id = ?").get(userId)?.count || 0 : 0;
      if (!isDeltaSync && existingLinksCount > 0 && incomingLinkKeys.length === 0) {
        console.warn(`[SAFETY GUARD] Blocked attempt to overwrite ${existingLinksCount} word_links with 0 links for user ${userId}`);
      } else if (incomingLinkKeys.length > 0) {
        const existingLinksSet = /* @__PURE__ */ new Set();
        if (incomingLinkKeys.length > 10) {
          const existingLinkRows = db.prepare("SELECT language_code, word_from, word_to FROM word_links WHERE user_id = ?").all(userId);
          for (const r of existingLinkRows) {
            existingLinksSet.add(`${r.language_code}|${r.word_from}|${r.word_to}`);
          }
        }
        for (const [key, val] of Object.entries(links)) {
          if (!val || typeof val !== "string") continue;
          const matchKey = key.match(/^([a-zA-Z]+)_(.*)$/);
          const matchVal = val.match(/^([a-zA-Z]+)_(.*)$/);
          if (!matchKey && !matchVal) {
            continue;
          }
          const lang = (matchKey ? matchKey[1] : matchVal[1]).toLowerCase();
          const cleanFrom = cleanWordPrefix(key);
          const cleanTo = cleanWordPrefix(val);
          if (existingLinksSet.has(`${lang}|${cleanFrom}|${cleanTo}`)) {
            continue;
          }
          ensureLangCached(lang);
          insertWordLink.run(userId, lang, cleanFrom, cleanTo);
        }
      }
      if (data.deletedLessonIds && Array.isArray(data.deletedLessonIds) && data.deletedLessonIds.length > 0) {
        const VIDEO_STORAGE_DIR3 = import_path7.default.join(DATA_DIR5, "media", "videos");
        const checkOtherUsersLessonStmt = db.prepare("SELECT 1 FROM lessons WHERE id = ? AND user_id != ? LIMIT 1");
        const safeUser = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
        for (const delId of data.deletedLessonIds) {
          try {
            const safeDelId = String(delId).replace(/[^a-zA-Z0-9_-]/g, "_");
            for (const ext of ["mp3", "m4a", "wav", "ogg"]) {
              const userScopedAudio = import_path7.default.join(AUDIO_STORAGE_DIR, `${safeUser}_${safeDelId}.${ext}`);
              if (import_fs8.default.existsSync(userScopedAudio)) import_fs8.default.unlinkSync(userScopedAudio);
            }
            const stillUsedByOther = checkOtherUsersLessonStmt.get(delId, userId);
            if (!stillUsedByOther) {
              const audioPathMp3 = import_path7.default.join(AUDIO_STORAGE_DIR, `audio_${delId}.mp3`);
              if (import_fs8.default.existsSync(audioPathMp3)) import_fs8.default.unlinkSync(audioPathMp3);
              const audioPathM4a = import_path7.default.join(AUDIO_STORAGE_DIR, `audio_${delId}.m4a`);
              if (import_fs8.default.existsSync(audioPathM4a)) import_fs8.default.unlinkSync(audioPathM4a);
              if (import_fs8.default.existsSync(VIDEO_STORAGE_DIR3)) {
                const videoMp4 = import_path7.default.join(VIDEO_STORAGE_DIR3, `${delId}.mp4`);
                if (import_fs8.default.existsSync(videoMp4)) import_fs8.default.unlinkSync(videoMp4);
                const videoM4a = import_path7.default.join(VIDEO_STORAGE_DIR3, `${delId}.m4a`);
                if (import_fs8.default.existsSync(videoM4a)) import_fs8.default.unlinkSync(videoM4a);
              }
            }
          } catch (e) {
            console.error("Failed to delete local media files for lesson:", delId, e);
          }
        }
        const placeholders = data.deletedLessonIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM lessons WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedLessonIds);
        const insertMeta = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, '1')");
        for (const delId of data.deletedLessonIds) {
          insertMeta.run(userId, `deleted_lesson_${delId}`);
        }
      }
      const lessons = data.lessons || [];
      const selectExistingLessonStmt = db.prepare(
        "SELECT title, text, audioUrl, targetLanguage, translationLanguage, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, playlistId, audioProgress, primaryTag, tags FROM lessons WHERE id = ? AND user_id = ?"
      );
      for (const l of lessons) {
        let finalAudioUrl = l.audioUrl || null;
        let finalAudioBase64 = null;
        if (l.audioBase64 && typeof l.audioBase64 === "string" && l.audioBase64.length > 50) {
          const savedUrl = saveAudioBase64ToDisk(l.id, l.audioBase64, userId);
          if (savedUrl) {
            finalAudioUrl = savedUrl;
          }
        }
        const existingLesson = selectExistingLessonStmt.get(l.id, userId);
        let finalIsArchived = l.isArchived ? 1 : 0;
        let finalPinned = l.pinned ? 1 : 0;
        if (l.isArchived === void 0 && existingLesson) {
          finalIsArchived = existingLesson.isArchived || 0;
        }
        if (l.pinned === void 0 && existingLesson) {
          finalPinned = existingLesson.pinned || 0;
        }
        const lessonPrimaryTag = l.primaryTag || null;
        const lessonTagsJson = l.tags && Array.isArray(l.tags) && l.tags.length > 0 ? JSON.stringify(l.tags) : null;
        const nextDetectedPhrasesJson = JSON.stringify(l.detectedPhrases || {});
        const nextAudioProgress = l.audioProgress !== void 0 ? Math.floor(Number(l.audioProgress) || 0) : existingLesson?.audioProgress || 0;
        if (existingLesson && existingLesson.title === l.title && existingLesson.text === l.text && existingLesson.audioUrl === finalAudioUrl && existingLesson.targetLanguage === (l.targetLanguage || "english") && existingLesson.translationLanguage === (l.translationLanguage || "russian") && existingLesson.isArchived === finalIsArchived && existingLesson.pinned === finalPinned && existingLesson.coverUrl === (l.coverUrl || null) && existingLesson.youtubeId === (l.youtubeId || null) && existingLesson.localVideoUrl === (l.localVideoUrl || null) && existingLesson.lessonType === (l.lessonType || null) && existingLesson.translationText === (l.translationText || null) && existingLesson.detectedPhrases === nextDetectedPhrasesJson && existingLesson.playlistId === (l.playlistId || null) && (existingLesson.audioProgress || 0) === nextAudioProgress && existingLesson.primaryTag === lessonPrimaryTag && existingLesson.tags === lessonTagsJson) {
          continue;
        }
        insertLesson.run(
          l.id,
          userId,
          l.title,
          l.text,
          finalAudioUrl,
          finalAudioBase64,
          normalizeLang(l.targetLanguage || "English"),
          normalizeLang(l.translationLanguage || "Russian"),
          l.isBuiltIn ? 1 : 0,
          finalIsArchived,
          l.coverUrl || null,
          l.youtubeId || null,
          l.localVideoUrl || null,
          l.lessonType || null,
          finalPinned,
          l.translationText || null,
          nextDetectedPhrasesJson,
          l.difficulty || null,
          l.difficultyExplanation || null,
          // Preserve existing createdAt if present, else use current time
          typeof l.createdAt === "number" && l.createdAt > 0 ? l.createdAt : Date.now(),
          l.wordTimestamps ? JSON.stringify(l.wordTimestamps) : null,
          l.channelName || l.channelTitle || null,
          l.channelAvatarUrl || l.channelAvatar || null,
          l.channelUrl || null,
          l.playlistId || null,
          l.images ? typeof l.images === "string" ? l.images : JSON.stringify(l.images) : null,
          nextAudioProgress,
          l.sourceType || (l.lessonType === "youtube" ? "youtube" : l.lessonType === "podcast" || l.lessonType === "audio" ? "podcast" : l.lessonType === "article" || l.lessonType === "website" || l.lessonType === "news" ? "article" : l.lessonType === "book" || l.epub || l.pdf ? "book" : l.lessonType || "article"),
          lessonPrimaryTag,
          lessonTagsJson
        );
        writtenLessonsCount++;
        if (lessonPrimaryTag && typeof lessonPrimaryTag === "string" && lessonPrimaryTag.trim()) {
          const pTag = lessonPrimaryTag.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          insertTag.run(tagId, userId, pTag, null, l.targetLanguage || null, Date.now());
          insertItemTag.run(userId, l.id, tagId, 1);
        }
        if (Array.isArray(l.tags)) {
          for (const t of l.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = lessonPrimaryTag && lessonPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            insertTag.run(tagId, userId, tagName, null, l.targetLanguage || null, Date.now());
            insertItemTag.run(userId, l.id, tagId, isPrim);
          }
        }
      }
      if (data.deletedPlaylistIds && Array.isArray(data.deletedPlaylistIds) && data.deletedPlaylistIds.length > 0) {
        const placeholders = data.deletedPlaylistIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM playlists WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedPlaylistIds);
        const insertMeta = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, '1')");
        for (const delId of data.deletedPlaylistIds) {
          insertMeta.run(userId, `deleted_playlist_${delId}`);
        }
      }
      const playlists = data.playlists || [];
      const selectExistingPlaylistStmt = db.prepare("SELECT isArchived, orderIndex, pinned FROM playlists WHERE id = ? AND user_id = ?");
      for (const p of playlists) {
        const existingPlaylist = selectExistingPlaylistStmt.get(p.id, userId);
        let finalPlIsArchived = p.isArchived ? 1 : 0;
        if (p.isArchived === void 0 && existingPlaylist) {
          finalPlIsArchived = existingPlaylist.isArchived || 0;
        }
        let finalOrder = typeof p.order === "number" ? p.order : typeof p.orderIndex === "number" ? p.orderIndex : existingPlaylist?.orderIndex ?? 0;
        let finalPinned = p.pinned !== void 0 ? p.pinned ? 1 : 0 : existingPlaylist?.pinned || 0;
        const playlistPrimaryTag = p.primaryTag || null;
        const playlistTagsJson = p.tags && Array.isArray(p.tags) && p.tags.length > 0 ? JSON.stringify(p.tags) : null;
        const rawPlItems = p.items ? typeof p.items === "string" ? JSON.parse(p.items) : p.items : [];
        const cleanPlItems = deduplicateDbPlaylistItems(rawPlItems);
        insertPlaylist.run(
          p.id,
          userId,
          p.title || "Untitled Playlist",
          p.description || null,
          p.thumbnailUrl || "",
          p.sourceType || "custom_collection",
          p.externalUrl || null,
          p.channelTitle || null,
          cleanPlItems.length,
          p.language || "en",
          JSON.stringify(cleanPlItems),
          finalPlIsArchived,
          p.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
          p.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
          playlistPrimaryTag,
          playlistTagsJson,
          finalOrder,
          finalPinned
        );
        if (playlistPrimaryTag && typeof playlistPrimaryTag === "string" && playlistPrimaryTag.trim()) {
          const pTag = playlistPrimaryTag.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          insertTag.run(tagId, userId, pTag, null, p.language || null, Date.now());
          insertItemTag.run(userId, p.id, tagId, 1);
        }
        if (Array.isArray(p.tags)) {
          for (const t of p.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = playlistPrimaryTag && playlistPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            insertTag.run(tagId, userId, tagName, null, p.language || null, Date.now());
            insertItemTag.run(userId, p.id, tagId, isPrim);
          }
        }
      }
      if (Array.isArray(playlists) && playlists.length > 0) {
        const updateLessonPlaylistStmt = db.prepare(
          "UPDATE lessons SET playlistId = ?, primaryTag = COALESCE(primaryTag, ?) WHERE user_id = ? AND (id = ? OR (youtubeId IS NOT NULL AND length(youtubeId) > 2 AND youtubeId = ?))"
        );
        for (const p of playlists) {
          try {
            const items = Array.isArray(p.items) ? p.items : typeof p.items === "string" ? JSON.parse(p.items || "[]") : [];
            for (const item of items) {
              if (item.lessonId || item.videoId) {
                updateLessonPlaylistStmt.run(p.id, p.primaryTag || null, userId, item.lessonId || "", item.videoId || "");
              }
            }
          } catch (_) {
          }
        }
      }
      const types = data.lessonTypes || [];
      for (const t of types) {
        if (t && t.id && t.name) {
          insertLessonType.run(t.id, t.name, t.icon);
        }
      }
      if (data.listeningSeconds !== void 0) {
        insertMetadata.run(userId, "listeningSeconds", String(data.listeningSeconds));
      }
      if (data.readerSettings && typeof data.readerSettings === "object") {
        insertMetadata.run(userId, "readerSettings", JSON.stringify(data.readerSettings));
      }
      if (data.pinnedLanguages && Array.isArray(data.pinnedLanguages)) {
        insertMetadata.run(userId, "pinnedLanguages", JSON.stringify(data.pinnedLanguages));
      }
      if (data.hiddenLanguages && Array.isArray(data.hiddenLanguages)) {
        insertMetadata.run(userId, "hiddenLanguages", JSON.stringify(data.hiddenLanguages));
      }
      if (data.selectedTargetLanguage && typeof data.selectedTargetLanguage === "string") {
        insertMetadata.run(userId, "selectedTargetLanguage", data.selectedTargetLanguage);
      }
      if (data.dictionaryPreferences && typeof data.dictionaryPreferences === "object") {
        let existingPrefs = {};
        const existingRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'dictionaryPreferences'").get(userId);
        if (existingRow?.value) {
          try {
            existingPrefs = JSON.parse(existingRow.value) || {};
          } catch (_) {
          }
        }
        const mergedPrefs = { ...existingPrefs };
        for (const [langKey, tabPrefs] of Object.entries(data.dictionaryPreferences)) {
          if (tabPrefs && typeof tabPrefs === "object") {
            mergedPrefs[langKey] = {
              ...mergedPrefs[langKey] || {},
              ...tabPrefs
            };
          }
        }
        insertMetadata.run(userId, "dictionaryPreferences", JSON.stringify(mergedPrefs));
      }
      if (data.customTags && Array.isArray(data.customTags)) {
        insertMetadata.run(userId, "customTags", JSON.stringify(data.customTags));
      }
      if (data.dailyWordGoal !== void 0 && data.dailyWordGoal !== null) {
        insertMetadata.run(userId, "dailyWordGoal", String(data.dailyWordGoal));
      }
      if (data.lastActiveLessonId && typeof data.lastActiveLessonId === "string") {
        insertMetadata.run(userId, "lastActiveLessonId", data.lastActiveLessonId);
      }
      const getMetaStmt = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?");
      if (data.videoProgress && typeof data.videoProgress === "object") {
        for (const [lessonId, val] of Object.entries(data.videoProgress)) {
          if (val !== void 0 && val !== null) {
            const key = `youtube_progress_${lessonId}`;
            const existingRow = getMetaStmt.get(userId, key);
            let incomingUpdatedAt = Date.now();
            let incomingProgress = val;
            if (typeof val === "object" && val !== null && "progress" in val) {
              incomingProgress = val.progress;
              if (typeof val.updatedAt === "number") incomingUpdatedAt = val.updatedAt;
            } else if (typeof val === "string") {
              try {
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === "object" && "progress" in parsed) {
                  incomingProgress = parsed.progress;
                  if (typeof parsed.updatedAt === "number") incomingUpdatedAt = parsed.updatedAt;
                }
              } catch (_) {
              }
            }
            let shouldSave = true;
            if (existingRow?.value) {
              try {
                const existingParsed = JSON.parse(existingRow.value);
                if (existingParsed && typeof existingParsed.updatedAt === "number" && existingParsed.updatedAt > incomingUpdatedAt) {
                  shouldSave = false;
                }
              } catch (_) {
              }
            }
            if (shouldSave) {
              const payload = JSON.stringify({ progress: incomingProgress, updatedAt: incomingUpdatedAt });
              insertMetadata.run(userId, key, payload);
            }
          }
        }
      }
      if (data.readingProgress && typeof data.readingProgress === "object") {
        for (const [lessonId, val] of Object.entries(data.readingProgress)) {
          if (val !== void 0 && val !== null) {
            const key = `vocab_progress_${lessonId}`;
            const existingRow = getMetaStmt.get(userId, key);
            let incomingUpdatedAt = Date.now();
            let incomingProgress = val;
            if (typeof val === "object" && val !== null && "progress" in val) {
              incomingProgress = val.progress;
              if (typeof val.updatedAt === "number") incomingUpdatedAt = val.updatedAt;
            } else if (typeof val === "string") {
              try {
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === "object" && "progress" in parsed) {
                  incomingProgress = parsed.progress;
                  if (typeof parsed.updatedAt === "number") incomingUpdatedAt = parsed.updatedAt;
                }
              } catch (_) {
              }
            }
            let shouldSave = true;
            if (existingRow?.value) {
              try {
                const existingParsed = JSON.parse(existingRow.value);
                if (existingParsed && typeof existingParsed.updatedAt === "number" && existingParsed.updatedAt > incomingUpdatedAt) {
                  shouldSave = false;
                }
              } catch (_) {
              }
            }
            if (shouldSave) {
              const payload = JSON.stringify({ progress: incomingProgress, updatedAt: incomingUpdatedAt });
              insertMetadata.run(userId, key, payload);
            }
          }
        }
      }
      const insertHistory = db.prepare(`
        INSERT OR REPLACE INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, lastPosition, audioUrl, guid, podcastTitle, primaryTag, youtubeId, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      if (Array.isArray(data.deletedHistoryIds) && data.deletedHistoryIds.length > 0) {
        const placeholders = data.deletedHistoryIds.map(() => "?").join(",");
        const result = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedHistoryIds);
        console.log("[Server SQL Delete Bulk]", { deletedIds: data.deletedHistoryIds, changes: result.changes });
      }
      let writtenHistoryCount = 0;
      if (Array.isArray(data.history) && data.history.length > 0) {
        const historyList = data.history;
        const existingHistoryMap = /* @__PURE__ */ new Map();
        if (historyList.length > 10) {
          const existingHistRows = db.prepare(
            "SELECT id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, lastPosition, audioUrl, guid, podcastTitle, primaryTag, youtubeId, duration FROM reading_history WHERE user_id = ?"
          ).all(userId);
          for (const r of existingHistRows) {
            existingHistoryMap.set(r.id, r);
          }
        }
        const findByYoutubeId = db.prepare(
          `SELECT id, durationSeconds, lastPosition, status, actionType, timestamp FROM reading_history WHERE user_id = ? AND youtubeId = ? AND id != ? AND ABS(JULIANDAY(timestamp) - JULIANDAY(?)) < 1.0 LIMIT 1`
        );
        const deleteById = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id = ?`);
        for (const h of historyList) {
          if (!h || !h.id) continue;
          const incomingDuration = h.durationSeconds || 0;
          const incomingPosition = h.lastPosition || 0;
          const isCompleted = h.status === "completed" || h.actionType === "complete";
          if (incomingDuration <= 0 && incomingPosition <= 0 && !isCompleted) {
            continue;
          }
          let canonicalId = h.id;
          if (h.youtubeId) {
            const existing = findByYoutubeId.get(userId, h.youtubeId, h.id, h.timestamp || (/* @__PURE__ */ new Date()).toISOString());
            if (existing) {
              const mergedDuration = Math.max(incomingDuration, existing.durationSeconds || 0);
              const mergedPosition = Math.max(incomingPosition, existing.lastPosition || 0);
              const mergedStatus = isCompleted || existing.status === "completed" || existing.actionType === "complete" ? "completed" : h.status || existing.status || "in_progress";
              const mergedActionType = isCompleted || existing.actionType === "complete" ? "complete" : h.actionType || existing.actionType || "listen";
              const mergedTimestamp = new Date(h.timestamp || 0).getTime() >= new Date(existing.timestamp || 0).getTime() ? h.timestamp || (/* @__PURE__ */ new Date()).toISOString() : existing.timestamp;
              canonicalId = existing.id;
              h.durationSeconds = mergedDuration;
              h.lastPosition = mergedPosition;
              h.status = mergedStatus;
              h.actionType = mergedActionType;
              h.timestamp = mergedTimestamp;
              if (h.id !== existing.id) {
                deleteById.run(userId, h.id);
              }
            }
          }
          const historyPrimaryTag = h.primaryTag || null;
          const historyTagsJson = h.tags && Array.isArray(h.tags) && h.tags.length > 0 ? JSON.stringify(h.tags) : null;
          const nextLastPos = h.lastPosition !== void 0 && h.lastPosition !== null ? Number(h.lastPosition) : 0;
          const nextDuration = h.duration !== void 0 && h.duration !== null ? Number(h.duration) : null;
          const existingH = existingHistoryMap.get(canonicalId);
          if (existingH && existingH.lessonId === (h.lessonId || "imported_record") && existingH.lessonTitle === (h.lessonTitle || "\u0417\u0430\u043D\u044F\u0442\u0438\u0435") && existingH.status === (h.status || "in_progress") && (existingH.durationSeconds || 0) === (h.durationSeconds || 0) && (existingH.lastPosition || 0) === nextLastPos && existingH.timestamp === h.timestamp && existingH.notes === (h.notes || null) && existingH.channelName === (h.channelName || null) && existingH.channelAvatarUrl === (h.channelAvatarUrl || null) && existingH.customTitle === (h.customTitle || null) && existingH.primaryTag === historyPrimaryTag && existingH.tags === historyTagsJson) {
            continue;
          }
          insertHistory.run(
            canonicalId,
            userId,
            h.lessonId || "imported_record",
            h.lessonTitle || "\u0417\u0430\u043D\u044F\u0442\u0438\u0435",
            h.lessonType || null,
            h.coverUrl || null,
            h.targetLanguage || "english",
            h.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
            h.actionType || "read",
            h.status || "in_progress",
            h.durationSeconds || 0,
            h.notes || null,
            h.channelName || null,
            h.channelAvatarUrl || null,
            h.channelUrl || null,
            h.category || null,
            h.customTitle || null,
            h.mode || null,
            historyTagsJson,
            nextLastPos,
            h.audioUrl || null,
            h.guid || null,
            h.podcastTitle || null,
            historyPrimaryTag,
            h.youtubeId || null,
            nextDuration
          );
          writtenHistoryCount++;
          if (historyPrimaryTag && typeof historyPrimaryTag === "string" && historyPrimaryTag.trim()) {
            const pTag = historyPrimaryTag.trim();
            const tagId = `${userId}_${pTag.toLowerCase()}`;
            insertTag.run(tagId, userId, pTag, null, h.targetLanguage || null, Date.now());
            insertItemTag.run(userId, canonicalId, tagId, 1);
          }
          if (Array.isArray(h.tags)) {
            for (const t of h.tags) {
              if (!t || typeof t !== "string" || !t.trim()) continue;
              const tagName = t.trim();
              const isPrim = historyPrimaryTag && historyPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
              const tagId = `${userId}_${tagName.toLowerCase()}`;
              insertTag.run(tagId, userId, tagName, null, h.targetLanguage || null, Date.now());
              insertItemTag.run(userId, canonicalId, tagId, isPrim);
            }
          }
        }
      }
      console.log(`[saveLocalServerDb] Committed for "${userId}" (written: ${writtenWordsCount} words, ${writtenLessonsCount} lessons, ${writtenHistoryCount} history)`);
    })();
    return true;
  } catch (e) {
    console.error(`[saveLocalServerDb] Error saving SQLite database for "${userId}":`, e);
    return false;
  }
}
router6.post("/dictionary-explain", handleDictionaryExplain);
router6.get("/server-db", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const dbData = getLocalServerDb(userId);
  if (!dbData) {
    return res.json({ status: "empty" });
  }
  const acceptEncoding = String(req.headers["accept-encoding"] || "");
  if (acceptEncoding.includes("gzip")) {
    const jsonBuffer = Buffer.from(JSON.stringify({ status: "ok", data: dbData }), "utf8");
    import_zlib.default.gzip(jsonBuffer, { level: import_zlib.default.constants.Z_BEST_SPEED }, (err, compressed) => {
      if (err) {
        return res.json({ status: "ok", data: dbData });
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", String(compressed.length));
      return res.send(compressed);
    });
    return;
  }
  return res.json({ status: "ok", data: dbData });
});
router6.post("/server-db", (req, res) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: "No data provided" });
  }
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const success = saveLocalServerDb(userId, data);
  if (success) {
    return res.json({ status: "success" });
  } else {
    return res.status(500).json({ error: "Failed to write database to local SQLite storage" });
  }
});
router6.delete("/server-db", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  try {
    const db = getDbConnection(userId);
    const wipeTransaction = db.transaction(() => {
      db.prepare("DELETE FROM words WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM word_links WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM lessons WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM playlists WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM reading_history WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM metadata WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM podcast_subscriptions WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM item_tags WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM tags WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM study_activity_logs WHERE userId = ?").run(userId);
    });
    wipeTransaction();
    return res.json({ status: "success", message: "User data wiped from server database successfully" });
  } catch (error) {
    console.error("Failed to wipe user data from server db:", error);
    return res.status(500).json({ error: "Failed to wipe user data from server database" });
  }
});
router6.get("/dictionary-preferences", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  try {
    const db = getDbConnection(userId);
    const row = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'dictionaryPreferences'").get(userId);
    const preferences = row?.value ? JSON.parse(row.value) : {};
    return res.json({ status: "ok", data: preferences });
  } catch (err) {
    console.error("[GET /api/dictionary-preferences] Error:", err);
    return res.status(500).json({ error: "Failed to fetch dictionary preferences" });
  }
});
router6.put("/dictionary-preferences", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { langKey, tab, dictionaries, preferences } = req.body;
  try {
    const db = getDbConnection(userId);
    const row = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'dictionaryPreferences'").get(userId);
    let existingPrefs = {};
    if (row?.value) {
      try {
        existingPrefs = JSON.parse(row.value) || {};
      } catch (_) {
      }
    }
    const mergedPrefs = { ...existingPrefs };
    if (langKey && tab && Array.isArray(dictionaries)) {
      mergedPrefs[langKey] = {
        ...mergedPrefs[langKey] || {},
        [tab]: dictionaries
      };
    } else if (langKey && preferences && typeof preferences === "object") {
      mergedPrefs[langKey] = {
        ...mergedPrefs[langKey] || {},
        ...preferences
      };
    } else if (preferences && typeof preferences === "object") {
      for (const [k, v] of Object.entries(preferences)) {
        if (v && typeof v === "object") {
          mergedPrefs[k] = {
            ...mergedPrefs[k] || {},
            ...v
          };
        }
      }
    } else {
      return res.status(400).json({ error: "Invalid payload. Required { langKey, tab, dictionaries } or { preferences }" });
    }
    db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'dictionaryPreferences', ?)").run(
      userId,
      JSON.stringify(mergedPrefs)
    );
    return res.json({ status: "success", data: mergedPrefs });
  } catch (err) {
    console.error("[PUT /api/dictionary-preferences] Error:", err);
    return res.status(500).json({ error: "Failed to save dictionary preferences" });
  }
});
router6.put("/user-metadata", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { customTags, dailyWordGoal, lastActiveLessonId } = req.body;
  try {
    const db = getDbConnection(userId);
    const insertMeta = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)");
    db.transaction(() => {
      if (customTags !== void 0 && Array.isArray(customTags)) {
        insertMeta.run(userId, "customTags", JSON.stringify(customTags));
      }
      if (dailyWordGoal !== void 0 && dailyWordGoal !== null) {
        insertMeta.run(userId, "dailyWordGoal", String(dailyWordGoal));
      }
      if (lastActiveLessonId !== void 0 && typeof lastActiveLessonId === "string") {
        insertMeta.run(userId, "lastActiveLessonId", lastActiveLessonId);
      }
    })();
    return res.json({ status: "success" });
  } catch (err) {
    console.error("[PUT /api/user-metadata] Error:", err);
    return res.status(500).json({ error: "Failed to save user metadata" });
  }
});
router6.post("/progress", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { type, lessonId, progress, updatedAt } = req.body;
  if (!type || !lessonId || progress === void 0) {
    return res.status(400).json({ error: "Required { type: 'reading' | 'video', lessonId, progress }" });
  }
  const incomingUpdatedAt = typeof updatedAt === "number" ? updatedAt : Date.now();
  const key = type === "video" ? `youtube_progress_${lessonId}` : `vocab_progress_${lessonId}`;
  try {
    const db = getDbConnection(userId);
    if (progress === 0 || progress === "0") {
      db.prepare("DELETE FROM metadata WHERE user_id = ? AND key = ?").run(userId, key);
      return res.json({ status: "success", progress: 0, deleted: true });
    }
    const existingRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?").get(userId, key);
    let shouldSave = true;
    if (existingRow?.value) {
      try {
        const existingParsed = JSON.parse(existingRow.value);
        if (existingParsed && typeof existingParsed.updatedAt === "number" && existingParsed.updatedAt > incomingUpdatedAt) {
          shouldSave = false;
        }
      } catch (_) {
      }
    }
    if (shouldSave) {
      const payload = JSON.stringify({ progress, updatedAt: incomingUpdatedAt });
      db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)").run(userId, key, payload);
      return res.json({ status: "success", progress, updatedAt: incomingUpdatedAt });
    } else {
      return res.json({ status: "stale_ignored", message: "Newer progress already recorded on server" });
    }
  } catch (err) {
    console.error("[POST /api/progress] Error:", err);
    return res.status(500).json({ error: "Failed to update progress" });
  }
});
router6.get("/user/settings", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  try {
    const db = getDbConnection(userId);
    let settings = {};
    const row = db.prepare("SELECT settings, updated_at FROM user_settings WHERE user_id = ?").get(userId);
    if (row?.settings) {
      try {
        settings = JSON.parse(row.settings);
      } catch (_) {
      }
    } else {
      const metaRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId);
      if (metaRow?.value) {
        try {
          settings = JSON.parse(metaRow.value);
        } catch (_) {
        }
      }
    }
    return res.json({ status: "success", settings, updatedAt: row?.updated_at || Date.now() });
  } catch (err) {
    console.error("[GET /api/user/settings] Error:", err);
    return res.status(500).json({ error: "Failed to get user settings" });
  }
});
var updateUserSettingsHandler = (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const incomingSettings = req.body.settings || req.body;
  if (!incomingSettings || typeof incomingSettings !== "object") {
    return res.status(400).json({ error: "Invalid settings object" });
  }
  try {
    const db = getDbConnection(userId);
    const now = Date.now();
    db.transaction(() => {
      let mergedSettings = {};
      const existingRow = db.prepare("SELECT settings FROM user_settings WHERE user_id = ?").get(userId);
      if (existingRow?.settings) {
        try {
          mergedSettings = JSON.parse(existingRow.settings);
        } catch (_) {
        }
      } else {
        const metaRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId);
        if (metaRow?.value) {
          try {
            mergedSettings = JSON.parse(metaRow.value);
          } catch (_) {
          }
        }
      }
      mergedSettings = { ...mergedSettings, ...incomingSettings };
      const serialized = JSON.stringify(mergedSettings);
      db.prepare("INSERT OR REPLACE INTO user_settings (user_id, settings, updated_at) VALUES (?, ?, ?)").run(userId, serialized, now);
      db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'readerSettings', ?)").run(userId, serialized);
    })();
    return res.json({ status: "success", settings: incomingSettings, updatedAt: now });
  } catch (err) {
    console.error("[PATCH /api/user/settings] Error:", err);
    return res.status(500).json({ error: "Failed to update user settings" });
  }
};
router6.patch("/user/settings", updateUserSettingsHandler);
router6.put("/user/settings", updateUserSettingsHandler);
router6.use(vocabRoutes_default);
var db_default = router6;

// routes/media.ts
var import_express7 = require("express");
var import_path8 = __toESM(require("path"), 1);
var import_fs9 = __toESM(require("fs"), 1);
var import_os2 = __toESM(require("os"), 1);
var import_crypto4 = __toESM(require("crypto"), 1);
var import_genai4 = require("@google/genai");
var pdfParseModule = __toESM(require("pdf-parse"), 1);
init_geminiClient();
init_youtube();
init_ytdlpWrapper();

// routes/bookParsers.ts
var import_adm_zip = __toESM(require("adm-zip"), 1);
var import_jsdom2 = require("jsdom");
var import_readability = require("@mozilla/readability");
var EPUB_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var EPUB_MAX_IMAGES = 250;
function safeDecodePath(rawPath) {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}
function normalizeZipPath(rawPath) {
  return rawPath.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
}
function resolveRelativePath(basePath, relativePath) {
  const baseParts = normalizeZipPath(basePath).split("/");
  baseParts.pop();
  const relParts = normalizeZipPath(relativePath).split("/");
  for (const part of relParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      if (baseParts.length > 0) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join("/");
}
function resolveOpfHref(opfEntryName, href) {
  const decodedHref = safeDecodePath(href);
  const opfParentDir = opfEntryName.includes("/") ? opfEntryName.substring(0, opfEntryName.lastIndexOf("/")) : "";
  if (!opfParentDir) {
    return normalizeZipPath(decodedHref);
  }
  const hrefParts = decodedHref.split("/");
  const baseParts = opfParentDir.split("/");
  const resolvedParts = [];
  for (const part of hrefParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      if (baseParts.length > 0) {
        baseParts.pop();
      }
    } else {
      resolvedParts.push(part);
    }
  }
  const fullPath = [...baseParts, ...resolvedParts].join("/");
  return normalizeZipPath(fullPath);
}
function findZipEntry(entries, resolvedPath) {
  const normalized = normalizeZipPath(resolvedPath).toLowerCase();
  const basename = normalized.includes("/") ? normalized.substring(normalized.lastIndexOf("/") + 1) : normalized;
  return entries.find((e) => {
    if (e.isDirectory) return false;
    const eName = normalizeZipPath(e.entryName).toLowerCase();
    return eName === normalized || eName.endsWith("/" + normalized) || normalized.endsWith("/" + eName) || eName.endsWith("/" + basename) || eName === basename;
  });
}
function getMimeFromPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/jpeg";
}
function getTagAttr(tagStr, attrName) {
  const quoted = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
  const quotedMatch = tagStr.match(quoted);
  if (quotedMatch) return quotedMatch[1];
  const unquoted = new RegExp(`${attrName}\\s*=\\s*([^\\s>"']+)`, "i");
  const unquotedMatch = tagStr.match(unquoted);
  return unquotedMatch ? unquotedMatch[1] : "";
}
function extractEpubCover(entries, opfXml, opfEntryName) {
  const resolveCoverEntry = (href) => {
    if (!href) return void 0;
    const cleanHref = href.split("#")[0].trim();
    if (!cleanHref) return void 0;
    const resolvedPath = resolveOpfHref(opfEntryName, cleanHref);
    return findZipEntry(entries, resolvedPath) || findZipEntry(entries, cleanHref);
  };
  const imageBufferToDataUrl = (entry) => {
    const mime = getMimeFromPath(entry.entryName);
    const base64 = entry.getData().toString("base64");
    return `data:${mime};base64,${base64}`;
  };
  const epub3Match = opfXml.match(/<item\b[^>]*\bproperties\s*=\s*["'][^"']*\bcover-image\b[^"']*["'][^>]*>/i);
  if (epub3Match) {
    const href = getTagAttr(epub3Match[0], "href");
    if (href) {
      const entry = resolveCoverEntry(href);
      if (entry) return imageBufferToDataUrl(entry);
    }
  }
  const metaCoverMatch = opfXml.match(/<meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i) || opfXml.match(/<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']cover["'][^>]*>/i);
  if (metaCoverMatch) {
    const coverId = metaCoverMatch[1];
    const escaped = coverId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const itemRegex = new RegExp(`<item\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>`, "i");
    const itemMatch = opfXml.match(itemRegex);
    if (itemMatch) {
      const href = getTagAttr(itemMatch[0], "href");
      if (href) {
        const entry = resolveCoverEntry(href);
        if (entry) return imageBufferToDataUrl(entry);
      }
    }
    const directEntry = resolveCoverEntry(coverId);
    if (directEntry) return imageBufferToDataUrl(directEntry);
  }
  const guideCoverMatch = opfXml.match(/<reference\b[^>]*\btype\s*=\s*["']cover["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (guideCoverMatch) {
    const href = guideCoverMatch[1];
    if (/\.(jpe?g|png|webp)$/i.test(href)) {
      const entry = resolveCoverEntry(href);
      if (entry) return imageBufferToDataUrl(entry);
    } else {
      const pageEntry = resolveCoverEntry(href);
      if (pageEntry) {
        const pageHtml = pageEntry.getData().toString("utf-8");
        const imgMatch = pageHtml.match(/<(?:img|image)\b[^>]*\b(?:src|xlink:href|href)\s*=\s*["']([^"']+)["'][^>]*>/i);
        if (imgMatch) {
          const imgSrc = imgMatch[1];
          const pageDir = pageEntry.entryName.includes("/") ? pageEntry.entryName.substring(0, pageEntry.entryName.lastIndexOf("/")) : "";
          const resolvedImg = resolveRelativePath(pageDir, safeDecodePath(imgSrc));
          const entry = findZipEntry(entries, resolvedImg) || findZipEntry(entries, imgSrc);
          if (entry) return imageBufferToDataUrl(entry);
        }
      }
    }
  }
  const manifestItems = opfXml.match(/<item\b[^>]*\/?>/gi) || [];
  for (const it of manifestItems) {
    const mediaType = getTagAttr(it, "media-type");
    const href = getTagAttr(it, "href");
    const id = getTagAttr(it, "id");
    const isImage = mediaType && mediaType.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(href);
    if (isImage && (/cover/i.test(id) || /cover/i.test(href))) {
      const entry = resolveCoverEntry(href);
      if (entry) return imageBufferToDataUrl(entry);
    }
  }
  const fallbackCover = entries.find((e) => !e.isDirectory && /(?:^|\/)cover[^\/]*\.(jpe?g|png|webp)$/i.test(e.entryName));
  if (fallbackCover) {
    return imageBufferToDataUrl(fallbackCover);
  }
  return void 0;
}
function parseEpub(epubBuffer, includeImages) {
  try {
    const zip = new import_adm_zip.default(epubBuffer);
    const entries = zip.getEntries();
    let containerXml = "";
    const containerEntry = findZipEntry(entries, "META-INF/container.xml");
    if (containerEntry) {
      containerXml = containerEntry.getData().toString("utf-8");
    }
    let opfPath = "";
    if (containerXml) {
      const fullPathMatch = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
      if (fullPathMatch) {
        opfPath = safeDecodePath(fullPathMatch[1]);
      }
    }
    if (!opfPath) {
      const opfEntry2 = entries.find((e) => e.entryName.toLowerCase().endsWith(".opf"));
      if (opfEntry2) opfPath = opfEntry2.entryName;
    }
    if (!opfPath) {
      throw new Error("Could not find .opf file in EPUB archive");
    }
    const opfEntry = findZipEntry(entries, opfPath);
    if (!opfEntry) {
      throw new Error(`OPF file '${opfPath}' not found in EPUB zip entries`);
    }
    const opfXml = opfEntry.getData().toString("utf-8");
    let title = "Imported EPUB Document";
    const titleMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }
    const manifestMap = {};
    const manifestMatch = opfXml.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i);
    if (manifestMatch) {
      const itemTags = manifestMatch[1].match(/<item\b[^>]*\/?>/gi) || [];
      for (const itemTag of itemTags) {
        const id = getTagAttr(itemTag, "id");
        const href = getTagAttr(itemTag, "href");
        const mediaType = getTagAttr(itemTag, "media-type");
        if (id && href) {
          manifestMap[id] = { href, mediaType };
        }
      }
    }
    const spineItemRefs = [];
    const spineMatch = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
    if (spineMatch) {
      const itemrefTags = spineMatch[1].match(/<itemref\b[^>]*\/?>/gi) || [];
      for (const tag of itemrefTags) {
        const idref = getTagAttr(tag, "idref");
        if (idref) spineItemRefs.push(idref);
      }
    }
    const chapterHrefs = [];
    for (const idref of spineItemRefs) {
      const item = manifestMap[idref];
      if (item && item.href) {
        chapterHrefs.push(item.href);
      }
    }
    if (chapterHrefs.length === 0) {
      for (const item of Object.values(manifestMap)) {
        if (item.mediaType === "application/xhtml+xml" || item.mediaType === "text/html" || item.href.endsWith(".html") || item.href.endsWith(".xhtml")) {
          chapterHrefs.push(item.href);
        }
      }
    }
    const extractEpubToc = () => {
      const tocMap2 = {};
      const addTocItem = (basePath, src, rawTitle) => {
        if (!src || !rawTitle) return;
        const [filePart, anchorPart] = src.split("#");
        const resolvedPath = resolveOpfHref(basePath, filePart).toLowerCase();
        if (!tocMap2[resolvedPath]) {
          tocMap2[resolvedPath] = [];
        }
        const cleanTitle = rawTitle.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        if (cleanTitle) {
          const exists = tocMap2[resolvedPath].some(
            (it) => it.title.toLowerCase() === cleanTitle.toLowerCase() && it.anchor === (anchorPart || null)
          );
          if (!exists) {
            tocMap2[resolvedPath].push({
              anchor: anchorPart || null,
              title: cleanTitle
            });
          }
        }
      };
      const ncxEntry = entries.find((e) => e.entryName.toLowerCase().endsWith(".ncx"));
      if (ncxEntry) {
        const ncxXml = ncxEntry.getData().toString("utf-8");
        ncxXml.replace(
          /<navPoint[^>]*>[\s\S]*?<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>\s*<content\s+src=["']([^"']+)["']/gi,
          (_, text, src) => {
            addTocItem(ncxEntry.entryName, src, text);
            return "";
          }
        );
      }
      const navEntry = entries.find(
        (e) => e.entryName.toLowerCase().includes("nav") && (e.entryName.endsWith(".xhtml") || e.entryName.endsWith(".html"))
      );
      if (navEntry) {
        const navXml = navEntry.getData().toString("utf-8");
        navXml.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
          addTocItem(navEntry.entryName, href, text);
          return "";
        });
      }
      return tocMap2;
    };
    const tocMap = extractEpubToc();
    const extractedImages = {};
    let totalExtractedImages = 0;
    const textBlocks = [];
    const extractImageFromSrc = (src, baseChapterPath) => {
      if (!src || src.startsWith("data:")) return "";
      if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
      const resolvedImgPath = resolveRelativePath(baseChapterPath, safeDecodePath(src));
      const imgEntry = findZipEntry(entries, resolvedImgPath);
      if (!imgEntry) return "";
      const imgBuffer = imgEntry.getData();
      if (imgBuffer.length > EPUB_MAX_IMAGE_BYTES) return "";
      const mime = getMimeFromPath(resolvedImgPath);
      if (mime === "image/svg+xml" && imgBuffer.length < 200) return "";
      const base64 = imgBuffer.toString("base64");
      const imgId = `epub_img_${totalExtractedImages + 1}_${Date.now()}_${totalExtractedImages}`;
      extractedImages[imgId] = `data:${mime};base64,${base64}`;
      totalExtractedImages++;
      return imgId;
    };
    for (const href of chapterHrefs) {
      const resolvedChapterPath = resolveOpfHref(opfEntry.entryName, href);
      const chapterEntry = findZipEntry(entries, resolvedChapterPath);
      if (!chapterEntry) continue;
      const htmlContent = chapterEntry.getData().toString("utf-8");
      let processedHtml = htmlContent;
      const bodyMatch = processedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        processedHtml = bodyMatch[1];
      }
      processedHtml = processedHtml.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
      const fileTocItems = tocMap[resolvedChapterPath.toLowerCase()] || [];
      let prependedTitle = "";
      if (fileTocItems.length > 0) {
        const mainItem = fileTocItems.find((it) => !it.anchor) || fileTocItems[0];
        if (mainItem) {
          prependedTitle = `[CHAPTER: ${mainItem.title}]

`;
        }
      }
      for (const it of fileTocItems) {
        if (it.anchor) {
          const anchorRegex = new RegExp(`<[^>]+\\b(?:id|name)=["']${it.anchor}["'][^>]*>`, "i");
          if (anchorRegex.test(processedHtml)) {
            processedHtml = processedHtml.replace(anchorRegex, `

---PAGE---

[CHAPTER: ${it.title}]

$&`);
          }
        }
      }
      if (includeImages && totalExtractedImages < EPUB_MAX_IMAGES) {
        processedHtml = processedHtml.replace(/<img\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
          const src = getTagAttr(imgTag, "src");
          const imgId = extractImageFromSrc(src, resolvedChapterPath);
          return imgId ? ` [IMG:${imgId}] ` : "";
        });
        processedHtml = processedHtml.replace(/<image\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
          const xlinkHref = getTagAttr(imgTag, "xlink:href") || getTagAttr(imgTag, "href");
          if (!xlinkHref) return "";
          const imgId = extractImageFromSrc(xlinkHref, resolvedChapterPath);
          return imgId ? ` [IMG:${imgId}] ` : "";
        });
      }
      const imgPlaceholders = [];
      let markerIndex = 0;
      processedHtml = processedHtml.replace(/\[IMG:epub_img_[^\]]+\]/g, (match) => {
        const token = `\0IMG${markerIndex}\0`;
        imgPlaceholders.push(match);
        markerIndex++;
        return token;
      });
      let cleanText = processedHtml.replace(/<\/p>/gi, "\n\n").replace(/<\/div>/gi, "\n\n").replace(/<\/h[1-6]>/gi, "\n\n").replace(/<\/blockquote>/gi, "\n\n").replace(/<\/li>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
      imgPlaceholders.forEach((placeholder, idx) => {
        cleanText = cleanText.replace(`\0IMG${idx}\0`, placeholder);
      });
      cleanText = cleanText.split("\n\n").map((para) => {
        return para.split("\n").map((line) => line.trim()).filter(Boolean).join(" ").replace(/[ \t\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, " ").trim();
      }).filter(Boolean).join("\n\n");
      if (cleanText) {
        if (cleanText.startsWith("[CHAPTER:")) {
          textBlocks.push(cleanText);
        } else {
          textBlocks.push((prependedTitle + cleanText).trim());
        }
      }
    }
    let combinedText = textBlocks.join("\n\n---PAGE---\n\n");
    combinedText = combinedText.replace(/\r\n/g, "\n").replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ").replace(/[ \t]+([.,!?:;…»)'"”\u2019\u201d\u2018\u201c\]\}]+)/g, "$1").replace(/([«(\[{“\u2018\u201c])[ \t]+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
    const result = { title, text: combinedText };
    if (includeImages && Object.keys(extractedImages).length > 0) {
      result.images = extractedImages;
      console.log(`[EPUB] Extracted ${Object.keys(extractedImages).length} images from "${title}"`);
    }
    const coverUrl = extractEpubCover(entries, opfXml, opfEntry.entryName);
    if (coverUrl) {
      result.coverUrl = coverUrl;
      console.log(`[EPUB] Extracted cover image for "${title}"`);
    }
    return result;
  } catch (err) {
    console.error(`[EPUB] Parsing failed:`, err);
    throw new Error("Unable to extract epub ZIP content structures: " + err.message);
  }
}
var BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ru;q=0.8,es;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1"
};
async function fetchWebPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15e3);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      throw new Error(`Failed to fetch webpage. HTTP status: ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}
function sanitizeImageUrl(rawUrl, baseUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (url.startsWith("//")) url = "https:" + url;
  if (url.startsWith("data:image") || url.includes("placeholder") || url.includes("grey-") || url.includes("1x1") || url.includes("avatar")) {
    return null;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url.startsWith("http") ? url : null;
  }
}
function resolveImgSrc(el, baseUrl) {
  const rawCandidates = [];
  for (const attr of ["data-src", "data-original", "data-lazy-src", "data-lazy", "data-url", "data-image-src"]) {
    const v = el.getAttribute(attr);
    if (v) rawCandidates.push(v);
  }
  for (const attr of ["data-srcset", "srcset"]) {
    const srcset = el.getAttribute(attr);
    if (!srcset) continue;
    const entries = srcset.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const parts = s.split(/\s+/);
      const url = parts[0];
      const desc = parts[1] || "";
      const wMatch = desc.match(/^(\d+)w$/i);
      const xMatch = desc.match(/^([\d.]+)x$/i);
      const weight = wMatch ? parseInt(wMatch[1], 10) : xMatch ? parseFloat(xMatch[1]) * 1e3 : 0;
      return { url, weight };
    }).filter((e) => !!e.url);
    if (entries.length === 0) continue;
    entries.sort((a, b) => b.weight - a.weight);
    rawCandidates.push(entries[0].url);
  }
  const picture = el.parentElement;
  if (picture && picture.tagName.toLowerCase() === "picture") {
    const sources = Array.from(picture.querySelectorAll("source"));
    for (const source of sources) {
      const srcset = source.getAttribute("srcset") || source.getAttribute("data-srcset");
      if (srcset) {
        const entries = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
        if (entries.length > 0) rawCandidates.push(entries[entries.length - 1]);
      }
    }
  }
  const plainSrc = el.getAttribute("src");
  if (plainSrc) rawCandidates.push(plainSrc);
  const JUNK_RE = /^data:|1x1|tracking|pixel|spinner|spacer|blank\.gif|placeholder|transparent|\.svg(\?|$)/i;
  for (const raw of rawCandidates) {
    if (!raw || raw.trim().length < 6) continue;
    if (JUNK_RE.test(raw.trim())) continue;
    try {
      const resolved = new URL(raw.trim(), baseUrl).href;
      if (/^https?:\/\//i.test(resolved)) return resolved;
    } catch {
      continue;
    }
  }
  return null;
}
function cleanAndFormatArticle(rawHtml, baseUrl) {
  const dom = new import_jsdom2.JSDOM(rawHtml, { url: baseUrl });
  const doc = dom.window.document;
  const metaImages = [];
  const ogImg = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute("content") || doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content");
  const cleanOg = sanitizeImageUrl(ogImg, baseUrl);
  if (cleanOg) metaImages.push(cleanOg);
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const data = JSON.parse(script.textContent || "{}");
      const scanObj = (obj) => {
        if (!obj) return;
        if (typeof obj === "string" && (obj.endsWith(".jpg") || obj.endsWith(".jpeg") || obj.endsWith(".png") || obj.endsWith(".webp") || obj.includes("/images/"))) {
          const u = sanitizeImageUrl(obj, baseUrl);
          if (u && !metaImages.includes(u)) metaImages.push(u);
        } else if (Array.isArray(obj)) {
          obj.forEach(scanObj);
        } else if (typeof obj === "object") {
          if (obj.image) scanObj(obj.image);
          if (obj.thumbnailUrl) scanObj(obj.thumbnailUrl);
          if (obj.url && obj["@type"] === "ImageObject") scanObj(obj.url);
        }
      };
      scanObj(data);
    } catch {
    }
  });
  const removeSelectors = [
    "header",
    "nav",
    "footer",
    "form",
    "aside",
    '[data-testid="header-search"]',
    '[data-testid="byline"]',
    '[data-testid="timestamp"]',
    "#search",
    ".search-box",
    "button",
    "input",
    "style",
    "noscript",
    "time",
    ".byline",
    ".article__metadata",
    '[class*="header-search"]',
    '[class*="search-bar"]',
    '[class*="site-search"]',
    '[role="navigation"]',
    '[role="banner"]',
    '[aria-label*="search" i]',
    '[aria-label*="navigation" i]',
    '[data-component="byline-block"]',
    ".article__byline",
    'header [data-component="headline-block"] ~ div:not([data-component="text-block"])'
  ];
  removeSelectors.forEach((sel) => {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch (_) {
    }
  });
  const mainRoot = doc.querySelector("article") || doc.querySelector("main") || doc.querySelector('[role="main"]') || doc.querySelector(".article-body") || doc.querySelector(".article__body") || doc.querySelector(".post-content") || doc.querySelector("#content") || doc.body;
  const imageContainers = doc.querySelectorAll('figure, picture, [data-component="image-block"], .article__image, .lead-image, .image-container, [class*="image-block"], [class*="figure"], img');
  imageContainers.forEach((container) => {
    if (!container.parentNode) return;
    if (container.tagName === "IMG") {
      if (container.closest('figure, picture, [data-component="image-block"]')) return;
    } else {
      if (container.parentElement?.closest('figure, picture, [data-component="image-block"]')) return;
    }
    let bestUrl = null;
    const sources = Array.from(container.querySelectorAll("source"));
    for (const src of sources) {
      const srcset = src.getAttribute("srcset") || src.getAttribute("data-srcset");
      if (srcset) {
        const parts = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]);
        const valid = parts.map((p) => sanitizeImageUrl(p, baseUrl)).filter(Boolean);
        if (valid.length > 0) {
          bestUrl = valid[valid.length - 1];
          break;
        }
      }
    }
    if (!bestUrl) {
      const imgs = container.tagName === "IMG" ? [container] : Array.from(container.querySelectorAll("img"));
      for (const imgNode of imgs) {
        const candidate = resolveImgSrc(imgNode, baseUrl);
        if (candidate) {
          bestUrl = candidate;
          break;
        }
      }
    }
    const figcap = container.querySelector('figcaption, [class*="caption" i], [data-testid*="caption"], .caption');
    const creditEl = container.querySelector('[class*="credit" i], [data-testid*="credit"], .credit');
    let captionText = figcap?.textContent?.replace(/^image caption[:,]?\s*/i, "").trim() || "";
    const creditText = creditEl && (!figcap || !figcap.contains(creditEl)) ? creditEl.textContent?.trim() || "" : "";
    if (!captionText && container.tagName === "IMG") {
      const alt = container.getAttribute("alt")?.trim();
      if (alt && alt.length > 5 && !alt.toLowerCase().includes("image unavailable") && !alt.toLowerCase().includes("placeholder")) {
        captionText = alt;
      }
    }
    if (creditText && !captionText.includes(creditText)) {
      captionText = captionText ? `${captionText} (${creditText})` : creditText;
    }
    if (captionText && captionText.length > 300) captionText = captionText.slice(0, 300);
    if (bestUrl) {
      const pImg = doc.createElement("p");
      pImg.textContent = `[IMG:${bestUrl}]`;
      container.parentNode?.insertBefore(pImg, container);
      if (captionText) {
        const pCap = doc.createElement("p");
        pCap.textContent = `[CAPTION:${captionText}]`;
        container.parentNode?.insertBefore(pCap, container);
      }
      container.remove();
    } else {
      if (["FIGURE", "PICTURE", "IMG"].includes(container.tagName)) {
        container.remove();
      }
    }
  });
  let parsed = null;
  try {
    const reader = new import_readability.Readability(doc, { keepClasses: false });
    parsed = reader.parse();
  } catch (e) {
    console.warn("[cleanAndFormatArticle] Readability parse error:", e);
  }
  const wordCount = (parsed?.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  let finalText = "";
  if (parsed && parsed.content && wordCount >= 50) {
    const contentDoc = new import_jsdom2.JSDOM(`<body>${parsed.content}</body>`).window.document;
    const blocks = [];
    contentDoc.body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li").forEach((el) => {
      const text = el.textContent?.trim();
      if (!text || /^Site search$/i.test(text)) return;
      if (text.startsWith("[IMG:") || text.startsWith("[CAPTION:")) {
        blocks.push(text);
      } else if (el.tagName === "H1" || el.tagName === "H2") {
        blocks.push(`## ${text} ##`);
      } else if (el.tagName === "H3" || el.tagName === "H4" || el.tagName === "H5" || el.tagName === "H6") {
        blocks.push(`# ${text} #`);
      } else if (el.tagName === "LI") {
        blocks.push(`\u2022 ${text}`);
      } else {
        blocks.push(text);
      }
    });
    finalText = blocks.join("\n\n");
  } else {
    console.log(`[cleanAndFormatArticle] Fallback triggered! Readability wordCount=${wordCount}`);
    const blocks = [];
    mainRoot.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote").forEach((el) => {
      if (el.parentElement && ["p", "li", "blockquote"].includes(el.parentElement.tagName.toLowerCase())) {
        return;
      }
      const t = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (!t || /^Site search$/i.test(t)) return;
      const tag = el.tagName.toUpperCase();
      if (t.startsWith("[IMG:") || t.startsWith("[CAPTION:")) {
        blocks.push(t);
      } else if (tag === "H1" || tag === "H2") {
        blocks.push(`## ${t} ##`);
      } else if (tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6") {
        blocks.push(`# ${t} #`);
      } else if (tag === "LI") {
        blocks.push(`\u2022 ${t}`);
      } else {
        blocks.push(t);
      }
    });
    finalText = blocks.join("\n\n");
  }
  if (!finalText.includes("[IMG:") && metaImages.length > 0) {
    finalText = `[IMG:${metaImages[0]}]

` + finalText;
  }
  finalText = finalText.replace(/\n{3,}/g, "\n\n").trim();
  const title = parsed?.title && parsed.title.trim() || doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() || doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim() || mainRoot.querySelector("h1")?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || doc.title?.trim() || "Web Article";
  return {
    title,
    text: finalText,
    byline: parsed?.byline || null,
    excerpt: parsed?.excerpt || null
  };
}

// routes/media.ts
var import_child_process = require("child_process");
var import_util2 = __toESM(require("util"), 1);
var pdfParse = pdfParseModule.default || pdfParseModule;
var execFilePromise = import_util2.default.promisify(import_child_process.execFile);
var router7 = (0, import_express7.Router)();
var DATA_DIR6 = process.env.DATA_DIR || process.cwd();
var IMAGE_CACHE_DIR = import_path8.default.join(DATA_DIR6, "image_cache");
if (!import_fs9.default.existsSync(IMAGE_CACHE_DIR)) {
  import_fs9.default.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}
var VIDEO_STORAGE_DIR = import_path8.default.join(DATA_DIR6, "media", "videos");
if (!import_fs9.default.existsSync(VIDEO_STORAGE_DIR)) {
  import_fs9.default.mkdirSync(VIDEO_STORAGE_DIR, { recursive: true });
}
var CLIPS_STORAGE_DIR = import_path8.default.join(DATA_DIR6, "media", "clips");
if (!import_fs9.default.existsSync(CLIPS_STORAGE_DIR)) {
  import_fs9.default.mkdirSync(CLIPS_STORAGE_DIR, { recursive: true });
}
router7.get("/image-proxy", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ error: "URL parameter 'url' is required" });
  }
  try {
    const hash = import_crypto4.default.createHash("md5").update(imageUrl).digest("hex");
    const parsedUrl = new URL(imageUrl);
    const pathname = parsedUrl.pathname;
    let ext = import_path8.default.extname(pathname) || ".jpg";
    if (!/^\.[a-zA-Z0-5]+$/.test(ext) || ext.length > 5) {
      ext = ".jpg";
    }
    const cacheFilename = `img_${hash}${ext}`;
    const cacheFilePath = import_path8.default.join(IMAGE_CACHE_DIR, cacheFilename);
    if (import_fs9.default.existsSync(cacheFilePath)) {
      res.set("Cache-Control", "public, max-age=31536000");
      return res.sendFile(cacheFilePath);
    }
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Image fetch failed with status ${response.status}` });
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await import_fs9.default.promises.writeFile(cacheFilePath, buffer);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000");
    return res.send(buffer);
  } catch (err) {
    console.error("Image proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy image" });
  }
});
router7.get("/image-search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const htmlUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    const htmlResponse = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });
    if (!htmlResponse.ok) {
      throw new Error(`DuckDuckGo HTML query returned status ${htmlResponse.status}`);
    }
    const html = await htmlResponse.text();
    let vqd = null;
    const match1 = html.match(/vqd=([\d-]+)\&/);
    if (match1) {
      vqd = match1[1];
    }
    if (!vqd) {
      const match2 = html.match(/vqd\s*=\s*['"]([^'"]+)['"]/);
      if (match2) {
        vqd = match2[1];
      }
    }
    if (!vqd) {
      const match3 = html.match(/vqd="([\d-]+)"/);
      if (match3) {
        vqd = match3[1];
      }
    }
    if (!vqd) {
      throw new Error("Could not extract vqd token from DuckDuckGo response");
    }
    const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,;&p=1`;
    const apiResponse = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://duckduckgo.com/"
      }
    });
    if (!apiResponse.ok) {
      throw new Error(`DuckDuckGo image API returned status ${apiResponse.status}`);
    }
    const data = await apiResponse.json();
    let results = (data.results || []).slice(0, 16).map((item, idx) => {
      const imgUrl = item.image || item.thumbnail || "";
      const thumbUrl = item.thumbnail || item.image || "";
      return {
        id: `ddg_${idx}_${Date.now()}`,
        url: imgUrl,
        thumb: thumbUrl,
        image: imgUrl,
        thumbnail: thumbUrl,
        author: item.source || "DuckDuckGo",
        source: item.source || "DuckDuckGo",
        description: item.title || "",
        title: item.title || ""
      };
    });
    if (!results || results.length === 0) {
      results = await searchWikimedia(query);
    }
    return res.json({ results });
  } catch (err) {
    console.error("DuckDuckGo Image search error, trying Wikimedia fallback:", err);
    try {
      const wikiResults = await searchWikimedia(query);
      if (wikiResults.length > 0) {
        return res.json({ results: wikiResults });
      }
    } catch (wikiErr) {
      console.error("Wikimedia fallback error:", wikiErr);
    }
    return res.status(500).json({ error: err.message || "Failed to search images" });
  }
});
async function searchWikimedia(query) {
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=16&prop=imageinfo&iiprop=url|mime&format=json`;
    const resp = await fetch(wikiUrl, {
      headers: { "User-Agent": "LecturaApp/1.0 (https://lectura.app)" }
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const pages = json.query?.pages || {};
    return Object.values(pages).map((page, idx) => {
      const ii = page.imageinfo?.[0];
      const imgUrl = ii?.url || "";
      return {
        id: `wiki_${page.pageid || idx}`,
        url: imgUrl,
        thumb: imgUrl,
        image: imgUrl,
        thumbnail: imgUrl,
        author: "Wikimedia Commons",
        source: "Wikimedia Commons",
        description: page.title || query,
        title: page.title || query
      };
    }).filter((item) => item.url);
  } catch (err) {
    return [];
  }
}
router7.post("/import-file", async (req, res) => {
  const { fileBase64, filename, fileType, importImages } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: "File data base64 is required" });
  }
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
  const estimatedSize = Math.ceil(fileBase64.length * 3 / 4);
  if (estimatedSize > MAX_FILE_SIZE_BYTES + 1024) {
    return res.status(413).json({ error: "\u0420\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u043B\u0438\u043C\u0438\u0442 50 \u041C\u0411 (Payload Too Large)" });
  }
  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ error: "\u0420\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u043B\u0438\u043C\u0438\u0442 50 \u041C\u0411 (Payload Too Large)" });
  }
  const extension = filename ? filename.split(".").pop().toLowerCase() : "";
  try {
    if (fileType === "application/pdf" || extension === "pdf") {
      let pdfResult;
      try {
        pdfResult = await pdfParse(buffer);
      } catch (err) {
        console.error("PDF parsing failed:", err);
        throw err;
      }
      let text = typeof pdfResult === "string" ? pdfResult : pdfResult?.text || "";
      text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");
      text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported PDF Document";
      return res.json({ title, text });
    } else if (fileType === "application/epub+zip" || fileType === "application/epub" || extension === "epub" || fileType === "application/octet-stream" && extension === "epub") {
      const parsed = parseEpub(buffer, !!importImages);
      if (!parsed.text) {
        throw new Error("Extracted text is empty. EPUB might contain scanned pages or empty chapters.");
      }
      return res.json(parsed);
    } else {
      const textContent = buffer.toString("utf-8");
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported Document";
      return res.json({ title, text: textContent });
    }
  } catch (err) {
    console.error("Document parser error in /api/import-file:", err);
    return res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0444\u0430\u0439\u043B: " + (err.message || err) });
  }
});
router7.post("/import-url", async (req, res) => {
  const { url, aiProvider, localAiUrl, localAiModel } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  try {
    const html = await fetchWebPage(url);
    let extractedCoverUrl = "";
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) || html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogImageMatch) {
      try {
        extractedCoverUrl = new URL(ogImageMatch[1], url).href;
      } catch {
        extractedCoverUrl = ogImageMatch[1];
      }
    }
    const isPodcastUrl = url.toLowerCase().includes("podcasts.apple.com") || url.toLowerCase().includes("podcast") || html.includes("schema:episode") || html.includes('"assetUrl"');
    if (isPodcastUrl) {
      console.log(`[Import URL] Podcast URL detected: ${url}`);
      let podcastTitle = "Podcast Episode";
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (ogTitleMatch) {
        podcastTitle = ogTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*-\s*Apple Podcasts.*$/i, "").trim();
      }
      let directAudioUrl = null;
      const assetUrlMatch = html.match(/"assetUrl"\s*:\s*"(https?:\/\/[^"]+)"/i);
      if (assetUrlMatch) {
        directAudioUrl = assetUrlMatch[1];
      } else {
        const audioMatches = html.match(/https?:\/\/[^\s"']+\.(?:mp3|m4a|aac)[^\s"']*/gi);
        if (audioMatches && audioMatches.length > 0) {
          directAudioUrl = audioMatches[0];
        }
      }
      console.log(`[Import URL] Direct audio URL found: ${directAudioUrl}`);
      let audioBase64 = null;
      let audioUrl = directAudioUrl;
      let transcriptText = "";
      if (directAudioUrl) {
        try {
          console.log(`[Import URL] Downloading audio stream from ${directAudioUrl}...`);
          const audioFetch = await fetch(directAudioUrl, {
            headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] }
          });
          if (audioFetch.ok) {
            const arrayBuf = await audioFetch.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            const DATA_DIR12 = process.env.DATA_DIR || process.cwd();
            const audioStorageDir = import_path8.default.join(DATA_DIR12, "audio_files");
            if (!import_fs9.default.existsSync(audioStorageDir)) {
              import_fs9.default.mkdirSync(audioStorageDir, { recursive: true });
            }
            const audioFileName = `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`;
            const diskPath = import_path8.default.join(audioStorageDir, audioFileName);
            import_fs9.default.writeFileSync(diskPath, buf);
            audioUrl = `/api/audio-files/${audioFileName}`;
            audioBase64 = null;
            const userApiKey = req.headers["x-gemini-key"] || req.body.geminiApiKey;
            const ai2 = getGeminiClient(userApiKey);
            if (ai2 && buf.length > 0) {
              console.log(`[Import URL] Running Gemini Speech-to-Text on ${buf.length} bytes of podcast audio...`);
              let uploadedFile = null;
              try {
                uploadedFile = await ai2.files.upload({
                  file: diskPath,
                  mimeType: "audio/mp3"
                });
                const prompt = `Listen carefully to this entire audio recording titled "${podcastTitle}".
Transcribe all spoken words accurately from the very beginning (0:00) ALL THE WAY TO THE VERY END of the audio file.
For EVERY single spoken sentence or dialogue phrase, provide the exact start timestamp in seconds or minutes (e.g. 0s	..., 15s	..., 1m15s	..., 15m40s	..., 25m10s	...).
Do NOT stop early. Continue generating timestamped entries for the entire duration of the audio recording until the final closing words.

IMPORTANT: Output ONLY the line-by-line timestamped transcript entries. Do not provide titles, introductory explanations, translation notes, bracketed remarks, or markdown code blocks.`;
                const aiRes = await ai2.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [
                    { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType || "audio/mp3" } },
                    prompt
                  ],
                  config: { maxOutputTokens: 8192 }
                });
                if (aiRes.text) {
                  transcriptText = formatGeminiTranscript(aiRes.text);
                }
              } catch (tErr) {
                console.error("[Import URL] Podcast Gemini transcription error:", tErr);
              } finally {
                if (uploadedFile?.name) {
                  try {
                    await ai2.files.delete({ name: uploadedFile.name });
                  } catch (_) {
                  }
                }
              }
            }
          }
        } catch (aErr) {
          console.error("[Import URL] Failed to fetch podcast MP3 stream:", aErr);
        }
      }
      if (!transcriptText.trim()) {
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        transcriptText = descMatch ? descMatch[1].trim() : "\u041F\u043E\u0434\u043A\u0430\u0441\u0442 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 '\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B' \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F \u0442\u0435\u043A\u0441\u0442\u0430 \u0440\u0435\u0447\u0438.";
      }
      return res.json({
        title: podcastTitle,
        text: transcriptText,
        lessonType: "podcast",
        coverUrl: extractedCoverUrl || null,
        audioUrl: audioUrl || directAudioUrl || null,
        audioBase64: null
      });
    }
    let articleData = null;
    try {
      articleData = cleanAndFormatArticle(html, url);
    } catch (parseErr) {
      console.warn("[Import URL] cleanAndFormatArticle error:", parseErr);
    }
    if (articleData && articleData.text) {
      let text2 = articleData.text;
      text2 = text2.replace(/\[(?:\[LECTURA_)?IMG:(https?:\/\/[^\]]+)\]/gi, "\n\n[IMG:$1]\n\n");
      text2 = text2.replace(/^\[caption\]\s*(.+)$/gim, "[CAPTION:$1]");
      text2 = text2.replace(/\n{3,}/g, "\n\n").trim();
      const wordCount = text2.replace(/\[(?:\[LECTURA_)?IMG:[^\]]+\]/gi, "").replace(/\[CAPTION:[^\]]+\]/gi, "").replace(/\[caption\][^\n]*/gi, "").split(/\s+/).filter(Boolean).length;
      if (wordCount >= 30) {
        console.log(`[Import URL] Clean & Format OK \u2014 ${wordCount} words extracted from ${url}`);
        const imageMatches = text2.match(/\[IMG:[^\]]+\]/g);
        console.log("\u{1F5BC}\uFE0F Found Images in imported text:", imageMatches);
        console.log("Saved Article Text Preview:", text2.slice(0, 500));
        let coverUrl = extractedCoverUrl;
        if (!coverUrl) {
          const firstImg = text2.match(/\[IMG:(https?:\/\/[^\]]+)\]/);
          if (firstImg) coverUrl = firstImg[1];
        }
        return res.json({
          title: articleData.title || "Web Article",
          text: text2,
          coverUrl: coverUrl || null,
          byline: articleData.byline || null,
          excerpt: articleData.excerpt || null
        });
      }
      console.warn(`[Import URL] Extracted only ${wordCount} words \u2014 trying AI fallback`);
    } else {
      console.warn(`[Import URL] cleanAndFormatArticle returned empty \u2014 trying AI fallback`);
    }
    if (aiProvider === "local") {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 45e3)}
---

Return your answer strictly in JSON format with these exact keys:
- "title": creative/extracted title of the article
- "text": the cleaned text content (paragraphs separated by double newlines \\n\\n)

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
        const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
        return res.json({
          title: data.title || "\u0421\u0442\u0430\u0442\u044C\u044F \u0441 \u0441\u0430\u0439\u0442\u0430",
          text: data.text || "",
          coverUrl: extractedCoverUrl || null
        });
      } catch (localErr) {
        console.warn("Local AI article parsing failed (falling back to Gemini):", localErr.message || localErr);
      }
    }
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 6e4)}
---

Output your result as a JSON object matching this schema:
{
  "title": "extracted article title",
  "text": "cleaned paragraph 1\\n\\ncleaned paragraph 2\\n\\n..."
}`;
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: import_genai4.Type.OBJECT,
              properties: {
                title: { type: import_genai4.Type.STRING },
                text: { type: import_genai4.Type.STRING }
              },
              required: ["title", "text"]
            }
          }
        });
        const parsed = JSON.parse(response.text || "{}");
        return res.json({
          title: parsed.title || "\u0421\u0442\u0430\u0442\u044C\u044F \u0441 \u0441\u0430\u0439\u0442\u0430",
          text: parsed.text || "",
          coverUrl: extractedCoverUrl || null
        });
      } catch (geminiErr) {
        console.warn("Gemini AI article parsing failed (falling back to offline regex parser):", geminiErr.message || geminiErr);
      }
    }
    let title = "\u0421\u0442\u0430\u0442\u044C\u044F \u0441 \u0441\u0430\u0439\u0442\u0430";
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "").replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "").replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "").replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "").replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
    text = text.replace(/<\/p>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
    return res.json({
      title,
      text: text.substring(0, 5e5),
      coverUrl: extractedCoverUrl || null
    });
  } catch (err) {
    console.error("Web article parser error:", err);
    return res.status(500).json({ error: "Failed to parse website article: " + (err.message || err) });
  }
});
router7.post("/transcribe-audio", async (req, res) => {
  req.setTimeout(6e5);
  res.setTimeout(6e5);
  try {
    const userApiKey = req.headers["x-gemini-key"] || req.body && req.body.geminiApiKey;
    const targetLanguage = req.headers["x-target-language"] || req.body && req.body.targetLanguage;
    const filenameRaw = req.headers["x-filename"] || req.body && req.body.filename;
    const filename = filenameRaw ? decodeURIComponent(filenameRaw) : "";
    const mimeTypeHeader = req.headers["content-type"] || req.body && req.body.mimeType || "audio/mp3";
    let buffer = null;
    let mimeType = mimeTypeHeader.split(";")[0].trim();
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
    } else if (req.body && typeof req.body.audioBase64 === "string") {
      const base64Data = req.body.audioBase64.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
      if (req.body.mimeType) mimeType = req.body.mimeType;
    }
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u043F\u0443\u0441\u0442\u043E\u0439 \u0438\u043B\u0438 \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0430\u0443\u0434\u0438\u043E\u0444\u0430\u0439\u043B." });
    }
    const ai = getGeminiClient(userApiKey);
    if (!ai) {
      return res.status(400).json({
        error: "\u0414\u043B\u044F \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F \u0440\u0435\u0447\u0438 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F Gemini API Key. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043B\u044E\u0447 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u0430."
      });
    }
    let ext = "mp3";
    const rawType = (mimeType || "").toLowerCase();
    if (rawType.includes("wav")) ext = "wav";
    else if (rawType.includes("ogg")) ext = "ogg";
    else if (rawType.includes("m4a") || rawType.includes("aac")) ext = "m4a";
    else if (rawType.includes("webm")) ext = "webm";
    const tempAudioDir = import_os2.default.tmpdir();
    const tempAudioPath = import_path8.default.join(tempAudioDir, `transcribe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`);
    import_fs9.default.writeFileSync(tempAudioPath, buffer);
    let uploadedGeminiFile = null;
    try {
      console.log(`[Audio Transcribe] Uploading ${buffer.length} bytes to Gemini File API (${mimeType})...`);
      uploadedGeminiFile = await ai.files.upload({
        file: tempAudioPath,
        mimeType: mimeType || "audio/mp3"
      });
      const prompt = `You are a professional transcription service. Listen to this entire audio recording${filename ? ` ("${filename}")` : ""}${targetLanguage ? ` in ${targetLanguage}` : ""} from START to FINISH.

Your ONLY task: output a timestamped transcript where each line starts with the REAL audio timestamp (the exact position in the audio file where that sentence begins).

Rules:
- Timestamps MUST match the actual audio position exactly \u2014 do NOT estimate or guess, use what you hear.
- Format: \`M:SS sentence text\` \u2014 for example: \`0:07 Hola, bienvenidos al podcast.\`
- One sentence per line. Each line must start with its correct timestamp.
- Do NOT merge multiple minutes into a single line.
- Do NOT skip any content. Transcribe everything from 0:00 to the very last word.
- Do NOT add headers, titles, notes, or markdown. Plain timestamped lines only.`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            fileData: {
              fileUri: uploadedGeminiFile.uri,
              mimeType: uploadedGeminiFile.mimeType || mimeType || "audio/mp3"
            }
          },
          prompt
        ],
        config: {
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });
      const aiText = response.text || "";
      if (!aiText.trim()) {
        throw new Error("Gemini AI \u0432\u0435\u0440\u043D\u0443\u043B \u043F\u0443\u0441\u0442\u043E\u0439 \u0442\u0435\u043A\u0441\u0442 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F.");
      }
      const formattedTranscript = formatGeminiTranscript(aiText);
      return res.json({
        text: formattedTranscript,
        success: true
      });
    } finally {
      if (import_fs9.default.existsSync(tempAudioPath)) {
        try {
          import_fs9.default.unlinkSync(tempAudioPath);
        } catch (e) {
        }
      }
      if (uploadedGeminiFile?.name) {
        try {
          await ai.files.delete({ name: uploadedGeminiFile.name });
        } catch (e) {
        }
      }
    }
  } catch (err) {
    console.error("Audio Transcription error:", err);
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F \u0440\u0435\u0447\u0438: " + (err.message || String(err)) });
  }
});
var activeDownloads = /* @__PURE__ */ new Map();
var downloadProgressMap = /* @__PURE__ */ new Map();
router7.get("/media/progress", (req, res) => {
  const { videoId, lessonId, onlyAudio } = req.query;
  const cleanVideoId = (videoId ? String(videoId) : "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
  const isAudio = onlyAudio === "true" || onlyAudio === "1";
  const ext = isAudio ? "m4a" : "mp4";
  const lockKey = `${fileId}_${ext}`;
  const isDownloading = activeDownloads.has(lockKey);
  const progress = downloadProgressMap.get(lockKey) || { percent: isDownloading ? 5 : 0, speed: "", eta: "", status: isDownloading ? "downloading" : "idle" };
  return res.json({
    downloading: isDownloading,
    percent: progress.percent,
    speed: progress.speed,
    eta: progress.eta,
    status: progress.status
  });
});
router7.post("/media/download", async (req, res) => {
  try {
    let userId = "default";
    try {
      userId = resolveUserId(req);
    } catch (_) {
      userId = "default";
    }
    const { videoId, lessonId, onlyAudio } = req.body;
    if (!videoId && !lessonId) {
      return res.status(400).json({ error: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440 videoId \u0438\u043B\u0438 lessonId \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D" });
    }
    const cleanVideoId = (videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanVideoId || cleanVideoId.length !== 11) {
      return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442 YouTube videoId" });
    }
    const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
    const isAudio = !!onlyAudio;
    const ext = isAudio ? "m4a" : "mp4";
    const filename = `${fileId}.${ext}`;
    const targetFilePath = import_path8.default.join(VIDEO_STORAGE_DIR, filename);
    if (import_fs9.default.existsSync(targetFilePath)) {
      const stat = import_fs9.default.statSync(targetFilePath);
      if (stat.size > 1e5) {
        return res.json({
          ready: true,
          url: `/api/media/stream/${filename}`,
          filename,
          isAudio,
          sizeBytes: stat.size
        });
      }
    }
    const lockKey = `${fileId}_${ext}`;
    let downloadPromise = activeDownloads.get(lockKey);
    if (!downloadPromise) {
      downloadProgressMap.set(lockKey, { percent: 1, speed: "", eta: "", status: "starting" });
      downloadPromise = new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const tempPath = import_path8.default.join(VIDEO_STORAGE_DIR, `${fileId}_tmp_${Date.now()}.${ext}`);
        const ytArgs = {
          output: tempPath,
          noPlaylist: true,
          newline: true,
          noWarnings: true
        };
        if (isAudio) {
          ytArgs.format = "ba/b";
        } else {
          ytArgs.format = "best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        }
        let processErrorMsg = "";
        const cp = getYtDlp().exec(videoUrl, ytArgs);
        cp.stdout?.on("data", (data) => {
          const text = data.toString();
          const match = text.match(/\[download\]\s+([\d\.]+)%(?:\s+of\s+~?\s*([\d\.]+[A-Za-z]+))?(?:\s+at\s+([\d\.]+[A-Za-z]+\/s))?(?:\s+ETA\s+(\S+))?/);
          if (match) {
            const pct = parseFloat(match[1]);
            const speed = match[3] || "";
            const eta = match[4] || "";
            downloadProgressMap.set(lockKey, {
              percent: !isNaN(pct) ? Math.min(99, pct) : 50,
              speed,
              eta,
              status: "downloading"
            });
          } else if (text.includes("[Merger]") || text.includes("Merging formats") || text.includes("[ffmpeg]")) {
            downloadProgressMap.set(lockKey, {
              percent: 99,
              speed: "\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430...",
              eta: "00:01",
              status: "merging"
            });
          }
        });
        cp.stderr?.on("data", (data) => {
          const text = data.toString();
          if (text.includes("ERROR:") || text.includes("Error")) {
            processErrorMsg += " " + text.trim();
          }
        });
        cp.on("close", (code) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);
          if (code === 0 && import_fs9.default.existsSync(tempPath)) {
            try {
              if (import_fs9.default.existsSync(targetFilePath)) {
                try {
                  import_fs9.default.unlinkSync(targetFilePath);
                } catch (_) {
                }
              }
              import_fs9.default.renameSync(tempPath, targetFilePath);
              if (lessonId) {
                try {
                  const db = getDbConnection(userId);
                  if (isAudio) {
                    db.prepare("UPDATE lessons SET audioUrl = ? WHERE id = ? AND user_id = ?").run(`/api/media/stream/${filename}`, lessonId, userId);
                  } else {
                    db.prepare("UPDATE lessons SET localVideoUrl = ? WHERE id = ? AND user_id = ?").run(`/api/media/stream/${filename}`, lessonId, userId);
                  }
                } catch (dbErr) {
                  console.warn("Could not update lesson media URL in SQLite:", dbErr);
                }
              }
              const stat = import_fs9.default.existsSync(targetFilePath) ? import_fs9.default.statSync(targetFilePath) : null;
              resolve({
                url: `/api/media/stream/${filename}`,
                filename,
                isAudio,
                sizeBytes: stat?.size || 0
              });
            } catch (err) {
              reject(new Error("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u044F \u0441\u043A\u0430\u0447\u0430\u043D\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430: " + err.message));
            }
          } else {
            if (import_fs9.default.existsSync(tempPath)) {
              try {
                import_fs9.default.unlinkSync(tempPath);
              } catch (_) {
              }
            }
            reject(new Error(processErrorMsg || `yt-dlp \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u0441 \u043A\u043E\u0434\u043E\u043C \u043E\u0448\u0438\u0431\u043A\u0438 ${code}`));
          }
        });
        cp.on("error", (err) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);
          if (import_fs9.default.existsSync(tempPath)) {
            try {
              import_fs9.default.unlinkSync(tempPath);
            } catch (_) {
            }
          }
          reject(err);
        });
      });
      activeDownloads.set(lockKey, downloadPromise);
    }
    const result = await downloadPromise;
    return res.json(result);
  } catch (err) {
    console.error("Media download error:", err);
    return res.status(500).json({ error: err.message || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043C\u0435\u0434\u0438\u0430 \u0447\u0435\u0440\u0435\u0437 yt-dlp" });
  }
});
router7.get("/media/status", (req, res) => {
  const { videoId, lessonId, onlyAudio } = req.query;
  const cleanVideoId = (videoId ? String(videoId) : "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
  const isAudio = onlyAudio === "true" || onlyAudio === "1";
  const ext = isAudio ? "m4a" : "mp4";
  const filename = `${fileId}.${ext}`;
  const targetFilePath = import_path8.default.join(VIDEO_STORAGE_DIR, filename);
  const lockKey = `${fileId}_${ext}`;
  const isDownloading = activeDownloads.has(lockKey);
  if (import_fs9.default.existsSync(targetFilePath)) {
    const stat = import_fs9.default.statSync(targetFilePath);
    if (stat.size > 1e5) {
      return res.json({
        exists: true,
        ready: true,
        downloading: false,
        url: `/api/media/stream/${filename}`,
        filename,
        isAudio,
        sizeBytes: stat.size
      });
    }
  }
  if (!isAudio) {
    const audioFilename = `${fileId}.m4a`;
    const audioPath = import_path8.default.join(VIDEO_STORAGE_DIR, audioFilename);
    if (import_fs9.default.existsSync(audioPath)) {
      const stat = import_fs9.default.statSync(audioPath);
      if (stat.size > 1e5) {
        return res.json({
          exists: true,
          ready: true,
          downloading: false,
          url: `/api/media/stream/${audioFilename}`,
          filename: audioFilename,
          isAudio: true,
          sizeBytes: stat.size
        });
      }
    }
  }
  return res.json({
    exists: false,
    ready: false,
    downloading: isDownloading
  });
});
function streamFile(filePath, req, res, defaultContentType) {
  if (!import_fs9.default.existsSync(filePath)) {
    return res.status(404).json({ error: "Media file not found" });
  }
  const stat = import_fs9.default.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = import_path8.default.extname(filePath).toLowerCase();
  let contentType = defaultContentType || (ext === ".mkv" ? "video/x-matroska" : "video/mp4");
  if (ext === ".m4a" || ext === ".aac") contentType = "audio/mp4";
  else if (ext === ".mp3") contentType = "audio/mpeg";
  else if (ext === ".webm") contentType = "video/webm";
  else if (ext === ".mkv") contentType = "video/x-matroska";
  res.setHeader("Accept-Ranges", "bytes");
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }
    const chunksize = end - start + 1;
    const fileStream = import_fs9.default.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": chunksize,
      "Content-Type": contentType
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType
    });
    import_fs9.default.createReadStream(filePath).pipe(res);
  }
}
router7.get("/media/stream/:filename", (req, res) => {
  const filename = import_path8.default.basename(req.params.filename);
  const filePath = import_path8.default.join(VIDEO_STORAGE_DIR, filename);
  if (filename.toLowerCase().endsWith(".mkv")) {
    const mp4Name = filename.replace(/\.mkv$/i, ".mp4");
    const mp4Path = import_path8.default.join(VIDEO_STORAGE_DIR, mp4Name);
    if (import_fs9.default.existsSync(mp4Path)) {
      return streamFile(mp4Path, req, res, "video/mp4");
    }
  }
  return streamFile(filePath, req, res);
});
router7.get("/media/youtube-stream/:videoId", async (req, res) => {
  try {
    let userId = "default";
    try {
      userId = resolveUserId(req);
    } catch (_) {
      userId = "default";
    }
    const cleanVideoId = (req.params.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanVideoId || cleanVideoId.length !== 11) {
      return res.status(400).json({ error: "Invalid video ID format" });
    }
    const lessonId = req.query.lessonId ? String(req.query.lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
    const filename = `${lessonId}.m4a`;
    const targetFilePath = import_path8.default.join(VIDEO_STORAGE_DIR, filename);
    if (import_fs9.default.existsSync(targetFilePath)) {
      const stat = import_fs9.default.statSync(targetFilePath);
      if (stat.size > 5e4) {
        return streamFile(targetFilePath, req, res, "audio/mp4");
      }
    }
    for (const altExt of ["m4a", "mp4"]) {
      const altPath = import_path8.default.join(VIDEO_STORAGE_DIR, `${cleanVideoId}.${altExt}`);
      if (import_fs9.default.existsSync(altPath)) {
        const stat = import_fs9.default.statSync(altPath);
        if (stat.size > 5e4) {
          return streamFile(altPath, req, res, altExt === "m4a" ? "audio/mp4" : "video/mp4");
        }
      }
    }
    const lockKey = `${lessonId}_m4a`;
    let downloadPromise = activeDownloads.get(lockKey);
    if (!downloadPromise) {
      downloadProgressMap.set(lockKey, { percent: 1, speed: "", eta: "", status: "starting" });
      downloadPromise = new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const tempPath = import_path8.default.join(VIDEO_STORAGE_DIR, `${lessonId}_tmp_${Date.now()}.m4a`);
        const ytArgs = {
          output: tempPath,
          noPlaylist: true,
          newline: true,
          noWarnings: true,
          format: "ba/b"
        };
        let processErrorMsg = "";
        const cp = getYtDlp().exec(videoUrl, ytArgs);
        cp.stdout?.on("data", (data) => {
          const text = data.toString();
          const match = text.match(/\[download\]\s+([\d\.]+)%/);
          if (match) {
            const pct = parseFloat(match[1]);
            downloadProgressMap.set(lockKey, {
              percent: !isNaN(pct) ? pct : 50,
              speed: "",
              eta: "",
              status: "downloading"
            });
          }
        });
        cp.stderr?.on("data", (data) => {
          const text = data.toString();
          if (text.includes("ERROR:") || text.includes("Error")) {
            processErrorMsg += " " + text.trim();
          }
        });
        cp.on("close", (code) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);
          if (code === 0 && import_fs9.default.existsSync(tempPath)) {
            try {
              if (import_fs9.default.existsSync(targetFilePath)) {
                try {
                  import_fs9.default.unlinkSync(targetFilePath);
                } catch (_) {
                }
              }
              import_fs9.default.renameSync(tempPath, targetFilePath);
              if (lessonId) {
                try {
                  const db = getDbConnection(userId);
                  db.prepare("UPDATE lessons SET audioUrl = ? WHERE id = ? AND user_id = ?").run(`/api/media/stream/${filename}`, lessonId, userId);
                } catch (_) {
                }
              }
              const stat = import_fs9.default.existsSync(targetFilePath) ? import_fs9.default.statSync(targetFilePath) : null;
              resolve({
                url: `/api/media/stream/${filename}`,
                filename,
                isAudio: true,
                sizeBytes: stat?.size || 0
              });
            } catch (err) {
              reject(err);
            }
          } else {
            if (import_fs9.default.existsSync(tempPath)) {
              try {
                import_fs9.default.unlinkSync(tempPath);
              } catch (_) {
              }
            }
            reject(new Error(processErrorMsg || `yt-dlp exited with code ${code}`));
          }
        });
      });
      activeDownloads.set(lockKey, downloadPromise);
    }
    await downloadPromise;
    return streamFile(targetFilePath, req, res, "audio/mp4");
  } catch (err) {
    console.error("[YouTube Audio Stream Error]:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Error resolving YouTube stream" });
  }
});
router7.get("/media/clips/:filename", (req, res) => {
  const filename = import_path8.default.basename(req.params.filename);
  const filePath = import_path8.default.join(CLIPS_STORAGE_DIR, filename);
  if (!import_fs9.default.existsSync(filePath)) {
    return res.status(404).json({ error: "Clip not found" });
  }
  const ext = import_path8.default.extname(filename).toLowerCase();
  const contentType = ext === ".mp3" ? "audio/mpeg" : ext === ".m4a" ? "audio/mp4" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return streamFile(filePath, req, res, contentType);
});
router7.post("/media/create-card-clip", async (req, res) => {
  try {
    const {
      lessonId,
      videoId,
      audioUrl,
      localVideoUrl,
      startTime = 0,
      endTime = 0,
      imageSnapshot,
      word = "word"
    } = req.body;
    const startNum = Math.max(0, parseFloat(startTime) || 0);
    let endNum = parseFloat(endTime) || startNum + 3;
    if (endNum <= startNum) {
      endNum = startNum + 3;
    }
    if (endNum - startNum > 15) {
      endNum = startNum + 15;
    }
    const paddedStart = Math.max(0, startNum - 0.15);
    const paddedEnd = endNum + 0.25;
    const clipId = `clip_${Date.now()}_${import_crypto4.default.randomBytes(4).toString("hex")}`;
    const targetMp3Path = import_path8.default.join(CLIPS_STORAGE_DIR, `${clipId}.mp3`);
    const targetJpgPath = import_path8.default.join(CLIPS_STORAGE_DIR, `${clipId}.jpg`);
    let finalImageUrl = null;
    let finalAudioUrl = null;
    if (imageSnapshot && typeof imageSnapshot === "string" && imageSnapshot.startsWith("data:image")) {
      try {
        const base64Data = imageSnapshot.replace(/^data:image\/\w+;base64,/, "");
        import_fs9.default.writeFileSync(targetJpgPath, Buffer.from(base64Data, "base64"));
        finalImageUrl = `/api/media/clips/${clipId}.jpg`;
      } catch (imgErr) {
        console.warn("[CardClip] Failed to write image snapshot:", imgErr);
      }
    }
    let sourcePath = null;
    const candidates = [
      lessonId ? import_path8.default.join(VIDEO_STORAGE_DIR, `${lessonId}.m4a`) : null,
      lessonId ? import_path8.default.join(VIDEO_STORAGE_DIR, `${lessonId}.mp4`) : null,
      videoId ? import_path8.default.join(VIDEO_STORAGE_DIR, `${videoId}.m4a`) : null,
      videoId ? import_path8.default.join(VIDEO_STORAGE_DIR, `${videoId}.mp4`) : null,
      localVideoUrl ? import_path8.default.join(VIDEO_STORAGE_DIR, import_path8.default.basename(localVideoUrl)) : null
    ].filter(Boolean);
    for (const c of candidates) {
      if (import_fs9.default.existsSync(c)) {
        sourcePath = c;
        break;
      }
    }
    if (sourcePath) {
      try {
        await execFilePromise("ffmpeg", [
          "-y",
          "-ss",
          paddedStart.toFixed(2),
          "-to",
          paddedEnd.toFixed(2),
          "-i",
          sourcePath,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "96k",
          "-ac",
          "2",
          targetMp3Path
        ]);
        if (import_fs9.default.existsSync(targetMp3Path)) {
          finalAudioUrl = `/api/media/clips/${clipId}.mp3`;
        }
      } catch (audioErr) {
        console.warn("[CardClip] ffmpeg audio cut error:", audioErr?.message);
      }
      if (!finalImageUrl && sourcePath.endsWith(".mp4")) {
        try {
          await execFilePromise("ffmpeg", [
            "-y",
            "-ss",
            startNum.toFixed(2),
            "-i",
            sourcePath,
            "-vframes",
            "1",
            "-q:v",
            "3",
            targetJpgPath
          ]);
          if (import_fs9.default.existsSync(targetJpgPath)) {
            finalImageUrl = `/api/media/clips/${clipId}.jpg`;
          }
        } catch (frameErr) {
          console.warn("[CardClip] ffmpeg frame extraction error:", frameErr?.message);
        }
      }
    } else if (audioUrl && typeof audioUrl === "string" && audioUrl.startsWith("http")) {
      try {
        await execFilePromise("ffmpeg", [
          "-y",
          "-ss",
          paddedStart.toFixed(2),
          "-to",
          paddedEnd.toFixed(2),
          "-i",
          audioUrl,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "96k",
          "-ac",
          "2",
          targetMp3Path
        ]);
        if (import_fs9.default.existsSync(targetMp3Path)) {
          finalAudioUrl = `/api/media/clips/${clipId}.mp3`;
        }
      } catch (remoteErr) {
        console.warn("[CardClip] Remote audio stream ffmpeg cut error:", remoteErr?.message);
      }
    } else if (videoId) {
      const tempSectionMp4 = import_path8.default.join(CLIPS_STORAGE_DIR, `temp_${clipId}.mp4`);
      try {
        const ytDlp = getYtDlp();
        await Promise.race([
          ytDlp(`https://www.youtube.com/watch?v=${videoId}`, {
            format: "18/best[height<=360]/best",
            extractorArgs: "youtube:player_client=android",
            downloadSections: `*${paddedStart.toFixed(2)}-${paddedEnd.toFixed(2)}`,
            output: tempSectionMp4,
            socketTimeout: 8,
            retries: 2,
            fragmentRetries: 2,
            noCheckCertificates: true,
            preferFreeFormats: true
          }),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("yt-dlp section cut timed out after 12s")), 12e3)
          )
        ]);
        if (import_fs9.default.existsSync(tempSectionMp4)) {
          if (!finalImageUrl) {
            try {
              await execFilePromise("ffmpeg", [
                "-y",
                "-ss",
                "0.3",
                "-i",
                tempSectionMp4,
                "-vframes",
                "1",
                "-q:v",
                "2",
                targetJpgPath
              ]);
              if (import_fs9.default.existsSync(targetJpgPath)) {
                finalImageUrl = `/api/media/clips/${clipId}.jpg`;
              }
            } catch (fErr) {
              console.warn("[CardClip] Failed to extract frame from section mp4:", fErr?.message);
            }
          }
          try {
            await execFilePromise("ffmpeg", [
              "-y",
              "-i",
              tempSectionMp4,
              "-vn",
              "-c:a",
              "libmp3lame",
              "-b:a",
              "96k",
              "-ac",
              "2",
              targetMp3Path
            ]);
            if (import_fs9.default.existsSync(targetMp3Path)) {
              finalAudioUrl = `/api/media/clips/${clipId}.mp3`;
            }
          } catch (aErr) {
            console.warn("[CardClip] Failed to extract audio from section mp4:", aErr?.message);
          }
          try {
            import_fs9.default.unlinkSync(tempSectionMp4);
          } catch (_) {
          }
        }
      } catch (ytdlpErr) {
        console.warn("[CardClip] yt-dlp section cut error:", ytdlpErr?.message);
        try {
          if (import_fs9.default.existsSync(tempSectionMp4)) import_fs9.default.unlinkSync(tempSectionMp4);
        } catch (_) {
        }
      }
    }
    if (!finalImageUrl && videoId) {
      finalImageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
    return res.json({
      success: true,
      clipId,
      audioClipUrl: finalAudioUrl,
      imageUrl: finalImageUrl
    });
  } catch (err) {
    console.error("[CardClip Error]:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Failed to create card clip" });
  }
});
var media_default = router7;

// routes/whisper.ts
var import_express8 = require("express");
var import_os3 = __toESM(require("os"), 1);
var import_fs11 = __toESM(require("fs"), 1);
var import_path10 = __toESM(require("path"), 1);
var import_child_process3 = require("child_process");
init_ytdlpWrapper();

// server/whisper/python_resolver.ts
var import_fs10 = __toESM(require("fs"), 1);
var import_path9 = __toESM(require("path"), 1);
var import_child_process2 = require("child_process");
function resolvePythonExecutable() {
  if (process.env.WHISPER_PYTHON_PATH && import_fs10.default.existsSync(process.env.WHISPER_PYTHON_PATH)) {
    return process.env.WHISPER_PYTHON_PATH;
  }
  const projectRoot = process.cwd();
  const venvWindows = import_path9.default.join(projectRoot, "venv", "Scripts", "python.exe");
  const venvUnix = import_path9.default.join(projectRoot, "venv", "bin", "python");
  if (import_fs10.default.existsSync(venvWindows)) return venvWindows;
  if (import_fs10.default.existsSync(venvUnix)) return venvUnix;
  const whisperflowVenvWin = import_path9.default.join(projectRoot, "..", "whisperflow-audio-transcription-&-alignment", "venv", "Scripts", "python.exe");
  const whisperflowVenvUnix = import_path9.default.join(projectRoot, "..", "whisperflow-audio-transcription-&-alignment", "venv", "bin", "python");
  if (import_fs10.default.existsSync(whisperflowVenvWin)) return whisperflowVenvWin;
  if (import_fs10.default.existsSync(whisperflowVenvUnix)) return whisperflowVenvUnix;
  const candidates = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      (0, import_child_process2.execSync)(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch (_) {
    }
  }
  return process.platform === "win32" ? "python" : "python3";
}

// routes/whisper.ts
var router8 = (0, import_express8.Router)();
var uploadDir = import_path10.default.join(import_os3.default.tmpdir(), "lectura_whisper_uploads");
if (!import_fs11.default.existsSync(uploadDir)) {
  import_fs11.default.mkdirSync(uploadDir, { recursive: true });
} else {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1e3;
    for (const file of import_fs11.default.readdirSync(uploadDir)) {
      const fullPath = import_path10.default.join(uploadDir, file);
      try {
        const stat = import_fs11.default.statSync(fullPath);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          import_fs11.default.unlinkSync(fullPath);
        }
      } catch (_) {
      }
    }
  } catch (_) {
  }
}
var queue = [];
var activeItem = null;
var currentChildProcess = null;
var lastActiveTimestamp = Date.now();
var IDLE_TIMEOUT_MS = 5 * 60 * 1e3;
var loadedModelName = null;
var sseClients = [];
function broadcastSse(event, data) {
  const payload = `event: ${event}
data: ${JSON.stringify(data)}

`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch (_) {
      sseClients.splice(i, 1);
    }
  }
}
function formatWhisperToLecturaParagraphs(segments) {
  if (!segments || segments.length === 0) return "";
  const paragraphs = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = (seg.text || "").trim();
    if (!text) continue;
    const startSec = Math.floor(seg.start || 0);
    const mins = Math.floor(startSec / 60);
    const secs = Math.floor(startSec % 60);
    const tsStr = `${mins}:${secs.toString().padStart(2, "0")}`;
    paragraphs.push(`${tsStr} ${text}`);
  }
  return paragraphs.join("\n\n");
}
async function processQueue() {
  if (activeItem || queue.length === 0) return;
  activeItem = queue.shift();
  activeItem.status = "extracting_audio";
  activeItem.startedAt = Date.now();
  activeItem.stageText = "Preparing media...";
  lastActiveTimestamp = Date.now();
  broadcastSse("queue_update", { queue, activeItem });
  let tempAudioPath = null;
  try {
    if (activeItem.sourceType === "youtube" && activeItem.sourceUrl) {
      activeItem.stageText = "Extracting audio from YouTube...";
      broadcastSse("queue_update", { queue, activeItem });
      if (activeItem.title === "YouTube Video" || !activeItem.thumbnail) {
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(activeItem.sourceUrl)}&format=json`);
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            if (oembedData.title && activeItem.title === "YouTube Video") {
              activeItem.title = oembedData.title;
            }
            if (oembedData.thumbnail_url && !activeItem.thumbnail) {
              activeItem.thumbnail = oembedData.thumbnail_url;
            }
            if (oembedData.author_name && !activeItem.channelName) {
              activeItem.channelName = oembedData.author_name;
            }
            if (oembedData.author_url && !activeItem.channelAvatarUrl) {
              try {
                const channelRes = await fetch(oembedData.author_url, {
                  headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
                });
                if (channelRes.ok) {
                  const channelHtml = await channelRes.text();
                  const ogImgMatch = channelHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || channelHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                  if (ogImgMatch) {
                    activeItem.channelAvatarUrl = ogImgMatch[1];
                  }
                }
              } catch (_) {
              }
            }
            broadcastSse("queue_update", { queue, activeItem });
          }
        } catch (_) {
        }
      }
      const outPattern = import_path10.default.join(uploadDir, `yt_whisper_${activeItem.id}.%(ext)s`);
      const dlp = getYtDlp();
      try {
        await dlp(activeItem.sourceUrl, {
          // Prefer lightweight audio-only formats: m4a → opus → webm → any audio
          format: "ba[ext=m4a]/ba[ext=opus]/ba[ext=webm]/bestaudio/best",
          output: outPattern,
          noCheckCertificate: true,
          preferFreeFormats: true,
          concurrentFragments: 4,
          bufferSize: "16K",
          addHeader: [
            "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language:en-US,en;q=0.9"
          ]
        });
      } catch (firstErr) {
        console.warn("[Whisper] Primary YouTube audio extraction failed, retrying with fallback audio format...", firstErr?.message || firstErr);
        await dlp(activeItem.sourceUrl, {
          format: "bestaudio/best",
          output: outPattern,
          noCheckCertificate: true,
          preferFreeFormats: true
        });
      }
      const files = import_fs11.default.readdirSync(uploadDir);
      const matchingFile = files.find((f) => f.startsWith(`yt_whisper_${activeItem.id}.`));
      if (!matchingFile) {
        throw new Error("Could not find extracted audio file from YouTube");
      }
      tempAudioPath = import_path10.default.join(uploadDir, matchingFile);
    } else if (activeItem.sourceType === "podcast" && activeItem.sourceUrl) {
      activeItem.stageText = "Downloading podcast audio stream...";
      broadcastSse("queue_update", { queue, activeItem });
      const podcastUrl = activeItem.sourceUrl;
      let directAudioUrl = null;
      if (/\.(mp3|m4a|aac|ogg|wav)(\?.*)?$/i.test(podcastUrl)) {
        directAudioUrl = podcastUrl;
      } else {
        try {
          const pageRes = await fetch(podcastUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9,es;q=0.8,ru;q=0.7"
            }
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            if (ogTitleMatch && (!activeItem.title || activeItem.title === "Podcast Episode")) {
              activeItem.title = ogTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*-\s*Apple Podcasts.*$/i, "").trim();
            }
            const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (ogImgMatch && !activeItem.thumbnail) {
              activeItem.thumbnail = ogImgMatch[1];
            }
            const partOfSeriesMatch = html.match(/"partOfSeries"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i) || html.match(/"seriesName"\s*:\s*"([^"]+)"/i) || html.match(/"collectionName"\s*:\s*"([^"]+)"/i);
            if (partOfSeriesMatch && !activeItem.channelName) {
              activeItem.channelName = partOfSeriesMatch[1].trim();
            }
            if (!activeItem.channelName) {
              const rawTitle = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").trim();
              if (rawTitle.includes(" - ")) {
                const parts = rawTitle.split(" - ").map((p) => p.trim());
                if (parts.length >= 3 && parts[parts.length - 1].toLowerCase().includes("apple podcast")) {
                  activeItem.channelName = parts[parts.length - 2];
                } else if (parts.length >= 2) {
                  activeItem.channelName = parts[1];
                }
              }
            }
            if (!activeItem.channelName) {
              const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
              if (authorMatch && !authorMatch[1].toLowerCase().includes("apple")) {
                activeItem.channelName = authorMatch[1].trim();
              }
            }
            if (ogImgMatch && !activeItem.channelAvatarUrl) {
              activeItem.channelAvatarUrl = ogImgMatch[1];
            }
            const assetUrlMatch = html.match(/"assetUrl"\s*:\s*"(https?:\/\/[^"]+)"/i);
            if (assetUrlMatch) {
              directAudioUrl = assetUrlMatch[1];
            } else {
              const audioMatches = html.match(/https?:\/\/[^\s"']+\.(?:mp3|m4a|aac|ogg)[^\s"']*/gi);
              if (audioMatches && audioMatches.length > 0) {
                directAudioUrl = audioMatches[0];
              }
            }
            broadcastSse("queue_update", { queue, activeItem });
          }
        } catch (fetchErr) {
          console.warn("[Whisper Podcast Fetch Warn]:", fetchErr.message);
        }
      }
      if (!directAudioUrl) {
        try {
          activeItem.stageText = "Trying yt-dlp fallback for podcast...";
          broadcastSse("queue_update", { queue, activeItem });
          const outPattern = import_path10.default.join(uploadDir, `podcast_ytdlp_${activeItem.id}.%(ext)s`);
          const dlp = getYtDlp();
          await dlp(podcastUrl, {
            format: "ba[ext=m4a]/ba[ext=mp3]/bestaudio/best",
            output: outPattern,
            noCheckCertificate: true,
            addHeader: [
              "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ]
          });
          const ytdlpFiles = import_fs11.default.readdirSync(uploadDir);
          const ytdlpMatch = ytdlpFiles.find((f) => f.startsWith(`podcast_ytdlp_${activeItem.id}.`));
          if (ytdlpMatch) {
            const DATA_DIR22 = process.env.DATA_DIR || process.cwd();
            const audioStorageDir2 = import_path10.default.join(DATA_DIR22, "audio_files");
            if (!import_fs11.default.existsSync(audioStorageDir2)) import_fs11.default.mkdirSync(audioStorageDir2, { recursive: true });
            const audioFileName2 = `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`;
            const diskPath2 = import_path10.default.join(audioStorageDir2, audioFileName2);
            import_fs11.default.copyFileSync(import_path10.default.join(uploadDir, ytdlpMatch), diskPath2);
            try {
              import_fs11.default.unlinkSync(import_path10.default.join(uploadDir, ytdlpMatch));
            } catch (_) {
            }
            tempAudioPath = diskPath2;
            activeItem.persistedAudioUrl = `/api/audio-files/${audioFileName2}`;
            broadcastSse("queue_update", { queue, activeItem });
          } else {
            throw new Error("yt-dlp did not produce output file");
          }
        } catch (ytdlpErr) {
          throw new Error(`Could not find audio for this podcast. HTML scraping and yt-dlp both failed: ${ytdlpErr.message}`);
        }
      } else {
        const DATA_DIR12 = process.env.DATA_DIR || process.cwd();
        const audioStorageDir = import_path10.default.join(DATA_DIR12, "audio_files");
        if (!import_fs11.default.existsSync(audioStorageDir)) {
          import_fs11.default.mkdirSync(audioStorageDir, { recursive: true });
        }
        const audioFileName = `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`;
        const diskPath = import_path10.default.join(audioStorageDir, audioFileName);
        const audioFetch = await fetch(directAudioUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (!audioFetch.ok) {
          throw new Error(`Failed to download podcast audio stream (HTTP ${audioFetch.status})`);
        }
        const arrayBuf = await audioFetch.arrayBuffer();
        import_fs11.default.writeFileSync(diskPath, Buffer.from(arrayBuf));
        tempAudioPath = diskPath;
        activeItem.persistedAudioUrl = `/api/audio-files/${audioFileName}`;
        broadcastSse("queue_update", { queue, activeItem });
      }
    } else if (activeItem.filePath && import_fs11.default.existsSync(activeItem.filePath)) {
      tempAudioPath = activeItem.filePath;
    } else {
      throw new Error("No valid media source provided");
    }
    activeItem.status = "transcribing";
    activeItem.stageText = "Starting Faster-Whisper CPU...";
    broadcastSse("queue_update", { queue, activeItem });
    const pythonPath = resolvePythonExecutable();
    const workerScript = import_path10.default.join(process.cwd(), "server", "whisper", "whisper_worker.py");
    const cacheDir = import_path10.default.join(process.env.DATA_DIR || process.cwd(), "models", "whisper");
    if (!import_fs11.default.existsSync(cacheDir)) {
      import_fs11.default.mkdirSync(cacheDir, { recursive: true });
    }
    const workerArgs = [
      workerScript,
      tempAudioPath,
      "--model",
      activeItem.model || "base",
      "--threads",
      String(activeItem.threads || 2),
      "--cache-dir",
      cacheDir,
      activeItem.vad === false ? "--no-vad" : "--vad"
    ];
    if (activeItem.language && activeItem.language !== "auto") {
      workerArgs.push("--language", activeItem.language);
    }
    await new Promise((resolve, reject) => {
      const proc = (0, import_child_process3.spawn)(pythonPath, workerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1"
        }
      });
      currentChildProcess = proc;
      let buffer = "";
      let stderrBuffer = "";
      let lastJsonError = null;
      proc.stdout.on("data", async (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === "download_start") {
              if (activeItem) {
                activeItem.status = "downloading_model";
                activeItem.stageText = event.message || "Downloading model weights...";
                broadcastSse("queue_update", { queue, activeItem });
              }
            } else if (event.type === "loaded") {
              loadedModelName = activeItem ? activeItem.model : null;
              if (activeItem) {
                activeItem.status = "transcribing";
                activeItem.stageText = `Model ${activeItem.model} loaded in RAM (${event.load_time_sec}s)`;
                broadcastSse("queue_update", { queue, activeItem });
              }
            } else if (event.type === "progress") {
              if (activeItem) {
                activeItem.status = "transcribing";
                activeItem.progress = event.percent || activeItem.progress;
                activeItem.currentTime = event.currentTime || activeItem.currentTime;
                activeItem.totalDuration = event.totalDuration || activeItem.totalDuration;
                activeItem.etaSeconds = event.etaSeconds || 0;
                activeItem.stageText = `Transcribing ${Math.round(activeItem.progress)}% \u2022 ETA ~${activeItem.etaSeconds}s`;
                broadcastSse("progress", activeItem);
              }
            } else if (event.type === "completed") {
              if (activeItem) {
                const bookId = await persistWhisperBook(activeItem, event);
                activeItem.createdBookId = bookId;
                activeItem.status = "completed";
                activeItem.progress = 100;
                activeItem.completedAt = Date.now();
                activeItem.stageText = "Transcription completed!";
                broadcastSse("task_completed", activeItem);
              }
            } else if (event.type === "error") {
              lastJsonError = event.message || "Whisper worker failed";
            }
          } catch (e) {
            console.error("[Whisper Worker Line Error]:", e.message, "Line was:", trimmed);
          }
        }
      });
      proc.stderr.on("data", (d) => {
        stderrBuffer += d.toString();
        console.warn("[Whisper Worker Stderr]:", d.toString());
      });
      proc.on("close", (code) => {
        currentChildProcess = null;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(lastJsonError || stderrBuffer.trim() || `Whisper worker exited with code ${code}`));
        }
      });
      proc.on("error", (err) => {
        currentChildProcess = null;
        reject(err);
      });
    });
  } catch (err) {
    if (activeItem) {
      if (activeItem.status !== "cancelled") {
        activeItem.status = "error";
      }
      activeItem.error = err.message || String(err);
      activeItem.stageText = `Failed: ${activeItem.error}`;
      broadcastSse("task_error", activeItem);
    }
  } finally {
    const persistedUrl = activeItem?.persistedAudioUrl;
    const isPersisted = persistedUrl && tempAudioPath && tempAudioPath.includes("audio_files");
    if (tempAudioPath && !isPersisted && import_fs11.default.existsSync(tempAudioPath)) {
      try {
        import_fs11.default.unlinkSync(tempAudioPath);
      } catch (_) {
      }
    }
    lastActiveTimestamp = Date.now();
    activeItem = null;
    broadcastSse("queue_update", { queue, activeItem });
    setTimeout(processQueue, 500);
  }
}
function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}
function normalizeTargetLanguage(lang) {
  if (!lang) return "English";
  const lower = lang.toLowerCase().trim();
  if (lower === "en" || lower.startsWith("eng") || lower.startsWith("\u0430\u043D\u0433\u043B")) return "English";
  if (lower === "es" || lower.startsWith("spa") || lower.startsWith("\u0438\u0441\u043F")) return "Spanish";
  if (lower === "fr" || lower.startsWith("fre") || lower.startsWith("\u0444\u0440\u0430\u043D")) return "French";
  if (lower === "de" || lower.startsWith("ger") || lower.startsWith("\u043D\u0435\u043C")) return "German";
  if (lower === "it" || lower.startsWith("ita") || lower.startsWith("\u0438\u0442\u0430")) return "Italian";
  if (lower === "ru" || lower.startsWith("rus") || lower.startsWith("\u0440\u0443\u0441")) return "Russian";
  if (lower === "pt" || lower.startsWith("por") || lower.startsWith("\u043F\u043E\u0440\u0442")) return "Portuguese";
  if (lower === "zh" || lower.startsWith("chi") || lower.startsWith("\u043A\u0438\u0442")) return "Chinese";
  if (lower === "ja" || lower.startsWith("jap") || lower.startsWith("\u044F\u043F\u043E\u043D")) return "Japanese";
  if (lower === "ko" || lower.startsWith("kor") || lower.startsWith("\u043A\u043E\u0440\u0435\u0439")) return "Korean";
  if (lower === "ar" || lower.startsWith("ara") || lower.startsWith("\u0430\u0440\u0430\u0431")) return "Arabic";
  if (lower === "tr" || lower.startsWith("tur") || lower.startsWith("\u0442\u0443\u0440")) return "Turkish";
  if (lower === "uk" || lower.startsWith("ukr") || lower.startsWith("\u0443\u043A\u0440")) return "Ukrainian";
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}
async function persistWhisperBook(item, event) {
  const db = getDbConnection();
  const bookId = `lesson_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const formattedContent = formatWhisperToLecturaParagraphs(event.segments || []);
  const resolvedTargetLang = normalizeTargetLanguage(item.language && item.language !== "auto" ? item.language : event.language);
  const user = !item.userId || item.userId === "default_user" ? "default" : item.userId;
  const ytId = item.sourceType === "youtube" ? extractYouTubeId(item.sourceUrl) : null;
  const now = Date.now();
  let coverUrl = null;
  if (ytId) {
    const { resolveBestYoutubeThumbnail: resolveBestYoutubeThumbnail2 } = await Promise.resolve().then(() => (init_youtube(), youtube_exports));
    coverUrl = await resolveBestYoutubeThumbnail2(ytId, item.thumbnail);
  } else if (item.thumbnail && item.thumbnail.startsWith("http")) {
    coverUrl = item.thumbnail;
  }
  const resolvedAudioUrl = item.persistedAudioUrl || null;
  const wordTimestamps = [];
  for (const seg of event.segments || []) {
    for (const w of seg.words || []) {
      if (w.word && typeof w.start === "number") {
        wordTimestamps.push({ w: w.word.trim(), s: w.start, e: w.end });
      }
    }
  }
  const wordTimestampsJson = wordTimestamps.length > 0 ? JSON.stringify(wordTimestamps) : null;
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO lessons (
        id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation, createdAt, wordTimestamps, channelName, channelAvatarUrl
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    insertStmt.run(
      bookId,
      user,
      item.title || "Whisper Transcription",
      formattedContent || event.text || "",
      resolvedAudioUrl,
      // audioUrl
      null,
      // audioBase64
      resolvedTargetLang,
      "Russian",
      // translationLanguage
      0,
      // isBuiltIn
      0,
      // isArchived
      coverUrl,
      ytId,
      null,
      // localVideoUrl
      item.sourceType === "youtube" ? "youtube" : item.sourceType === "podcast" ? "podcast" : "book",
      0,
      // pinned
      null,
      // translationText
      JSON.stringify({}),
      // detectedPhrases
      null,
      // difficulty
      null,
      // difficultyExplanation
      now,
      // createdAt — ensures Whisper books sort to the top as newest
      wordTimestampsJson,
      item.channelName || null,
      item.channelAvatarUrl || null
    );
    console.log(`[Whisper] Successfully saved lesson '${item.title}' (ID: ${bookId}, Lang: ${resolvedTargetLang}, User: ${user}) to SQLite`);
    try {
      const hiddenRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'hiddenLanguages'").get(user);
      if (hiddenRow?.value) {
        const parsed = JSON.parse(hiddenRow.value);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter((l) => l.toLowerCase() !== resolvedTargetLang.toLowerCase());
          if (updated.length !== parsed.length) {
            db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'hiddenLanguages', ?)").run(user, JSON.stringify(updated));
          }
        }
      }
    } catch (_) {
    }
  } catch (err) {
    console.error("[Whisper Auto-Persist DB Error]:", err);
  }
  return bookId;
}
router8.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.push(res);
  res.write(`event: init
data: ${JSON.stringify({ queue, activeItem })}

`);
  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});
router8.post("/queue", async (req, res) => {
  try {
    let resolvedAuthUser = "default";
    try {
      resolvedAuthUser = resolveUserId(req);
    } catch (_) {
      resolvedAuthUser = "default";
    }
    const { title, sourceUrl, fileBase64, filename, model, language, threads, vad, userId, thumbnail, sourceType: explicitSourceType } = req.body;
    const effectiveUserId = resolvedAuthUser !== "default" ? resolvedAuthUser : !userId || userId === "default_user" ? "default" : String(userId);
    let resolvedSourceType = "file";
    if (explicitSourceType === "podcast" || explicitSourceType === "youtube" || explicitSourceType === "file") {
      resolvedSourceType = explicitSourceType;
    } else if (sourceUrl && typeof sourceUrl === "string") {
      if (sourceUrl.includes("podcasts.apple.com") || sourceUrl.includes("spotify.com") || sourceUrl.includes("podcast") || /\.(mp3|m4a|aac|ogg)(\?.*)?$/i.test(sourceUrl)) {
        resolvedSourceType = "podcast";
      } else {
        resolvedSourceType = "youtube";
      }
    }
    const hasUrl = !!sourceUrl && typeof sourceUrl === "string" && sourceUrl.includes("http");
    let localFilePath = void 0;
    if (fileBase64 && typeof fileBase64 === "string") {
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const ext = import_path10.default.extname(filename || "audio.mp3") || ".mp3";
      const targetPath = import_path10.default.join(uploadDir, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`);
      import_fs11.default.writeFileSync(targetPath, buffer);
      localFilePath = targetPath;
    }
    const itemTitle = (title || "").trim() || (resolvedSourceType === "youtube" ? "YouTube Video" : resolvedSourceType === "podcast" ? "Podcast Episode" : filename || "Audio Lesson");
    const newItem = {
      id: `whisper_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: effectiveUserId,
      title: itemTitle,
      sourceUrl: hasUrl ? sourceUrl : void 0,
      filePath: localFilePath,
      sourceType: resolvedSourceType,
      model: model || "base",
      language: language || "auto",
      threads: threads ? parseInt(threads, 10) : 2,
      vad: vad === false || vad === "false" ? false : true,
      thumbnail: thumbnail || (resolvedSourceType === "youtube" && sourceUrl ? `https://img.youtube.com/vi/${sourceUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || ""}/hqdefault.jpg` : ""),
      status: "queued",
      progress: 0,
      currentTime: 0,
      totalDuration: 0,
      etaSeconds: 0,
      stageText: `Queued (Position #${queue.length + (activeItem ? 1 : 0)})`,
      createdAt: Date.now()
    };
    queue.push(newItem);
    broadcastSse("queue_update", { queue, activeItem });
    processQueue();
    res.json({ success: true, item: newItem, queuePosition: queue.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to enqueue transcription task" });
  }
});
router8.get("/queue", (_req, res) => {
  res.json({ queue, activeItem });
});
router8.post("/cancel", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Missing task id" });
  if (activeItem && activeItem.id === id) {
    activeItem.status = "cancelled";
    activeItem.stageText = "Cancelled by user";
    if (currentChildProcess) {
      try {
        currentChildProcess.kill();
      } catch (_) {
      }
    }
    if (activeItem.filePath && activeItem.filePath.startsWith(uploadDir)) {
      try {
        if (import_fs11.default.existsSync(activeItem.filePath)) import_fs11.default.unlinkSync(activeItem.filePath);
      } catch (_) {
      }
    }
    broadcastSse("queue_update", { queue, activeItem });
    return res.json({ success: true, message: "Active task cancelled" });
  }
  const idx = queue.findIndex((q) => q.id === id);
  if (idx !== -1) {
    const removed = queue.splice(idx, 1)[0];
    if (removed.filePath && removed.filePath.startsWith(uploadDir)) {
      try {
        if (import_fs11.default.existsSync(removed.filePath)) import_fs11.default.unlinkSync(removed.filePath);
      } catch (_) {
      }
    }
    broadcastSse("queue_update", { queue, activeItem });
    return res.json({ success: true, message: "Queued task removed", item: removed });
  }
  res.status(404).json({ error: "Task not found" });
});
router8.get("/telemetry", async (_req, res) => {
  const totalMem = import_os3.default.totalmem();
  const freeMem = import_os3.default.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = import_os3.default.cpus();
  const isTranscribing = !!activeItem;
  const idleElapsedSec = Math.floor((Date.now() - lastActiveTimestamp) / 1e3);
  const idleRemainingSec = isTranscribing ? 300 : Math.max(0, Math.floor((IDLE_TIMEOUT_MS - (Date.now() - lastActiveTimestamp)) / 1e3));
  const isModelActiveInRam = isTranscribing || idleRemainingSec > 0 && !!loadedModelName;
  res.json({
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || "CPU"
    },
    ram: {
      totalMb: Math.round(totalMem / (1024 * 1024)),
      usedMb: Math.round(usedMem / (1024 * 1024)),
      freeMb: Math.round(freeMem / (1024 * 1024)),
      percent: Math.round(usedMem / totalMem * 100)
    },
    model: {
      status: isModelActiveInRam ? `ACTIVE IN RAM: ${(loadedModelName || "BASE").toUpperCase()}` : "DORMANT (0 MB)",
      isLoaded: isModelActiveInRam,
      currentModel: loadedModelName,
      idleRemainingSeconds: idleRemainingSec,
      idleTimeoutSeconds: 300
    }
  });
});
router8.get("/models-status", async (_req, res) => {
  const cacheDir = import_path10.default.join(process.env.DATA_DIR || process.cwd(), "models", "whisper");
  const models = ["tiny", "base", "small", "medium"];
  const pythonPath = resolvePythonExecutable();
  const workerScript = import_path10.default.join(process.cwd(), "server", "whisper", "whisper_worker.py");
  const results = {};
  await Promise.all(models.map(async (model) => {
    return new Promise((resolve) => {
      const proc = (0, import_child_process3.spawn)(pythonPath, [workerScript, "dummy", "--model", model, "--cache-dir", cacheDir, "--check-cached-only"], {
        stdio: ["ignore", "pipe", "ignore"]
      });
      let stdout = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.on("close", () => {
        try {
          const parsed = JSON.parse(stdout.trim());
          results[model] = { cached: !!parsed.cached };
        } catch (_) {
          results[model] = { cached: false };
        }
        resolve();
      });
      proc.on("error", () => {
        results[model] = { cached: false };
        resolve();
      });
    });
  }));
  res.json({ models: results });
});
router8.post("/unload", (_req, res) => {
  if (activeItem) {
    return res.status(400).json({ error: "Cannot release RAM while transcription is in progress" });
  }
  loadedModelName = null;
  lastActiveTimestamp = 0;
  broadcastSse("model_unloaded", { message: "Model unloaded from RAM" });
  res.json({ success: true, message: "Whisper model successfully unloaded and RAM freed." });
});
var whisper_default = router8;

// routes/wordnet.ts
var import_express9 = require("express");

// server/wordnet/wordnetService.ts
var import_natural = __toESM(require("natural"), 1);
var wordnetInstance = null;
function getWordNetInstance() {
  if (!wordnetInstance) {
    try {
      wordnetInstance = new import_natural.default.WordNet();
    } catch (err) {
      console.error("[WordNet] Failed to initialize WordNet instance:", err);
    }
  }
  return wordnetInstance;
}
var POS_MAP = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb"
};
function normalizeQueryWord(raw) {
  if (!raw) return "";
  return raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "").replace(/\s+/g, "_").trim();
}
function lookupRaw(wn, word) {
  return new Promise((resolve) => {
    try {
      wn.lookup(word, (results) => {
        resolve(Array.isArray(results) ? results : []);
      });
    } catch (e) {
      resolve([]);
    }
  });
}
function getSynsetRaw(wn, offset, pos) {
  return new Promise((resolve) => {
    try {
      wn.get(offset, pos, (result) => {
        resolve(result || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}
async function lookupWordNet(rawWord) {
  const word = normalizeQueryWord(rawWord);
  if (!word) {
    return {
      query: rawWord,
      found: false,
      synsetsCount: 0,
      synsets: [],
      allSynonyms: [],
      allAntonyms: []
    };
  }
  const wn = getWordNetInstance();
  if (!wn) {
    return {
      query: word,
      found: false,
      synsetsCount: 0,
      synsets: [],
      allSynonyms: [],
      allAntonyms: []
    };
  }
  let rawResults = await lookupRaw(wn, word);
  if (rawResults.length === 0) {
    const candidates = [];
    if (word.endsWith("ies") && word.length > 4) candidates.push(word.slice(0, -3) + "y");
    if (word.endsWith("es") && word.length > 3) candidates.push(word.slice(0, -2));
    if (word.endsWith("s") && word.length > 2) candidates.push(word.slice(0, -1));
    if (word.endsWith("ed") && word.length > 3) {
      candidates.push(word.slice(0, -2));
      candidates.push(word.slice(0, -1));
    }
    if (word.endsWith("ing") && word.length > 4) {
      candidates.push(word.slice(0, -3));
      candidates.push(word.slice(0, -3) + "e");
    }
    for (const cand of candidates) {
      const candResults = await lookupRaw(wn, cand);
      if (candResults.length > 0) {
        rawResults = candResults;
        break;
      }
    }
  }
  if (rawResults.length === 0) {
    return {
      query: word,
      found: false,
      synsetsCount: 0,
      synsets: [],
      allSynonyms: [],
      allAntonyms: []
    };
  }
  const allSynonymsSet = /* @__PURE__ */ new Set();
  const allAntonymsSet = /* @__PURE__ */ new Set();
  const synsets = [];
  for (const item of rawResults) {
    const posName = POS_MAP[item.pos] || "other";
    const cleanSynonyms = (item.synonyms || []).map((s) => s.replace(/_/g, " ")).filter((s) => s.toLowerCase() !== word.replace(/_/g, " "));
    cleanSynonyms.forEach((s) => allSynonymsSet.add(s));
    const antonymsList = [];
    const hypernymsList = [];
    const derivationsList = [];
    const ptrs = Array.isArray(item.ptrs) ? item.ptrs : [];
    for (const ptr of ptrs.slice(0, 10)) {
      if (ptr.pointerSymbol === "!" && ptr.synsetOffset) {
        const target = await getSynsetRaw(wn, ptr.synsetOffset, ptr.pos);
        if (target && target.synonyms) {
          target.synonyms.forEach((ant) => {
            const clean = ant.replace(/_/g, " ");
            antonymsList.push(clean);
            allAntonymsSet.add(clean);
          });
        }
      } else if (ptr.pointerSymbol === "@" && ptr.synsetOffset && hypernymsList.length < 3) {
        const target = await getSynsetRaw(wn, ptr.synsetOffset, ptr.pos);
        if (target && target.synonyms && target.synonyms.length > 0) {
          const primaryName = target.synonyms[0].replace(/_/g, " ");
          hypernymsList.push({
            name: primaryName,
            definition: target.def
          });
        }
      } else if (ptr.pointerSymbol === "+" && ptr.synsetOffset && derivationsList.length < 5) {
        const target = await getSynsetRaw(wn, ptr.synsetOffset, ptr.pos);
        if (target && target.synonyms) {
          target.synonyms.forEach((der) => {
            const clean = der.replace(/_/g, " ");
            if (!derivationsList.includes(clean) && clean.toLowerCase() !== word.replace(/_/g, " ")) {
              derivationsList.push(clean);
            }
          });
        }
      }
    }
    synsets.push({
      synsetOffset: item.synsetOffset,
      pos: item.pos,
      posName,
      definition: item.def || item.gloss || "",
      examples: Array.isArray(item.exp) ? item.exp : [],
      synonyms: cleanSynonyms,
      antonyms: Array.from(new Set(antonymsList)),
      hypernyms: hypernymsList,
      derivations: derivationsList
    });
  }
  return {
    query: word.replace(/_/g, " "),
    found: true,
    synsetsCount: synsets.length,
    synsets,
    allSynonyms: Array.from(allSynonymsSet),
    allAntonyms: Array.from(allAntonymsSet)
  };
}

// routes/wordnet.ts
var router9 = (0, import_express9.Router)();
router9.get("/lookup", async (req, res) => {
  const word = (req.query.word || "").trim();
  if (!word) {
    return res.status(400).json({ error: "Query parameter 'word' is required" });
  }
  try {
    const data = await lookupWordNet(word);
    return res.json({ status: "ok", data });
  } catch (err) {
    console.error(`[WordNet Route Error] Lookup failed for '${word}':`, err);
    return res.status(500).json({ error: err.message || "Failed to lookup WordNet" });
  }
});
router9.get("/synonyms", async (req, res) => {
  const word = (req.query.word || "").trim();
  if (!word) {
    return res.status(400).json({ error: "Query parameter 'word' is required" });
  }
  try {
    const data = await lookupWordNet(word);
    return res.json({ status: "ok", query: data.query, synonyms: data.allSynonyms });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to lookup synonyms" });
  }
});
var wordnet_default = router9;

// routes/frequency.ts
var import_express10 = require("express");
var frequencyRouter = (0, import_express10.Router)();
frequencyRouter.get("/lookup", (req, res) => {
  try {
    const word = req.query.word || "";
    const lang = req.query.lang || "en";
    if (!word || !word.trim()) {
      return res.status(400).json({ error: "Query parameter 'word' is required" });
    }
    const data = lookupWordFrequency(word, lang);
    return res.json({
      status: "ok",
      data
    });
  } catch (error) {
    console.error("Error in frequency lookup:", error);
    return res.status(500).json({ error: error.message || "Failed to lookup frequency" });
  }
});
frequencyRouter.post("/batch", (req, res) => {
  try {
    const { words, lang } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: "'words' array is required" });
    }
    const targetLang = (lang || "en").toLowerCase().startsWith("en") ? "en" : lang || "en";
    const data = lookupBatchWordFrequency(words, targetLang);
    return res.json({
      status: "ok",
      data
    });
  } catch (error) {
    console.error("Error in batch frequency lookup:", error);
    return res.status(500).json({ error: error.message || "Failed to lookup batch frequency" });
  }
});
frequencyRouter.post("/analyze-text", (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "'text' string is required" });
    }
    const targetLang = (lang || "en").toLowerCase().startsWith("en") ? "en" : lang || "en";
    const data = analyzeTextComplexity(text, targetLang);
    return res.json({
      status: "ok",
      data
    });
  } catch (error) {
    console.error("Error in analyze-text complexity:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze text complexity" });
  }
});

// routes/backup.ts
var import_express11 = require("express");

// server/backupService.ts
var import_path11 = __toESM(require("path"), 1);
var import_fs12 = __toESM(require("fs"), 1);
var DATA_DIR7 = process.env.DATA_DIR || process.cwd();
var BACKUPS_ROOT = import_path11.default.join(DATA_DIR7, "data", "backups");
function sanitizeUserId(userId) {
  if (!userId || typeof userId !== "string") return "default";
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function getBackupsDir(userId) {
  const safeId = sanitizeUserId(userId);
  const userDir = import_path11.default.join(BACKUPS_ROOT, safeId);
  if (!import_fs12.default.existsSync(userDir)) {
    import_fs12.default.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}
function getBackupSettings(userId) {
  const defaultSettings = {
    enabled: true,
    intervalHours: 24,
    maxKeep: 5,
    lastBackupTime: null
  };
  try {
    const db = getDbConnection(userId);
    const row = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'backup_settings'").get(userId);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultSettings.enabled,
        intervalHours: typeof parsed.intervalHours === "number" && parsed.intervalHours > 0 ? parsed.intervalHours : defaultSettings.intervalHours,
        maxKeep: typeof parsed.maxKeep === "number" && parsed.maxKeep > 0 ? parsed.maxKeep : defaultSettings.maxKeep,
        lastBackupTime: typeof parsed.lastBackupTime === "string" ? parsed.lastBackupTime : null
      };
    }
  } catch (err) {
    console.error(`[BackupService] Failed to read backup settings for ${userId}:`, err);
  }
  return defaultSettings;
}
function saveBackupSettings(userId, settings) {
  const current = getBackupSettings(userId);
  const updated = {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : current.enabled,
    intervalHours: typeof settings.intervalHours === "number" && settings.intervalHours > 0 ? settings.intervalHours : current.intervalHours,
    maxKeep: typeof settings.maxKeep === "number" && settings.maxKeep > 0 ? settings.maxKeep : current.maxKeep,
    lastBackupTime: settings.lastBackupTime !== void 0 ? settings.lastBackupTime : current.lastBackupTime
  };
  try {
    const db = getDbConnection(userId);
    db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'backup_settings', ?)").run(
      userId,
      JSON.stringify(updated)
    );
  } catch (err) {
    console.error(`[BackupService] Failed to save backup settings for ${userId}:`, err);
  }
  return updated;
}
function formatDateForFilename(d = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}
async function createBackup(userId, type = "manual") {
  try {
    const userDir = getBackupsDir(userId);
    const dbData = getLocalServerDb(userId);
    if (!dbData) {
      console.warn(`[BackupService] No data found to backup for user ${userId}`);
      return null;
    }
    const db = getDbConnection(userId);
    let username = "user";
    try {
      const userRow = db.prepare("SELECT display_name, email FROM server_users WHERE id = ?").get(userId);
      if (userRow) {
        username = userRow.display_name || userRow.email?.split("@")[0] || "user";
      }
    } catch (_) {
    }
    const now = /* @__PURE__ */ new Date();
    const dateStr = formatDateForFilename(now);
    let filename = `lectura-backup-${type}-${dateStr}.json`;
    let targetPath = import_path11.default.join(userDir, filename);
    if (import_fs12.default.existsSync(targetPath)) {
      const seconds = String(now.getSeconds()).padStart(2, "0");
      filename = `lectura-backup-${type}-${dateStr}-${seconds}.json`;
      targetPath = import_path11.default.join(userDir, filename);
    }
    const payload = {
      version: "1.0",
      backupType: type,
      username,
      exportDate: now.toISOString(),
      ...dbData
    };
    const jsonContent = JSON.stringify(payload, null, 2);
    await import_fs12.default.promises.writeFile(targetPath, jsonContent, "utf8");
    const stat = await import_fs12.default.promises.stat(targetPath);
    if (type === "auto" || type === "manual") {
      saveBackupSettings(userId, { lastBackupTime: now.toISOString() });
    }
    const settings = getBackupSettings(userId);
    await pruneOldBackups(userId, settings.maxKeep);
    return {
      filename,
      size: stat.size,
      createdAt: stat.mtimeMs || now.getTime(),
      isAuto: type === "auto",
      type,
      exportDate: now.toISOString(),
      lessonsCount: Array.isArray(dbData.lessons) ? dbData.lessons.length : 0,
      wordsCount: dbData.vocab ? Object.keys(dbData.vocab).length : 0,
      username
    };
  } catch (err) {
    console.error(`[BackupService] Failed to create backup for ${userId}:`, err);
    throw err;
  }
}
async function pruneOldBackups(userId, maxKeep) {
  if (maxKeep <= 0) return 0;
  try {
    const userDir = getBackupsDir(userId);
    const files = await import_fs12.default.promises.readdir(userDir);
    const backupFiles = [];
    for (const file of files) {
      if (file.startsWith("lectura-backup-") && file.endsWith(".json")) {
        if (file.includes("-pre-restore-")) continue;
        const filePath = import_path11.default.join(userDir, file);
        try {
          const stat = await import_fs12.default.promises.stat(filePath);
          backupFiles.push({ filename: file, path: filePath, mtime: stat.mtimeMs });
        } catch (_) {
        }
      }
    }
    backupFiles.sort((a, b) => b.mtime - a.mtime);
    let deletedCount = 0;
    if (backupFiles.length > maxKeep) {
      const filesToDelete = backupFiles.slice(maxKeep);
      for (const item of filesToDelete) {
        try {
          await import_fs12.default.promises.unlink(item.path);
          deletedCount++;
        } catch (delErr) {
          console.error(`[BackupService] Failed to delete expired backup ${item.filename}:`, delErr);
        }
      }
    }
    const snapshotFiles = [];
    for (const file of files) {
      if (file.includes("-pre-restore-") && file.endsWith(".json")) {
        const filePath = import_path11.default.join(userDir, file);
        try {
          const stat = await import_fs12.default.promises.stat(filePath);
          snapshotFiles.push({ filename: file, path: filePath, mtime: stat.mtimeMs });
        } catch (_) {
        }
      }
    }
    snapshotFiles.sort((a, b) => b.mtime - a.mtime);
    if (snapshotFiles.length > 3) {
      for (const snap of snapshotFiles.slice(3)) {
        try {
          await import_fs12.default.promises.unlink(snap.path);
        } catch (_) {
        }
      }
    }
    return deletedCount;
  } catch (err) {
    console.error(`[BackupService] Error pruning backups for ${userId}:`, err);
    return 0;
  }
}
async function listBackups(userId) {
  try {
    const userDir = getBackupsDir(userId);
    const files = await import_fs12.default.promises.readdir(userDir);
    const result = [];
    for (const file of files) {
      if (file.startsWith("lectura-backup-") && file.endsWith(".json")) {
        const filePath = import_path11.default.join(userDir, file);
        try {
          const stat = await import_fs12.default.promises.stat(filePath);
          const isAuto = file.includes("-auto-");
          const isPreRestore = file.includes("-pre-restore-");
          const isManual = file.includes("-manual-");
          const type = isPreRestore ? "pre-restore" : isAuto ? "auto" : isManual ? "manual" : "custom";
          let exportDate;
          let lessonsCount;
          let wordsCount;
          let username;
          try {
            const content = await import_fs12.default.promises.readFile(filePath, "utf8");
            const parsed = JSON.parse(content);
            exportDate = parsed.exportDate;
            username = parsed.username;
            lessonsCount = Array.isArray(parsed.lessons) ? parsed.lessons.length : 0;
            wordsCount = parsed.vocab ? Object.keys(parsed.vocab).length : parsed.words ? Object.keys(parsed.words).length : 0;
          } catch (_) {
          }
          result.push({
            filename: file,
            size: stat.size,
            createdAt: stat.mtimeMs,
            isAuto,
            type,
            exportDate,
            lessonsCount,
            wordsCount,
            username
          });
        } catch (_) {
        }
      }
    }
    result.sort((a, b) => b.createdAt - a.createdAt);
    return result;
  } catch (err) {
    console.error(`[BackupService] Failed to list backups for ${userId}:`, err);
    return [];
  }
}
async function restoreBackup(userId, filename) {
  try {
    const safeFilename = import_path11.default.basename(filename);
    if (safeFilename !== filename || !safeFilename.endsWith(".json") || !safeFilename.startsWith("lectura-backup-")) {
      return { success: false, error: "Invalid backup filename" };
    }
    const userDir = getBackupsDir(userId);
    const targetPath = import_path11.default.join(userDir, safeFilename);
    if (!import_fs12.default.existsSync(targetPath)) {
      return { success: false, error: "Backup file not found" };
    }
    const fileContent = await import_fs12.default.promises.readFile(targetPath, "utf8");
    const parsedData = JSON.parse(fileContent);
    if (!parsedData || typeof parsedData !== "object") {
      return { success: false, error: "Invalid backup file structure" };
    }
    try {
      await createBackup(userId, "pre-restore");
    } catch (snapErr) {
      console.warn(`[BackupService] Failed to create pre-restore snapshot:`, snapErr);
    }
    const saved = saveLocalServerDb(userId, parsedData);
    if (!saved) {
      return { success: false, error: "Database transaction failed during restore" };
    }
    const refreshedData = getLocalServerDb(userId);
    return { success: true, data: refreshedData };
  } catch (err) {
    console.error(`[BackupService] Failed to restore backup for ${userId}:`, err);
    return { success: false, error: err.message || String(err) };
  }
}
async function deleteBackup(userId, filename) {
  try {
    const safeFilename = import_path11.default.basename(filename);
    if (safeFilename !== filename || !safeFilename.endsWith(".json") || !safeFilename.startsWith("lectura-backup-")) {
      return false;
    }
    const userDir = getBackupsDir(userId);
    const targetPath = import_path11.default.join(userDir, safeFilename);
    if (import_fs12.default.existsSync(targetPath)) {
      await import_fs12.default.promises.unlink(targetPath);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[BackupService] Failed to delete backup ${filename} for ${userId}:`, err);
    return false;
  }
}
function getBackupFilePath(userId, filename) {
  const safeFilename = import_path11.default.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith(".json") || !safeFilename.startsWith("lectura-backup-")) {
    return null;
  }
  const userDir = getBackupsDir(userId);
  const targetPath = import_path11.default.join(userDir, safeFilename);
  if (import_fs12.default.existsSync(targetPath)) {
    return targetPath;
  }
  return null;
}
var schedulerInterval = null;
function startBackupScheduler() {
  if (schedulerInterval) return;
  const runSchedulerCheck = async () => {
    try {
      const db = getDbConnection("default");
      const users = db.prepare("SELECT id FROM server_users").all();
      const userIds = users.map((u) => u.id);
      if (!userIds.includes("default")) {
        userIds.push("default");
      }
      const now = Date.now();
      for (const uid of userIds) {
        try {
          const settings = getBackupSettings(uid);
          if (!settings.enabled) continue;
          let shouldBackup = false;
          if (!settings.lastBackupTime) {
            shouldBackup = true;
          } else {
            const lastTime = new Date(settings.lastBackupTime).getTime();
            const intervalMs = settings.intervalHours * 3600 * 1e3;
            if (isNaN(lastTime) || now - lastTime >= intervalMs) {
              shouldBackup = true;
            }
          }
          if (shouldBackup) {
            const userDb = getLocalServerDb(uid);
            const hasData = userDb?.lessons && userDb.lessons.length > 0 || userDb?.vocab && Object.keys(userDb.vocab).length > 0;
            if (hasData) {
              console.log(`[BackupScheduler] Triggering automatic backup for user "${uid}" (interval: ${settings.intervalHours}h)`);
              await createBackup(uid, "auto");
            }
          }
        } catch (userErr) {
          console.error(`[BackupScheduler] Error checking backups for user ${uid}:`, userErr);
        }
      }
    } catch (err) {
      console.error("[BackupScheduler] Main loop error:", err);
    }
  };
  setTimeout(() => {
    runSchedulerCheck().catch(() => {
    });
  }, 15e3);
  schedulerInterval = setInterval(() => {
    runSchedulerCheck().catch(() => {
    });
  }, 10 * 60 * 1e3);
  console.log("[BackupScheduler] Automatic backup scheduler initialized (10m tick).");
}

// routes/backup.ts
var router10 = (0, import_express11.Router)();
function getUser(req, res) {
  try {
    return resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    } else {
      res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
    }
    return null;
  }
}
router10.get("/backups", async (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  try {
    const backups = await listBackups(userId);
    return res.json({ status: "ok", data: backups });
  } catch (err) {
    console.error(`[GET /api/backups] Error:`, err);
    return res.status(500).json({ error: "Failed to list backups" });
  }
});
router10.post("/backups/create", async (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  try {
    const backupInfo = await createBackup(userId, "manual");
    if (!backupInfo) {
      return res.status(400).json({ error: "No data available to backup" });
    }
    return res.json({ status: "success", data: backupInfo });
  } catch (err) {
    console.error(`[POST /api/backups/create] Error:`, err);
    return res.status(500).json({ error: "Failed to create backup: " + (err.message || String(err)) });
  }
});
router10.post("/backups/restore/:filename", async (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).json({ error: "Filename is required" });
  }
  try {
    const result = await restoreBackup(userId, filename);
    if (!result.success) {
      return res.status(400).json({ error: result.error || "Failed to restore backup" });
    }
    return res.json({ status: "success", data: result.data });
  } catch (err) {
    console.error(`[POST /api/backups/restore] Error:`, err);
    return res.status(500).json({ error: "Failed to restore backup: " + (err.message || String(err)) });
  }
});
router10.get("/backups/download/:filename", (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).json({ error: "Filename is required" });
  }
  const filePath = getBackupFilePath(userId, filename);
  if (!filePath) {
    return res.status(404).json({ error: "Backup file not found" });
  }
  res.download(filePath, filename, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Failed to download backup file" });
    }
  });
});
router10.delete("/backups/:filename", async (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).json({ error: "Filename is required" });
  }
  try {
    const deleted = await deleteBackup(userId, filename);
    if (!deleted) {
      return res.status(404).json({ error: "Backup file not found or could not be deleted" });
    }
    return res.json({ status: "success" });
  } catch (err) {
    console.error(`[DELETE /api/backups] Error:`, err);
    return res.status(500).json({ error: "Failed to delete backup" });
  }
});
router10.get("/settings/backup", (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  try {
    const settings = getBackupSettings(userId);
    return res.json({ status: "ok", data: settings });
  } catch (err) {
    console.error(`[GET /api/settings/backup] Error:`, err);
    return res.status(500).json({ error: "Failed to get backup settings" });
  }
});
var updateBackupSettingsHandler = (req, res) => {
  const userId = getUser(req, res);
  if (!userId) return;
  const { enabled, intervalHours, maxKeep } = req.body;
  try {
    const updated = saveBackupSettings(userId, {
      enabled: typeof enabled === "boolean" ? enabled : void 0,
      intervalHours: typeof intervalHours === "number" ? intervalHours : void 0,
      maxKeep: typeof maxKeep === "number" ? maxKeep : void 0
    });
    return res.json({ status: "success", data: updated });
  } catch (err) {
    console.error(`[PATCH /api/settings/backup] Error:`, err);
    return res.status(500).json({ error: "Failed to update backup settings" });
  }
};
router10.patch("/settings/backup", updateBackupSettingsHandler);
router10.put("/settings/backup", updateBackupSettingsHandler);
var backup_default = router10;

// routes/podcasts.ts
var import_express12 = require("express");
var import_path12 = __toESM(require("path"), 1);
var import_fs13 = __toESM(require("fs"), 1);
var import_promises = require("stream/promises");
var import_crypto5 = __toESM(require("crypto"), 1);
var import_child_process4 = require("child_process");
var import_fast_xml_parser = require("fast-xml-parser");
var router11 = (0, import_express12.Router)();
var DATA_DIR8 = process.env.DATA_DIR || process.cwd();
var AUDIO_STORAGE_DIR2 = import_path12.default.join(DATA_DIR8, "audio_files");
if (!import_fs13.default.existsSync(AUDIO_STORAGE_DIR2)) {
  import_fs13.default.mkdirSync(AUDIO_STORAGE_DIR2, { recursive: true });
}
var xmlParser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["item", "enclosure", "podcast:transcript"].includes(name),
  parseTagValue: true,
  trimValues: true
});
var CANONICAL_LANG_NAMES = {
  es: "Spanish",
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  pl: "Polish",
  uk: "Ukrainian",
  ar: "Arabic",
  he: "Hebrew",
  el: "Greek",
  sv: "Swedish",
  hi: "Hindi",
  nl: "Dutch",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  hu: "Hungarian",
  cs: "Czech",
  ro: "Romanian",
  vi: "Vietnamese",
  fa: "Persian",
  id: "Indonesian",
  th: "Thai"
};
var normalizeLanguageCode = (lang) => {
  if (!lang) return "";
  const clean = lang.toLowerCase().trim();
  if (clean.startsWith("es") || clean === "spanish" || clean === "spa" || clean.includes("\u0438\u0441\u043F\u0430\u043D") || clean.includes("espa\xF1ol")) return "es";
  if (clean.startsWith("en") || clean === "english" || clean === "eng" || clean.includes("\u0430\u043D\u0433\u043B")) return "en";
  if (clean.startsWith("fr") || clean === "french" || clean === "fra" || clean.includes("\u0444\u0440\u0430\u043D\u0446")) return "fr";
  if (clean.startsWith("de") || clean === "german" || clean === "deu" || clean.includes("\u043D\u0435\u043C\u0435\u0446")) return "de";
  if (clean.startsWith("ru") || clean === "russian" || clean === "rus" || clean.includes("\u0440\u0443\u0441\u0441\u043A")) return "ru";
  if (clean.startsWith("it") || clean === "italian" || clean === "ita" || clean.includes("\u0438\u0442\u0430\u043B\u044C")) return "it";
  if (clean.startsWith("pt") || clean === "portuguese" || clean === "por" || clean.includes("\u043F\u043E\u0440\u0442\u0443\u0433")) return "pt";
  if (clean.startsWith("zh") || clean === "chinese" || clean === "chi" || clean.includes("\u043A\u0438\u0442\u0430\u0439")) return "zh";
  if (clean.startsWith("ja") || clean === "japanese" || clean === "jap" || clean.includes("\u044F\u043F\u043E\u043D")) return "ja";
  if (clean.startsWith("ko") || clean === "korean" || clean === "kor" || clean.includes("\u043A\u043E\u0440\u0435\u0439")) return "ko";
  if (clean.startsWith("tr") || clean === "turkish" || clean === "tur" || clean.includes("\u0442\u0443\u0440\u0435\u0446")) return "tr";
  if (clean.startsWith("uk") || clean === "ukrainian" || clean === "ukr" || clean.includes("\u0443\u043A\u0440\u0430\u0438\u043D")) return "uk";
  if (clean.startsWith("ar") || clean === "arabic" || clean === "ara" || clean.includes("\u0430\u0440\u0430\u0431")) return "ar";
  if (clean.startsWith("he") || clean === "hebrew" || clean === "heb" || clean.includes("\u0438\u0432\u0440\u0438\u0442")) return "he";
  if (clean.startsWith("el") || clean === "greek" || clean === "gre" || clean.includes("\u0433\u0440\u0435\u0447\u0435\u0441\u043A")) return "el";
  if (clean.startsWith("sv") || clean === "swedish" || clean === "swe" || clean.includes("\u0448\u0432\u0435\u0434\u0441\u043A")) return "sv";
  if (clean.startsWith("hi") || clean === "hindi" || clean === "hin" || clean.includes("\u0445\u0438\u043D\u0434\u0438")) return "hi";
  if (clean.startsWith("nl") || clean === "dutch" || clean === "dut" || clean.includes("\u043D\u0438\u0434\u0435\u0440\u043B\u0430\u043D\u0434")) return "nl";
  if (clean.startsWith("pl") || clean === "polish" || clean === "pol" || clean.includes("\u043F\u043E\u043B\u044C\u0441\u043A")) return "pl";
  return clean.slice(0, 2) || "";
};
function resolveUserTargetLanguage(db, userId, activeLanguage, fallbackLanguage) {
  const langCandidate = activeLanguage && activeLanguage !== "All" && activeLanguage.trim() !== "" ? activeLanguage : fallbackLanguage || "es";
  const isoCode = normalizeLanguageCode(langCandidate);
  try {
    const existingLessons = db.prepare(
      "SELECT DISTINCT targetLanguage FROM lessons WHERE user_id = ? AND targetLanguage IS NOT NULL AND targetLanguage != ''"
    ).all(userId);
    for (const row of existingLessons) {
      if (normalizeLanguageCode(row.targetLanguage) === isoCode) {
        return row.targetLanguage;
      }
    }
  } catch (e) {
    console.warn("[Podcasts] Failed to query existing user languages:", e);
  }
  try {
    const dbLang = db.prepare("SELECT code, name FROM languages WHERE code = ?").get(isoCode);
    if (dbLang) {
      return dbLang.name || dbLang.code;
    }
  } catch (_) {
  }
  if (activeLanguage && activeLanguage !== "All" && activeLanguage.trim() !== "") {
    return activeLanguage;
  }
  return CANONICAL_LANG_NAMES[isoCode] || isoCode;
}
function parseWebVTT(vttText) {
  const lines = vttText.split(/\r?\n/);
  const textLines = [];
  let inHeader = true;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (inHeader) {
      if (line === "" || !line.startsWith("WEBVTT") && !line.startsWith("NOTE") && !line.includes("-->")) {
        inHeader = false;
      } else {
        continue;
      }
    }
    if (!line || line.startsWith("NOTE") || line.includes("-->") || /^\d+$/.test(line)) {
      continue;
    }
    const cleanLine = line.replace(/<\/?[^>]+>/g, "").trim();
    if (cleanLine) {
      textLines.push(cleanLine);
    }
  }
  return textLines.join(" ").replace(/\s+/g, " ").trim();
}
function parseSRT(srtText) {
  const lines = srtText.split(/\r?\n/);
  const textLines = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^\d+$/.test(line) || line.includes("-->")) {
      continue;
    }
    const cleanLine = line.replace(/<\/?[^>]+>/g, "").trim();
    if (cleanLine) {
      textLines.push(cleanLine);
    }
  }
  return textLines.join(" ").replace(/\s+/g, " ").trim();
}
function parseTranscriptJson(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (typeof data.text === "string" && data.text.trim()) {
      return data.text.trim();
    }
    if (typeof data.transcript === "string" && data.transcript.trim()) {
      return data.transcript.trim();
    }
    if (Array.isArray(data.segments)) {
      return data.segments.map((s) => s.text || s.body || "").join(" ").replace(/\s+/g, " ").trim();
    }
    if (Array.isArray(data.transcripts)) {
      return data.transcripts.map((t) => t.text || t.body || "").join(" ").replace(/\s+/g, " ").trim();
    }
    if (Array.isArray(data.words)) {
      return data.words.map((w) => w.word || w.text || "").join(" ").replace(/\s+/g, " ").trim();
    }
  } catch {
  }
  return "";
}
async function transcribeAudioWithWhisper(audioPath, languageCode, taskId) {
  const pythonPath = resolvePythonExecutable();
  if (!pythonPath) return null;
  const workerScript = import_path12.default.join(process.cwd(), "server", "whisper", "whisper_worker.py");
  if (!import_fs13.default.existsSync(workerScript)) return null;
  const cacheDir = import_path12.default.join(process.env.DATA_DIR || process.cwd(), "models", "whisper");
  if (!import_fs13.default.existsSync(cacheDir)) {
    import_fs13.default.mkdirSync(cacheDir, { recursive: true });
  }
  const isoLang = normalizeLanguageCode(languageCode);
  const workerArgs = [
    workerScript,
    audioPath,
    "--model",
    "base",
    "--threads",
    "2",
    "--cache-dir",
    cacheDir,
    "--vad"
  ];
  if (isoLang && isoLang !== "auto") {
    workerArgs.push("--language", isoLang);
  }
  if (taskId) {
    broadcastSse("progress", {
      id: taskId,
      status: "transcribing",
      progress: 5,
      stageText: "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438 \u0447\u0435\u0440\u0435\u0437 Whisper..."
    });
  }
  return new Promise((resolve) => {
    try {
      const proc = (0, import_child_process4.spawn)(pythonPath, workerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1"
        }
      });
      let buffer = "";
      let completedResult = null;
      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === "progress" && taskId) {
              broadcastSse("progress", {
                id: taskId,
                status: "transcribing",
                progress: event.percent,
                currentTime: event.currentTime,
                totalDuration: event.totalDuration,
                etaSeconds: event.etaSeconds,
                stageText: "\u0420\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u043A\u0430 \u0440\u0435\u0447\u0438"
              });
            } else if (event.type === "completed") {
              completedResult = event;
            }
          } catch (_) {
          }
        }
      });
      proc.stderr.on("data", (d) => {
        console.warn("[Podcasts Whisper Stderr]:", d.toString());
      });
      proc.on("close", (code) => {
        if (code === 0 && completedResult) {
          const formatted = formatWhisperToLecturaParagraphs(completedResult.segments || []);
          const wordTimestamps = [];
          for (const seg of completedResult.segments || []) {
            for (const w of seg.words || []) {
              if (w.word && typeof w.start === "number") {
                wordTimestamps.push({ w: w.word.trim(), s: w.start, e: w.end });
              }
            }
          }
          const wordTimestampsJson = wordTimestamps.length > 0 ? JSON.stringify(wordTimestamps) : null;
          resolve({
            text: formatted || completedResult.text || "",
            wordTimestampsJson,
            duration: completedResult.duration
          });
        } else {
          console.warn(`[Podcasts Whisper] Exited with code ${code}`);
          resolve(null);
        }
      });
      proc.on("error", (err) => {
        console.error("[Podcasts Whisper] Spawn error:", err);
        resolve(null);
      });
    } catch (e) {
      console.error("[Podcasts Whisper] Execution failed:", e);
      resolve(null);
    }
  });
}
function parseDuration(raw) {
  if (!raw) return null;
  if (typeof raw === "number") return raw;
  const str = String(raw).trim();
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function safeResolveUserId(req) {
  try {
    return resolveUserId(req);
  } catch {
    return "default";
  }
}
var LANG_TO_ITUNES_COUNTRY = {
  en: "US",
  es: "ES",
  fr: "FR",
  de: "DE",
  it: "IT",
  pt: "BR",
  ru: "RU",
  zh: "CN",
  ja: "JP",
  ko: "KR",
  pl: "PL",
  tr: "TR",
  uk: "UA",
  ar: "SA",
  nl: "NL",
  sv: "SE",
  no: "NO",
  da: "DK",
  fi: "FI",
  cs: "CZ",
  el: "GR",
  he: "IL",
  hi: "IN",
  hu: "HU",
  id: "ID",
  ro: "RO",
  th: "TH",
  vi: "VN"
};
router11.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  const lang = (req.query.lang || "").trim();
  const limit = Math.min(Number(req.query.limit) || 24, 50);
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const buildUrl = (withCountry) => {
      const params = new URLSearchParams({
        term: q,
        media: "podcast",
        entity: "podcast",
        limit: String(limit)
      });
      if (withCountry && lang) {
        const isoLang = normalizeLanguageCode(lang);
        const countryCode = LANG_TO_ITUNES_COUNTRY[isoLang] || (isoLang.length === 2 ? isoLang.toUpperCase() : "US");
        params.set("country", countryCode);
      }
      return `https://itunes.apple.com/search?${params.toString()}`;
    };
    let response = await fetch(buildUrl(Boolean(lang)), {
      headers: { "User-Agent": "Lectura/1.0" },
      signal: AbortSignal.timeout(8e3)
    }).catch(() => null);
    if (!response || !response.ok) {
      response = await fetch(buildUrl(false), {
        headers: { "User-Agent": "Lectura/1.0" },
        signal: AbortSignal.timeout(8e3)
      }).catch(() => null);
    }
    if (!response || !response.ok) {
      return res.status(502).json({ error: "iTunes Search API unavailable" });
    }
    const data = await response.json();
    let rawResults = data.results || [];
    if (rawResults.length === 0 && lang) {
      try {
        const globalRes = await fetch(buildUrl(false), {
          headers: { "User-Agent": "Lectura/1.0" },
          signal: AbortSignal.timeout(6e3)
        });
        if (globalRes.ok) {
          const globalData = await globalRes.json();
          if (globalData.results && globalData.results.length > 0) {
            rawResults = globalData.results;
          }
        }
      } catch (_) {
      }
    }
    const results = rawResults.map((item) => ({
      collectionId: item.collectionId,
      title: item.collectionName || item.trackName || "",
      artistName: item.artistName || "",
      feedUrl: item.feedUrl || "",
      artworkUrl600: item.artworkUrl600 || item.artworkUrl100 || "",
      primaryGenreName: item.primaryGenreName || "",
      trackCount: item.trackCount || 0
    }));
    res.json({ results });
  } catch (err) {
    console.error("[Podcasts] Search error:", err);
    res.status(500).json({ error: "Failed to search podcasts" });
  }
});
router11.get("/subscriptions", (req, res) => {
  try {
    const userId = safeResolveUserId(req);
    const db = getDbConnection("default");
    const subs = db.prepare(
      "SELECT * FROM podcast_subscriptions WHERE user_id = ? ORDER BY created_at DESC"
    ).all(userId);
    res.json({ subscriptions: subs.map((s) => ({
      id: s.id,
      title: s.title,
      author: s.author,
      feedUrl: s.feed_url,
      artworkUrl: s.artwork_url,
      language: normalizeLanguageCode(s.language),
      createdAt: s.created_at
    })) });
  } catch (err) {
    console.error("[Podcasts] Get subscriptions error:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});
router11.post("/subscriptions", async (req, res) => {
  try {
    const userId = safeResolveUserId(req);
    const { title, author, feedUrl, artworkUrl, language } = req.body;
    if (!title || !feedUrl) {
      return res.status(400).json({ error: "title and feedUrl are required" });
    }
    let normalizedLang = normalizeLanguageCode(language);
    if (!normalizedLang && feedUrl) {
      try {
        const feed = await fetchAndParseFeed(feedUrl, { limit: 1 });
        if (feed?.meta?.language) {
          normalizedLang = normalizeLanguageCode(feed.meta.language);
        }
      } catch (_) {
      }
    }
    if (!normalizedLang) normalizedLang = "en";
    const db = getDbConnection("default");
    const id = import_crypto5.default.randomUUID();
    const now = Date.now();
    try {
      db.prepare(
        `INSERT INTO podcast_subscriptions (id, user_id, title, author, feed_url, artwork_url, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, title, author || "", feedUrl, artworkUrl || "", normalizedLang, now);
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE" || String(e).includes("UNIQUE")) {
        const existing = db.prepare(
          "SELECT * FROM podcast_subscriptions WHERE user_id = ? AND feed_url = ?"
        ).get(userId, feedUrl);
        if (existing) {
          return res.json({ subscription: {
            id: existing.id,
            title: existing.title,
            author: existing.author,
            feedUrl: existing.feed_url,
            artworkUrl: existing.artwork_url,
            language: normalizeLanguageCode(existing.language) || normalizedLang,
            createdAt: existing.created_at
          }, alreadyExists: true });
        }
      }
      throw e;
    }
    timelineCache.delete(userId);
    res.json({ subscription: { id, title, author: author || "", feedUrl, artworkUrl: artworkUrl || "", language: normalizedLang, createdAt: now } });
  } catch (err) {
    console.error("[Podcasts] Subscribe error:", err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});
var timelineCache = /* @__PURE__ */ new Map();
var TIMELINE_CACHE_TTL = 5 * 60 * 1e3;
async function fetchAndParseFeed(feedUrl, options = {}) {
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(feedUrl);
  } catch {
    decodedUrl = feedUrl;
  }
  if (!decodedUrl.startsWith("http://") && !decodedUrl.startsWith("https://")) {
    throw new Error("Invalid feed URL");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1e4);
  let feedResponse;
  try {
    feedResponse = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "Lectura Podcast Reader/1.0 (compatible; RSS)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!feedResponse.ok) {
    throw new Error(`Feed server returned HTTP ${feedResponse.status}`);
  }
  const xmlText = await feedResponse.text();
  const parsed = xmlParser.parse(xmlText);
  const channel = parsed?.rss?.channel || parsed?.feed || {};
  let rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
  if (options.limit && options.limit > 0) {
    rawItems = rawItems.slice(0, options.limit);
  }
  const rawLang = channel.language || "";
  const normalizedChannelLang = normalizeLanguageCode(rawLang);
  const meta = {
    title: channel.title || "",
    description: stripHtml(channel.description || channel["itunes:summary"] || ""),
    language: normalizedChannelLang,
    artworkUrl: channel["itunes:image"]?.["@_href"] || channel.image?.url || "",
    author: channel["itunes:author"] || channel["managingEditor"] || "",
    link: channel.link || ""
  };
  const episodes = rawItems.map((item) => {
    const enclosures = Array.isArray(item.enclosure) ? item.enclosure : item.enclosure ? [item.enclosure] : [];
    const audioEnclosure = enclosures.find(
      (e) => e["@_type"]?.startsWith("audio/") || e["@_url"]
    );
    const rawAudioUrl = audioEnclosure?.["@_url"] || "";
    const audioUrl = rawAudioUrl.startsWith("http://") ? rawAudioUrl.replace("http://", "https://") : rawAudioUrl;
    const originalAudioUrl = rawAudioUrl;
    const transcripts = Array.isArray(item["podcast:transcript"]) ? item["podcast:transcript"] : item["podcast:transcript"] ? [item["podcast:transcript"]] : [];
    let chosenTranscriptUrl = "";
    let chosenTranscriptType = null;
    for (const t of transcripts) {
      const url = (t["@_url"] || "").trim();
      const type = (t["@_type"] || "").toLowerCase();
      if (!url) continue;
      const isVtt = type.includes("vtt") || url.endsWith(".vtt");
      const isSrt = type.includes("srt") || url.endsWith(".srt");
      const isJson = type.includes("json") || url.endsWith(".json");
      if (isVtt || isSrt || isJson || type.includes("text")) {
        chosenTranscriptUrl = url.startsWith("http://") ? url.replace("http://", "https://") : url;
        chosenTranscriptType = isVtt ? "vtt" : isSrt ? "srt" : isJson ? "json" : "text";
        break;
      }
    }
    const durationSec = parseDuration(item["itunes:duration"] || item.duration);
    const itemArtwork = item["itunes:image"]?.["@_href"] || "";
    return {
      guid: String(item.guid?.["#text"] || item.guid || item.link || rawAudioUrl || Math.random()),
      title: item.title || "",
      pubDate: item.pubDate || "",
      duration: durationSec,
      description: stripHtml(item.description || item["itunes:summary"] || ""),
      audioUrl,
      originalAudioUrl,
      transcriptUrl: chosenTranscriptUrl,
      transcriptType: chosenTranscriptType,
      hasTranscript: Boolean(chosenTranscriptUrl),
      artworkUrl: itemArtwork,
      fileSize: Number(audioEnclosure?.["@_length"]) || null
    };
  });
  return { meta, episodes };
}
router11.get("/timeline", async (req, res) => {
  try {
    const userId = safeResolveUserId(req);
    const forceRefresh = req.query.refresh === "true";
    const cached = timelineCache.get(userId);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < TIMELINE_CACHE_TTL) {
      return res.json({ episodes: cached.episodes, fromCache: true });
    }
    const db = getDbConnection("default");
    const subscriptions = db.prepare(
      "SELECT * FROM podcast_subscriptions WHERE user_id = ? ORDER BY created_at DESC"
    ).all(userId);
    if (!subscriptions || subscriptions.length === 0) {
      timelineCache.set(userId, { episodes: [], timestamp: Date.now() });
      return res.json({ episodes: [] });
    }
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const feed = await fetchAndParseFeed(sub.feed_url, { limit: 5 });
          const detectedFeedLang = normalizeLanguageCode(feed.meta.language) || normalizeLanguageCode(sub.language) || "en";
          return feed.episodes.map((ep) => ({
            ...ep,
            podcastId: sub.id,
            podcastTitle: sub.title || feed.meta.title,
            podcastArtwork: sub.artwork_url || feed.meta.artworkUrl,
            podcastAuthor: sub.author || feed.meta.author,
            podcastLanguage: detectedFeedLang,
            feedUrl: sub.feed_url
          }));
        } catch (e) {
          console.warn(`[Podcasts Timeline] Failed to fetch feed ${sub.feed_url}:`, e);
          return [];
        }
      })
    );
    const allEpisodes = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value).sort((a, b) => {
      const timeA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const timeB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return timeB - timeA;
    }).slice(0, 50);
    timelineCache.set(userId, {
      episodes: allEpisodes,
      timestamp: Date.now()
    });
    res.json({ episodes: allEpisodes });
  } catch (err) {
    console.error("[Podcasts Timeline] Error:", err);
    res.status(500).json({ error: "Failed to generate timeline" });
  }
});
router11.get("/feed", async (req, res) => {
  const feedUrl = (req.query.url || "").trim();
  if (!feedUrl) {
    return res.status(400).json({ error: "Query parameter 'url' is required" });
  }
  try {
    const result = await fetchAndParseFeed(feedUrl);
    res.json(result);
  } catch (err) {
    console.error("[Podcasts Feed] Error:", err);
    res.status(500).json({ error: err.message || "Failed to parse RSS feed" });
  }
});
router11.delete("/subscriptions/:id", (req, res) => {
  try {
    const userId = safeResolveUserId(req);
    const { id } = req.params;
    const db = getDbConnection("default");
    const result = db.prepare(
      "DELETE FROM podcast_subscriptions WHERE id = ? AND user_id = ?"
    ).run(id, userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Subscription not found" });
    }
    timelineCache.delete(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Podcasts] Unsubscribe error:", err);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});
router11.post("/import-episode", async (req, res) => {
  const {
    guid,
    title,
    audioUrl,
    originalAudioUrl,
    transcriptUrl,
    description,
    artworkUrl,
    podcastTitle,
    language,
    activeLanguage,
    currentLanguage,
    duration,
    pubDate,
    taskId
  } = req.body;
  if (!audioUrl || !title) {
    return res.status(400).json({ error: "audioUrl and title are required" });
  }
  const userId = safeResolveUserId(req);
  const db = getDbConnection("default");
  const lessonId = `podcast_${import_crypto5.default.randomUUID()}`;
  const safeFilename = lessonId;
  const urlForExt = audioUrl.split("?")[0];
  const extMatch = urlForExt.match(/\.(mp3|m4a|aac|ogg|opus|wav|webm)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : "mp3";
  const audioFilename = `${safeFilename}.${ext}`;
  const audioFilePath = import_path12.default.join(AUDIO_STORAGE_DIR2, audioFilename);
  const storedAudioUrl = `/api/audio-files/${audioFilename}`;
  try {
    const urlsToTry = [audioUrl];
    if (originalAudioUrl && originalAudioUrl !== audioUrl) {
      urlsToTry.push(originalAudioUrl);
    }
    let downloadSuccess = false;
    let lastError;
    for (const tryUrl of urlsToTry) {
      try {
        const audioResp = await fetch(tryUrl, {
          headers: { "User-Agent": "Lectura/1.0" },
          signal: AbortSignal.timeout(12e4)
        });
        if (!audioResp.ok) {
          lastError = new Error(`HTTP ${audioResp.status} from ${tryUrl}`);
          continue;
        }
        if (!audioResp.body) {
          lastError = new Error("No response body");
          continue;
        }
        const { Readable: Readable2 } = await import("stream");
        const fileStream = import_fs13.default.createWriteStream(audioFilePath);
        await (0, import_promises.pipeline)(Readable2.fromWeb(audioResp.body), fileStream);
        downloadSuccess = true;
        break;
      } catch (e) {
        lastError = e;
        if (import_fs13.default.existsSync(audioFilePath)) {
          try {
            import_fs13.default.unlinkSync(audioFilePath);
          } catch {
          }
        }
      }
    }
    if (!downloadSuccess) {
      throw lastError || new Error("Audio download failed");
    }
    const effectiveActiveLanguage = activeLanguage || currentLanguage;
    const resolvedTargetLanguage = resolveUserTargetLanguage(db, userId, effectiveActiveLanguage, language);
    const targetIso = normalizeLanguageCode(resolvedTargetLanguage);
    let lessonText = "";
    let hasValidTranscript = false;
    let wordTimestampsJson = null;
    let transcriptionMethod = "show_notes";
    if (transcriptUrl) {
      try {
        const tResp = await fetch(transcriptUrl, {
          headers: { "User-Agent": "Lectura/1.0" },
          signal: AbortSignal.timeout(15e3)
        });
        if (tResp.ok) {
          const raw = await tResp.text();
          if (raw && raw.trim().length > 30) {
            const lowerUrl = transcriptUrl.toLowerCase();
            if (lowerUrl.endsWith(".vtt") || raw.includes("WEBVTT")) {
              lessonText = parseWebVTT(raw);
            } else if (lowerUrl.endsWith(".srt") || raw.includes("-->")) {
              lessonText = parseSRT(raw);
            } else if (lowerUrl.endsWith(".json") || raw.startsWith("{") || raw.startsWith("[")) {
              lessonText = parseTranscriptJson(raw);
            } else {
              lessonText = raw.slice(0, 1e5).trim();
            }
            if (lessonText.length > 30) {
              hasValidTranscript = true;
              transcriptionMethod = "rss_transcript";
            }
          }
        }
      } catch (e) {
        console.warn("[Podcasts] RSS transcript fetch failed:", e);
      }
    }
    if (!hasValidTranscript) {
      console.log(`[Podcasts] No RSS transcript found for "${title}". Triggering Faster-Whisper (${targetIso})...`);
      try {
        const whisperResult = await transcribeAudioWithWhisper(audioFilePath, targetIso, taskId);
        if (whisperResult && whisperResult.text && whisperResult.text.trim().length > 30) {
          lessonText = whisperResult.text;
          wordTimestampsJson = whisperResult.wordTimestampsJson;
          hasValidTranscript = true;
          transcriptionMethod = "whisper";
          console.log(`[Podcasts] Whisper transcription successful for "${title}" (${lessonText.length} chars)`);
        }
      } catch (whisperErr) {
        console.warn("[Podcasts] Whisper STT pipeline failed (fallback to show notes):", whisperErr);
      }
    }
    if (!hasValidTranscript || !lessonText) {
      const cleanDesc = description ? description.trim() : "";
      lessonText = `[Show Notes / \u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0432\u044B\u043F\u0443\u0441\u043A\u0430]

${cleanDesc || title}`;
      transcriptionMethod = "show_notes";
    }
    const now = Date.now();
    const cleanTitle = (title || "").trim();
    const cleanPodcastTitle = (podcastTitle || "").trim();
    const cleanArtworkUrl = (artworkUrl || "").trim();
    const origGuid = (guid || req.body.episodeId || "").trim();
    const origAudio = (originalAudioUrl || audioUrl || "").trim();
    db.prepare(`
      INSERT INTO lessons (id, user_id, title, text, audioUrl, targetLanguage, translationLanguage,
        lessonType, coverUrl, channelName, wordTimestamps, playlistId, channelUrl, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'podcast', ?, ?, ?, ?, ?, ?)
    `).run(
      lessonId,
      userId,
      cleanTitle,
      lessonText,
      storedAudioUrl,
      resolvedTargetLanguage,
      "English",
      cleanArtworkUrl || null,
      cleanPodcastTitle || null,
      wordTimestampsJson,
      null,
      origAudio || null,
      now
    );
    res.json({
      ok: true,
      lessonId,
      audioUrl: storedAudioUrl,
      targetLanguage: resolvedTargetLanguage,
      hasTranscript: hasValidTranscript,
      transcriptionMethod
    });
  } catch (err) {
    if (import_fs13.default.existsSync(audioFilePath)) {
      try {
        import_fs13.default.unlinkSync(audioFilePath);
      } catch {
      }
    }
    console.error("[Podcasts] Import episode error:", err);
    res.status(500).json({ error: err.message || "Failed to import episode" });
  }
});
router11.get("/stats/channels", (req, res) => {
  try {
    const userId = safeResolveUserId(req);
    const db = getDbConnection("default");
    const rows = db.prepare(`
      SELECT 
        MAX(channelName) AS display_name,
        COALESCE(
          MAX(CASE WHEN channelAvatarUrl IS NOT NULL AND channelAvatarUrl != '' THEN channelAvatarUrl END),
          MAX(CASE WHEN youtubeId IS NOT NULL OR lessonType = 'youtube' THEN coverUrl END),
          MAX(coverUrl)
        ) AS avatar_url,
        COUNT(id) AS total_items
      FROM lessons
      WHERE user_id = ? AND channelName IS NOT NULL AND TRIM(channelName) != ''
      GROUP BY LOWER(TRIM(channelName))
      ORDER BY total_items DESC
    `).all(userId);
    res.json({
      channels: rows.map((r) => ({
        name: r.display_name,
        avatarUrl: r.avatar_url,
        totalItems: r.total_items
      }))
    });
  } catch (err) {
    console.error("[Podcasts] Channels stats error:", err);
    res.status(500).json({ error: "Failed to fetch channel stats" });
  }
});
var podcasts_default = router11;

// routes/translate.ts
var import_express13 = require("express");
var import_path13 = __toESM(require("path"), 1);
var import_better_sqlite34 = __toESM(require("better-sqlite3"), 1);
init_ai();
init_geminiClient();
var router12 = (0, import_express13.Router)();
var DATA_DIR9 = process.env.DATA_DIR || process.cwd();
var CACHE_DB_PATH2 = import_path13.default.join(DATA_DIR9, "ai_cache.sqlite");
var cacheDbConn2 = null;
function getCacheDb2() {
  if (!cacheDbConn2) {
    cacheDbConn2 = new import_better_sqlite34.default(CACHE_DB_PATH2);
    cacheDbConn2.pragma("journal_mode = WAL");
    cacheDbConn2.exec(`
      CREATE TABLE IF NOT EXISTS sentence_translations (
        source_text TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        translation TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source_text, source_lang, target_lang)
      );
      CREATE INDEX IF NOT EXISTS idx_sentence_trans_lookup ON sentence_translations (source_lang, target_lang);
    `);
  }
  return cacheDbConn2;
}
var ISO_MAP = {
  spanish: "es",
  spa: "es",
  es: "es",
  english: "en",
  eng: "en",
  en: "en",
  french: "fr",
  fra: "fr",
  fr: "fr",
  german: "de",
  deu: "de",
  ger: "de",
  de: "de",
  italian: "it",
  ita: "it",
  it: "it",
  russian: "ru",
  rus: "ru",
  ru: "ru",
  portuguese: "pt",
  por: "pt",
  pt: "pt",
  chinese: "zh",
  zho: "zh",
  chi: "zh",
  zh: "zh",
  japanese: "ja",
  jpn: "ja",
  ja: "ja",
  korean: "ko",
  kor: "ko",
  ko: "ko",
  turkish: "tr",
  tur: "tr",
  tr: "tr",
  polish: "pl",
  pol: "pl",
  pl: "pl",
  ukrainian: "uk",
  ukr: "uk",
  uk: "uk"
};
function toIso(lang) {
  if (!lang) return "auto";
  const clean = lang.toLowerCase().trim();
  return ISO_MAP[clean] || (clean.length === 2 ? clean : "auto");
}
async function translateWithGoogleGtx(text, sl, tl) {
  const clean = text.trim();
  if (!clean) return "";
  const isMultiWord = clean.includes(" ");
  const dtParams = isMultiWord ? "dt=t" : "dt=t&dt=at&dt=bd";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&${dtParams}&q=${encodeURIComponent(clean)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(6e3)
  });
  if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data) throw new Error("Empty Google Translate response");
  let primary = "";
  if (Array.isArray(data[0])) {
    primary = data[0].map((item) => item && item[0] ? item[0] : "").join("").trim();
  }
  if (isMultiWord) {
    if (primary) return primary;
    throw new Error("No phrase translation returned");
  }
  if (data[1] && Array.isArray(data[1]) && data[1].length > 0) {
    const posLines = [];
    for (const posBlock of data[1]) {
      if (posBlock && typeof posBlock[0] === "string" && Array.isArray(posBlock[1]) && posBlock[1].length > 0) {
        const posTag = posBlock[0].toLowerCase();
        const topWords = posBlock[1].slice(0, 4).map((w) => String(w).trim()).filter(Boolean);
        if (topWords.length > 0) {
          posLines.push(`(${posTag}) ${topWords.join(", ")}`);
        }
      }
    }
    if (posLines.length > 0) {
      return posLines.join("\n");
    }
  }
  const definitions = [];
  if (primary) {
    definitions.push(primary);
  }
  if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
    for (const item of data[5][0][2]) {
      if (item && typeof item[0] === "string" && item[0].trim()) {
        const cleanSyn = item[0].trim();
        if (!definitions.some((d) => d.toLowerCase() === cleanSyn.toLowerCase())) {
          definitions.push(cleanSyn);
        }
      }
    }
  }
  if (definitions.length > 0) {
    return definitions.slice(0, 3).join(", ");
  }
  if (primary) return primary;
  throw new Error("Unexpected Google Translate response format");
}
async function translateBatchWithAi(sentences, sourceLang, targetLang, req) {
  const profile = extractAiProfile(req);
  const prompt = `You are a professional language translator. Translate the following array of sentences from ${sourceLang} to ${targetLang}.
Return ONLY a valid JSON object mapping each original sentence string exactly to its translated string.

Sentences to translate:
${JSON.stringify(sentences, null, 2)}

Format:
{
  "Original sentence 1": "Translated sentence 1",
  "Original sentence 2": "Translated sentence 2"
}`;
  try {
    const raw = await callUniversalAiProvider(profile, prompt, {
      formatJson: true,
      temperature: 0.1,
      timeoutMs: 15e3
    });
    if (typeof raw === "object" && raw !== null) {
      return raw;
    }
    if (typeof raw === "string") {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Translate] AI batch translation failed:", err);
  }
  return {};
}
router12.post("/translate-sentences", aiRateLimit, async (req, res) => {
  const { sentences, sourceLanguage, targetLanguage } = req.body;
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.json({ translations: {} });
  }
  const sLang = (sourceLanguage || "Spanish").trim();
  const tLang = (targetLanguage || "Russian").trim();
  const sIso = toIso(sLang);
  const tIso = toIso(tLang);
  const db = getCacheDb2();
  const result = {};
  const missing = [];
  const selectStmt = db.prepare(`
    SELECT translation FROM sentence_translations 
    WHERE source_text = ? AND source_lang = ? AND target_lang = ?
  `);
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(clean) || /^\[IMG.*\]$/.test(clean)) {
      continue;
    }
    const row = selectStmt.get(clean, sIso, tIso);
    if (row && row.translation) {
      result[clean] = row.translation;
    } else {
      missing.push(clean);
    }
  }
  if (missing.length === 0) {
    return res.json({ translations: result });
  }
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const uniqueMissing = Array.from(new Set(missing)).slice(0, 35);
  const fetchPromises = uniqueMissing.map(async (text) => {
    try {
      const translated = await translateWithGoogleGtx(text, sIso, tIso);
      if (translated && translated.trim()) {
        const cleanTrans = translated.trim();
        result[text] = cleanTrans;
        insertStmt.run(text, sIso, tIso, cleanTrans, Date.now());
      }
    } catch (_) {
    }
  });
  await Promise.allSettled(fetchPromises);
  const stillMissing = uniqueMissing.filter((t) => !result[t]);
  if (stillMissing.length > 0) {
    const aiResults = await translateBatchWithAi(stillMissing, sLang, tLang, req);
    for (const [orig, trans] of Object.entries(aiResults)) {
      if (trans && typeof trans === "string" && trans.trim()) {
        const cleanTrans = trans.trim();
        result[orig] = cleanTrans;
        try {
          insertStmt.run(orig, sIso, tIso, cleanTrans, Date.now());
        } catch (_) {
        }
      }
    }
  }
  return res.json({ translations: result });
});
var COMMON_WORD_DICTIONARY = {
  "en_ru": {
    "you": "\u0442\u044B, \u0432\u044B, \u0432\u0430\u043C",
    "were": "\u0431\u044B\u043B\u0438, \u0431\u044B\u043B, \u0431\u044B\u043B\u0430",
    "was": "\u0431\u044B\u043B, \u0431\u044B\u043B\u0430, \u0431\u044B\u043B\u043E",
    "be": "\u0431\u044B\u0442\u044C, \u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F",
    "been": "\u0431\u044B\u043B, \u0431\u044B\u043B\u0430 (\u0431\u044B\u0432\u0448\u0438\u0439)",
    "to": "\u043A, \u0432, \u0447\u0442\u043E\u0431\u044B",
    "the": "(\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D\u043D\u044B\u0439 \u0430\u0440\u0442\u0438\u043A\u043B\u044C)",
    "a": "(\u043D\u0435\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D\u043D\u044B\u0439 \u0430\u0440\u0442\u0438\u043A\u043B\u044C)",
    "an": "(\u043D\u0435\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D\u043D\u044B\u0439 \u0430\u0440\u0442\u0438\u043A\u043B\u044C)",
    "it": "\u044D\u0442\u043E, \u043E\u043D\u043E, \u0435\u043C\u0443",
    "i": "\u044F, \u043C\u043D\u0435",
    "we": "\u043C\u044B, \u043D\u0430\u043C",
    "they": "\u043E\u043D\u0438, \u0438\u043C",
    "he": "\u043E\u043D, \u0435\u043C\u0443",
    "she": "\u043E\u043D\u0430, \u0435\u0439",
    "and": "\u0438",
    "or": "\u0438\u043B\u0438",
    "but": "\u043D\u043E",
    "in": "\u0432",
    "on": "\u043D\u0430",
    "at": "\u0432, \u0443, \u043E\u043A\u043E\u043B\u043E",
    "for": "\u0434\u043B\u044F, \u0437\u0430",
    "of": "\u0438\u0437, \u043E",
    "with": "\u0441, \u0432\u043C\u0435\u0441\u0442\u0435 \u0441",
    "as": "\u043A\u0430\u043A, \u0432 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0435",
    "by": "\u0443, \u043E\u043A\u043E\u043B\u043E, \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E",
    "is": "\u0435\u0441\u0442\u044C, \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F",
    "are": "\u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F, \u0435\u0441\u0442\u044C",
    "am": "\u044F\u0432\u043B\u044F\u044E\u0441\u044C, \u0435\u0441\u0442\u044C",
    "have": "\u0438\u043C\u0435\u0442\u044C",
    "has": "\u0438\u043C\u0435\u0435\u0442",
    "had": "\u0438\u043C\u0435\u043B, \u0438\u043C\u0435\u043B\u0438",
    "do": "\u0434\u0435\u043B\u0430\u0442\u044C",
    "does": "\u0434\u0435\u043B\u0430\u0435\u0442",
    "did": "\u0434\u0435\u043B\u0430\u043B, \u0441\u0434\u0435\u043B\u0430\u043B\u0438",
    "can": "\u043C\u043E\u0447\u044C, \u0443\u043C\u0435\u0442\u044C",
    "could": "\u043C\u043E\u0433, \u043C\u043E\u0433\u043B\u0438",
    "will": "\u0431\u0443\u0434\u0435\u0442, \u0431\u0443\u0434\u0443\u0442",
    "would": "\u0431\u044B",
    "should": "\u0441\u043B\u0435\u0434\u0443\u0435\u0442, \u0434\u043E\u043B\u0436\u0435\u043D",
    "must": "\u0434\u043E\u043B\u0436\u0435\u043D, \u043E\u0431\u044F\u0437\u0430\u043D\u044B",
    "my": "\u043C\u043E\u0439, \u043C\u043E\u044F, \u043C\u043E\u0451",
    "your": "\u0442\u0432\u043E\u0439, \u0432\u0430\u0448",
    "their": "\u0438\u0445",
    "our": "\u043D\u0430\u0448",
    "his": "\u0435\u0433\u043E",
    "her": "\u0435\u0451",
    "its": "\u0435\u0433\u043E, \u0435\u0451",
    "this": "\u044D\u0442\u043E\u0442, \u044D\u0442\u0430, \u044D\u0442\u043E",
    "that": "\u0442\u043E\u0442, \u0442\u0430, \u0442\u043E",
    "these": "\u044D\u0442\u0438",
    "those": "\u0442\u0435",
    "what": "\u0447\u0442\u043E, \u043A\u0430\u043A\u043E\u0439",
    "who": "\u043A\u0442\u043E",
    "where": "\u0433\u0434\u0435, \u043A\u0443\u0434\u0430",
    "when": "\u043A\u043E\u0433\u0434\u0430",
    "why": "\u043F\u043E\u0447\u0435\u043C\u0443, \u0437\u0430\u0447\u0435\u043C",
    "how": "\u043A\u0430\u043A",
    "not": "\u043D\u0435, \u043D\u0435\u0442",
    "no": "\u043D\u0435\u0442, \u043D\u0438\u043A\u0430\u043A\u043E\u0439",
    "yes": "\u0434\u0430"
  }
};
async function translateWithMyMemory(text, sl, tl) {
  const from = sl === "auto" ? "en" : sl;
  const to = tl === "auto" ? "ru" : tl;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.responseData?.translatedText && !data.responseData.translatedText.includes("MYMEMORY WARNING")) {
    return data.responseData.translatedText;
  }
  throw new Error("No valid MyMemory translation");
}
router12.post("/translate", aiRateLimit, async (req, res) => {
  const text = (req.body.text || req.body.word || "").trim();
  const sourceLanguage = req.body.sourceLanguage || req.body.sourceLang || req.body.sl || "auto";
  const targetLanguage = req.body.targetLanguage || req.body.targetLang || req.body.tl || "ru";
  if (!text) {
    return res.status(400).json({ error: "Missing text to translate" });
  }
  const sIso = toIso(sourceLanguage);
  const tIso = toIso(targetLanguage);
  const db = getCacheDb2();
  try {
    const gtxTranslation = await translateWithGoogleGtx(text, sIso, tIso);
    if (gtxTranslation && gtxTranslation.trim()) {
      const clean = gtxTranslation.trim();
      try {
        db.prepare(`
          INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(text, sIso, tIso, clean, Date.now());
      } catch (_) {
      }
      return res.json({ text, translation: clean, sourceLang: sIso, targetLang: tIso });
    }
  } catch (err) {
    console.warn("[POST /api/translate] Google GTX RPC error, checking fallbacks:", err.message);
  }
  try {
    const row = db.prepare(`
      SELECT translation FROM sentence_translations 
      WHERE source_text = ? AND source_lang = ? AND target_lang = ?
    `).get(text, sIso, tIso);
    if (row?.translation) {
      return res.json({ text, translation: row.translation, cached: true });
    }
  } catch (_) {
  }
  try {
    const myMemoryTrans = await translateWithMyMemory(text, sIso, tIso);
    if (myMemoryTrans && myMemoryTrans.trim()) {
      const clean = myMemoryTrans.trim();
      try {
        db.prepare(`
          INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(text, sIso, tIso, clean, Date.now());
      } catch (_) {
      }
      return res.json({ text, translation: clean, sourceLang: sIso, targetLang: tIso });
    }
  } catch (_) {
  }
  try {
    const aiResults = await translateBatchWithAi([text], sourceLanguage, targetLanguage, req);
    if (aiResults[text]) {
      const clean = aiResults[text].trim();
      try {
        db.prepare(`
          INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(text, sIso, tIso, clean, Date.now());
      } catch (_) {
      }
      return res.json({ text, translation: clean, sourceLang: sIso, targetLang: tIso });
    }
  } catch (err) {
    console.error("[POST /api/translate] Translation error:", err);
  }
  const dictKey = `${sIso}_${tIso}`;
  const lowerText = text.toLowerCase();
  if (COMMON_WORD_DICTIONARY[dictKey] && COMMON_WORD_DICTIONARY[dictKey][lowerText]) {
    return res.json({ text, translation: COMMON_WORD_DICTIONARY[dictKey][lowerText], sourceLang: sIso, targetLang: tIso });
  }
  return res.json({ text, translation: "", sourceLang: sIso, targetLang: tIso });
});
var translate_default = router12;

// routes/history.ts
var import_express14 = require("express");
var router13 = (0, import_express14.Router)();
function normalizeLang2(lang) {
  if (!lang) return "Spanish";
  const lower = lang.trim().toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  if (lang.length > 2) {
    return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
  }
  return lang;
}
function handleTrackActivity(req, res) {
  let userId = "default";
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const {
    videoId,
    title,
    videoTitle,
    channelName,
    channelAvatarUrl,
    channelUrl,
    thumbnailUrl,
    duration,
    durationSeconds,
    studyLanguage,
    language,
    addedSeconds,
    watchedSeconds,
    lastPosition: reqLastPosition,
    currentTime,
    progress,
    isCompleted,
    timestamp
  } = req.body || {};
  const cleanVideoId = String(videoId || "").trim();
  const cleanTitle = String(
    title || videoTitle || (cleanVideoId ? `YouTube Video (${cleanVideoId})` : "Media Session")
  ).trim();
  const cleanChannel = String(channelName || "YouTube").trim();
  const cleanChannelUrl = String(
    channelUrl || (cleanVideoId ? `https://www.youtube.com/watch?v=${cleanVideoId}` : "")
  ).trim();
  const cleanCover = thumbnailUrl || (cleanVideoId ? `https://img.youtube.com/vi/${cleanVideoId}/hqdefault.jpg` : null);
  const rawTargetLang = String(studyLanguage || language || "es").toLowerCase().trim();
  const targetLang = normalizeLang2(rawTargetLang);
  const totalDuration = Math.max(0, Math.round(Number(duration || durationSeconds) || 0));
  const rawPos = reqLastPosition ?? currentTime ?? progress;
  const resolvedLastPosition = rawPos !== void 0 && !isNaN(Number(rawPos)) ? Math.max(0, Math.round(Number(rawPos))) : void 0;
  const addedSec = req.body?.addedSeconds !== void 0 ? Math.min(7200, Math.max(0, Math.round(Number(req.body.addedSeconds) || 0))) : req.body?.watchedSeconds !== void 0 && Number(req.body.watchedSeconds) <= 300 ? Math.min(300, Math.max(0, Math.round(Number(req.body.watchedSeconds) || 0))) : 0;
  const completed = Boolean(isCompleted);
  const statusStr = completed ? "COMPLETED" : "IN_PROGRESS";
  const now = timestamp ? new Date(timestamp).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
  const todayDate = now.split("T")[0];
  try {
    const db = getDbConnection(userId);
    try {
      db.prepare(`
        DELETE FROM lessons 
        WHERE user_id = ? 
          AND (text IS NULL OR TRIM(text) = '') 
          AND (isBuiltIn IS NULL OR isBuiltIn = 0) 
          AND (wordTimestamps IS NULL OR length(wordTimestamps) <= 2)
      `).run(userId);
    } catch (_) {
    }
    const effectiveLessonId = cleanVideoId ? cleanVideoId.startsWith("lesson-yt_") ? cleanVideoId : `lesson-yt_${cleanVideoId}` : `custom_activity_${Date.now().toString(36)}`;
    let lesson = cleanVideoId ? db.prepare(`
          SELECT id, timeSpentSeconds, status, duration 
          FROM lessons 
          WHERE (youtubeId = ? OR id = ? OR id = ?) AND user_id = ?
        `).get(cleanVideoId, effectiveLessonId, `youtube_${cleanVideoId}`, userId) : null;
    let incrementalSec = 0;
    if (lesson) {
      const prevTimeSpent = lesson.timeSpentSeconds || 0;
      const newTimeSpent = prevTimeSpent + addedSec;
      incrementalSec = addedSec;
      const newStatus = completed ? "COMPLETED" : lesson.status || "IN_PROGRESS";
      db.prepare(`
        UPDATE lessons 
        SET timeSpentSeconds = ?, status = ?, updatedAt = ?,
            duration = CASE WHEN ? > 0 THEN ? WHEN COALESCE(duration, 0) > 0 THEN duration ELSE 0 END,
            channelName = COALESCE(?, channelName),
            channelUrl = COALESCE(?, channelUrl)
        WHERE id = ? AND user_id = ?
      `).run(
        newTimeSpent,
        newStatus,
        now,
        totalDuration,
        totalDuration,
        cleanChannel,
        cleanChannelUrl,
        lesson.id,
        userId
      );
      lesson.timeSpentSeconds = newTimeSpent;
    } else {
      incrementalSec = addedSec;
    }
    const recordedLessonId = lesson ? lesson.id : effectiveLessonId;
    if (incrementalSec > 0) {
      db.prepare(`
        INSERT INTO study_activity_logs (userId, lessonId, date, secondsSpent, updatedAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(userId, lessonId, date) 
        DO UPDATE SET secondsSpent = secondsSpent + ?, updatedAt = ?
      `).run(userId, recordedLessonId, todayDate, incrementalSec, now, incrementalSec, now);
    }
    let existingHistory = null;
    if (cleanVideoId) {
      existingHistory = db.prepare(`
        SELECT * FROM reading_history
        WHERE user_id = ? 
          AND (lessonId = ? OR lessonId = ? OR (coverUrl LIKE ? AND lessonType = 'youtube'))
          AND timestamp LIKE ?
        ORDER BY timestamp DESC LIMIT 1
      `).get(userId, recordedLessonId, `youtube_${cleanVideoId}`, `%${cleanVideoId}%`, `${todayDate}%`);
    }
    if (existingHistory) {
      const prevDuration = existingHistory.durationSeconds || 0;
      const updatedDuration = prevDuration + addedSec;
      const finalLastPosition = resolvedLastPosition !== void 0 ? resolvedLastPosition : existingHistory.lastPosition || 0;
      db.prepare(`
        UPDATE reading_history SET
          durationSeconds = ?,
          timestamp = ?,
          status = ?,
          lessonTitle = COALESCE(?, lessonTitle),
          channelName = COALESCE(?, channelName),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          coverUrl = COALESCE(?, coverUrl),
          lastPosition = ?,
          duration = CASE WHEN ? > 0 THEN ? WHEN COALESCE(duration, 0) > 0 THEN duration ELSE 0 END
        WHERE user_id = ? AND id = ?
      `).run(
        updatedDuration,
        now,
        completed ? "completed" : existingHistory.status || "in_progress",
        cleanTitle,
        cleanChannel,
        channelAvatarUrl || null,
        cleanChannelUrl || null,
        cleanCover,
        finalLastPosition,
        totalDuration,
        totalDuration,
        userId,
        existingHistory.id
      );
    } else {
      const initialDuration = addedSec;
      const initialLastPos = resolvedLastPosition !== void 0 ? resolvedLastPosition : 0;
      let autoPrimaryTag = null;
      let autoTags = [];
      if (cleanVideoId) {
        try {
          const lRow = db.prepare(`
            SELECT id, primaryTag, tags, playlistId FROM lessons
            WHERE user_id = ? AND (id = ? OR youtubeId = ?)
            LIMIT 1
          `).get(userId, recordedLessonId, cleanVideoId);
          if (lRow) {
            autoPrimaryTag = lRow.primaryTag || null;
            if (lRow.tags) {
              const parsed = JSON.parse(lRow.tags);
              if (Array.isArray(parsed)) autoTags = parsed;
            }
            if (!autoPrimaryTag && lRow.playlistId) {
              const pRow = db.prepare(`
                SELECT primaryTag FROM playlists WHERE user_id = ? AND id = ?
              `).get(userId, lRow.playlistId);
              if (pRow?.primaryTag) autoPrimaryTag = pRow.primaryTag;
            }
          }
        } catch (_) {
        }
      }
      if (req.body.primaryTag) autoPrimaryTag = req.body.primaryTag;
      if (Array.isArray(req.body.tags)) autoTags = req.body.tags;
      const finalTagsJson = autoTags.length > 0 ? JSON.stringify(autoTags) : null;
      const historyId = "hist_yt_" + (cleanVideoId || Date.now().toString(36)) + "_" + Date.now().toString(36);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
          timestamp, actionType, status, durationSeconds, channelName, channelAvatarUrl,
          channelUrl, category, customTitle, mode, tags, lastPosition, duration, primaryTag
        ) VALUES (?, ?, ?, ?, 'youtube', ?, ?, ?, 'listen', ?, ?, ?, ?, ?, 'video', ?, 'custom', ?, ?, ?, ?)
      `).run(
        historyId,
        userId,
        recordedLessonId,
        cleanTitle,
        cleanCover,
        targetLang,
        now,
        completed ? "completed" : "in_progress",
        initialDuration,
        cleanChannel,
        channelAvatarUrl || null,
        cleanChannelUrl || null,
        cleanTitle,
        finalTagsJson,
        initialLastPos,
        totalDuration,
        autoPrimaryTag || null
      );
    }
    if (incrementalSec > 0) {
      const currentListeningRow = db.prepare(
        "SELECT value FROM metadata WHERE user_id = ? AND key = 'listeningSeconds'"
      ).get(userId);
      const currentTotal = currentListeningRow ? parseFloat(currentListeningRow.value) || 0 : 0;
      const newTotal = Math.round(currentTotal + incrementalSec);
      db.prepare(
        "INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'listeningSeconds', ?)"
      ).run(userId, String(newTotal));
    }
    return res.json({
      success: true,
      lessonId: recordedLessonId,
      addedSeconds: addedSec,
      timestamp: now
    });
  } catch (err) {
    console.error("[track-activity] Error saving activity:", err);
    return res.status(500).json({ error: "Failed to track activity: " + err.message });
  }
}
router13.post("/history/track-activity", handleTrackActivity);
router13.post("/history/track", handleTrackActivity);
router13.post("/history/log", handleTrackActivity);
router13.post("/activity/track", handleTrackActivity);
router13.post("/activity/log", handleTrackActivity);
router13.patch("/history/:id", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { id } = req.params;
  const updates = req.body;
  if (!id) return res.status(400).json({ error: "Missing history entry ID" });
  try {
    const db = getDbConnection(userId);
    db.transaction(() => {
      const existing = db.prepare("SELECT * FROM reading_history WHERE user_id = ? AND id = ?").get(userId, id);
      const requestedDuration = updates?.durationSeconds;
      if (!existing && (requestedDuration || 0) <= 0) {
        throw new Error("ZERO_DURATION_HISTORY_CREATE");
      }
      if (existing && requestedDuration !== void 0 && requestedDuration <= 0) {
        throw new Error("ZERO_DURATION_HISTORY_UPDATE");
      }
      if (!existing) {
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO reading_history (
            id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, primaryTag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const primaryTagVal = updates.primaryTag || null;
        insertStmt.run(
          id,
          userId,
          updates.lessonId || "custom",
          updates.lessonTitle || updates.customTitle || "\u0417\u0430\u043D\u044F\u0442\u0438\u0435",
          updates.lessonType || updates.category || null,
          updates.coverUrl || null,
          updates.targetLanguage || "english",
          updates.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
          updates.actionType || "read",
          updates.status || "in_progress",
          updates.durationSeconds || 0,
          updates.notes || null,
          updates.channelName || null,
          updates.channelAvatarUrl || null,
          updates.channelUrl || null,
          updates.category || null,
          updates.customTitle || null,
          updates.mode || null,
          updates.tags ? JSON.stringify(updates.tags) : null,
          primaryTagVal
        );
        if (primaryTagVal && typeof primaryTagVal === "string" && primaryTagVal.trim()) {
          const pTag = primaryTagVal.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, pTag, null, updates.targetLanguage || null, Date.now());
          db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, 1);
        }
        if (Array.isArray(updates.tags)) {
          for (const t of updates.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = primaryTagVal && primaryTagVal.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, tagName, null, updates.targetLanguage || null, Date.now());
            db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, isPrim);
          }
        }
      } else {
        const nextChannelName = updates.channelName !== void 0 ? updates.channelName : existing.channelName;
        const nextChannelAvatar = updates.channelAvatarUrl !== void 0 ? updates.channelAvatarUrl : existing.channelAvatarUrl;
        const nextChannelUrl = updates.channelUrl !== void 0 ? updates.channelUrl : existing.channelUrl;
        const nextNotes = updates.notes !== void 0 ? updates.notes : existing.notes;
        const nextTitle = updates.lessonTitle !== void 0 ? updates.lessonTitle : existing.lessonTitle;
        const nextTargetLang = updates.targetLanguage !== void 0 ? updates.targetLanguage : existing.targetLanguage;
        const nextStatus = updates.status !== void 0 ? updates.status : existing.status;
        const nextActionType = updates.actionType !== void 0 ? updates.actionType : existing.actionType;
        const nextDuration = updates.durationSeconds !== void 0 ? updates.durationSeconds : existing.durationSeconds;
        const nextCoverUrl = updates.coverUrl !== void 0 ? updates.coverUrl : existing.coverUrl;
        const nextLessonType = updates.lessonType !== void 0 ? updates.lessonType : existing.lessonType;
        const nextLessonId = updates.lessonId && updates.lessonId !== "custom" ? updates.lessonId : existing.lessonId;
        const nextTags = updates.tags !== void 0 ? Array.isArray(updates.tags) ? JSON.stringify(updates.tags) : updates.tags : existing.tags;
        const nextPrimaryTag = updates.primaryTag !== void 0 ? updates.primaryTag || null : existing.primaryTag || null;
        const nextMode = updates.mode !== void 0 ? updates.mode : existing.mode;
        const nextCategory = updates.category !== void 0 ? updates.category : existing.category;
        const nextCustomTitle = updates.customTitle !== void 0 ? updates.customTitle : existing.customTitle;
        db.prepare(`
          UPDATE reading_history SET
            lessonId = ?, lessonTitle = ?, lessonType = ?, coverUrl = ?, targetLanguage = ?,
            actionType = ?, status = ?, durationSeconds = ?, notes = ?, channelName = ?,
            channelAvatarUrl = ?, channelUrl = ?, category = ?, customTitle = ?, mode = ?, tags = ?, primaryTag = ?
          WHERE user_id = ? AND id = ?
        `).run(
          nextLessonId,
          nextTitle,
          nextLessonType,
          nextCoverUrl,
          nextTargetLang,
          nextActionType,
          nextStatus,
          nextDuration,
          nextNotes,
          nextChannelName,
          nextChannelAvatar,
          nextChannelUrl,
          nextCategory,
          nextCustomTitle,
          nextMode,
          nextTags,
          nextPrimaryTag,
          userId,
          id
        );
        if (updates.primaryTag !== void 0 || updates.tags !== void 0) {
          db.prepare("DELETE FROM item_tags WHERE user_id = ? AND item_id = ?").run(userId, id);
          if (nextPrimaryTag && typeof nextPrimaryTag === "string" && nextPrimaryTag.trim()) {
            const pTag = nextPrimaryTag.trim();
            const tagId = `${userId}_${pTag.toLowerCase()}`;
            db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, pTag, null, nextTargetLang || null, Date.now());
            db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, 1);
          }
          const parsedTags = nextTags ? typeof nextTags === "string" ? JSON.parse(nextTags) : nextTags : [];
          if (Array.isArray(parsedTags)) {
            for (const t of parsedTags) {
              if (!t || typeof t !== "string" || !t.trim()) continue;
              const tagName = t.trim();
              const isPrim = nextPrimaryTag && nextPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
              const tagId = `${userId}_${tagName.toLowerCase()}`;
              db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, tagName, null, nextTargetLang || null, Date.now());
              db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, isPrim);
            }
          }
        }
        if (updates.channelName !== void 0 && nextLessonId && nextLessonId !== "custom") {
          db.prepare(`
            UPDATE reading_history SET
              channelName = ?,
              channelAvatarUrl = COALESCE(?, channelAvatarUrl),
              channelUrl = COALESCE(?, channelUrl)
            WHERE user_id = ? AND lessonId = ?
          `).run(nextChannelName, nextChannelAvatar, nextChannelUrl, userId, nextLessonId);
          db.prepare(`
            UPDATE lessons SET
              channelName = ?,
              channelTitle = ?,
              channelAvatarUrl = COALESCE(?, channelAvatarUrl),
              channelUrl = COALESCE(?, channelUrl)
            WHERE user_id = ? AND id = ?
          `).run(nextChannelName, nextChannelName, nextChannelAvatar, nextChannelUrl, userId, nextLessonId);
        }
      }
    })();
    console.log(`[SAVED TO DB] History ${id} updated with channel: ${updates.channelName || updates.channelTitle || "unchanged"}`);
    return res.json({ status: "success", id });
  } catch (err) {
    if (err?.message === "ZERO_DURATION_HISTORY_CREATE" || err?.message === "ZERO_DURATION_HISTORY_UPDATE") {
      return res.status(400).json({ error: "History durationSeconds must be greater than 0" });
    }
    console.error("[PATCH /api/history/:id] Error:", err);
    return res.status(500).json({ error: "Failed to update history entry" });
  }
});
router13.delete("/history/:id", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { id } = req.params;
  try {
    const db = getDbConnection(userId);
    const result = db.prepare("DELETE FROM reading_history WHERE user_id = ? AND id = ?").run(userId, id);
    console.log("[Server SQL Delete]", { id, changes: result.changes });
    return res.json({ status: "success", id, changes: result.changes });
  } catch (err) {
    console.error("[DELETE /api/history/:id] Error:", err);
    return res.status(500).json({ error: "Failed to delete history entry" });
  }
});
router13.post("/history/batch-delete", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Missing or empty ids array" });
  }
  try {
    const db = getDbConnection(userId);
    let totalDeleted = 0;
    db.transaction(() => {
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        db.prepare(`DELETE FROM item_tags WHERE user_id = ? AND item_id IN (${placeholders})`).run(userId, ...chunk);
        const result = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...chunk);
        totalDeleted += result.changes;
      }
    })();
    console.log("[Server SQL Batch Delete]", { count: ids.length, totalDeleted });
    return res.json({ status: "success", count: ids.length, deletedCount: totalDeleted });
  } catch (err) {
    console.error("[POST /api/history/batch-delete] Error:", err);
    return res.status(500).json({ error: "Failed to batch delete history entries" });
  }
});
router13.post("/history/batch-edit", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { ids, targetLanguage, primaryTag, tags, tagMode = "replace" } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Missing or empty ids array" });
  }
  try {
    const db = getDbConnection(userId);
    db.transaction(() => {
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = db.prepare(`SELECT id, lessonId, tags, primaryTag, targetLanguage FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).all(userId, ...chunk);
        for (const row of rows) {
          const nextLang = targetLanguage !== void 0 ? targetLanguage : row.targetLanguage;
          const nextPrimaryTag = primaryTag !== void 0 ? primaryTag && typeof primaryTag === "string" && primaryTag.trim() ? primaryTag.trim() : null : row.primaryTag;
          let nextTagsList = [];
          if (tags !== void 0) {
            if (tagMode === "append") {
              let existingList = [];
              try {
                existingList = row.tags ? typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags : [];
              } catch (_) {
              }
              const seen = new Set(existingList.map((t) => t.toLowerCase()));
              nextTagsList = [...existingList];
              if (Array.isArray(tags)) {
                for (const t of tags) {
                  const clean = typeof t === "string" ? t.trim().replace(/^#+/, "").trim() : "";
                  if (clean && !seen.has(clean.toLowerCase())) {
                    seen.add(clean.toLowerCase());
                    nextTagsList.push(clean);
                  }
                }
              }
            } else {
              nextTagsList = Array.isArray(tags) ? tags.map((t) => typeof t === "string" ? t.trim().replace(/^#+/, "").trim() : "").filter(Boolean) : [];
            }
          } else {
            try {
              nextTagsList = row.tags ? typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags : [];
            } catch (_) {
            }
          }
          if (nextPrimaryTag && !nextTagsList.some((t) => t.toLowerCase() === nextPrimaryTag.toLowerCase())) {
            nextTagsList.unshift(nextPrimaryTag);
          }
          const nextTagsJson = JSON.stringify(nextTagsList);
          db.prepare(`
            UPDATE reading_history
            SET targetLanguage = ?, primaryTag = ?, tags = ?
            WHERE user_id = ? AND id = ?
          `).run(nextLang, nextPrimaryTag, nextTagsJson, userId, row.id);
          if (tags !== void 0 || primaryTag !== void 0 || targetLanguage !== void 0) {
            db.prepare("DELETE FROM item_tags WHERE user_id = ? AND item_id = ?").run(userId, row.id);
            for (const t of nextTagsList) {
              const tagName = t.trim();
              const isPrim = nextPrimaryTag && nextPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
              const tagId = `${userId}_${tagName.toLowerCase()}`;
              db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, tagName, null, nextLang || null, Date.now());
              db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, row.id, tagId, isPrim);
            }
          }
          if (row.lessonId && row.lessonId !== "custom" && row.lessonId !== "imported_record") {
            if (targetLanguage !== void 0 && (tags !== void 0 || primaryTag !== void 0)) {
              db.prepare("UPDATE lessons SET targetLanguage = ?, primaryTag = ?, tags = ? WHERE user_id = ? AND id = ?").run(nextLang, nextPrimaryTag, nextTagsJson, userId, row.lessonId);
            } else if (targetLanguage !== void 0) {
              db.prepare("UPDATE lessons SET targetLanguage = ? WHERE user_id = ? AND id = ?").run(nextLang, userId, row.lessonId);
            } else if (tags !== void 0 || primaryTag !== void 0) {
              db.prepare("UPDATE lessons SET primaryTag = ?, tags = ? WHERE user_id = ? AND id = ?").run(nextPrimaryTag, nextTagsJson, userId, row.lessonId);
            }
          }
        }
      }
    })();
    return res.json({ status: "success", count: ids.length });
  } catch (err) {
    console.error("[POST /api/history/batch-edit] Error:", err);
    return res.status(500).json({ error: "Failed to batch edit history entries" });
  }
});
router13.post("/history/assign-channel", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { lessonIds, historyIds, channelName, channelAvatarUrl, channelUrl } = req.body;
  if (!channelName || !Array.isArray(lessonIds) && !Array.isArray(historyIds)) {
    return res.status(400).json({ error: "Missing channelName or target IDs" });
  }
  try {
    const db = getDbConnection(userId);
    const trimmedName = String(channelName).trim();
    const avatar = channelAvatarUrl || null;
    const url = channelUrl || null;
    db.transaction(() => {
      if (Array.isArray(lessonIds) && lessonIds.length > 0) {
        const placeholders = lessonIds.map(() => "?").join(",");
        db.prepare(`
          UPDATE lessons SET
            channelName = ?,
            channelTitle = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND id IN (${placeholders})
        `).run(trimmedName, trimmedName, avatar, url, userId, ...lessonIds);
        db.prepare(`
          UPDATE reading_history SET
            channelName = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND lessonId IN (${placeholders})
        `).run(trimmedName, avatar, url, userId, ...lessonIds);
      }
      if (Array.isArray(historyIds) && historyIds.length > 0) {
        const placeholders = historyIds.map(() => "?").join(",");
        db.prepare(`
          UPDATE reading_history SET
            channelName = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND id IN (${placeholders})
        `).run(trimmedName, avatar, url, userId, ...historyIds);
      }
    })();
    return res.json({ status: "success", count: (lessonIds?.length || 0) + (historyIds?.length || 0) });
  } catch (err) {
    console.error("[POST /api/history/assign-channel] Error:", err);
    return res.status(500).json({ error: "Failed to assign channel in batch" });
  }
});
var getActivityHistoryHandler = (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447" });
  }
  try {
    const db = getDbConnection(userId);
    const lang = req.query.language || req.query.lang ? String(req.query.language || req.query.lang).toLowerCase().trim() : null;
    const query = "SELECT * FROM reading_history WHERE user_id = ? ORDER BY timestamp DESC";
    let rows = db.prepare(query).all(userId);
    if (lang && lang !== "all" && lang !== "overall") {
      rows = rows.filter((h) => matchLanguage(h.targetLanguage, lang));
    }
    const readerSettingsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId);
    let dailyGoalMinutes = 15;
    let dailyGoalsByLanguage = {};
    if (readerSettingsRow?.value) {
      try {
        const parsed = JSON.parse(readerSettingsRow.value);
        if (typeof parsed.dailyGoalMinutes === "number") dailyGoalMinutes = parsed.dailyGoalMinutes;
        if (parsed.dailyGoalsByLanguage && typeof parsed.dailyGoalsByLanguage === "object") {
          dailyGoalsByLanguage = parsed.dailyGoalsByLanguage;
        }
      } catch (_) {
      }
    }
    const langRows = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL").all();
    const customFlags = {};
    for (const row of langRows) {
      if (row.code && row.flag) {
        customFlags[row.code.toLowerCase().trim()] = row.flag;
      }
    }
    const userFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'studyLanguageFlags'").get(userId);
    if (userFlagsRow?.value) {
      try {
        const parsed = JSON.parse(userFlagsRow.value);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") customFlags[k.toLowerCase().trim()] = v;
          }
        }
      } catch (_) {
      }
    }
    const languageFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'languageFlags'").get(userId);
    if (languageFlagsRow?.value) {
      try {
        const parsed = JSON.parse(languageFlagsRow.value);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") customFlags[k.toLowerCase().trim()] = v;
          }
        }
      } catch (_) {
      }
    }
    return res.json({
      success: true,
      userGoals: {
        dailyGoalMinutes,
        dailyGoalsByLanguage
      },
      customFlags,
      history: rows.map((h) => ({
        id: h.id,
        lessonId: h.lessonId,
        lessonTitle: h.lessonTitle,
        lessonType: h.lessonType || "youtube",
        coverUrl: h.coverUrl || null,
        targetLanguage: h.targetLanguage || "en",
        timestamp: h.timestamp,
        actionType: h.actionType,
        status: h.status || "in_progress",
        durationSeconds: h.durationSeconds || 0,
        channelName: h.channelName || null,
        category: h.category || void 0,
        customTitle: h.customTitle || void 0
      }))
    });
  } catch (err) {
    console.error("[GET /api/history] Error:", err);
    return res.status(500).json({ error: "Failed to load history: " + err.message });
  }
};
router13.get("/history", getActivityHistoryHandler);
router13.get("/activity", getActivityHistoryHandler);
var getDayActivityHandler = (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447" });
  }
  const dateStr = req.query.date ? String(req.query.date).trim() : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const lang = req.query.language || req.query.lang ? String(req.query.language || req.query.lang).toLowerCase().trim() : null;
  const tzOffset = req.query.tzOffset !== void 0 ? Number(req.query.tzOffset) : null;
  try {
    const db = getDbConnection(userId);
    let prevDateStr = "";
    let nextDateStr = "";
    try {
      const parts = dateStr.split("-").map(Number);
      if (parts.length === 3) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        prevDateStr = new Date(d.getTime() - 864e5).toISOString().slice(0, 10);
        nextDateStr = new Date(d.getTime() + 864e5).toISOString().slice(0, 10);
      }
    } catch (_) {
    }
    let query = "SELECT * FROM reading_history WHERE user_id = ?";
    const params = [userId];
    if (prevDateStr && nextDateStr) {
      query += " AND (timestamp LIKE ? OR timestamp LIKE ? OR timestamp LIKE ?)";
      params.push(`${dateStr}%`, `${prevDateStr}%`, `${nextDateStr}%`);
    } else {
      query += " AND timestamp LIKE ?";
      params.push(`${dateStr}%`);
    }
    query += " ORDER BY timestamp DESC";
    const rows = db.prepare(query).all(...params);
    const flags = {
      en: "\u{1F1FA}\u{1F1F8}",
      es: "\u{1F1EA}\u{1F1F8}",
      pt: "\u{1F1F5}\u{1F1F9}",
      ru: "\u{1F1F7}\u{1F1FA}",
      uk: "\u{1F1FA}\u{1F1E6}",
      fr: "\u{1F1EB}\u{1F1F7}",
      de: "\u{1F1E9}\u{1F1EA}",
      it: "\u{1F1EE}\u{1F1F9}",
      zh: "\u{1F1E8}\u{1F1F3}",
      ja: "\u{1F1EF}\u{1F1F5}",
      ar: "\u{1F1F8}\u{1F1E6}",
      tr: "\u{1F1F9}\u{1F1F7}",
      pl: "\u{1F1F5}\u{1F1F1}",
      sv: "\u{1F1F8}\u{1F1EA}",
      nl: "\u{1F1F3}\u{1F1F1}",
      kk: "\u{1F1F0}\u{1F1FF}",
      ko: "\u{1F1F0}\u{1F1F7}",
      he: "\u{1F1EE}\u{1F1F1}",
      hi: "\u{1F1EE}\u{1F1F3}",
      fa: "\u{1F1EE}\u{1F1F7}",
      el: "\u{1F1EC}\u{1F1F7}"
    };
    const langAliasMap = {
      sp: "es",
      spa: "es",
      spanish: "es",
      esp: "es",
      eng: "en",
      english: "en",
      rus: "ru",
      russian: "ru",
      ger: "de",
      deu: "de",
      german: "de",
      deutsch: "de",
      fra: "fr",
      fre: "fr",
      french: "fr",
      por: "pt",
      portuguese: "pt",
      ita: "it",
      italian: "it",
      ukr: "uk",
      ukrainian: "uk",
      kaz: "kk",
      kazakh: "kk",
      chi: "zh",
      zho: "zh",
      chinese: "zh",
      jpn: "ja",
      japanese: "ja",
      kor: "ko",
      korean: "ko",
      tur: "tr",
      turkish: "tr",
      pol: "pl",
      polish: "pl",
      swe: "sv",
      swedish: "sv",
      dut: "nl",
      nld: "nl",
      dutch: "nl",
      ara: "ar",
      arabic: "ar"
    };
    const userFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'studyLanguageFlags'").get(userId);
    let userCustomFlags = {};
    if (userFlagsRow?.value) {
      try {
        userCustomFlags = JSON.parse(userFlagsRow.value);
      } catch (_) {
      }
    }
    const filteredRows = rows.filter((h) => {
      if (h.timestamp) {
        let itemDate = h.timestamp.slice(0, 10);
        if (tzOffset !== null && !isNaN(tzOffset)) {
          const tMs = new Date(h.timestamp).getTime();
          if (!isNaN(tMs)) {
            const localMs = tMs - tzOffset * 60 * 1e3;
            itemDate = new Date(localMs).toISOString().slice(0, 10);
          }
        }
        if (itemDate !== dateStr && !h.timestamp.startsWith(dateStr)) {
          return false;
        }
      }
      if (lang && lang !== "all" && lang !== "overall") {
        if (!matchLanguage(h.targetLanguage, lang)) {
          return false;
        }
      }
      return true;
    });
    const logs = filteredRows.map((h) => {
      const durSec = Number(h.durationSeconds) || 0;
      const rawLang = (h.targetLanguage || "en").toLowerCase().trim();
      const cleanLang = rawLang.replace(/[-_].*$/, "");
      const langCode = langAliasMap[rawLang] || langAliasMap[cleanLang] || cleanLang.slice(0, 2);
      const flag = userCustomFlags[langCode] || flags[langCode] || "\u{1F310}";
      const minutes = Math.max(1, Math.round(durSec / 60));
      const videoId = h.lessonId && h.lessonId.startsWith("youtube_") ? h.lessonId.replace("youtube_", "") : "";
      const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : h.sourceUrl || "";
      return {
        id: h.id,
        title: h.lessonTitle || h.customTitle || "Activity Record",
        minutes,
        durationSeconds: durSec,
        language: langCode,
        flag,
        channel: h.channelName || "Lectura",
        source: h.lessonType === "article" ? "Article" : h.lessonType === "podcast" ? "Podcast" : "YouTube",
        url,
        timestamp: h.timestamp
      };
    });
    return res.json({ success: true, date: dateStr, logs });
  } catch (err) {
    console.error("[GET /api/activity/day] Error:", err);
    return res.status(500).json({ error: "Failed to load day activity: " + err.message });
  }
};
router13.get("/activity/day", getDayActivityHandler);
router13.get("/history/day", getDayActivityHandler);
router13.delete("/activity/log/:id", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447" });
  }
  const { id } = req.params;
  try {
    const db = getDbConnection(userId);
    const result = db.prepare("DELETE FROM reading_history WHERE user_id = ? AND id = ?").run(userId, id);
    return res.json({ success: true, id, changes: result.changes });
  } catch (err) {
    console.error("[DELETE /api/activity/log/:id] Error:", err);
    return res.status(500).json({ error: "Failed to delete activity log: " + err.message });
  }
});
var history_default = router13;

// routes/lessons.ts
var import_express15 = require("express");
init_youtube();
var router14 = (0, import_express15.Router)();
router14.get("/", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }
  const {
    sourceType,
    type,
    lessonType,
    sortBy,
    sort,
    lang,
    targetLanguage,
    isArchived,
    limit,
    offset
  } = req.query;
  try {
    const db = getDbConnection(userId);
    let query = "SELECT * FROM lessons WHERE user_id = ? AND (length(trim(COALESCE(text, ''))) > 0 OR isBuiltIn = 1 OR (wordTimestamps IS NOT NULL AND length(wordTimestamps) > 2))";
    const params = [userId];
    const resolvedSource = sourceType || type || lessonType ? String(sourceType || type || lessonType).toLowerCase().trim() : null;
    if (resolvedSource && resolvedSource !== "all") {
      query += " AND (lower(sourceType) = ? OR lower(lessonType) = ?)";
      params.push(resolvedSource, resolvedSource);
    }
    if (isArchived !== void 0) {
      const arch = isArchived === "true" || isArchived === "1" ? 1 : 0;
      query += " AND COALESCE(isArchived, 0) = ?";
      params.push(arch);
    } else {
      query += " AND COALESCE(isArchived, 0) = 0";
    }
    const resolvedLang = lang || targetLanguage ? String(lang || targetLanguage).toLowerCase().trim() : null;
    if (resolvedLang && resolvedLang !== "all") {
      query += " AND lower(targetLanguage) = ?";
      params.push(resolvedLang);
    }
    const sortOption = String(sortBy || sort || "newest").toLowerCase().trim();
    if (sortOption === "short" || sortOption === "length_short") {
      if (resolvedSource === "youtube" || resolvedSource === "podcast") {
        query += " ORDER BY duration ASC, wordCount ASC";
      } else {
        query += " ORDER BY CASE WHEN COALESCE(duration, 0) > 0 THEN duration ELSE COALESCE(wordCount, 0) END ASC";
      }
    } else if (sortOption === "long" || sortOption === "length_long") {
      if (resolvedSource === "youtube" || resolvedSource === "podcast") {
        query += " ORDER BY duration DESC, wordCount DESC";
      } else {
        query += " ORDER BY CASE WHEN COALESCE(duration, 0) > 0 THEN duration ELSE COALESCE(wordCount, 0) END DESC";
      }
    } else if (sortOption === "title") {
      query += " ORDER BY title ASC";
    } else if (sortOption === "title_desc") {
      query += " ORDER BY title DESC";
    } else if (sortOption === "oldest") {
      query += " ORDER BY COALESCE(createdAt, rowid * 1000) ASC";
    } else {
      query += " ORDER BY COALESCE(createdAt, rowid * 1000) DESC";
    }
    if (limit) {
      query += " LIMIT ?";
      params.push(Number(limit));
      if (offset) {
        query += " OFFSET ?";
        params.push(Number(offset));
      }
    }
    const rows = db.prepare(query).all(...params);
    return res.json({ status: "ok", count: rows.length, lessons: rows });
  } catch (err) {
    console.error("[GET /api/lessons] Error:", err);
    return res.status(500).json({ error: "Failed to fetch lessons: " + err.message });
  }
});
router14.post("/:id/archive", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }
  const { id } = req.params;
  const isArchived = req.body.isArchived !== void 0 ? req.body.isArchived ? 1 : 0 : 1;
  try {
    const db = getDbConnection(userId);
    const result = db.prepare("UPDATE lessons SET isArchived = ? WHERE id = ? AND user_id = ?").run(isArchived, id, userId);
    return res.json({ status: "ok", id, isArchived: isArchived === 1, changes: result.changes });
  } catch (err) {
    console.error("[POST /api/lessons/:id/archive] Error:", err);
    return res.status(500).json({ error: "Failed to archive lesson: " + err.message });
  }
});
function handleBatchLessons(req, res) {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }
  const { lessonIds, action } = req.body;
  const payload = req.body.payload || {};
  const tag = req.body.tag ?? payload.tag;
  const primaryTag = req.body.primaryTag ?? payload.primaryTag;
  const isArchived = req.body.isArchived !== void 0 ? req.body.isArchived : payload.isArchived;
  const playlistId = req.body.playlistId !== void 0 ? req.body.playlistId : payload.playlistId;
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lessonIds must be a non-empty array" });
  }
  try {
    const db = getDbConnection(userId);
    const result = db.transaction(() => {
      let affected = 0;
      if (action === "addTag") {
        let cleanTag = String(tag || "").trim().replace(/^#+/, "").trim();
        if (!cleanTag) throw new Error("Tag name is required for addTag");
        cleanTag = cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);
        let existingTag = db.prepare("SELECT id FROM tags WHERE user_id = ? AND lower(name) = ?").get(userId, cleanTag.toLowerCase());
        let tagId = existingTag?.id;
        if (!tagId) {
          tagId = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, createdAt) VALUES (?, ?, ?, ?, ?)").run(
            tagId,
            userId,
            cleanTag,
            "#14B8A6",
            (/* @__PURE__ */ new Date()).toISOString()
          );
        }
        const getLesson = db.prepare("SELECT id, tags, primaryTag FROM lessons WHERE id = ? AND user_id = ?");
        const updateLesson = db.prepare("UPDATE lessons SET tags = ?, primaryTag = COALESCE(primaryTag, ?) WHERE id = ? AND user_id = ?");
        const insertItemTag = db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)");
        for (const id of lessonIds) {
          const row = getLesson.get(id, userId);
          if (!row) continue;
          let currentTags = [];
          if (row.tags) {
            try {
              currentTags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
              if (!Array.isArray(currentTags)) currentTags = [];
            } catch {
              currentTags = String(row.tags).split(",").map((t) => t.trim()).filter(Boolean);
            }
          }
          if (!currentTags.some((t) => t.toLowerCase() === cleanTag.toLowerCase())) {
            currentTags.push(cleanTag);
          }
          const hasPrimary = Boolean(row.primaryTag);
          updateLesson.run(JSON.stringify(currentTags), cleanTag, id, userId);
          insertItemTag.run(userId, id, tagId, hasPrimary ? 0 : 1);
          affected++;
        }
      } else if (action === "removeTag") {
        let cleanTag = String(tag || "").trim().replace(/^#+/, "").trim();
        if (!cleanTag) throw new Error("Tag name is required for removeTag");
        cleanTag = cleanTag.toLowerCase();
        const getLesson = db.prepare("SELECT id, tags, primaryTag FROM lessons WHERE id = ? AND user_id = ?");
        const updateLesson = db.prepare("UPDATE lessons SET tags = ?, primaryTag = ? WHERE id = ? AND user_id = ?");
        const deleteItemTag = db.prepare("DELETE FROM item_tags WHERE user_id = ? AND item_id = ? AND tag_id IN (SELECT id FROM tags WHERE user_id = ? AND lower(name) = ?)");
        for (const id of lessonIds) {
          const row = getLesson.get(id, userId);
          if (!row) continue;
          let currentTags = [];
          if (row.tags) {
            try {
              currentTags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
              if (!Array.isArray(currentTags)) currentTags = [];
            } catch {
              currentTags = String(row.tags).split(",").map((t) => t.trim()).filter(Boolean);
            }
          }
          const nextTags = currentTags.filter((t) => t.toLowerCase() !== cleanTag);
          let newPrimaryTag = row.primaryTag;
          if (row.primaryTag && row.primaryTag.toLowerCase() === cleanTag) {
            newPrimaryTag = nextTags.length > 0 ? nextTags[0] : null;
          }
          updateLesson.run(JSON.stringify(nextTags), newPrimaryTag, id, userId);
          deleteItemTag.run(userId, id, userId, cleanTag);
          affected++;
        }
      } else if (action === "setPrimaryTag") {
        let cleanTag = String(primaryTag || tag || "").trim().replace(/^#+/, "").trim();
        if (!cleanTag) throw new Error("Tag name is required for setPrimaryTag");
        cleanTag = cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);
        let existingTag = db.prepare("SELECT id FROM tags WHERE user_id = ? AND lower(name) = ?").get(userId, cleanTag.toLowerCase());
        let tagId = existingTag?.id;
        if (!tagId) {
          tagId = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, createdAt) VALUES (?, ?, ?, ?, ?)").run(
            tagId,
            userId,
            cleanTag,
            "#14B8A6",
            (/* @__PURE__ */ new Date()).toISOString()
          );
        }
        const getLesson = db.prepare("SELECT id, tags, primaryTag FROM lessons WHERE id = ? AND user_id = ?");
        const updateLesson = db.prepare("UPDATE lessons SET primaryTag = ?, tags = ? WHERE id = ? AND user_id = ?");
        const clearItemPrimary = db.prepare("UPDATE item_tags SET is_primary = 0 WHERE user_id = ? AND item_id = ?");
        const setItemPrimary = db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, 1)");
        for (const id of lessonIds) {
          const row = getLesson.get(id, userId);
          if (!row) continue;
          let currentTags = [];
          if (row.tags) {
            try {
              currentTags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
              if (!Array.isArray(currentTags)) currentTags = [];
            } catch {
              currentTags = String(row.tags).split(",").map((t) => t.trim()).filter(Boolean);
            }
          }
          if (!currentTags.some((t) => t.toLowerCase() === cleanTag.toLowerCase())) {
            currentTags.push(cleanTag);
          }
          updateLesson.run(cleanTag, JSON.stringify(currentTags), id, userId);
          clearItemPrimary.run(userId, id);
          setItemPrimary.run(userId, id, tagId);
          affected++;
        }
      } else if (action === "archive") {
        const arch = isArchived !== void 0 ? isArchived ? 1 : 0 : 1;
        const stmt = db.prepare("UPDATE lessons SET isArchived = ? WHERE id = ? AND user_id = ?");
        for (const id of lessonIds) {
          const res2 = stmt.run(arch, id, userId);
          if (res2.changes > 0) affected++;
        }
      } else if (action === "assignPlaylist") {
        const targetPlaylist = playlistId || null;
        const stmt = db.prepare("UPDATE lessons SET playlistId = ? WHERE id = ? AND user_id = ?");
        for (const id of lessonIds) {
          const res2 = stmt.run(targetPlaylist, id, userId);
          if (res2.changes > 0) affected++;
        }
        try {
          const allPlaylists = db.prepare("SELECT id, items FROM playlists WHERE user_id = ?").all(userId);
          const getLessonStmt = db.prepare("SELECT id, title, youtubeId, coverUrl, duration, text FROM lessons WHERE id = ? AND user_id = ?");
          for (const pl of allPlaylists) {
            let plItems = [];
            try {
              plItems = typeof pl.items === "string" ? JSON.parse(pl.items) : pl.items || [];
              if (!Array.isArray(plItems)) plItems = [];
            } catch {
              plItems = [];
            }
            let changed = false;
            let filteredItems = plItems;
            if (pl.id !== targetPlaylist) {
              const beforeLen = filteredItems.length;
              filteredItems = filteredItems.filter((it) => {
                if (lessonIds.includes(it.lessonId)) return false;
                for (const lid of lessonIds) {
                  const lRow = getLessonStmt.get(lid, userId);
                  if (lRow && lRow.youtubeId && it.videoId === lRow.youtubeId) return false;
                }
                return true;
              });
              if (filteredItems.length !== beforeLen) changed = true;
            } else {
              for (const id of lessonIds) {
                const lRow = getLessonStmt.get(id, userId);
                if (lRow) {
                  const existingIdx = filteredItems.findIndex(
                    (it) => it.lessonId && it.lessonId === lRow.id || lRow.youtubeId && it.videoId && it.videoId === lRow.youtubeId
                  );
                  const itemPayload = {
                    lessonId: lRow.id,
                    title: lRow.title,
                    videoId: lRow.youtubeId || null,
                    durationSeconds: lRow.duration || 0,
                    thumbnailUrl: lRow.coverUrl || "",
                    transcriptLoaded: !!(lRow.text && lRow.text.length > 20)
                  };
                  if (existingIdx !== -1) {
                    filteredItems[existingIdx] = {
                      ...filteredItems[existingIdx],
                      ...itemPayload
                    };
                    changed = true;
                  } else {
                    filteredItems.push({
                      id: `item_${lRow.id}_${Date.now()}`,
                      ...itemPayload
                    });
                    changed = true;
                  }
                }
              }
            }
            const seen = /* @__PURE__ */ new Set();
            const deduped = [];
            for (const it of filteredItems) {
              const key = it.videoId || it.lessonId || it.id;
              if (key && seen.has(key)) {
                changed = true;
                continue;
              }
              if (key) seen.add(key);
              deduped.push(it);
            }
            if (changed) {
              db.prepare("UPDATE playlists SET items = ?, itemCount = ?, updatedAt = ? WHERE id = ? AND user_id = ?").run(
                JSON.stringify(deduped),
                deduped.length,
                (/* @__PURE__ */ new Date()).toISOString(),
                pl.id,
                userId
              );
            }
          }
        } catch (e) {
          console.error("Error syncing playlist items in batch:", e);
        }
      } else {
        throw new Error(`Unknown batch action: ${action}`);
      }
      return affected;
    })();
    return res.json({ status: "ok", action, affectedCount: result });
  } catch (err) {
    console.error("[POST /api/lessons/batch] Error:", err);
    return res.status(500).json({ error: "Failed to perform batch update: " + err.message });
  }
}
router14.post("/batch", handleBatchLessons);
router14.post("/", async (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const {
    id,
    title,
    text,
    content,
    targetLanguage,
    language,
    translationLanguage,
    sourceUrl,
    coverUrl,
    lessonType,
    author,
    channelTitle,
    channelName: bodyChannelName,
    channelAvatarUrl: bodyChannelAvatarUrl,
    youtubeId: bodyYoutubeId,
    duration: bodyDuration,
    geminiApiKey
  } = req.body;
  const rawText = (text || content || "").trim();
  const targetLang = normalizeLang((targetLanguage || language || "es").trim());
  const transLang = normalizeLang((translationLanguage || "ru").trim());
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;
  const candidateUrl = String(sourceUrl || req.body.audioUrl || req.body.audio_url || "").trim();
  const ytMatch = candidateUrl.match(ytRegex);
  const extractedYoutubeId = (typeof bodyYoutubeId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(bodyYoutubeId.trim()) ? bodyYoutubeId.trim() : null) || (ytMatch ? ytMatch[1] : null);
  let cleanTitle = (title || "Imported Article").replace(/<[^>]+>/g, "").replace(/\s*-\s*YouTube$/i, "").trim();
  let finalText = "";
  let resolvedYoutubeId = extractedYoutubeId;
  let resolvedDuration = typeof bodyDuration === "number" && bodyDuration > 0 ? Math.round(bodyDuration) : null;
  let resolvedCoverUrl = coverUrl || null;
  let resolvedChannelName = author || channelTitle || bodyChannelName || null;
  let resolvedChannelAvatarUrl = bodyChannelAvatarUrl || null;
  if (resolvedYoutubeId) {
    const hasValidTimestampedSubtitles = /(?:^|\n)\d+(?:\.\d+)?s\t/m.test(rawText) && rawText.split(/\r?\n/).filter((l) => l.trim().length > 0).length >= 3;
    try {
      const ytData = await fetchYoutubeVideoAndSubtitles(
        resolvedYoutubeId,
        targetLang,
        geminiApiKey
      );
      if (ytData.title && (!cleanTitle || cleanTitle === "Imported Article" || cleanTitle === "YouTube")) {
        cleanTitle = ytData.title;
      }
      if (ytData.coverUrl && !resolvedCoverUrl) {
        resolvedCoverUrl = ytData.coverUrl;
      }
      if (ytData.youtubeDuration && !resolvedDuration) {
        resolvedDuration = ytData.youtubeDuration;
      }
      if (ytData.channelName && !resolvedChannelName) {
        resolvedChannelName = ytData.channelName;
      }
      if (ytData.channelAvatarUrl && !resolvedChannelAvatarUrl) {
        resolvedChannelAvatarUrl = ytData.channelAvatarUrl;
      }
      if (ytData.ok && ytData.text && !ytData.isFallback) {
        finalText = ytData.text.trim();
      } else if (hasValidTimestampedSubtitles) {
        finalText = rawText;
      } else if (ytData.text) {
        finalText = ytData.text.trim();
      } else {
        finalText = htmlToPlainText(rawText);
      }
    } catch (ytErr) {
      console.warn("[POST /api/lessons] Failed to fetch YouTube metadata/subtitles:", ytErr);
      finalText = hasValidTimestampedSubtitles ? rawText : htmlToPlainText(rawText);
    }
    if (!resolvedCoverUrl) {
      resolvedCoverUrl = `https://img.youtube.com/vi/${resolvedYoutubeId}/maxresdefault.jpg`;
    }
  } else {
    finalText = htmlToPlainText(rawText);
  }
  const isVideoOrAudio = Boolean(resolvedYoutubeId) || lessonType === "video" || lessonType === "podcast" || lessonType === "youtube";
  const incomingAudio = (req.body.audioUrl || req.body.audio_url || "").trim();
  const isMediaStream = incomingAudio && !resolvedYoutubeId && (/\.(mp3|m4a|wav|ogg|aac|flac|mp4|webm|m3u8)(\?.*)?$/i.test(incomingAudio) || incomingAudio.startsWith("/api/audio-files/"));
  const resolvedAudioUrl = isVideoOrAudio && isMediaStream ? incomingAudio : null;
  const type = resolvedYoutubeId ? "youtube" : resolvedAudioUrl || isVideoOrAudio ? lessonType || "video" : "article";
  if (!finalText) {
    return res.status(400).json({ error: "Lesson text/content is required" });
  }
  const plainWordsText = finalText.replace(/^\d+(?:\.\d+)?s\t/gm, " ");
  const wordCount = plainWordsText.trim().split(/\s+/).filter(Boolean).length;
  let difficulty = null;
  let difficultyExplanation = null;
  try {
    const analysis = analyzeTextComplexity(plainWordsText, targetLang);
    if (analysis) {
      difficulty = analysis.cefrOverall || null;
      difficultyExplanation = JSON.stringify({
        coverage: analysis.coverage,
        uniqueWords: analysis.uniqueWords,
        stats: analysis.stats
      });
    }
  } catch (_) {
  }
  try {
    const db = getDbConnection(userId);
    const now = Date.now();
    let lessonId = id || "";
    if (!lessonId && resolvedYoutubeId) {
      const existing = db.prepare(`
        SELECT id FROM lessons
        WHERE user_id = ? AND (
          youtubeId = ?
          OR (channelUrl IS NOT NULL AND channelUrl LIKE ?)
          OR (title = ? AND (lessonType = 'youtube' OR sourceType = 'youtube'))
        )
        ORDER BY createdAt DESC
        LIMIT 1
      `).get(userId, resolvedYoutubeId, `%${resolvedYoutubeId}%`, cleanTitle);
      if (existing?.id) {
        lessonId = existing.id;
      }
    }
    if (!lessonId) {
      lessonId = "ext_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
    }
    const canonicalSourceUrl = resolvedYoutubeId ? sourceUrl || `https://www.youtube.com/watch?v=${resolvedYoutubeId}` : sourceUrl || null;
    db.transaction(() => {
      db.prepare(`
        INSERT INTO lessons (
          id, user_id, title, text, audioUrl, youtubeId, duration, wordCount,
          difficulty, difficultyExplanation, targetLanguage, translationLanguage,
          isBuiltIn, isArchived, coverUrl, lessonType, pinned, createdAt,
          channelName, channelTitle, channelAvatarUrl, channelUrl, sourceType
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          title = excluded.title,
          text = excluded.text,
          audioUrl = excluded.audioUrl,
          youtubeId = COALESCE(excluded.youtubeId, lessons.youtubeId),
          duration = COALESCE(excluded.duration, lessons.duration),
          wordCount = excluded.wordCount,
          difficulty = COALESCE(excluded.difficulty, lessons.difficulty),
          difficultyExplanation = COALESCE(excluded.difficultyExplanation, lessons.difficultyExplanation),
          targetLanguage = excluded.targetLanguage,
          translationLanguage = excluded.translationLanguage,
          coverUrl = COALESCE(excluded.coverUrl, lessons.coverUrl),
          lessonType = excluded.lessonType,
          channelName = COALESCE(excluded.channelName, lessons.channelName),
          channelTitle = COALESCE(excluded.channelTitle, lessons.channelTitle),
          channelAvatarUrl = COALESCE(excluded.channelAvatarUrl, lessons.channelAvatarUrl),
          channelUrl = COALESCE(excluded.channelUrl, lessons.channelUrl),
          sourceType = excluded.sourceType
      `).run(
        lessonId,
        userId,
        cleanTitle,
        finalText,
        resolvedAudioUrl,
        resolvedYoutubeId,
        resolvedDuration,
        wordCount,
        difficulty,
        difficultyExplanation,
        targetLang,
        transLang,
        resolvedCoverUrl,
        type,
        now,
        resolvedChannelName,
        resolvedChannelName,
        resolvedChannelAvatarUrl,
        canonicalSourceUrl,
        type
      );
      const historyId = "hist_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
          timestamp, actionType, status, durationSeconds, channelTitle, channelUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'opened', 'reading', ?, ?, ?)
      `).run(
        historyId,
        userId,
        lessonId,
        cleanTitle,
        type,
        resolvedCoverUrl,
        targetLang,
        (/* @__PURE__ */ new Date()).toISOString(),
        resolvedDuration || 0,
        resolvedChannelName,
        canonicalSourceUrl
      );
    })();
    console.log(`[EXTENSION API] Imported lesson '${cleanTitle}' (${lessonId}, type=${type}, lang=${targetLang}, yt=${resolvedYoutubeId || "none"}) for user ${userId}`);
    return res.json({
      status: "success",
      id: lessonId,
      lesson: {
        id: lessonId,
        title: cleanTitle,
        text: finalText,
        targetLanguage: targetLang,
        translationLanguage: transLang,
        lessonType: type,
        sourceType: type,
        sourceUrl: canonicalSourceUrl,
        coverUrl: resolvedCoverUrl,
        audioUrl: resolvedAudioUrl,
        audioFile: null,
        youtubeId: resolvedYoutubeId,
        duration: resolvedDuration,
        wordCount,
        difficulty,
        difficultyExplanation,
        channelName: resolvedChannelName,
        channelTitle: resolvedChannelName,
        channelAvatarUrl: resolvedChannelAvatarUrl,
        channelUrl: canonicalSourceUrl,
        createdAt: now
      }
    });
  } catch (err) {
    console.error("[POST /api/lessons] Error importing lesson:", err);
    return res.status(500).json({ error: "Failed to save lesson: " + err.message });
  }
});
router14.get("/:id", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing lesson ID" });
  try {
    const db = getDbConnection(userId);
    const lesson = db.prepare("SELECT * FROM lessons WHERE id = ? AND user_id = ?").get(id, userId);
    if (!lesson) {
      const meta = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?").get(userId, `audio_progress_${id}`);
      if (meta?.value) {
        try {
          const parsed = JSON.parse(meta.value);
          return res.json({ id, audio_progress: parsed.progress ?? parsed.audioProgress, audioProgress: parsed.progress ?? parsed.audioProgress, ...parsed });
        } catch (_) {
        }
      }
      return res.status(404).json({ error: "Lesson not found" });
    }
    if (typeof lesson.wordTimestamps === "string") {
      try {
        lesson.wordTimestamps = JSON.parse(lesson.wordTimestamps);
      } catch (_) {
        lesson.wordTimestamps = null;
      }
    }
    if (typeof lesson.detectedPhrases === "string") {
      try {
        lesson.detectedPhrases = JSON.parse(lesson.detectedPhrases);
      } catch (_) {
        lesson.detectedPhrases = {};
      }
    }
    if (typeof lesson.images === "string") {
      try {
        lesson.images = JSON.parse(lesson.images);
      } catch (_) {
        lesson.images = void 0;
      }
    }
    if (typeof lesson.tags === "string") {
      try {
        lesson.tags = JSON.parse(lesson.tags);
      } catch (_) {
        lesson.tags = [];
      }
    }
    lesson.isBuiltIn = lesson.isBuiltIn === 1 || lesson.isBuiltIn === true;
    lesson.isArchived = lesson.isArchived === 1 || lesson.isArchived === true;
    lesson.pinned = lesson.pinned === 1 || lesson.pinned === true;
    return res.json(lesson);
  } catch (err) {
    console.error("[GET /api/lessons/:id] Error:", err);
    return res.status(500).json({ error: "Failed to get lesson" });
  }
});
var updateLessonHandler = (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    return res.status(401).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u044E\u0447 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
  }
  const { id } = req.params;
  const updates = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing lesson ID" });
  try {
    const db = getDbConnection(userId);
    const channelTitle = updates.channelTitle || updates.channelName || null;
    const channelAvatar = updates.channelAvatar || updates.channelAvatarUrl || null;
    const channelUrl = updates.channelUrl || null;
    const primaryTag = updates.primaryTag !== void 0 ? typeof updates.primaryTag === "string" ? updates.primaryTag.trim() : null : null;
    const tagsJson = updates.tags !== void 0 ? Array.isArray(updates.tags) && updates.tags.length > 0 ? JSON.stringify(updates.tags) : null : null;
    db.transaction(() => {
      db.prepare(`
        UPDATE lessons SET
          channelName = COALESCE(?, channelName),
          channelTitle = COALESCE(?, channelTitle),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          primaryTag = CASE WHEN ? IS NOT NULL THEN ? ELSE primaryTag END,
          tags = CASE WHEN ? IS NOT NULL THEN ? ELSE tags END
        WHERE user_id = ? AND id = ?
      `).run(
        channelTitle,
        channelTitle,
        channelAvatar,
        channelUrl,
        updates.primaryTag !== void 0 ? primaryTag : null,
        primaryTag,
        updates.tags !== void 0 ? tagsJson : null,
        tagsJson,
        userId,
        id
      );
      if (primaryTag || Array.isArray(updates.tags) && updates.tags.length > 0) {
        const insertTag = db.prepare(`
          INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertItemTag = db.prepare(`
          INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)
        `);
        if (primaryTag && typeof primaryTag === "string" && primaryTag.trim()) {
          const pTag = primaryTag.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          insertTag.run(tagId, userId, pTag, null, null, Date.now());
          insertItemTag.run(userId, id, tagId, 1);
        }
        if (Array.isArray(updates.tags)) {
          for (const t of updates.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = primaryTag && primaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            insertTag.run(tagId, userId, tagName, null, null, Date.now());
            insertItemTag.run(userId, id, tagId, isPrim);
          }
        }
      }
      const existingLesson = db.prepare("SELECT youtubeId FROM lessons WHERE user_id = ? AND id = ?").get(userId, id);
      const ytId = updates.youtubeId || existingLesson?.youtubeId || null;
      db.prepare(`
        UPDATE reading_history SET
          channelName = COALESCE(?, channelName),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          primaryTag = CASE WHEN ? IS NOT NULL THEN ? ELSE primaryTag END,
          tags = CASE WHEN ? IS NOT NULL THEN ? ELSE tags END
        WHERE user_id = ? AND (
          lessonId = ? 
          OR (? IS NOT NULL AND (
            lessonId = ? 
            OR lessonId = ('lesson-yt_' || ?) 
            OR lessonId = ('youtube_' || ?) 
            OR coverUrl LIKE ('%' || ? || '%')
          ))
        )
      `).run(
        channelTitle,
        channelAvatar,
        channelUrl,
        updates.primaryTag !== void 0 ? primaryTag : null,
        primaryTag,
        updates.tags !== void 0 ? tagsJson : null,
        tagsJson,
        userId,
        id,
        ytId,
        ytId,
        ytId,
        ytId,
        ytId
      );
    })();
    console.log(`[SAVED TO DB] Lesson ${id} updated with channel: ${channelTitle}`);
    return res.json({ status: "success", id, channelTitle, channelAvatar, channelUrl });
  } catch (err) {
    console.error("[PATCH /api/lessons/:id] Error:", err);
    return res.status(500).json({ error: "Failed to update lesson on server" });
  }
};
router14.patch("/:id", updateLessonHandler);
router14.put("/:id", updateLessonHandler);
router14.patch("/:id/progress", (req, res) => {
  let userId;
  try {
    userId = resolveUserId(req);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." });
    }
    userId = "default";
  }
  const { id } = req.params;
  const { progress, audioProgress, progressPercent, lastSentenceIndex, status, clientUpdatedAt, updatedAt } = req.body || {};
  const incomingProgress = Number(progress !== void 0 ? progress : audioProgress) || 0;
  const incomingTime = Number(clientUpdatedAt || updatedAt) || Date.now();
  if (!id) return res.status(400).json({ error: "Missing lesson ID" });
  try {
    const db = getDbConnection(userId);
    const current = db.prepare("SELECT audio_progress_updated_at FROM lessons WHERE id = ? AND user_id = ?").get(id, userId);
    if (current?.audio_progress_updated_at && current.audio_progress_updated_at > incomingTime) {
      return res.json({ success: false, reason: "Stale update ignored" });
    }
    try {
      db.prepare(`
        UPDATE lessons 
        SET audio_progress = ?, audio_progress_updated_at = ? 
        WHERE id = ? AND user_id = ?
      `).run(incomingProgress, incomingTime, id, userId);
    } catch (_) {
    }
    const metaPayload = JSON.stringify({
      progress: incomingProgress,
      audioProgress: incomingProgress,
      progressPercent: typeof progressPercent === "number" ? progressPercent : void 0,
      lastSentenceIndex: typeof lastSentenceIndex === "number" ? lastSentenceIndex : void 0,
      status: typeof status === "string" ? status : void 0,
      updatedAt: incomingTime
    });
    db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)").run(userId, `audio_progress_${id}`, metaPayload);
    return res.json({
      success: true,
      audio_progress: incomingProgress,
      audioProgress: incomingProgress,
      audio_progress_updated_at: incomingTime
    });
  } catch (err) {
    console.error("[PATCH /api/lessons/:id/progress] Error:", err);
    return res.status(500).json({ error: "Failed to update audio progress: " + (err.message || String(err)) });
  }
});
var lessons_default = router14;

// routes/system.ts
var import_express16 = require("express");

// server/updaterService.ts
var import_fs14 = __toESM(require("fs"), 1);
var import_os4 = __toESM(require("os"), 1);
var import_path14 = __toESM(require("path"), 1);
var import_stream = require("stream");
var import_promises2 = require("stream/promises");
var import_child_process5 = require("child_process");
var import_util3 = require("util");
var import_adm_zip2 = __toESM(require("adm-zip"), 1);

// src/version.ts
var APP_VERSION = "v1.0.41";

// server/updaterService.ts
var execAsync = (0, import_util3.promisify)(import_child_process5.exec);
var GITHUB_REPO = "rustams1990/Lectura";
var RAW_PACKAGE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json`;
var RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
var COMMITS_URL = `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&per_page=8`;
var MAIN_ZIP_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;
var DATA_DIR10 = process.env.DATA_DIR || process.cwd();
var BACKUPS_DIR = import_path14.default.join(DATA_DIR10, "backups");
var LAST_VERSION_FILE = import_path14.default.join(DATA_DIR10, ".last_run_version");
var cachedCheckResult = null;
var CHECK_CACHE_TTL_MS = 5 * 60 * 1e3;
var updateProgress = {
  status: "idle",
  progress: 0,
  stepKey: "idle",
  message: ""
};
function compareSemver(a, b) {
  const cleanA = String(a || "").replace(/^v/i, "").trim();
  const cleanB = String(b || "").replace(/^v/i, "").trim();
  const pa = cleanA.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = cleanB.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
function getLiveServerVersion() {
  if (process.env.NODE_ENV === "production") {
    return APP_VERSION;
  }
  try {
    const pkgPath = import_path14.default.join(process.cwd(), "package.json");
    if (import_fs14.default.existsSync(pkgPath)) {
      const pkg = JSON.parse(import_fs14.default.readFileSync(pkgPath, "utf8"));
      if (pkg.version) {
        return `v${String(pkg.version).replace(/^v/i, "")}`;
      }
    }
  } catch (_) {
  }
  return APP_VERSION;
}
function getSystemEnvironment() {
  const isDocker = import_fs14.default.existsSync("/.dockerenv") || process.env.IS_DOCKER === "true";
  const hasGit = import_fs14.default.existsSync(import_path14.default.join(process.cwd(), ".git"));
  return {
    isDocker,
    hasGit,
    platform: process.platform,
    canOneClickUpdate: true
  };
}
function formatTimestamp(d = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
async function createSqliteSnapshotBackup(reasonLabel = "pre_update") {
  try {
    if (!import_fs14.default.existsSync(SQLITE_DB_PATH)) {
      return null;
    }
    if (!import_fs14.default.existsSync(BACKUPS_DIR)) {
      import_fs14.default.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const safeReason = reasonLabel.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `db_backup_${safeReason}_${formatTimestamp()}.sqlite`;
    const destPath = import_path14.default.join(BACKUPS_DIR, filename);
    try {
      const db = getDbConnection("default");
      await db.backup(destPath);
    } catch (backupApiErr) {
      import_fs14.default.copyFileSync(SQLITE_DB_PATH, destPath);
    }
    console.log(`[Updater] Created mandatory SQLite backup: ${destPath}`);
    const rootBackups = import_path14.default.join(process.cwd(), "backups");
    if (import_path14.default.resolve(rootBackups) !== import_path14.default.resolve(BACKUPS_DIR)) {
      try {
        if (!import_fs14.default.existsSync(rootBackups)) {
          import_fs14.default.mkdirSync(rootBackups, { recursive: true });
        }
        import_fs14.default.copyFileSync(destPath, import_path14.default.join(rootBackups, filename));
      } catch (_) {
      }
    }
    await pruneSqliteSnapshots(BACKUPS_DIR, 7);
    if (import_path14.default.resolve(rootBackups) !== import_path14.default.resolve(BACKUPS_DIR) && import_fs14.default.existsSync(rootBackups)) {
      await pruneSqliteSnapshots(rootBackups, 7);
    }
    try {
      const db = getDbConnection("default");
      const users = db.prepare("SELECT id FROM server_users").all();
      const userIds = users.map((u) => u.id);
      if (!userIds.includes("default")) userIds.push("default");
      for (const uid of userIds) {
        try {
          await createBackup(uid, "auto");
        } catch (_) {
        }
      }
    } catch (_) {
    }
    return destPath;
  } catch (err) {
    console.error("[Updater] Failed to create SQLite backup:", err);
    throw err;
  }
}
async function pruneSqliteSnapshots(dir, maxKeep) {
  try {
    const files = await import_fs14.default.promises.readdir(dir);
    const sqliteFiles = [];
    for (const f of files) {
      if (f.startsWith("db_backup_") && f.endsWith(".sqlite")) {
        const fullPath = import_path14.default.join(dir, f);
        try {
          const st = await import_fs14.default.promises.stat(fullPath);
          sqliteFiles.push({ name: f, fullPath, mtime: st.mtimeMs });
        } catch (_) {
        }
      }
    }
    sqliteFiles.sort((a, b) => b.mtime - a.mtime);
    if (sqliteFiles.length > maxKeep) {
      for (const oldFile of sqliteFiles.slice(maxKeep)) {
        try {
          await import_fs14.default.promises.unlink(oldFile.fullPath);
        } catch (_) {
        }
      }
    }
  } catch (_) {
  }
}
async function ensureStartupVersionCheckAndBackup() {
  try {
    const currentVersion = getLiveServerVersion();
    const versionTsPath = import_path14.default.join(process.cwd(), "src", "version.ts");
    if (import_fs14.default.existsSync(import_path14.default.dirname(versionTsPath))) {
      const expectedContent = `export const APP_VERSION = "${currentVersion}";
`;
      const existingContent = import_fs14.default.existsSync(versionTsPath) ? import_fs14.default.readFileSync(versionTsPath, "utf8") : "";
      if (existingContent !== expectedContent) {
        try {
          import_fs14.default.writeFileSync(versionTsPath, expectedContent, "utf8");
        } catch (_) {
        }
      }
    }
    let lastVersion = "";
    if (import_fs14.default.existsSync(LAST_VERSION_FILE)) {
      lastVersion = import_fs14.default.readFileSync(LAST_VERSION_FILE, "utf8").trim();
    }
    if (lastVersion && lastVersion !== currentVersion) {
      console.log(`[Updater] Version transition detected (${lastVersion} -> ${currentVersion}). Creating safety DB backup...`);
      await createSqliteSnapshotBackup(`upgrade_from_${lastVersion}_to_${currentVersion}`);
    } else if (!lastVersion && import_fs14.default.existsSync(SQLITE_DB_PATH)) {
      await createSqliteSnapshotBackup(`init_${currentVersion}`);
    }
    import_fs14.default.writeFileSync(LAST_VERSION_FILE, currentVersion, "utf8");
  } catch (err) {
    console.warn("[Updater] Startup version check warning:", err);
  }
}
async function checkSystemUpdate(force = false) {
  const currentVersion = getLiveServerVersion();
  const environment = getSystemEnvironment();
  if (!force && cachedCheckResult && Date.now() - cachedCheckResult.timestamp < CHECK_CACHE_TTL_MS) {
    const cached = cachedCheckResult.data;
    const isNewer = compareSemver(cached.latestVersion, currentVersion) > 0;
    return {
      ...cached,
      currentVersion,
      hasUpdate: isNewer,
      environment
    };
  }
  let latestVersion = currentVersion;
  let releaseName = currentVersion;
  let releaseBody = "";
  let publishedAt = (/* @__PURE__ */ new Date()).toISOString();
  let htmlUrl = `https://github.com/${GITHUB_REPO}`;
  let apkDownloadUrl;
  let apkSize;
  try {
    const pkgRes = await fetch(`${RAW_PACKAGE_URL}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" }
    });
    if (pkgRes.ok) {
      const pkgData = await pkgRes.json();
      if (pkgData?.version) {
        const mainVer = `v${String(pkgData.version).replace(/^v/i, "").trim()}`;
        if (compareSemver(mainVer, latestVersion) > 0) {
          latestVersion = mainVer;
          releaseName = `Lectura ${mainVer}`;
        }
      }
    }
  } catch (_) {
  }
  try {
    const relRes = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Lectura-Updater"
      }
    });
    if (relRes.ok) {
      const relData = await relRes.json();
      const relTag = String(relData?.tag_name || "").trim();
      if (relTag) {
        const normalizedTag = `v${relTag.replace(/^v/i, "")}`;
        if (compareSemver(normalizedTag, latestVersion) >= 0) {
          latestVersion = normalizedTag;
          releaseName = relData.name || `Lectura ${normalizedTag}`;
          releaseBody = relData.body || "";
          publishedAt = relData.published_at || publishedAt;
          htmlUrl = relData.html_url || htmlUrl;
        }
        if (Array.isArray(relData.assets)) {
          const apkAsset = relData.assets.find(
            (a) => a.name && (a.name.endsWith(".apk") || a.content_type === "application/vnd.android.package-archive")
          );
          if (apkAsset) {
            apkDownloadUrl = apkAsset.browser_download_url;
            apkSize = apkAsset.size;
          }
        }
      }
    }
  } catch (_) {
  }
  if (!releaseBody) {
    try {
      const commitsRes = await fetch(COMMITS_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Lectura-Updater"
        }
      });
      if (commitsRes.ok) {
        const commitsData = await commitsRes.json();
        if (Array.isArray(commitsData) && commitsData.length > 0) {
          publishedAt = commitsData[0]?.commit?.committer?.date || publishedAt;
          htmlUrl = `https://github.com/${GITHUB_REPO}/commits/main`;
          const lines = [];
          for (const c of commitsData) {
            const firstLine = String(c?.commit?.message || "").split("\n")[0].trim();
            if (firstLine && !firstLine.toLowerCase().startsWith("merge ")) {
              lines.push(`\u2022 ${firstLine}`);
            }
            if (lines.length >= 6) break;
          }
          if (lines.length > 0) {
            releaseBody = lines.join("\n");
          }
        }
      }
    } catch (_) {
    }
  }
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
  const result = {
    currentVersion,
    latestVersion,
    tag_name: latestVersion,
    name: releaseName,
    body: releaseBody || "Performance improvements and bug fixes.",
    published_at: publishedAt,
    html_url: htmlUrl,
    apkDownloadUrl,
    apkSize,
    hasUpdate,
    environment
  };
  cachedCheckResult = {
    data: result,
    timestamp: Date.now()
  };
  return result;
}
function getUpdateProgress() {
  return updateProgress;
}
var PROTECTED_RELATIVE_PATHS = /* @__PURE__ */ new Set([
  ".env",
  ".last_run_version",
  "local_server_db.sqlite",
  "local_server_db.sqlite-shm",
  "local_server_db.sqlite-wal",
  "ai_cache.sqlite",
  "ai_cache.sqlite-shm",
  "ai_cache.sqlite-wal",
  "lectura.db"
]);
var PROTECTED_DIR_PREFIXES = [
  "backups/",
  "data/",
  "media/",
  "audio_files/",
  "audio_cache/",
  "image_cache/",
  "node_modules/",
  ".git/"
];
function isProtectedPath(relPath) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return true;
  if (PROTECTED_RELATIVE_PATHS.has(normalized)) return true;
  for (const prefix of PROTECTED_DIR_PREFIXES) {
    if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
async function downloadChangedFilesViaCompareApi(baseTag, holdEntryFilesForDevWatch) {
  const cleanBase = baseTag.startsWith("v") ? baseTag : `v${baseTag}`;
  const compareUrl = `https://api.github.com/repos/${GITHUB_REPO}/compare/${cleanBase}...main`;
  const res = await fetch(compareUrl, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Lectura-Updater"
    },
    signal: AbortSignal.timeout(15e3)
  });
  if (!res.ok) {
    throw new Error(`Compare API returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const files = Array.isArray(data?.files) ? data.files : [];
  if (files.length === 0 || files.length > 150) {
    throw new Error(`Compare API returned ${files.length} files (fallback to archive)`);
  }
  const rootDir = process.cwd();
  const deferredFiles = [];
  let hasDistServer = false;
  let hasDistIndex = false;
  for (const f of files) {
    const relPath = String(f.filename || "").replace(/^\/+/, "");
    if (!relPath || isProtectedPath(relPath)) continue;
    if (f.status === "removed") {
      const targetPath = import_path14.default.join(rootDir, relPath);
      if (import_fs14.default.existsSync(targetPath)) {
        try {
          import_fs14.default.unlinkSync(targetPath);
        } catch (_) {
        }
      }
      continue;
    }
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${relPath}?t=${Date.now()}`;
    const fileRes = await fetch(rawUrl, {
      headers: { "User-Agent": "Lectura-Updater", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(3e4)
    });
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch ${relPath} (HTTP ${fileRes.status})`);
    }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const fullPath = import_path14.default.join(rootDir, relPath);
    if (relPath === "dist/server.cjs") hasDistServer = true;
    if (relPath === "dist/index.html") hasDistIndex = true;
    if (holdEntryFilesForDevWatch && (relPath === "server.ts" || relPath === "src/version.ts")) {
      deferredFiles.push({ fullPath, content: buf });
      continue;
    }
    const parentDir = import_path14.default.dirname(fullPath);
    if (!import_fs14.default.existsSync(parentDir)) {
      import_fs14.default.mkdirSync(parentDir, { recursive: true });
    }
    import_fs14.default.writeFileSync(fullPath, buf);
  }
  const distReady = hasDistServer && hasDistIndex || import_fs14.default.existsSync(import_path14.default.join(rootDir, "dist", "server.cjs")) && import_fs14.default.existsSync(import_path14.default.join(rootDir, "dist", "index.html"));
  return {
    ok: true,
    deferredFiles,
    extractedPrebuiltDist: distReady
  };
}
async function downloadAndExtractGitHubZip(holdEntryFilesForDevWatch) {
  const tmpZipPath = import_path14.default.join(import_os4.default.tmpdir(), `lectura_update_${Date.now()}.zip`);
  try {
    const res = await fetch(MAIN_ZIP_URL, {
      headers: { "User-Agent": "Lectura-Updater" },
      signal: AbortSignal.timeout(9e4)
    });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download update archive from GitHub (HTTP ${res.status})`);
    }
    const fileStream = import_fs14.default.createWriteStream(tmpZipPath);
    await (0, import_promises2.pipeline)(import_stream.Readable.fromWeb(res.body), fileStream);
    const zip = new import_adm_zip2.default(tmpZipPath);
    const entries = zip.getEntries();
    const deferredFiles = [];
    let newPackageJson = null;
    let hasDistServer = false;
    let hasDistIndex = false;
    const rootDir = process.cwd();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.split("/");
      if (parts.length < 2) continue;
      const relPath = parts.slice(1).join("/");
      if (relPath === "dist/server.cjs") hasDistServer = true;
      if (relPath === "dist/index.html") hasDistIndex = true;
    }
    if (hasDistServer && hasDistIndex) {
      const distAssetsDir = import_path14.default.join(rootDir, "dist", "assets");
      if (import_fs14.default.existsSync(distAssetsDir)) {
        try {
          import_fs14.default.rmSync(distAssetsDir, { recursive: true, force: true });
        } catch (_) {
        }
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.split("/");
      if (parts.length < 2) continue;
      const relPath = parts.slice(1).join("/");
      if (!relPath || isProtectedPath(relPath)) continue;
      const fullPath = import_path14.default.join(rootDir, relPath);
      const data = entry.getData();
      if (relPath === "package.json") {
        try {
          newPackageJson = JSON.parse(data.toString("utf8"));
        } catch (_) {
        }
      }
      if (holdEntryFilesForDevWatch && (relPath === "server.ts" || relPath === "src/version.ts")) {
        deferredFiles.push({ fullPath, content: data });
        continue;
      }
      const parentDir = import_path14.default.dirname(fullPath);
      if (!import_fs14.default.existsSync(parentDir)) {
        import_fs14.default.mkdirSync(parentDir, { recursive: true });
      }
      import_fs14.default.writeFileSync(fullPath, data);
    }
    return {
      deferredFiles,
      newPackageJson,
      extractedPrebuiltDist: hasDistServer && hasDistIndex
    };
  } finally {
    try {
      if (import_fs14.default.existsSync(tmpZipPath)) {
        import_fs14.default.unlinkSync(tmpZipPath);
      }
    } catch (_) {
    }
  }
}
async function startSystemUpdate() {
  if (updateProgress.status !== "idle" && updateProgress.status !== "error" && updateProgress.status !== "completed") {
    return { started: false, message: "Update is already in progress" };
  }
  const check = await checkSystemUpdate(true);
  const targetVersion = check.latestVersion;
  updateProgress = {
    status: "backup",
    progress: 15,
    stepKey: "backup",
    message: "Creating mandatory database backup...",
    targetVersion,
    startedAt: Date.now()
  };
  (async () => {
    try {
      const rootDir = process.cwd();
      const isProd = process.env.NODE_ENV === "production";
      const isDevWatch = !isProd;
      let oldDepsJson = "";
      try {
        const oldPkg = JSON.parse(import_fs14.default.readFileSync(import_path14.default.join(rootDir, "package.json"), "utf8"));
        oldDepsJson = JSON.stringify({
          d: oldPkg.dependencies || {},
          dev: oldPkg.devDependencies || {}
        });
      } catch (_) {
      }
      await createSqliteSnapshotBackup(`pre_update_to_${targetVersion}`);
      updateProgress = {
        ...updateProgress,
        status: "downloading",
        progress: 40,
        stepKey: "downloading",
        message: `Downloading Lectura ${targetVersion} from GitHub...`
      };
      let deferredFiles = [];
      let usedGit = false;
      let hasPrebuiltDist = false;
      if (import_fs14.default.existsSync(import_path14.default.join(rootDir, ".git")) && !isDevWatch) {
        try {
          await execAsync("git fetch origin main", { cwd: rootDir, timeout: 45e3 });
          await execAsync("git reset --hard origin/main", { cwd: rootDir, timeout: 3e4 });
          usedGit = true;
          hasPrebuiltDist = import_fs14.default.existsSync(import_path14.default.join(rootDir, "dist", "server.cjs")) && import_fs14.default.existsSync(import_path14.default.join(rootDir, "dist", "index.html"));
        } catch (gitErr) {
          console.warn("[Updater] Git update fallback to ZIP archive:", gitErr);
        }
      }
      if (!usedGit) {
        try {
          const currentVer = getLiveServerVersion();
          const fastResult = await downloadChangedFilesViaCompareApi(currentVer, isDevWatch);
          deferredFiles = fastResult.deferredFiles;
          hasPrebuiltDist = fastResult.extractedPrebuiltDist;
          console.log(`[Updater] Fast delta update from ${currentVer} completed via GitHub Compare API.`);
        } catch (deltaErr) {
          console.warn("[Updater] Delta update fallback to full archive:", deltaErr?.message || deltaErr);
          const zipResult = await downloadAndExtractGitHubZip(isDevWatch);
          deferredFiles = zipResult.deferredFiles;
          hasPrebuiltDist = zipResult.extractedPrebuiltDist;
        }
      }
      let newDepsJson = "";
      let newVersionClean = targetVersion.replace(/^v/i, "");
      try {
        const newPkg = JSON.parse(import_fs14.default.readFileSync(import_path14.default.join(rootDir, "package.json"), "utf8"));
        if (newPkg.version) newVersionClean = String(newPkg.version).replace(/^v/i, "");
        newDepsJson = JSON.stringify({
          d: newPkg.dependencies || {},
          dev: newPkg.devDependencies || {}
        });
      } catch (_) {
      }
      const depsChanged = oldDepsJson !== newDepsJson;
      if (depsChanged) {
        updateProgress = {
          ...updateProgress,
          status: "installing",
          progress: 65,
          stepKey: "installing",
          message: "Updating npm packages..."
        };
        await execAsync("npm install --no-audit --no-fund", {
          cwd: rootDir,
          timeout: 5 * 60 * 1e3,
          env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" }
        });
      }
      const finalVersionTag = `v${newVersionClean}`;
      const versionTsContent = `export const APP_VERSION = "${finalVersionTag}";
`;
      const versionTsPath = import_path14.default.join(rootDir, "src", "version.ts");
      if (isProd) {
        if (!import_fs14.default.existsSync(import_path14.default.dirname(versionTsPath))) {
          import_fs14.default.mkdirSync(import_path14.default.dirname(versionTsPath), { recursive: true });
        }
        import_fs14.default.writeFileSync(versionTsPath, versionTsContent, "utf8");
        if (!hasPrebuiltDist) {
          updateProgress = {
            ...updateProgress,
            status: "building",
            progress: 80,
            stepKey: "building",
            message: "Building updated application bundle..."
          };
          await execAsync("npm run build", {
            cwd: rootDir,
            timeout: 5 * 60 * 1e3,
            env: {
              ...process.env,
              NODE_ENV: "development",
              NODE_OPTIONS: "--max-old-space-size=1024"
            }
          });
        }
      }
      try {
        import_fs14.default.writeFileSync(LAST_VERSION_FILE, finalVersionTag, "utf8");
      } catch (_) {
      }
      cachedCheckResult = null;
      updateProgress = {
        ...updateProgress,
        status: "restarting",
        progress: 95,
        stepKey: "restarting",
        message: `Restarting server with ${finalVersionTag}...`,
        targetVersion: finalVersionTag
      };
      setTimeout(async () => {
        try {
          if (isDevWatch) {
            if (import_fs14.default.existsSync(import_path14.default.join(rootDir, ".git"))) {
              try {
                await execAsync("git fetch origin main", { cwd: rootDir, timeout: 15e3 });
                await execAsync("git reset --soft origin/main", { cwd: rootDir, timeout: 15e3 });
              } catch (_) {
              }
            }
            for (const item of deferredFiles) {
              const dir = import_path14.default.dirname(item.fullPath);
              if (!import_fs14.default.existsSync(dir)) import_fs14.default.mkdirSync(dir, { recursive: true });
              import_fs14.default.writeFileSync(item.fullPath, item.content);
            }
            import_fs14.default.writeFileSync(versionTsPath, versionTsContent, "utf8");
            const serverTsPath = import_path14.default.join(rootDir, "server.ts");
            if (import_fs14.default.existsSync(serverTsPath)) {
              const now = /* @__PURE__ */ new Date();
              import_fs14.default.utimesSync(serverTsPath, now, now);
            }
            updateProgress = {
              ...updateProgress,
              status: "completed",
              progress: 100,
              stepKey: "completed",
              message: `Updated to ${finalVersionTag}`
            };
          } else {
            console.log(`[Updater] Update to ${finalVersionTag} complete. Exiting process for automatic restart...`);
            process.exit(0);
          }
        } catch (restartErr) {
          console.error("[Updater] Restart step error:", restartErr);
        }
      }, 1200);
    } catch (err) {
      console.error("[Updater] Update failed:", err);
      updateProgress = {
        status: "error",
        progress: 0,
        stepKey: "error",
        message: err?.message || "Update failed",
        error: err?.message || String(err)
      };
    }
  })();
  return { started: true, message: "Update started" };
}

// routes/system.ts
var router15 = (0, import_express16.Router)();
router15.get("/system/update-check", async (req, res) => {
  try {
    const force = req.query.force === "true" || req.query.force === "1";
    const result = await checkSystemUpdate(force);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Failed to check for updates",
      currentVersion: getLiveServerVersion(),
      hasUpdate: false,
      environment: getSystemEnvironment()
    });
  }
});
router15.post("/system/update-apply", async (_req, res) => {
  try {
    const result = await startSystemUpdate();
    return res.json({
      status: result.started ? "started" : "busy",
      message: result.message,
      progress: getUpdateProgress()
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Failed to start update"
    });
  }
});
router15.get("/system/update-progress", (_req, res) => {
  return res.json({
    ...getUpdateProgress(),
    currentVersion: getLiveServerVersion()
  });
});
var system_default = router15;

// server/videoProcessor.ts
var import_path15 = __toESM(require("path"), 1);
var import_fs15 = __toESM(require("fs"), 1);
var import_child_process6 = require("child_process");
var import_util4 = __toESM(require("util"), 1);

// src/utils/subtitleParser.ts
function formatSecondsToTimestamp(seconds) {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor(totalSecs % 3600 / 60);
  const secs = totalSecs % 60;
  const pad = (n) => n < 10 ? `0${n}` : `${n}`;
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}
function parseTimecodeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const normalized = timeStr.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  } else {
    return parseFloat(parts[0]) || 0;
  }
}
function cleanSubtitleText(raw) {
  return raw.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").replace(/^[-–—]\s*/, "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
function parseSubtitleFile(rawContent) {
  if (!rawContent || !rawContent.trim()) {
    return { cues: [], text: "", duration: 0, cueCount: 0 };
  }
  const content = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawBlocks = content.split(/\n\s*\n/);
  const cues = [];
  const timeRegex = /(?:(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{2,3}))\s*-->\s*(?:(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{2,3}))/;
  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("WEBVTT") || trimmed.startsWith("NOTE") || trimmed.startsWith("STYLE")) {
      continue;
    }
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    let timeIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeIndex = i;
        break;
      }
    }
    if (timeIndex === -1) {
      continue;
    }
    const timeLine = lines[timeIndex];
    const match = timeLine.match(timeRegex);
    if (!match) continue;
    const parts = timeLine.split("-->");
    const startStr = parts[0].trim();
    const endRaw = parts[1].trim().split(/\s+/)[0];
    const startSec = parseTimecodeToSeconds(startStr);
    const endSec = parseTimecodeToSeconds(endRaw);
    const textLines2 = lines.slice(timeIndex + 1);
    const cleanText = cleanSubtitleText(textLines2.join(" "));
    if (!cleanText || /^\[.*\]$/.test(cleanText) || /^\(.*\)$/.test(cleanText) || /^[♪♫\s]+$/.test(cleanText)) {
      continue;
    }
    cues.push({
      start: startSec,
      end: endSec,
      text: cleanText
    });
  }
  cues.sort((a, b) => a.start - b.start);
  const cleanCues = [];
  for (let i = 0; i < cues.length; i++) {
    const curr = cues[i];
    if (cleanCues.length > 0) {
      const prev = cleanCues[cleanCues.length - 1];
      if (prev.text === curr.text && Math.abs(curr.start - prev.start) < 2) {
        prev.end = Math.max(prev.end, curr.end);
        continue;
      }
    }
    cleanCues.push(curr);
  }
  const textLines = cleanCues.map((cue) => `[${formatSecondsToTimestamp(cue.start)}] ${cue.text}`);
  const formattedText = textLines.join("\n\n");
  const duration = cleanCues.length > 0 ? Math.ceil(cleanCues[cleanCues.length - 1].end) : 0;
  return {
    cues: cleanCues,
    text: formattedText,
    duration,
    cueCount: cleanCues.length
  };
}

// server/videoProcessor.ts
var execFilePromise2 = import_util4.default.promisify(import_child_process6.execFile);
function formatLanguageName(code) {
  const map = {
    spa: "Espa\xF1ol",
    es: "Espa\xF1ol",
    eng: "English",
    en: "English",
    rus: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
    ru: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
    fra: "Fran\xE7ais",
    fre: "Fran\xE7ais",
    fr: "Fran\xE7ais",
    deu: "Deutsch",
    ger: "Deutsch",
    de: "Deutsch",
    ita: "Italiano",
    it: "Italiano",
    por: "Portugu\xEAs",
    pt: "Portugu\xEAs",
    jpn: "\u65E5\u672C\u8A9E",
    ja: "\u65E5\u672C\u8A9E",
    kor: "\uD55C\uAD6D\uC5B4",
    ko: "\uD55C\uAD6D\uC5B4",
    zho: "\u4E2D\u6587",
    chi: "\u4E2D\u6587",
    zh: "\u4E2D\u6587",
    ukr: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430",
    uk: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430",
    tur: "T\xFCrk\xE7e",
    tr: "T\xFCrk\xE7e",
    pol: "Polski",
    pl: "Polski"
  };
  return map[code.toLowerCase()] || code.toUpperCase();
}
function generateTrackDisplayTitle(type, index, rawLang, rawTitle, extra) {
  const langName = rawLang ? formatLanguageName(rawLang) : "";
  const prefix = rawLang ? `[${rawLang.toUpperCase()}]` : "";
  if (rawTitle && rawTitle.trim()) {
    const cleanTitle = rawTitle.trim();
    if (langName && cleanTitle.toLowerCase().includes(langName.toLowerCase())) {
      return `${prefix} ${cleanTitle}${extra ? ` (${extra})` : ""}`.trim();
    }
    return `${prefix} ${langName ? `${langName} - ` : ""}${cleanTitle}${extra ? ` (${extra})` : ""}`.trim();
  }
  const typeName = type === "audio" ? "\u041E\u0437\u0432\u0443\u0447\u043A\u0430" : "\u0421\u0443\u0431\u0442\u0438\u0442\u0440\u044B";
  return `${prefix} ${langName || `${typeName} #${index}`}${extra ? ` (${extra})` : ""}`.trim();
}
function matchesLanguage(trackLang, targetLang) {
  if (!trackLang || !targetLang) return false;
  const tl = targetLang.toLowerCase().trim();
  const trk = trackLang.toLowerCase().trim();
  if (tl === trk) return true;
  const map = {
    es: ["spa", "es", "spanish", "espa\xF1ol", "espanol", "latino", "castellano"],
    en: ["eng", "en", "english"],
    ru: ["rus", "ru", "russian"],
    fr: ["fra", "fre", "fr", "french"],
    de: ["deu", "ger", "de", "german"],
    it: ["ita", "it", "italian"],
    pt: ["por", "pt", "portuguese"],
    ja: ["jpn", "ja", "japanese"],
    ko: ["kor", "ko", "korean"],
    zh: ["zho", "chi", "zh", "chinese"],
    tr: ["tur", "tr", "turkish"],
    uk: ["ukr", "uk", "ukrainian"],
    pl: ["pol", "pl", "polish"]
  };
  const aliases = map[tl] || [tl];
  return aliases.some((a) => trk.includes(a) || a.includes(trk));
}
async function processVideoFile(filePath, filename, targetLanguage) {
  const ext = import_path15.default.extname(filename).toLowerCase();
  let durationSec = 0;
  const subtitleTracks = [];
  const audioTracks = [];
  let vCodec = "";
  let pixFmt = "";
  let isBrowserCompatibleVideo = true;
  let videoWarning;
  try {
    const probeResult = await execFilePromise2("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=index,codec_type,codec_name,pix_fmt,channels:stream_tags=language,title:stream_disposition=default,forced",
      "-of",
      "json",
      filePath
    ]);
    const probeData = JSON.parse(probeResult.stdout || "{}");
    durationSec = Math.round(parseFloat(probeData.format?.duration) || 0);
    const streams = probeData.streams || [];
    const videoStream = streams.find((s) => s.codec_type === "video");
    vCodec = (videoStream?.codec_name || "").toLowerCase();
    pixFmt = (videoStream?.pix_fmt || "").toLowerCase();
    const is10Bit2 = pixFmt.includes("10") || pixFmt.includes("12");
    const isHevc2 = vCodec === "hevc" || vCodec === "h265";
    isBrowserCompatibleVideo = vCodec === "h264" && !is10Bit2;
    if (isHevc2 || is10Bit2) {
      videoWarning = `\u0424\u0430\u0439\u043B \u0437\u0430\u043A\u043E\u0434\u0438\u0440\u043E\u0432\u0430\u043D \u0432 ${isHevc2 ? "x265 / HEVC" : vCodec}${is10Bit2 ? " (10-bit)" : ""}. \u0411\u0440\u0430\u0443\u0437\u0435\u0440\u044B \u043D\u0430 \u041F\u041A (Chrome/Edge) \u0431\u0435\u0437 \u0430\u043F\u043F\u0430\u0440\u0430\u0442\u043D\u043E\u0433\u043E \u0434\u0435\u043A\u043E\u0434\u0435\u0440\u0430 \u043C\u043E\u0433\u0443\u0442 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u0447\u0435\u0440\u043D\u044B\u0439 \u044D\u043A\u0440\u0430\u043D. \u0414\u043B\u044F \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u0432\u0438\u0434\u0435\u043E \u0441 \u043A\u043E\u0434\u0435\u043A\u043E\u043C H.264 (x264).`;
    }
    const audioStreams = streams.filter((s) => s.codec_type === "audio");
    for (const a of audioStreams) {
      const rawLang = a.tags?.language || "";
      const rawTitle = a.tags?.title || "";
      const isDefault = a.disposition?.default === 1;
      const displayTitle = generateTrackDisplayTitle("audio", a.index, rawLang, rawTitle);
      audioTracks.push({
        index: a.index,
        language: rawLang,
        title: displayTitle,
        codec: a.codec_name,
        channels: a.channels,
        isDefault
      });
    }
    const subStreams = streams.filter((s) => s.codec_type === "subtitle");
    for (const s of subStreams) {
      const rawLang = s.tags?.language || "";
      const rawTitle = s.tags?.title || "";
      const isForced = s.disposition?.forced === 1;
      const extra = isForced ? "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u0434\u043F\u0438\u0441\u0438 / Forced" : "";
      const displayTitle = generateTrackDisplayTitle("subtitle", s.index, rawLang, rawTitle, extra);
      const trackInfo = {
        index: s.index,
        language: rawLang,
        title: displayTitle,
        codec: s.codec_name,
        isForced
      };
      try {
        const subExtract = await execFilePromise2("ffmpeg", [
          "-nostdin",
          "-y",
          "-loglevel",
          "error",
          "-i",
          filePath,
          "-map",
          `0:${s.index}`,
          "-f",
          "srt",
          "-"
        ], { maxBuffer: 20 * 1024 * 1024 });
        if (subExtract.stdout && subExtract.stdout.trim().length > 0) {
          const parsed = parseSubtitleFile(subExtract.stdout);
          if (parsed.cueCount > 0) {
            trackInfo.text = parsed.text;
            trackInfo.cueCount = parsed.cueCount;
            trackInfo.duration = parsed.duration;
            if (durationSec === 0 && parsed.duration > 0) {
              durationSec = parsed.duration;
            }
          }
        }
      } catch (subErr) {
        console.warn(`[VideoProcessor] Warning: failed to extract subtitle stream ${s.index}:`, subErr?.message);
      }
      if (trackInfo.text) {
        subtitleTracks.push(trackInfo);
      }
    }
  } catch (probeErr) {
    console.warn("[VideoProcessor] ffprobe inspection warning:", probeErr?.message);
  }
  let selectedTrack = null;
  if (subtitleTracks.length > 0) {
    const fullTracks = subtitleTracks.filter((t) => !t.isForced);
    const candidateTracks = fullTracks.length > 0 ? fullTracks : subtitleTracks;
    if (targetLanguage) {
      selectedTrack = candidateTracks.find((t) => matchesLanguage(t.language, targetLanguage) || t.title && matchesLanguage(t.title, targetLanguage)) || null;
    }
    if (!selectedTrack) {
      selectedTrack = candidateTracks[0];
    }
  }
  let selectedAudio = null;
  if (audioTracks.length > 0) {
    if (targetLanguage) {
      selectedAudio = audioTracks.find((a) => matchesLanguage(a.language, targetLanguage) || a.title && matchesLanguage(a.title, targetLanguage)) || null;
    }
    if (!selectedAudio) {
      selectedAudio = audioTracks.find((a) => a.isDefault) || audioTracks[0];
    }
  }
  const is10Bit = pixFmt.includes("10") || pixFmt.includes("12");
  const isHevc = vCodec === "hevc" || vCodec === "h265";
  const isDirectMp4Compatible = ext === ".mp4" && (vCodec === "h264" || vCodec === "avc1") && !is10Bit;
  const defaultAudioIdx = selectedAudio ? selectedAudio.index : 0;
  const finalFilename = filename;
  const finalPath = filePath;
  const finalUrl = isDirectMp4Compatible ? `/api/media/stream/${finalFilename}` : `/api/media/hls/${finalFilename}/index.m3u8?audioIndex=${defaultAudioIdx}`;
  const stat = import_fs15.default.statSync(finalPath);
  const coverUrl = await extractVideoCoverBase64(finalPath, durationSec);
  return {
    finalFilename,
    finalUrl,
    sizeBytes: stat.size,
    duration: durationSec,
    subtitleTracks,
    selectedSubtitle: selectedTrack,
    audioTracks,
    selectedAudio,
    videoCodec: vCodec,
    pixelFormat: pixFmt,
    isBrowserCompatibleVideo: true,
    // 100% playable via HLS on all browsers
    videoWarning: void 0,
    coverUrl: coverUrl || void 0
  };
}
async function extractVideoCoverBase64(videoFilePath, durationSec) {
  const seekSec = durationSec > 20 ? Math.min(15, Math.floor(durationSec * 0.05)) : 2;
  const seekStr = `${Math.floor(seekSec / 60).toString().padStart(2, "0")}:${(seekSec % 60).toString().padStart(2, "0")}`;
  try {
    const { stdout } = await execFilePromise2("ffmpeg", [
      "-nostdin",
      "-y",
      "-ss",
      seekStr,
      "-i",
      videoFilePath,
      "-vframes",
      "1",
      "-vf",
      "scale=640:-1",
      "-q:v",
      "3",
      "-f",
      "image2",
      "-"
    ], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
    if (stdout && stdout.length > 500) {
      return `data:image/jpeg;base64,${stdout.toString("base64")}`;
    }
  } catch (err) {
    console.warn("[VideoProcessor] Could not extract cover frame:", err?.message);
  }
  return null;
}
async function switchVideoAudioTrack(sourceMkvPath, outputMp4Path, audioIndex, h264VideoSourcePath) {
  const ffmpegArgs = ["-nostdin", "-y", "-loglevel", "error"];
  if (h264VideoSourcePath && import_fs15.default.existsSync(h264VideoSourcePath) && import_fs15.default.statSync(h264VideoSourcePath).size > 1e3) {
    ffmpegArgs.push(
      "-i",
      h264VideoSourcePath,
      "-i",
      sourceMkvPath,
      "-map",
      "0:v:0",
      "-map",
      `1:${audioIndex}`,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-sn",
      outputMp4Path
    );
  } else {
    ffmpegArgs.push(
      "-i",
      sourceMkvPath,
      "-map",
      "0:v:0",
      "-map",
      `0:${audioIndex}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-sn",
      outputMp4Path
    );
  }
  await execFilePromise2("ffmpeg", ffmpegArgs, { maxBuffer: 50 * 1024 * 1024 });
  return import_fs15.default.existsSync(outputMp4Path) && import_fs15.default.statSync(outputMp4Path).size > 1e3;
}

// server/hlsStreamer.ts
var import_path16 = __toESM(require("path"), 1);
var import_fs16 = __toESM(require("fs"), 1);
var import_child_process7 = require("child_process");
var import_util5 = __toESM(require("util"), 1);
var execFilePromise3 = import_util5.default.promisify(import_child_process7.execFile);
var DATA_DIR11 = process.env.DATA_DIR || process.cwd();
var VIDEO_STORAGE_DIR2 = import_path16.default.join(DATA_DIR11, "media", "videos");
var HLS_CACHE_DIR = import_path16.default.join(DATA_DIR11, "media", "hls_cache");
if (!import_fs16.default.existsSync(HLS_CACHE_DIR)) {
  import_fs16.default.mkdirSync(HLS_CACHE_DIR, { recursive: true });
}
var SEGMENT_DURATION = 4;
var metadataCache = /* @__PURE__ */ new Map();
function formatSeekTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor(seconds % 3600 / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.padStart(6, "0")}`;
}
async function getVideoMetadata(sourcePath) {
  const cached = metadataCache.get(sourcePath);
  if (cached) return cached;
  try {
    const { stdout } = await execFilePromise3("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,pix_fmt",
      "-of",
      "json",
      sourcePath
    ]);
    const data = JSON.parse(stdout || "{}");
    const duration = Math.round(parseFloat(data.format?.duration) || 0);
    const videoStream = (data.streams || []).find((s) => s.codec_type === "video");
    const vCodec = (videoStream?.codec_name || "").toLowerCase();
    const pixFmt = (videoStream?.pix_fmt || "").toLowerCase();
    const is10Bit = pixFmt.includes("10") || pixFmt.includes("12");
    const isH264 = (vCodec === "h264" || vCodec === "avc1") && !is10Bit;
    const meta = { duration, isH264 };
    metadataCache.set(sourcePath, meta);
    return meta;
  } catch (err) {
    console.warn("[HLS] ffprobe error:", err?.message);
    return { duration: 0, isH264: false };
  }
}
async function generateHlsPlaylist(filename, audioIndex = 0) {
  const sourcePath = import_path16.default.join(VIDEO_STORAGE_DIR2, filename);
  if (!import_fs16.default.existsSync(sourcePath)) return null;
  const { duration } = await getVideoMetadata(sourcePath);
  if (!duration || duration <= 0) return null;
  const totalSegments = Math.ceil(duration / SEGMENT_DURATION);
  let m3u8 = "#EXTM3U\n";
  m3u8 += "#EXT-X-VERSION:3\n";
  m3u8 += `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}
`;
  m3u8 += "#EXT-X-MEDIA-SEQUENCE:0\n";
  m3u8 += "#EXT-X-PLAYLIST-TYPE:VOD\n";
  for (let i = 0; i < totalSegments; i++) {
    const segDur = i === totalSegments - 1 ? (duration - i * SEGMENT_DURATION).toFixed(3) : SEGMENT_DURATION.toFixed(3);
    m3u8 += "#EXT-X-DISCONTINUITY\n";
    m3u8 += `#EXTINF:${segDur},
`;
    m3u8 += `segment_${i}.ts?audioIndex=${audioIndex}
`;
  }
  m3u8 += "#EXT-X-ENDLIST\n";
  return m3u8;
}
var pendingJobs = /* @__PURE__ */ new Map();
async function getOrCreateSegment(filename, segIndex, audioIndex = 0) {
  const sourcePath = import_path16.default.join(VIDEO_STORAGE_DIR2, filename);
  if (!import_fs16.default.existsSync(sourcePath)) return null;
  const segCacheFolder = import_path16.default.join(HLS_CACHE_DIR, filename, `a_${audioIndex}`);
  if (!import_fs16.default.existsSync(segCacheFolder)) {
    import_fs16.default.mkdirSync(segCacheFolder, { recursive: true });
  }
  const finalPath = import_path16.default.join(segCacheFolder, `seg_${segIndex}.ts`);
  if (import_fs16.default.existsSync(finalPath) && import_fs16.default.statSync(finalPath).size > 500) {
    return finalPath;
  }
  const jobKey = `${filename}_${audioIndex}_${segIndex}`;
  if (pendingJobs.has(jobKey)) {
    return pendingJobs.get(jobKey);
  }
  const jobPromise = (async () => {
    try {
      const { duration, isH264 } = await getVideoMetadata(sourcePath);
      const startTime = segIndex * SEGMENT_DURATION;
      if (duration > 0 && startTime >= duration) {
        return null;
      }
      const startStr = formatSeekTime(startTime);
      const tmpPath = import_path16.default.join(segCacheFolder, `tmp_${segIndex}_${Date.now()}.ts`);
      const videoArgs = isH264 ? ["-c:v", "copy"] : [
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p"
      ];
      const ffmpegArgs = [
        "-nostdin",
        "-y",
        "-loglevel",
        "error",
        "-ss",
        startStr,
        "-i",
        sourcePath,
        "-t",
        String(SEGMENT_DURATION),
        "-map",
        "0:v:0",
        "-map",
        `0:${audioIndex}?`,
        ...videoArgs,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-f",
        "mpegts",
        tmpPath
      ];
      await execFilePromise3("ffmpeg", ffmpegArgs, { maxBuffer: 50 * 1024 * 1024 });
      if (import_fs16.default.existsSync(tmpPath) && import_fs16.default.statSync(tmpPath).size > 500) {
        import_fs16.default.renameSync(tmpPath, finalPath);
        const totalSegments = Math.ceil(duration / SEGMENT_DURATION);
        if (segIndex + 1 < totalSegments) {
          setTimeout(() => {
            getOrCreateSegment(filename, segIndex + 1, audioIndex).catch(() => {
            });
          }, 50);
        }
        return finalPath;
      }
    } catch (err) {
      console.warn(`[HLS] Failed to generate segment ${segIndex} for ${filename}:`, err?.message);
    } finally {
      pendingJobs.delete(jobKey);
    }
    return null;
  })();
  pendingJobs.set(jobKey, jobPromise);
  return jobPromise;
}
async function handleHlsPlaylist(req, res) {
  try {
    const filename = import_path16.default.basename(req.params.filename);
    const audioIndex = parseInt(req.query.audioIndex, 10) || 0;
    const m3u8 = await generateHlsPlaylist(filename, audioIndex);
    if (!m3u8) {
      return res.status(404).send("Media not found or unreadable");
    }
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.send(m3u8);
  } catch (err) {
    console.error("[HLS Playlist error]:", err);
    return res.status(500).send("Internal Server Error");
  }
}
async function handleHlsSegment(req, res) {
  try {
    const filename = import_path16.default.basename(req.params.filename);
    const segIndex = parseInt(req.params.segIndex, 10);
    const audioIndex = parseInt(req.query.audioIndex, 10) || 0;
    if (isNaN(segIndex) || segIndex < 0) {
      return res.status(400).send("Invalid segment index");
    }
    const segPath = await getOrCreateSegment(filename, segIndex, audioIndex);
    if (!segPath || !import_fs16.default.existsSync(segPath)) {
      return res.status(404).send("Segment generation failed");
    }
    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const stream = import_fs16.default.createReadStream(segPath);
    return stream.pipe(res);
  } catch (err) {
    console.error("[HLS Segment error]:", err);
    return res.status(500).send("Internal Server Error");
  }
}

// server.ts
import_dotenv.default.config();
async function startServer() {
  const app = (0, import_express17.default)();
  const PORT = process.env.PORT || 3e3;
  const DATA_DIR12 = process.env.DATA_DIR || process.cwd();
  if (!import_fs17.default.existsSync(DATA_DIR12)) {
    import_fs17.default.mkdirSync(DATA_DIR12, { recursive: true });
  }
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Range, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  app.post("/api/media/upload-video", (req, res) => {
    try {
      const VIDEO_STORAGE_DIR3 = import_path17.default.join(DATA_DIR12, "media", "videos");
      if (!import_fs17.default.existsSync(VIDEO_STORAGE_DIR3)) {
        import_fs17.default.mkdirSync(VIDEO_STORAGE_DIR3, { recursive: true });
      }
      const rawFilename = req.headers["x-filename"] ? decodeURIComponent(String(req.headers["x-filename"])) : `video_${Date.now()}.mp4`;
      const cleanBasename = import_path17.default.basename(rawFilename).replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueFilename = `${Date.now()}_${cleanBasename}`;
      const targetFilePath = import_path17.default.join(VIDEO_STORAGE_DIR3, uniqueFilename);
      const writeStream = import_fs17.default.createWriteStream(targetFilePath);
      req.pipe(writeStream);
      writeStream.on("finish", async () => {
        if (!import_fs17.default.existsSync(targetFilePath)) {
          return res.status(500).json({ error: "Failed to save video file" });
        }
        try {
          const targetLang = req.headers["x-target-language"] ? String(req.headers["x-target-language"]) : void 0;
          const result = await processVideoFile(targetFilePath, uniqueFilename, targetLang);
          return res.json({
            success: true,
            url: result.finalUrl,
            filename: result.finalFilename,
            sizeBytes: result.sizeBytes,
            duration: result.duration,
            subtitleTracks: result.subtitleTracks,
            selectedSubtitle: result.selectedSubtitle,
            audioTracks: result.audioTracks,
            selectedAudio: result.selectedAudio,
            videoCodec: result.videoCodec,
            pixelFormat: result.pixelFormat,
            isBrowserCompatibleVideo: result.isBrowserCompatibleVideo,
            videoWarning: result.videoWarning,
            coverUrl: result.coverUrl
          });
        } catch (procErr) {
          console.warn("[upload-video] Post-processing fallback:", procErr?.message);
          const stat = import_fs17.default.statSync(targetFilePath);
          return res.json({
            success: true,
            url: `/api/media/stream/${uniqueFilename}`,
            filename: uniqueFilename,
            sizeBytes: stat.size,
            duration: 0,
            subtitleTracks: [],
            selectedSubtitle: null,
            audioTracks: [],
            selectedAudio: null,
            videoCodec: void 0,
            isBrowserCompatibleVideo: true,
            videoWarning: void 0
          });
        }
      });
      writeStream.on("error", (err) => {
        console.error("[upload-video error]:", err);
        try {
          if (import_fs17.default.existsSync(targetFilePath)) import_fs17.default.unlinkSync(targetFilePath);
        } catch (_) {
        }
        return res.status(500).json({ error: err.message || "File upload failed" });
      });
    } catch (err) {
      console.error("[upload-video exception]:", err);
      return res.status(500).json({ error: err.message || "Failed to initiate file upload" });
    }
  });
  app.use(import_express17.default.json({ limit: "200mb" }));
  app.use(import_express17.default.urlencoded({ limit: "200mb", extended: true }));
  app.use(import_express17.default.raw({ type: ["audio/*", "application/octet-stream"], limit: "200mb" }));
  app.get("/api/media/hls/:filename/index.m3u8", handleHlsPlaylist);
  app.get("/api/media/hls/:filename/master.m3u8", handleHlsPlaylist);
  app.get("/api/media/hls/:filename/segment_:segIndex.ts", handleHlsSegment);
  app.post("/api/media/switch-audio", async (req, res) => {
    try {
      const { filename, audioIndex } = req.body;
      if (!filename || typeof audioIndex !== "number") {
        return res.status(400).json({ error: "Missing filename or audioIndex" });
      }
      const VIDEO_STORAGE_DIR3 = import_path17.default.join(DATA_DIR12, "media", "videos");
      const cleanFileName = import_path17.default.basename(filename);
      const baseClean = cleanFileName.replace(/(_a\d+)?\.(mp4|mkv)$/i, "");
      const mkvCandidate = import_path17.default.join(VIDEO_STORAGE_DIR3, `${baseClean}.mkv`);
      const sourceFile = import_fs17.default.existsSync(mkvCandidate) ? mkvCandidate : import_path17.default.join(VIDEO_STORAGE_DIR3, cleanFileName);
      if (!import_fs17.default.existsSync(sourceFile)) {
        return res.status(404).json({ error: "Source video file not found" });
      }
      if (sourceFile.endsWith(".mkv")) {
        const sourceBase = import_path17.default.basename(sourceFile);
        return res.json({
          success: true,
          url: `/api/media/hls/${sourceBase}/index.m3u8?audioIndex=${audioIndex}`,
          filename: sourceBase
        });
      }
      const targetMp4Name = `${baseClean}_a${audioIndex}.mp4`;
      const targetMp4Path = import_path17.default.join(VIDEO_STORAGE_DIR3, targetMp4Name);
      const h264Candidate = import_path17.default.join(VIDEO_STORAGE_DIR3, `${baseClean}.mp4`);
      if (!import_fs17.default.existsSync(targetMp4Path) || import_fs17.default.statSync(targetMp4Path).size < 1e3) {
        await switchVideoAudioTrack(sourceFile, targetMp4Path, audioIndex, import_fs17.default.existsSync(h264Candidate) ? h264Candidate : void 0);
      }
      return res.json({
        success: true,
        url: `/api/media/stream/${targetMp4Name}`,
        filename: targetMp4Name
      });
    } catch (err) {
      console.error("[switch-audio error]:", err);
      return res.status(500).json({ error: err.message || "Failed to switch audio track" });
    }
  });
  app.post("/api/log", (req, res) => {
    console.log("BROWSER ERROR:", req.body);
    res.json({ ok: true });
  });
  app.get("/api/health", (req, res) => {
    let resolvedUser = "default";
    try {
      resolvedUser = resolveUserId(req);
    } catch (_) {
    }
    res.json({ status: "ok", version: getLiveServerVersion() || APP_VERSION, uptime: process.uptime(), timestamp: Date.now(), userId: resolvedUser });
  });
  const swTemplatePath = import_path17.default.join(process.cwd(), "public", "sw.js");
  app.get("/sw.js", (_req, res) => {
    try {
      if (process.env.NODE_ENV !== "production") {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.send(`
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});
`);
        return;
      }
      const swTemplate = import_fs17.default.readFileSync(swTemplatePath, "utf8");
      const swContent = swTemplate.replace(/__CACHE_VERSION__/g, APP_VERSION);
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(swContent);
    } catch (e) {
      res.status(500).send("// sw.js template not found");
    }
  });
  const manifestFilePath = import_path17.default.join(process.cwd(), "public", "manifest.json");
  app.get(["/manifest.json", "/manifest.webmanifest"], (_req, res) => {
    try {
      res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      if (import_fs17.default.existsSync(manifestFilePath)) {
        res.sendFile(manifestFilePath);
      } else {
        res.status(404).json({ error: "Manifest not found" });
      }
    } catch (e) {
      res.status(500).json({ error: "Failed to serve manifest" });
    }
  });
  const AUDIO_STORAGE_DIR3 = import_path17.default.join(DATA_DIR12, "audio_files");
  if (!import_fs17.default.existsSync(AUDIO_STORAGE_DIR3)) {
    import_fs17.default.mkdirSync(AUDIO_STORAGE_DIR3, { recursive: true });
  }
  const serveAudioFile = (req, res) => {
    const rawFilename = import_path17.default.basename(req.params.filename || "");
    let filePath = import_path17.default.join(AUDIO_STORAGE_DIR3, rawFilename);
    if (!import_fs17.default.existsSync(filePath)) {
      const candidates = [".mp3", ".m4a", ".aac", ".ogg", ".wav", ".webm"];
      for (const ext2 of candidates) {
        const testPath = import_path17.default.join(AUDIO_STORAGE_DIR3, `${rawFilename}${ext2}`);
        if (import_fs17.default.existsSync(testPath)) {
          filePath = testPath;
          break;
        }
      }
    }
    if (!import_fs17.default.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found" });
    }
    const stat = import_fs17.default.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = import_path17.default.extname(filePath).toLowerCase();
    let mimeType = "audio/mpeg";
    if (ext === ".m4a" || ext === ".aac") mimeType = "audio/mp4";
    else if (ext === ".ogg") mimeType = "audio/ogg";
    else if (ext === ".wav") mimeType = "audio/wav";
    else if (ext === ".webm") mimeType = "audio/webm";
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }
      const chunksize = end - start + 1;
      const fileStream = import_fs17.default.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunksize,
        "Content-Type": mimeType
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType
      });
      import_fs17.default.createReadStream(filePath).pipe(res);
    }
  };
  app.get("/api/audio-files/:filename", serveAudioFile);
  app.get("/api/audio-stream/:filename", serveAudioFile);
  setInterval(() => {
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
      }
    }
  }, 3 * 60 * 1e3);
  app.use("/api", ai_default);
  app.use("/api", tts_default);
  app.use("/api", youtube_default);
  app.use("/api", db_default);
  app.use("/api", media_default);
  app.use("/api/whisper", whisper_default);
  app.use("/api/wordnet", wordnet_default);
  app.use("/api/frequency", frequencyRouter);
  app.use("/api/auth", auth_default);
  app.use("/api", backup_default);
  app.use("/api/podcasts", podcasts_default);
  app.use("/api", translate_default);
  app.use("/api", history_default);
  app.use("/api/lessons", lessons_default);
  app.use("/api", system_default);
  await ensureStartupVersionCheckAndBackup();
  startBackupScheduler();
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path17.default.join(process.cwd(), "dist");
    app.use(import_express17.default.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html") || filePath.endsWith("manifest.json") || filePath.endsWith("manifest.webmanifest") || filePath.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(import_path17.default.join(distPath, "index.html"));
    });
  }
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("FATAL ERROR IN startServer:", err);
  process.exit(1);
});
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
