import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

export interface AIProfilePayload {
  id?: string;
  name?: string;
  provider?: 'gemini' | 'openai' | 'groq' | 'ollama' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface UniversalAiOptions {
  systemInstruction?: string;
  formatJson?: boolean;
  responseSchema?: any;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/**
 * Sanitizes Gemini API key
 */
export function sanitizeGeminiKey(rawKey?: string): string | null {
  if (!rawKey) return null;
  const clean = rawKey.trim().replace(/^["']|["']$/g, '');
  // Filter non-ASCII characters to prevent ByteString crash
  const ascii = clean.replace(/[^\x00-\x7F]/g, '');
  if (!ascii || ascii === "MY_GEMINI_API_KEY" || ascii.includes("ваш_ключ") || ascii.length < 10) {
    return null;
  }
  return ascii;
}

/**
 * Lazy initialization of GoogleGenAI client with key validation
 */
export function getGeminiClient(customKey?: string): GoogleGenAI | null {
  const key = sanitizeGeminiKey(customKey || process.env.GEMINI_API_KEY);
  if (!key) return null;

  try {
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI client:", err);
    return null;
  }
}

function getCandidateUrls(inputUrl: string): string[] {
  const clean = inputUrl.trim();
  const urls = [clean];
  if (clean.includes("localhost") || clean.includes("127.0.0.1")) {
    urls.push(clean.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"));
    urls.push(clean.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"));
  }
  return Array.from(new Set(urls));
}

/**
 * Robust JSON text extraction helper (removes ```json ... ``` codeblocks)
 */
export function extractAndParseJson(raw: string): any {
  let clean = raw.trim();
  // Strip markdown code fences if present
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  
  // Find first { or [ and last } or ]
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

/**
 * Universal AI caller supporting Gemini, OpenAI, Groq, Ollama and Custom OpenAI-compatible endpoints
 */
export async function callUniversalAiProvider(
  profile: AIProfilePayload,
  prompt: string,
  options: UniversalAiOptions = {}
): Promise<any> {
  const provider = profile.provider || 'gemini';
  const apiKey = (profile.apiKey || "").trim();
  const timeoutMs = options.timeoutMs || 60000;

  // 1. Google Gemini Provider
  if (provider === 'gemini') {
    const key = sanitizeGeminiKey(apiKey || process.env.GEMINI_API_KEY);
    if (!key) {
      const err: any = new Error("GEMINI_API_KEY is not configured or invalid");
      err.status = 401;
      throw err;
    }

    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' }
      }
    });

    const modelName = (profile.model === "gemini-2.0-flash" ? "gemini-2.5-flash" : profile.model) || "gemini-2.5-flash";
    const config: any = {};

    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }
    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options.maxOutputTokens !== undefined) {
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
        model: modelName,
        contents: prompt,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      const rawText = response.text || "";
      if (options.formatJson) {
        return extractAndParseJson(rawText);
      }
      return rawText;
    } catch (err: any) {
      let cleanMessage = err.message || String(err);
      try {
        const parsed = typeof cleanMessage === "string" && cleanMessage.startsWith("{") ? JSON.parse(cleanMessage) : null;
        if (parsed?.error?.message) {
          cleanMessage = parsed.error.message;
        }
      } catch (_) {}

      // Check for rate limit / quota exceeded
      const errStr = cleanMessage;
      if (
        errStr.includes("429") || 
        errStr.includes("RESOURCE_EXHAUSTED") || 
        errStr.includes("QuotaExceeded") ||
        errStr.includes("rate limit") ||
        err.status === 429
      ) {
        const error: any = new Error(`Quota limit exceeded for Gemini key (${modelName}): ${cleanMessage}`);
        error.status = 429;
        error.isQuotaExceeded = true;
        throw error;
      }
      const error: any = new Error(cleanMessage);
      error.status = err.status || (errStr.includes("404") || errStr.includes("NOT_FOUND") ? 404 : 400);
      throw error;
    }
  }

  // 2. Local Ollama (Native /api/generate format or OpenAI format)
  if (provider === 'ollama' && (!profile.baseUrl || profile.baseUrl.includes("/api/generate"))) {
    const url = profile.baseUrl || "http://localhost:11434/api/generate";
    const model = profile.model || "phi3.5";
    let combinedPrompt = prompt;
    if (options.systemInstruction) {
      combinedPrompt = `System: ${options.systemInstruction}\n\nUser: ${prompt}`;
    }
    return callLocalAi(url, model, combinedPrompt, options.formatJson);
  }

  // 3. OpenAI / Groq / Custom / Ollama (OpenAI-compatible chat/completions)
  let endpoint = "";
  let defaultModel = "gpt-4o-mini";

  if (provider === 'openai') {
    endpoint = (profile.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    defaultModel = "gpt-4o-mini";
  } else if (provider === 'groq') {
    endpoint = (profile.baseUrl || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    defaultModel = "llama-3.3-70b-versatile";
  } else if (provider === 'ollama') {
    endpoint = (profile.baseUrl || "http://localhost:11434/v1").replace(/\/$/, "");
    defaultModel = "llama3.2";
  } else {
    // Custom
    endpoint = (profile.baseUrl || "http://localhost:11434/v1").replace(/\/$/, "");
    defaultModel = profile.model || "default";
  }

  if (!endpoint.endsWith("/chat/completions")) {
    endpoint = `${endpoint}/chat/completions`;
  }

  const modelName = profile.model || defaultModel;
  const messages: any[] = [];

  if (options.systemInstruction) {
    messages.push({ role: "system", content: options.systemInstruction });
  }
  messages.push({ role: "user", content: prompt });

  const bodyPayload: any = {
    model: modelName,
    messages,
    temperature: options.temperature !== undefined ? options.temperature : 0.3,
  };

  if (options.maxOutputTokens) {
    bodyPayload.max_tokens = options.maxOutputTokens;
  }

  if (options.formatJson) {
    bodyPayload.response_format = { type: "json_object" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const candidateUrls = getCandidateUrls(endpoint);
  let lastError: any = null;

  for (const urlToTry of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(urlToTry, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        let parsedErr: any = {};
        try { parsedErr = JSON.parse(errorText); } catch (_) {}
        const errMsg = parsedErr.error?.message || errorText || `HTTP ${res.status}`;

        if (res.status === 429 || errMsg.includes("rate_limit") || errMsg.includes("quota")) {
          const err: any = new Error(`Quota limit exceeded for ${provider} (${modelName}): ${errMsg}`);
          err.status = 429;
          err.isQuotaExceeded = true;
          throw err;
        }

        const err: any = new Error(`${provider.toUpperCase()} API Error (${res.status}): ${errMsg}`);
        err.status = res.status;
        throw err;
      }

      const data: any = await res.json();
      const rawText = data.choices?.[0]?.message?.content || "";

      if (options.formatJson) {
        return extractAndParseJson(rawText);
      }
      return rawText;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.isQuotaExceeded || err.status === 429) {
        throw err;
      }
      if (err.name === 'AbortError') {
        continue;
      }
      if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`Failed to connect to ${provider} API at ${endpoint}`);
}

/**
 * Legacy Helper function to call local Ollama AI model
 */
export async function callLocalAi(
  url: string,
  model: string,
  prompt: string,
  formatJson = false
): Promise<any> {
  const cleanUrl = (url || "http://localhost:11434/api/generate").trim();
  const cleanModel = (model || "phi3.5").trim();

  const candidateUrls = getCandidateUrls(cleanUrl);
  let lastError: any = null;

  for (const urlToTry of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const bodyPayload: any = {
        model: cleanModel,
        prompt: prompt,
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

      const data: any = await response.json();
      const rawText = (data.response || "").trim();

      if (formatJson) {
        return extractAndParseJson(rawText);
      }
      return rawText;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === 'AbortError') {
        continue;
      }
      if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
        continue;
      }
      throw err;
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error("Запрос к локальному ИИ превысил лимит времени (60 секунд).");
  }
  if (lastError?.code === 'ECONNREFUSED' || lastError?.message?.includes('fetch failed')) {
    const displayHost = cleanUrl.replace("/api/generate", "");
    throw new Error(`Локальный ИИ недоступен. Проверьте, запущен ли Ollama на вашем сервере (${displayHost}).`);
  }
  throw lastError;
}
