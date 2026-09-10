import { Router, Request, Response } from "express";
import { resolveUserId } from "./auth.ts";
import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  getBackupSettings,
  saveBackupSettings,
  getBackupFilePath,
} from "../server/backupService.ts";

const router = Router();

// Middleware to resolve user id or handle auth error
function getUser(req: Request, res: Response): string | null {
  try {
    return resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    } else {
      res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
    }
    return null;
  }
}

// 1. GET /api/backups - List available backups on disk for current user
router.get("/backups", async (req: Request, res: Response) => {
  const userId = getUser(req, res);
  if (!userId) return;

  try {
    const backups = await listBackups(userId);
    return res.json({ status: "ok", data: backups });
  } catch (err: any) {
    console.error(`[GET /api/backups] Error:`, err);
    return res.status(500).json({ error: "Failed to list backups" });
  }
});

// 2. POST /api/backups/create - Create backup right now (manual trigger)
router.post("/backups/create", async (req: Request, res: Response) => {
  const userId = getUser(req, res);
  if (!userId) return;

  try {
    const backupInfo = await createBackup(userId, "manual");
    if (!backupInfo) {
      return res.status(400).json({ error: "No data available to backup" });
    }
    return res.json({ status: "success", data: backupInfo });
  } catch (err: any) {
    console.error(`[POST /api/backups/create] Error:`, err);
    return res.status(500).json({ error: "Failed to create backup: " + (err.message || String(err)) });
  }
});

// 3. POST /api/backups/restore/:filename - Restore state from server backup file
router.post("/backups/restore/:filename", async (req: Request, res: Response) => {
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
  } catch (err: any) {
    console.error(`[POST /api/backups/restore] Error:`, err);
    return res.status(500).json({ error: "Failed to restore backup: " + (err.message || String(err)) });
  }
});

// 4. GET /api/backups/download/:filename - Download backup file from server disk
router.get("/backups/download/:filename", (req: Request, res: Response) => {
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

// 5. DELETE /api/backups/:filename - Delete a specific backup file
router.delete("/backups/:filename", async (req: Request, res: Response) => {
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
  } catch (err: any) {
    console.error(`[DELETE /api/backups] Error:`, err);
    return res.status(500).json({ error: "Failed to delete backup" });
  }
});

// 6. GET /api/settings/backup - Get auto-backup configuration
router.get("/settings/backup", (req: Request, res: Response) => {
  const userId = getUser(req, res);
  if (!userId) return;

  try {
    const settings = getBackupSettings(userId);
    return res.json({ status: "ok", data: settings });
  } catch (err: any) {
    console.error(`[GET /api/settings/backup] Error:`, err);
    return res.status(500).json({ error: "Failed to get backup settings" });
  }
});

// 7. PATCH / PUT /api/settings/backup - Update auto-backup configuration
const updateBackupSettingsHandler = (req: Request, res: Response) => {
  const userId = getUser(req, res);
  if (!userId) return;

  const { enabled, intervalHours, maxKeep } = req.body;

  try {
    const updated = saveBackupSettings(userId, {
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      intervalHours: typeof intervalHours === "number" ? intervalHours : undefined,
      maxKeep: typeof maxKeep === "number" ? maxKeep : undefined,
    });
    return res.json({ status: "success", data: updated });
  } catch (err: any) {
    console.error(`[PATCH /api/settings/backup] Error:`, err);
    return res.status(500).json({ error: "Failed to update backup settings" });
  }
};

router.patch("/settings/backup", updateBackupSettingsHandler);
router.put("/settings/backup", updateBackupSettingsHandler);

export default router;
