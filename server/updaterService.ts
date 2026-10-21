import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { exec } from "child_process";
import { promisify } from "util";
import AdmZip from "adm-zip";
import { getDbConnection, SQLITE_DB_PATH } from "../routes/dbConnection.ts";
import { createBackup } from "./backupService.ts";
import { APP_VERSION } from "../src/version.ts";

const execAsync = promisify(exec);

const GITHUB_REPO = "rustams1990/Lectura";
const RAW_PACKAGE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json`;
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const COMMITS_URL = `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&per_page=8`;
const MAIN_ZIP_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const LAST_VERSION_FILE = path.join(DATA_DIR, ".last_run_version");

export interface SystemUpdateEnvironment {
  isDocker: boolean;
  hasGit: boolean;
  platform: string;
  canOneClickUpdate: boolean;
}

export interface SystemUpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  apkDownloadUrl?: string;
  apkSize?: number;
  hasUpdate: boolean;
  environment: SystemUpdateEnvironment;
}

export interface UpdateProgressState {
  status: "idle" | "backup" | "downloading" | "installing" | "building" | "restarting" | "completed" | "error";
  progress: number;
  stepKey: string;
  message: string;
  error?: string;
  targetVersion?: string;
  startedAt?: number;
}

let cachedCheckResult: { data: SystemUpdateCheckResult; timestamp: number } | null = null;
const CHECK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let updateProgress: UpdateProgressState = {
  status: "idle",
  progress: 0,
  stepKey: "idle",
  message: "",
};

/**
 * Semver comparison helper (returns 1 if a > b, -1 if a < b, 0 if equal)
 */
export function compareSemver(a: string, b: string): number {
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

/**
 * Reads the live version from package.json on disk (fallback to APP_VERSION)
 */
export function getLiveServerVersion(): string {
  if (process.env.NODE_ENV === "production") {
    return APP_VERSION;
  }
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.version) {
        return `v${String(pkg.version).replace(/^v/i, "")}`;
      }
    }
  } catch (_) {}
  return APP_VERSION;
}

/**
 * Detects current runtime environment capabilities
 */
export function getSystemEnvironment(): SystemUpdateEnvironment {
  const isDocker = fs.existsSync("/.dockerenv") || process.env.IS_DOCKER === "true";
  const hasGit = fs.existsSync(path.join(process.cwd(), ".git"));
  return {
    isDocker,
    hasGit,
    platform: process.platform,
    canOneClickUpdate: true,
  };
}

/**
 * Formats timestamp for backup filenames
 */
function formatTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Creates a full SQLite file backup in DATA_DIR/backups (and prunes old SQLite backups to max 7)
 * Conforms strictly to Dogma #4 (Mandatory DB backup prior to updates) and Dogma #3 (Disk space control)
 */
export async function createSqliteSnapshotBackup(reasonLabel = "pre_update"): Promise<string | null> {
  try {
    if (!fs.existsSync(SQLITE_DB_PATH)) {
      return null;
    }

    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const safeReason = reasonLabel.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `db_backup_${safeReason}_${formatTimestamp()}.sqlite`;
    const destPath = path.join(BACKUPS_DIR, filename);

    try {
      const db = getDbConnection("default");
      await db.backup(destPath);
    } catch (backupApiErr) {
      // Fallback to direct file copy if .backup() fails
      fs.copyFileSync(SQLITE_DB_PATH, destPath);
    }

    console.log(`[Updater] Created mandatory SQLite backup: ${destPath}`);

    // Also mirror to root ./backups if DATA_DIR is different and ./backups exists
    const rootBackups = path.join(process.cwd(), "backups");
    if (path.resolve(rootBackups) !== path.resolve(BACKUPS_DIR)) {
      try {
        if (!fs.existsSync(rootBackups)) {
          fs.mkdirSync(rootBackups, { recursive: true });
        }
        fs.copyFileSync(destPath, path.join(rootBackups, filename));
      } catch (_) {}
    }

    // Prune older SQLite snapshots to keep latest 7
    await pruneSqliteSnapshots(BACKUPS_DIR, 7);
    if (path.resolve(rootBackups) !== path.resolve(BACKUPS_DIR) && fs.existsSync(rootBackups)) {
      await pruneSqliteSnapshots(rootBackups, 7);
    }

    // Also create user-scoped JSON backups for active users
    try {
      const db = getDbConnection("default");
      const users = db.prepare("SELECT id FROM server_users").all() as { id: string }[];
      const userIds = users.map((u) => u.id);
      if (!userIds.includes("default")) userIds.push("default");
      for (const uid of userIds) {
        try {
          await createBackup(uid, "auto");
        } catch (_) {}
      }
    } catch (_) {}

    return destPath;
  } catch (err) {
    console.error("[Updater] Failed to create SQLite backup:", err);
    throw err;
  }
}

async function pruneSqliteSnapshots(dir: string, maxKeep: number): Promise<void> {
  try {
    const files = await fs.promises.readdir(dir);
    const sqliteFiles: { name: string; fullPath: string; mtime: number }[] = [];

    for (const f of files) {
      if (f.startsWith("db_backup_") && f.endsWith(".sqlite")) {
        const fullPath = path.join(dir, f);
        try {
          const st = await fs.promises.stat(fullPath);
          sqliteFiles.push({ name: f, fullPath, mtime: st.mtimeMs });
        } catch (_) {}
      }
    }

    sqliteFiles.sort((a, b) => b.mtime - a.mtime);
    if (sqliteFiles.length > maxKeep) {
      for (const oldFile of sqliteFiles.slice(maxKeep)) {
        try {
          await fs.promises.unlink(oldFile.fullPath);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/**
 * Runs on server startup:
 * 1. Ensures src/version.ts matches package.json in dev environments
 * 2. If version changed since last run (e.g. Watchtower or Docker recreate), creates an automatic DB snapshot
 */
export async function ensureStartupVersionCheckAndBackup(): Promise<void> {
  try {
    const currentVersion = getLiveServerVersion();

    // Sync src/version.ts if src folder exists and differs
    const versionTsPath = path.join(process.cwd(), "src", "version.ts");
    if (fs.existsSync(path.dirname(versionTsPath))) {
      const expectedContent = `export const APP_VERSION = "${currentVersion}";\n`;
      const existingContent = fs.existsSync(versionTsPath) ? fs.readFileSync(versionTsPath, "utf8") : "";
      if (existingContent !== expectedContent) {
        try {
          fs.writeFileSync(versionTsPath, expectedContent, "utf8");
        } catch (_) {}
      }
    }

    let lastVersion = "";
    if (fs.existsSync(LAST_VERSION_FILE)) {
      lastVersion = fs.readFileSync(LAST_VERSION_FILE, "utf8").trim();
    }

    if (lastVersion && lastVersion !== currentVersion) {
      console.log(`[Updater] Version transition detected (${lastVersion} -> ${currentVersion}). Creating safety DB backup...`);
      await createSqliteSnapshotBackup(`upgrade_from_${lastVersion}_to_${currentVersion}`);
    } else if (!lastVersion && fs.existsSync(SQLITE_DB_PATH)) {
      await createSqliteSnapshotBackup(`init_${currentVersion}`);
    }

    fs.writeFileSync(LAST_VERSION_FILE, currentVersion, "utf8");
  } catch (err) {
    console.warn("[Updater] Startup version check warning:", err);
  }
}

/**
 * Checks GitHub for newer version (checks both package.json on main and latest GitHub Release)
 */
export async function checkSystemUpdate(force = false): Promise<SystemUpdateCheckResult> {
  const currentVersion = getLiveServerVersion();
  const environment = getSystemEnvironment();

  if (!force && cachedCheckResult && Date.now() - cachedCheckResult.timestamp < CHECK_CACHE_TTL_MS) {
    const cached = cachedCheckResult.data;
    const isNewer = compareSemver(cached.latestVersion, currentVersion) > 0;
    return {
      ...cached,
      currentVersion,
      hasUpdate: isNewer,
      environment,
    };
  }

  let latestVersion = currentVersion;
  let releaseName = currentVersion;
  let releaseBody = "";
  let publishedAt = new Date().toISOString();
  let htmlUrl = `https://github.com/${GITHUB_REPO}`;
  let apkDownloadUrl: string | undefined;
  let apkSize: number | undefined;

  // 1. Check raw package.json on main branch (always reflects latest pushed version)
  try {
    const pkgRes = await fetch(`${RAW_PACKAGE_URL}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (pkgRes.ok) {
      const pkgData = (await pkgRes.json()) as { version?: string };
      if (pkgData?.version) {
        const mainVer = `v${String(pkgData.version).replace(/^v/i, "").trim()}`;
        if (compareSemver(mainVer, latestVersion) > 0) {
          latestVersion = mainVer;
          releaseName = `Lectura ${mainVer}`;
        }
      }
    }
  } catch (_) {}

  // 2. Check GitHub Releases API (for APK assets and release notes)
  try {
    const relRes = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Lectura-Updater",
      },
    });
    if (relRes.ok) {
      const relData = (await relRes.json()) as any;
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
            (a: any) => a.name && (a.name.endsWith(".apk") || a.content_type === "application/vnd.android.package-archive")
          );
          if (apkAsset) {
            apkDownloadUrl = apkAsset.browser_download_url;
            apkSize = apkAsset.size;
          }
        }
      }
    }
  } catch (_) {}

  // 3. If releaseBody is empty (e.g. version bumped on main without a matching GitHub Release body), fetch recent commits
  if (!releaseBody) {
    try {
      const commitsRes = await fetch(COMMITS_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Lectura-Updater",
        },
      });
      if (commitsRes.ok) {
        const commitsData = (await commitsRes.json()) as any[];
        if (Array.isArray(commitsData) && commitsData.length > 0) {
          publishedAt = commitsData[0]?.commit?.committer?.date || publishedAt;
          htmlUrl = `https://github.com/${GITHUB_REPO}/commits/main`;
          const lines: string[] = [];
          for (const c of commitsData) {
            const firstLine = String(c?.commit?.message || "")
              .split("\n")[0]
              .trim();
            if (firstLine && !firstLine.toLowerCase().startsWith("merge ")) {
              lines.push(`• ${firstLine}`);
            }
            if (lines.length >= 6) break;
          }
          if (lines.length > 0) {
            releaseBody = lines.join("\n");
          }
        }
      }
    } catch (_) {}
  }

  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

  const result: SystemUpdateCheckResult = {
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
    environment,
  };

  cachedCheckResult = {
    data: result,
    timestamp: Date.now(),
  };

  return result;
}

export function getUpdateProgress(): UpdateProgressState {
  return updateProgress;
}

// Protected user data paths that must NEVER be overwritten during ZIP extraction
const PROTECTED_RELATIVE_PATHS = new Set([
  ".env",
  ".last_run_version",
  "local_server_db.sqlite",
  "local_server_db.sqlite-shm",
  "local_server_db.sqlite-wal",
  "ai_cache.sqlite",
  "ai_cache.sqlite-shm",
  "ai_cache.sqlite-wal",
  "lectura.db",
]);

const PROTECTED_DIR_PREFIXES = [
  "backups/",
  "data/",
  "media/",
  "audio_files/",
  "audio_cache/",
  "image_cache/",
  "node_modules/",
  ".git/",
];

function isProtectedPath(relPath: string): boolean {
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

/**
 * Downloads and extracts latest main.zip from GitHub.
 * In dev mode (tsx watch), holds back server.ts and src/version.ts until dependencies are installed
 * so tsx watch does not prematurely restart the server mid-update.
 */
async function downloadAndExtractGitHubZip(holdEntryFilesForDevWatch: boolean): Promise<{
  deferredFiles: { fullPath: string; content: Buffer }[];
  newPackageJson: any;
  extractedPrebuiltDist: boolean;
}> {
  const tmpZipPath = path.join(os.tmpdir(), `lectura_update_${Date.now()}.zip`);
  try {
    const res = await fetch(MAIN_ZIP_URL, {
      headers: { "User-Agent": "Lectura-Updater" },
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download update archive from GitHub (HTTP ${res.status})`);
    }

    // Stream ZIP directly to disk to keep RAM usage minimal inside 256MB Docker containers
    const fileStream = fs.createWriteStream(tmpZipPath);
    await pipeline(Readable.fromWeb(res.body as any), fileStream);

    const zip = new AdmZip(tmpZipPath);
    const entries = zip.getEntries();

    const deferredFiles: { fullPath: string; content: Buffer }[] = [];
    let newPackageJson: any = null;
    let hasDistServer = false;
    let hasDistIndex = false;
    const rootDir = process.cwd();

    // Check if the archive includes pre-built dist/ files
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.split("/");
      if (parts.length < 2) continue;
      const relPath = parts.slice(1).join("/");
      if (relPath === "dist/server.cjs") hasDistServer = true;
      if (relPath === "dist/index.html") hasDistIndex = true;
    }

    // Clean old hashed assets in dist/assets before extracting new ones
    if (hasDistServer && hasDistIndex) {
      const distAssetsDir = path.join(rootDir, "dist", "assets");
      if (fs.existsSync(distAssetsDir)) {
        try {
          fs.rmSync(distAssetsDir, { recursive: true, force: true });
        } catch (_) {}
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      // Strip top-level folder (e.g. "Lectura-main/")
      const parts = entry.entryName.split("/");
      if (parts.length < 2) continue;
      const relPath = parts.slice(1).join("/");
      if (!relPath || isProtectedPath(relPath)) continue;

      const fullPath = path.join(rootDir, relPath);
      const data = entry.getData();

      if (relPath === "package.json") {
        try {
          newPackageJson = JSON.parse(data.toString("utf8"));
        } catch (_) {}
      }

      if (holdEntryFilesForDevWatch && (relPath === "server.ts" || relPath === "src/version.ts")) {
        deferredFiles.push({ fullPath, content: data });
        continue;
      }

      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, data);
    }

    return {
      deferredFiles,
      newPackageJson,
      extractedPrebuiltDist: hasDistServer && hasDistIndex,
    };
  } finally {
    try {
      if (fs.existsSync(tmpZipPath)) {
        fs.unlinkSync(tmpZipPath);
      }
    } catch (_) {}
  }
}

/**
 * Executes the full automatic update pipeline in the background:
 * 1. Mandatory SQLite & User JSON Backup
 * 2. Pull / Download latest code from GitHub
 * 3. Install dependencies (if changed) & Build (in production/Docker)
 * 4. Restart server process automatically
 */
export async function startSystemUpdate(): Promise<{ started: boolean; message: string }> {
  if (
    updateProgress.status !== "idle" &&
    updateProgress.status !== "error" &&
    updateProgress.status !== "completed"
  ) {
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
    startedAt: Date.now(),
  };

  // Run pipeline asynchronously so HTTP request returns immediately
  (async () => {
    try {
      const rootDir = process.cwd();
      const isProd = process.env.NODE_ENV === "production";
      const isDevWatch = !isProd;

      // Read current package.json before update to compare dependencies
      let oldDepsJson = "";
      try {
        const oldPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
        oldDepsJson = JSON.stringify({
          d: oldPkg.dependencies || {},
          dev: oldPkg.devDependencies || {},
        });
      } catch (_) {}

      // STEP 1: Mandatory Database Backup (Dogma #4)
      await createSqliteSnapshotBackup(`pre_update_to_${targetVersion}`);

      // STEP 2: Download new code
      updateProgress = {
        ...updateProgress,
        status: "downloading",
        progress: 40,
        stepKey: "downloading",
        message: `Downloading Lectura ${targetVersion} from GitHub...`,
      };

      let deferredFiles: { fullPath: string; content: Buffer }[] = [];
      let usedGit = false;
      let hasPrebuiltDist = false;

      if (fs.existsSync(path.join(rootDir, ".git")) && !isDevWatch) {
        try {
          await execAsync("git fetch origin main", { cwd: rootDir, timeout: 45000 });
          await execAsync("git reset --hard origin/main", { cwd: rootDir, timeout: 30000 });
          usedGit = true;
          hasPrebuiltDist =
            fs.existsSync(path.join(rootDir, "dist", "server.cjs")) &&
            fs.existsSync(path.join(rootDir, "dist", "index.html"));
        } catch (gitErr) {
          console.warn("[Updater] Git update fallback to ZIP archive:", gitErr);
        }
      }

      if (!usedGit) {
        const zipResult = await downloadAndExtractGitHubZip(isDevWatch);
        deferredFiles = zipResult.deferredFiles;
        hasPrebuiltDist = zipResult.extractedPrebuiltDist;
      }

      // Check if dependencies changed
      let newDepsJson = "";
      let newVersionClean = targetVersion.replace(/^v/i, "");
      try {
        const newPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
        if (newPkg.version) newVersionClean = String(newPkg.version).replace(/^v/i, "");
        newDepsJson = JSON.stringify({
          d: newPkg.dependencies || {},
          dev: newPkg.devDependencies || {},
        });
      } catch (_) {}

      const depsChanged = oldDepsJson !== newDepsJson;

      // STEP 3: Install dependencies (if changed) & Build
      if (depsChanged) {
        updateProgress = {
          ...updateProgress,
          status: "installing",
          progress: 65,
          stepKey: "installing",
          message: "Updating npm packages...",
        };
        await execAsync("npm install --no-audit --no-fund", {
          cwd: rootDir,
          timeout: 5 * 60 * 1000,
          env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" },
        });
      }

      const finalVersionTag = `v${newVersionClean}`;
      const versionTsContent = `export const APP_VERSION = "${finalVersionTag}";\n`;
      const versionTsPath = path.join(rootDir, "src", "version.ts");

      if (isProd) {
        // Write src/version.ts
        if (!fs.existsSync(path.dirname(versionTsPath))) {
          fs.mkdirSync(path.dirname(versionTsPath), { recursive: true });
        }
        fs.writeFileSync(versionTsPath, versionTsContent, "utf8");

        // Only run `npm run build` if pre-built dist/ files were NOT included in the release archive
        if (!hasPrebuiltDist) {
          updateProgress = {
            ...updateProgress,
            status: "building",
            progress: 80,
            stepKey: "building",
            message: "Building updated application bundle...",
          };

          await execAsync("npm run build", {
            cwd: rootDir,
            timeout: 5 * 60 * 1000,
            env: {
              ...process.env,
              NODE_ENV: "development",
              NODE_OPTIONS: "--max-old-space-size=1024",
            },
          });
        }
      }

      // Record updated version in .last_run_version so startup knows backup was already created
      try {
        fs.writeFileSync(LAST_VERSION_FILE, finalVersionTag, "utf8");
      } catch (_) {}

      // Clear cached update check
      cachedCheckResult = null;

      // STEP 4: Restarting
      updateProgress = {
        ...updateProgress,
        status: "restarting",
        progress: 95,
        stepKey: "restarting",
        message: `Restarting server with ${finalVersionTag}...`,
        targetVersion: finalVersionTag,
      };

      // Give frontend 1.2s to poll the "restarting" status before restarting process
      setTimeout(async () => {
        try {
          if (isDevWatch) {
            // If .git exists, sync git HEAD quietly so git status stays clean
            if (fs.existsSync(path.join(rootDir, ".git"))) {
              try {
                await execAsync("git fetch origin main", { cwd: rootDir, timeout: 15000 });
                await execAsync("git reset --soft origin/main", { cwd: rootDir, timeout: 15000 });
              } catch (_) {}
            }

            // Write deferred server.ts and src/version.ts now -> tsx watch immediately restarts the server!
            for (const item of deferredFiles) {
              const dir = path.dirname(item.fullPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(item.fullPath, item.content);
            }
            fs.writeFileSync(versionTsPath, versionTsContent, "utf8");

            // Touch server.ts to guarantee tsx watch triggers a reload
            const serverTsPath = path.join(rootDir, "server.ts");
            if (fs.existsSync(serverTsPath)) {
              const now = new Date();
              fs.utimesSync(serverTsPath, now, now);
            }

            updateProgress = {
              ...updateProgress,
              status: "completed",
              progress: 100,
              stepKey: "completed",
              message: `Updated to ${finalVersionTag}`,
            };
          } else {
            // Production / Docker mode (restart: unless-stopped restarts container immediately)
            console.log(`[Updater] Update to ${finalVersionTag} complete. Exiting process for automatic restart...`);
            process.exit(0);
          }
        } catch (restartErr) {
          console.error("[Updater] Restart step error:", restartErr);
        }
      }, 1200);
    } catch (err: any) {
      console.error("[Updater] Update failed:", err);
      updateProgress = {
        status: "error",
        progress: 0,
        stepKey: "error",
        message: err?.message || "Update failed",
        error: err?.message || String(err),
      };
    }
  })();

  return { started: true, message: "Update started" };
}
