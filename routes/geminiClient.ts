import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

/**
 * Lazy initialization of GoogleGenAI client
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
 * Helper function to call local Ollama AI model
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
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

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
        try {
          return JSON.parse(rawText);
        } catch (e) {
          console.error("Failed to parse JSON response from local AI:", rawText, e);
          throw new Error("Не удалось разобрать JSON-ответ от локального ИИ. Убедитесь, что модель генерирует корректный JSON.");
        }
      }
      return rawText;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === 'AbortError') {
        continue;
      }
      if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
        continue;
      }
      throw err;
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error("Запрос к локальному ИИ превысил лимит времени (60 секунд).");
  }
  if (lastError?.code === 'ECONNREFUSED' || lastError?.message?.includes('fetch failed') || lastError?.message?.includes('ECONNREFUSED')) {
    const displayHost = cleanUrl.replace("/api/generate", "");
    throw new Error(`Локальный ИИ недоступен. Проверьте, запущен ли Ollama на вашем сервере (адрес: ${displayHost}).`);
  }
  throw lastError;
}
