import { Router, Request, Response } from "express";
import {
  checkSystemUpdate,
  startSystemUpdate,
  getUpdateProgress,
  getLiveServerVersion,
  getSystemEnvironment,
} from "../server/updaterService.ts";

const router = Router();

// GET /api/system/update-check — Checks for updates against GitHub and returns live server version
router.get("/system/update-check", async (req: Request, res: Response) => {
  try {
    const force = req.query.force === "true" || req.query.force === "1";
    const result = await checkSystemUpdate(force);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Failed to check for updates",
      currentVersion: getLiveServerVersion(),
      hasUpdate: false,
      environment: getSystemEnvironment(),
    });
  }
});

// POST /api/system/update-apply — Triggers 1-click update (DB backup -> Download -> Build -> Restart)
router.post("/system/update-apply", async (_req: Request, res: Response) => {
  try {
    const result = await startSystemUpdate();
    return res.json({
      status: result.started ? "started" : "busy",
      message: result.message,
      progress: getUpdateProgress(),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Failed to start update",
    });
  }
});

// GET /api/system/update-progress — Returns current step & percentage of running update
router.get("/system/update-progress", (_req: Request, res: Response) => {
  return res.json({
    ...getUpdateProgress(),
    currentVersion: getLiveServerVersion(),
  });
});

export default router;
