import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

/**
 * Lazy initialization of GoogleGenAI client
 */
export function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY") {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
  }
  return aiClient;
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

    const response = await fetch(cleanUrl, {
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
    if (err.name === 'AbortError') {
      throw new Error("Запрос к локальному ИИ превысил лимит времени (60 секунд).");
    }
    if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
      const displayHost = cleanUrl.replace("/api/generate", "");
      throw new Error(`Локальный ИИ недоступен. Проверьте, запущен ли Ollama на вашем компьютере (адрес: ${displayHost}).`);
    }
    throw err;
  }
}
