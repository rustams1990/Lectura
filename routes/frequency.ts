import { Router, Request, Response } from "express";
import { lookupWordFrequency, lookupBatchWordFrequency, analyzeTextComplexity } from "../server/frequency/frequencyService";

export const frequencyRouter = Router();

/**
 * GET /api/frequency/lookup?word=:word&lang=:lang
 * Fast single word frequency & CEFR lookup
 */
frequencyRouter.get("/lookup", (req: Request, res: Response) => {
  try {
    const word = (req.query.word as string) || "";
    const lang = (req.query.lang as string) || "en";

    if (!word || !word.trim()) {
      return res.status(400).json({ error: "Query parameter 'word' is required" });
    }

    const data = lookupWordFrequency(word, lang);
    return res.json({
      status: "ok",
      data,
    });
  } catch (error: any) {
    console.error("Error in frequency lookup:", error);
    return res.status(500).json({ error: error.message || "Failed to lookup frequency" });
  }
});

/**
 * POST /api/frequency/batch
 * Lookup frequency for array of words
 */
frequencyRouter.post("/batch", (req: Request, res: Response) => {
  try {
    const { words, lang } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: "'words' array is required" });
    }

    const targetLang = (lang || "en").toLowerCase().startsWith("en") ? "en" : (lang || "en");
    const data = lookupBatchWordFrequency(words, targetLang);
    return res.json({
      status: "ok",
      data,
    });
  } catch (error: any) {
    console.error("Error in batch frequency lookup:", error);
    return res.status(500).json({ error: error.message || "Failed to lookup batch frequency" });
  }
});

/**
 * POST /api/frequency/analyze-text
 * Analyzes full lesson/book text CEFR distribution
 */
frequencyRouter.post("/analyze-text", (req: Request, res: Response) => {
  try {
    const { text, lang } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "'text' string is required" });
    }

    const targetLang = (lang || "en").toLowerCase().startsWith("en") ? "en" : (lang || "en");
    const data = analyzeTextComplexity(text, targetLang);
    return res.json({
      status: "ok",
      data,
    });
  } catch (error: any) {
    console.error("Error in analyze-text complexity:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze text complexity" });
  }
});
