import { Router, Request, Response } from "express";
import { lookupWordNet } from "../server/wordnet/wordnetService.ts";

const router = Router();

/**
 * GET /api/wordnet/lookup?word=:word
 * Returns comprehensive semantic WordNet graph for a given word
 */
router.get("/lookup", async (req: Request, res: Response) => {
  const word = (req.query.word as string || "").trim();
  if (!word) {
    return res.status(400).json({ error: "Query parameter 'word' is required" });
  }

  try {
    const data = await lookupWordNet(word);
    return res.json({ status: "ok", data });
  } catch (err: any) {
    console.error(`[WordNet Route Error] Lookup failed for '${word}':`, err);
    return res.status(500).json({ error: err.message || "Failed to lookup WordNet" });
  }
});

/**
 * GET /api/wordnet/synonyms?word=:word
 * Fast endpoint returning flat list of synonyms
 */
router.get("/synonyms", async (req: Request, res: Response) => {
  const word = (req.query.word as string || "").trim();
  if (!word) {
    return res.status(400).json({ error: "Query parameter 'word' is required" });
  }

  try {
    const data = await lookupWordNet(word);
    return res.json({ status: "ok", query: data.query, synonyms: data.allSynonyms });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to lookup synonyms" });
  }
});

export default router;
