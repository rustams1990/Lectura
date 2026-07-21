import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

import aiRouter from "./routes/ai.ts";
import ttsRouter from "./routes/tts.ts";
import youtubeRouter from "./routes/youtube.ts";
import authRouter from "./routes/auth.ts";
import dbRouter from "./routes/db.ts";
import mediaRouter from "./routes/media.ts";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || process.cwd();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// ============================================================
// Express Routers
// ============================================================
app.use("/api", aiRouter);
app.use("/api", ttsRouter);
app.use("/api", youtubeRouter);
app.use("/api", dbRouter);
app.use("/api", mediaRouter);
app.use("/api/auth", authRouter);

// ============================================================
// Frontend Middleware (Vite Dev Server / Production Static Files)
// ============================================================
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
