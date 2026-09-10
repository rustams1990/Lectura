import path from "path";
import fs from "fs";
import { getDbConnection } from "../routes/dbConnection.ts";
import { getLocalServerDb, saveLocalServerDb } from "../routes/db.ts";

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const BACKUPS_ROOT = path.join(DATA_DIR, "data", "backups");

export interface BackupSettings {
  enabled: boolean;
  intervalHours: number;
  maxKeep: number;
  lastBackupTime: string | null;
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  createdAt: number;
  isAuto: boolean;
  type: "auto" | "manual" | "pre-restore" | "custom";
  exportDate?: string;
  lessonsCount?: number;
  wordsCount?: number;
  username?: string;
}

export function sanitizeUserId(userId: string): string {
  if (!userId || typeof userId !== "string") return "default";
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getBackupsDir(userId: string): string {
  const safeId = sanitizeUserId(userId);
  const userDir = path.join(BACKUPS_ROOT, safeId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

export function getBackupSettings(userId: string): BackupSettings {
  const defaultSettings: BackupSettings = {
    enabled: true,
    intervalHours: 24,
    maxKeep: 5,
    lastBackupTime: null,
  };

  try {
    const db = getDbConnection(userId);
    const row = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'backup_settings'").get(userId) as { value: string } | undefined;
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultSettings.enabled,
        intervalHours: typeof parsed.intervalHours === "number" && parsed.intervalHours > 0 ? parsed.intervalHours : defaultSettings.intervalHours,
        maxKeep: typeof parsed.maxKeep === "number" && parsed.maxKeep > 0 ? parsed.maxKeep : defaultSettings.maxKeep,
        lastBackupTime: typeof parsed.lastBackupTime === "string" ? parsed.lastBackupTime : null,
      };
    }
  } catch (err) {
    console.error(`[BackupService] Failed to read backup settings for ${userId}:`, err);
  }

  return defaultSettings;
}

export function saveBackupSettings(userId: string, settings: Partial<BackupSettings>): BackupSettings {
  const current = getBackupSettings(userId);
  const updated: BackupSettings = {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : current.enabled,
    intervalHours: typeof settings.intervalHours === "number" && settings.intervalHours > 0 ? settings.intervalHours : current.intervalHours,
    maxKeep: typeof settings.maxKeep === "number" && settings.maxKeep > 0 ? settings.maxKeep : current.maxKeep,
    lastBackupTime: settings.lastBackupTime !== undefined ? settings.lastBackupTime : current.lastBackupTime,
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

function formatDateForFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

export async function createBackup(
  userId: string,
  type: "auto" | "manual" | "pre-restore" = "manual"
): Promise<BackupFileInfo | null> {
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
      const userRow = db.prepare("SELECT display_name, email FROM server_users WHERE id = ?").get(userId) as any;
      if (userRow) {
        username = userRow.display_name || userRow.email?.split("@")[0] || "user";
      }
    } catch (_) {}

    const now = new Date();
    const dateStr = formatDateForFilename(now);
    let filename = `lectura-backup-${type}-${dateStr}.json`;
    let targetPath = path.join(userDir, filename);

    // If file with exact minute already exists, append seconds
    if (fs.existsSync(targetPath)) {
      const seconds = String(now.getSeconds()).padStart(2, "0");
      filename = `lectura-backup-${type}-${dateStr}-${seconds}.json`;
      targetPath = path.join(userDir, filename);
    }

    const payload = {
      version: "1.0",
      backupType: type,
      username,
      exportDate: now.toISOString(),
      ...dbData,
    };

    const jsonContent = JSON.stringify(payload, null, 2);
    await fs.promises.writeFile(targetPath, jsonContent, "utf8");

    const stat = await fs.promises.stat(targetPath);

    // Update last backup timestamp if this was an auto or manual backup
    if (type === "auto" || type === "manual") {
      saveBackupSettings(userId, { lastBackupTime: now.toISOString() });
    }

    // Prune old backups respecting maxKeep
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
      username,
    };
  } catch (err) {
    console.error(`[BackupService] Failed to create backup for ${userId}:`, err);
    throw err;
  }
}

export async function pruneOldBackups(userId: string, maxKeep: number): Promise<number> {
  if (maxKeep <= 0) return 0;
  try {
    const userDir = getBackupsDir(userId);
    const files = await fs.promises.readdir(userDir);

    // Filter relevant backup files (auto and manual copies subject to retention)
    const backupFiles: { filename: string; path: string; mtime: number }[] = [];

    for (const file of files) {
      if (file.startsWith("lectura-backup-") && file.endsWith(".json")) {
        if (file.includes("-pre-restore-")) continue;
        const filePath = path.join(userDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          backupFiles.push({ filename: file, path: filePath, mtime: stat.mtimeMs });
        } catch (_) {}
      }
    }

    // Sort newest first
    backupFiles.sort((a, b) => b.mtime - a.mtime);

    let deletedCount = 0;
    if (backupFiles.length > maxKeep) {
      const filesToDelete = backupFiles.slice(maxKeep);
      for (const item of filesToDelete) {
        try {
          await fs.promises.unlink(item.path);
          deletedCount++;
        } catch (delErr) {
          console.error(`[BackupService] Failed to delete expired backup ${item.filename}:`, delErr);
        }
      }
    }

    // Also limit pre-restore snapshots to max 3
    const snapshotFiles: { filename: string; path: string; mtime: number }[] = [];
    for (const file of files) {
      if (file.includes("-pre-restore-") && file.endsWith(".json")) {
        const filePath = path.join(userDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          snapshotFiles.push({ filename: file, path: filePath, mtime: stat.mtimeMs });
        } catch (_) {}
      }
    }
    snapshotFiles.sort((a, b) => b.mtime - a.mtime);
    if (snapshotFiles.length > 3) {
      for (const snap of snapshotFiles.slice(3)) {
        try {
          await fs.promises.unlink(snap.path);
        } catch (_) {}
      }
    }

    return deletedCount;
  } catch (err) {
    console.error(`[BackupService] Error pruning backups for ${userId}:`, err);
    return 0;
  }
}

export async function listBackups(userId: string): Promise<BackupFileInfo[]> {
  try {
    const userDir = getBackupsDir(userId);
    const files = await fs.promises.readdir(userDir);
    const result: BackupFileInfo[] = [];

    for (const file of files) {
      if (file.startsWith("lectura-backup-") && file.endsWith(".json")) {
        const filePath = path.join(userDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          const isAuto = file.includes("-auto-");
          const isPreRestore = file.includes("-pre-restore-");
          const isManual = file.includes("-manual-");
          const type = isPreRestore ? "pre-restore" : isAuto ? "auto" : isManual ? "manual" : "custom";

          let exportDate: string | undefined;
          let lessonsCount: number | undefined;
          let wordsCount: number | undefined;
          let username: string | undefined;

          try {
            const content = await fs.promises.readFile(filePath, "utf8");
            const parsed = JSON.parse(content);
            exportDate = parsed.exportDate;
            username = parsed.username;
            lessonsCount = Array.isArray(parsed.lessons) ? parsed.lessons.length : 0;
            wordsCount = parsed.vocab ? Object.keys(parsed.vocab).length : (parsed.words ? Object.keys(parsed.words).length : 0);
          } catch (_) {}

          result.push({
            filename: file,
            size: stat.size,
            createdAt: stat.mtimeMs,
            isAuto,
            type,
            exportDate,
            lessonsCount,
            wordsCount,
            username,
          });
        } catch (_) {}
      }
    }

    // Sort newest first
    result.sort((a, b) => b.createdAt - a.createdAt);
    return result;
  } catch (err) {
    console.error(`[BackupService] Failed to list backups for ${userId}:`, err);
    return [];
  }
}

export async function restoreBackup(userId: string, filename: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Validate filename strictly against path traversal
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || !safeFilename.endsWith(".json") || !safeFilename.startsWith("lectura-backup-")) {
      return { success: false, error: "Invalid backup filename" };
    }

    const userDir = getBackupsDir(userId);
    const targetPath = path.join(userDir, safeFilename);

    if (!fs.existsSync(targetPath)) {
      return { success: false, error: "Backup file not found" };
    }

    const fileContent = await fs.promises.readFile(targetPath, "utf8");
    const parsedData = JSON.parse(fileContent);

    if (!parsedData || typeof parsedData !== "object") {
      return { success: false, error: "Invalid backup file structure" };
    }

    // 1. Create a safety pre-restore snapshot before modifying DB
    try {
      await createBackup(userId, "pre-restore");
    } catch (snapErr) {
      console.warn(`[BackupService] Failed to create pre-restore snapshot:`, snapErr);
    }

    // 2. Restore data into SQLite DB
    const saved = saveLocalServerDb(userId, parsedData);
    if (!saved) {
      return { success: false, error: "Database transaction failed during restore" };
    }

    // Return the fresh database state
    const refreshedData = getLocalServerDb(userId);
    return { success: true, data: refreshedData };
  } catch (err: any) {
    console.error(`[BackupService] Failed to restore backup for ${userId}:`, err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function deleteBackup(userId: string, filename: string): Promise<boolean> {
  try {
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || !safeFilename.endsWith(".json") || !safeFilename.startsWith("lectura-backup-")) {
      return false;
    }

    const userDir = getBackupsDir(userId);
    const targetPath = path.join(userDir, safeFilename);

    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[BackupService] Failed to delete backup ${filename} for ${userId}:`, err);
    return false;
  }
}

export function getBackupFilePath(userId: string, filename: string): string | null {
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith(".json") || !safeFilename.startsWith("lectura-backup-")) {
    return null;
  }

  const userDir = getBackupsDir(userId);
  const targetPath = path.join(userDir, safeFilename);
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }
  return null;
}

// Background scheduler
let schedulerInterval: NodeJS.Timeout | null = null;

export function startBackupScheduler(): void {
  if (schedulerInterval) return;

  const runSchedulerCheck = async () => {
    try {
      const db = getDbConnection("default");
      // Find all users
      const users = db.prepare("SELECT id FROM server_users").all() as { id: string }[];
      const userIds = users.map(u => u.id);
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
            const intervalMs = settings.intervalHours * 3600 * 1000;
            if (isNaN(lastTime) || now - lastTime >= intervalMs) {
              shouldBackup = true;
            }
          }

          if (shouldBackup) {
            // Check if user has any lessons or words
            const userDb = getLocalServerDb(uid);
            const hasData = (userDb?.lessons && userDb.lessons.length > 0) || (userDb?.vocab && Object.keys(userDb.vocab).length > 0);
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

  // Run initial check after 15 seconds of startup
  setTimeout(() => {
    runSchedulerCheck().catch(() => {});
  }, 15000);

  // Run periodic check every 10 minutes
  schedulerInterval = setInterval(() => {
    runSchedulerCheck().catch(() => {});
  }, 10 * 60 * 1000);

  console.log("[BackupScheduler] Automatic backup scheduler initialized (10m tick).");
}
