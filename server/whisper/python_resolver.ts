import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";

/**
 * Resolves the best Python executable to use for faster-whisper.
 * Priority:
 * 1. WHISPER_PYTHON_PATH env var
 * 2. Local virtual environment ./venv (Windows or Linux/macOS)
 * 3. Sibling whisperflow ./venv
 * 4. System python3 / python
 */
export function resolvePythonExecutable(): string {
  // 1. Explicit env var
  if (process.env.WHISPER_PYTHON_PATH && fs.existsSync(process.env.WHISPER_PYTHON_PATH)) {
    return process.env.WHISPER_PYTHON_PATH;
  }

  // 2. Local ./venv
  const projectRoot = process.cwd();
  const venvWindows = path.join(projectRoot, "venv", "Scripts", "python.exe");
  const venvUnix = path.join(projectRoot, "venv", "bin", "python");

  if (fs.existsSync(venvWindows)) return venvWindows;
  if (fs.existsSync(venvUnix)) return venvUnix;

  // Sibling project directory venv
  const whisperflowVenvWin = path.join(projectRoot, "..", "whisperflow-audio-transcription-&-alignment", "venv", "Scripts", "python.exe");
  const whisperflowVenvUnix = path.join(projectRoot, "..", "whisperflow-audio-transcription-&-alignment", "venv", "bin", "python");
  if (fs.existsSync(whisperflowVenvWin)) return whisperflowVenvWin;
  if (fs.existsSync(whisperflowVenvUnix)) return whisperflowVenvUnix;

  // 3. Fallback to system command
  const candidates = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch (_) {}
  }

  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Checks if faster-whisper is installed in the resolved Python environment
 */
export async function checkWhisperEnvironment(): Promise<{ available: boolean; pythonPath: string; error?: string }> {
  const pythonPath = resolvePythonExecutable();
  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ["-c", "import faster_whisper; print('OK')"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code === 0 && stdout.includes("OK")) {
        resolve({ available: true, pythonPath });
      } else {
        resolve({ 
          available: false, 
          pythonPath, 
          error: stderr.trim() || "faster-whisper module not installed in Python environment" 
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ available: false, pythonPath, error: err.message });
    });
  });
}
