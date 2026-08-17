import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import util from "util";
import { getDbConnection } from "./dbConnection.ts";

const router = Router();

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AVATARS_DIR = path.join(DATA_DIR, "media", "avatars");
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

// Rate limiter for authentication endpoints (login & register)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Generous limit for home/local servers
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: "Слишком много попыток входа или регистрации. Пожалуйста, подождите 15 минут.",
    retryAfter: 900
  },
});

// ============================================================
const pbkdf2Async = util.promisify(crypto.pbkdf2);

// Password Hashing and Verification (pbkdf2 async)
// ============================================================

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 310000;
  const hashBuffer = await pbkdf2Async(password, salt, iterations, 64, "sha512");
  return `${iterations}:${salt}:${hashBuffer.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length === 2) {
    // Legacy format: salt:hash (1000 iterations)
    const [salt, originalHash] = parts;
    const hashBuffer = (await pbkdf2Async(password, salt, 1000, 64, "sha512")).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hashBuffer, "hex"), Buffer.from(originalHash, "hex"));
  } else if (parts.length === 3) {
    // Modern format: iterations:salt:hash
    const [iterStr, salt, originalHash] = parts;
    const iterations = parseInt(iterStr, 10);
    const hashBuffer = (await pbkdf2Async(password, salt, iterations, 64, "sha512")).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hashBuffer, "hex"), Buffer.from(originalHash, "hex"));
  }
  return false;
}

// ============================================================
// Multi-Account User Resolution and Middlewares
// ============================================================

export function resolveUserId(req: Request): string {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const db = getDbConnection("default");
    const session = db.prepare("SELECT user_id, expires_at FROM server_sessions WHERE token = ?").get(token) as any;
    if (session) {
      if (session.expires_at && session.expires_at < Date.now()) {
        db.prepare("DELETE FROM server_sessions WHERE token = ?").run(token);
        throw new Error("UNAUTHORIZED_TOKEN");
      }
      return session.user_id;
    } else {
      throw new Error("UNAUTHORIZED_TOKEN");
    }
  }

  const expectedKey = process.env.LOCAL_SYNC_KEY;
  if (expectedKey) {
    const clientKey = (req.headers["x-local-sync-key"] as string) || (req.query.sync_key as string);
    if (clientKey !== expectedKey) {
      console.warn(`[resolveUserId] Fallback sync key check failed.`);
      throw new Error("UNAUTHORIZED_SYNC_KEY");
    }
  }

  const resolved = String(req.headers["x-local-sync-user"] || req.query.sync_user || "default");
  return resolved;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = resolveUserId(req);
    (req as any).userId = userId;
    next();
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }
}

export function requireLocalSyncKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.LOCAL_SYNC_KEY;
  if (!expectedKey) {
    return next();
  }
  const clientKey = req.headers["x-local-sync-key"] || req.query.sync_key;
  if (clientKey === expectedKey) {
    return next();
  }
  return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
}

// ============================================================
// Authentication & Profile Routes
// ============================================================

// 1. User Registration
router.post("/register", authRateLimit, async (req: Request, res: Response) => {
  const emailInput = req.body.email || req.body.username;
  const { password, name, passwordHint, avatarUrl } = req.body;
  if (!emailInput || !password) {
    return res.status(400).json({ error: "Email и пароль обязательны" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
  }

  const cleanEmail = String(emailInput).trim().toLowerCase();
  const cleanName = name ? String(name).trim() : cleanEmail.split("@")[0];
  const cleanHint = passwordHint && String(passwordHint).trim() ? String(passwordHint).trim() : null;
  const cleanAvatar = avatarUrl && String(avatarUrl).trim() ? String(avatarUrl).trim() : null;

  const db = getDbConnection("default");
  try {
    const existing = db.prepare("SELECT id FROM server_users WHERE email = ?").get(cleanEmail) as any;
    if (existing) {
      return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
    }

    const userId = "usr_" + crypto.randomBytes(16).toString("hex");
    const pwdHash = await hashPassword(password);
    const createdAt = Date.now();

    db.prepare("INSERT INTO server_users (id, email, password_hash, display_name, avatarUrl, passwordHint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, cleanEmail, pwdHash, cleanName, cleanAvatar, cleanHint, createdAt);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, userId, expiresAt);

    return res.json({
      token,
      user: {
        uid: userId,
        id: userId,
        email: cleanEmail,
        username: cleanEmail,
        displayName: cleanName,
        avatarUrl: cleanAvatar,
        passwordHint: cleanHint
      }
    });
  } catch (err: any) {
    console.error("[AUTH REGISTER] Error:", err);
    return res.status(500).json({ error: "Ошибка при регистрации пользователя: " + err.message });
  }
});

// 2. User Login
router.post("/login", authRateLimit, async (req: Request, res: Response) => {
  const emailInput = req.body.email || req.body.username;
  const { password } = req.body;
  if (!emailInput || !password) {
    return res.status(400).json({ error: "Email и пароль обязательны" });
  }

  const cleanEmail = String(emailInput).trim().toLowerCase();

  const db = getDbConnection("default");

  try {
    const user = db.prepare("SELECT * FROM server_users WHERE lower(email) = ?").get(cleanEmail) as any;
    if (!user) {
      return res.status(400).json({ error: "Неверный логин или пароль" });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: "Неверный логин или пароль" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, user.id, expiresAt);

    return res.json({
      token,
      user: {
        uid: user.id,
        id: user.id,
        email: user.email,
        username: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatarUrl || null,
        passwordHint: user.passwordHint || null
      }
    });
  } catch (err: any) {
    console.error("[AUTH LOGIN] Error:", err);
    return res.status(500).json({ error: "Ошибка авторизации: " + err.message });
  }
});

// 3. User Logout
router.post("/logout", (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.json({ status: "success" });
  }

  const db = getDbConnection("default");
  try {
    db.prepare("DELETE FROM server_sessions WHERE token = ?").run(token);
    return res.json({ status: "success" });
  } catch (err: any) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Ошибка при выходе: " + err.message });
  }
});

// 4. Current User Session Check
router.get("/me", (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Не авторизован" });
  }

  const db = getDbConnection("default");
  try {
    const session = db.prepare("SELECT * FROM server_sessions WHERE token = ? AND expires_at > ?").get(token, Date.now()) as any;
    if (!session) {
      return res.status(401).json({ error: "Сессия истекла или недействительна" });
    }

    const user = db.prepare("SELECT id, email, display_name, avatarUrl, passwordHint FROM server_users WHERE id = ?").get(session.user_id) as any;
    if (!user) {
      return res.status(401).json({ error: "Пользователь не найден" });
    }

    return res.json({
      user: {
        uid: user.id,
        id: user.id,
        email: user.email,
        username: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatarUrl || null,
        passwordHint: user.passwordHint || null
      }
    });
  } catch (err: any) {
    console.error("Auth check error:", err);
    return res.status(500).json({ error: "Ошибка при проверке авторизации: " + err.message });
  }
});

// 5. Retrieve Password Hint (Public helper with rate limiting)
router.get("/password-hint", authRateLimit, (req: Request, res: Response) => {
  try {
    const queryUser = req.query.username || req.query.email || req.query.login;
    if (!queryUser) {
      return res.json({ hint: null });
    }
    const cleanQuery = String(queryUser).trim().toLowerCase();
    if (!cleanQuery) {
      return res.json({ hint: null });
    }

    const db = getDbConnection("default");
    const user = db.prepare("SELECT passwordHint FROM server_users WHERE lower(email) = ? LIMIT 1").get(cleanQuery) as any;
    
    if (!user || !user.passwordHint || !String(user.passwordHint).trim()) {
      return res.json({ hint: null });
    }

    return res.json({ hint: String(user.passwordHint).trim() });
  } catch (err: any) {
    console.error("[AUTH PASSWORD-HINT] Error:", err);
    return res.json({ hint: null });
  }
});

// 6. Update User Profile (displayName, avatarUrl, passwordHint)
const updateProfileHandler = (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { displayName, name, avatarUrl, passwordHint } = req.body;
  const db = getDbConnection("default");

  try {
    const user = db.prepare("SELECT id, email, display_name, avatarUrl, passwordHint FROM server_users WHERE id = ?").get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const newName = (displayName !== undefined || name !== undefined) 
      ? String(displayName ?? name).trim() 
      : user.display_name;

    const newAvatar = avatarUrl !== undefined 
      ? (avatarUrl ? String(avatarUrl).trim() : null) 
      : (user.avatarUrl || null);

    const newHint = passwordHint !== undefined 
      ? (passwordHint ? String(passwordHint).trim() : null) 
      : (user.passwordHint || null);

    db.prepare("UPDATE server_users SET display_name = ?, avatarUrl = ?, passwordHint = ? WHERE id = ?")
      .run(newName, newAvatar, newHint, userId);

    return res.json({
      success: true,
      user: {
        uid: user.id,
        id: user.id,
        email: user.email,
        username: user.email,
        displayName: newName,
        avatarUrl: newAvatar,
        passwordHint: newHint
      }
    });
  } catch (err: any) {
    console.error("[AUTH PROFILE UPDATE] Error:", err);
    return res.status(500).json({ error: "Ошибка при обновлении профиля: " + err.message });
  }
};

router.put("/profile", requireAuth, updateProfileHandler);
router.patch("/profile", requireAuth, updateProfileHandler);

// 7. Change Password
router.put("/change-password", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { currentPassword, newPassword, passwordHint } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Текущий и новый пароль обязательны" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Новый пароль должен содержать не менее 6 символов" });
  }

  const db = getDbConnection("default");
  try {
    const user = db.prepare("SELECT * FROM server_users WHERE id = ?").get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: "Неверный текущий пароль" });
    }

    const newHash = await hashPassword(newPassword);
    const newHint = passwordHint !== undefined 
      ? (passwordHint ? String(passwordHint).trim() : null) 
      : (user.passwordHint || null);

    db.prepare("UPDATE server_users SET password_hash = ?, passwordHint = ? WHERE id = ?")
      .run(newHash, newHint, userId);

    return res.json({
      success: true,
      message: "Пароль успешно изменен",
      passwordHint: newHint
    });
  } catch (err: any) {
    console.error("[AUTH CHANGE-PASSWORD] Error:", err);
    return res.status(500).json({ error: "Ошибка при смене пароля: " + err.message });
  }
});

// 8. Avatar Upload & Storage
router.post("/avatar-upload", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { imageBase64, avatarData } = req.body;
  const dataStr = imageBase64 || avatarData;

  if (!dataStr) {
    return res.status(400).json({ error: "Изображение не передано" });
  }

  try {
    const matches = String(dataStr).match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      const filename = `avatar_${userId}_${Date.now()}.${ext}`;
      const filePath = path.join(AVATARS_DIR, filename);
      fs.writeFileSync(filePath, buffer);

      const avatarUrl = `/api/auth/avatar/${filename}`;
      const db = getDbConnection("default");
      db.prepare("UPDATE server_users SET avatarUrl = ? WHERE id = ?").run(avatarUrl, userId);

      return res.json({ success: true, avatarUrl });
    } else {
      // Direct URL or emoji/preset string
      const cleanUrl = String(dataStr).trim();
      const db = getDbConnection("default");
      db.prepare("UPDATE server_users SET avatarUrl = ? WHERE id = ?").run(cleanUrl, userId);
      return res.json({ success: true, avatarUrl: cleanUrl });
    }
  } catch (err: any) {
    console.error("[AUTH AVATAR-UPLOAD] Error:", err);
    return res.status(500).json({ error: "Ошибка сохранения аватара: " + err.message });
  }
});

// 9. Serve Avatar Image
router.get("/avatar/:filename", (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(AVATARS_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "Аватар не найден" });
  }
});

export default router;
