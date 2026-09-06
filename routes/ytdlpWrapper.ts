import fs from "fs";
import defaultYtDlp, { create } from "yt-dlp-exec";

let cachedYtDlp: typeof defaultYtDlp | null = null;

export function getYtDlp(): typeof defaultYtDlp {
  if (cachedYtDlp) return cachedYtDlp;

  // Check system locations (e.g. Linux container with pip install yt-dlp)
  const systemPaths = [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "/bin/yt-dlp",
    "C:\\Program Files\\yt-dlp\\yt-dlp.exe",
  ];

  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      try {
        cachedYtDlp = create(p);
        console.log(`[yt-dlp] Using system yt-dlp binary at: ${p}`);
        return cachedYtDlp;
      } catch (_) {}
    }
  }

  // Fallback to bundled npm binary
  cachedYtDlp = defaultYtDlp;
  return cachedYtDlp;
}

export default getYtDlp;
