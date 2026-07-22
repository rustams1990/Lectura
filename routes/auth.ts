import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getDbConnection } from "./dbConnection.ts";

const router = Router();

// ============================================================
// Password Hashing and Verification (pbkdf2)
// ============================================================

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === originalHash;
}

// ============================================================
// Auth & Session Resolution Helpers
// ============================================================

export function resolveUserId(req: Request): string {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (token) {
    const db = getDbConnection("default");
    const session = db.prepare("SELECT user_id FROM server_sessions WHERE token = ? AND expires_at > ?").get(token, Date.now()) as any;
    if (session) {
      return session.user_id;
    }
    console.warn(`[resolveUserId] Token provided but session not found/expired in database.`);
    throw new Error("UNAUTHORIZED_TOKEN");
  }

  // Fallback to local sync key for backward compatibility/guests
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
// Authentication Routes
// ============================================================

// 1. User Registration
router.post("/register", (req: Request, res: Response) => {
  const emailInput = req.body.email || req.body.username;
  const { password, name } = req.body;
  if (!emailInput || !password) {
    return res.status(400).json({ error: "Email и пароль обязательны" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
  }

  const cleanEmail = String(emailInput).trim().toLowerCase();
  const cleanName = name ? String(name).trim() : cleanEmail.split("@")[0];

  const db = getDbConnection("default");
  try {
    const existing = db.prepare("SELECT id FROM server_users WHERE email = ?").get(cleanEmail) as any;
    if (existing) {
      return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
    }

    const userId = "usr_" + crypto.randomBytes(16).toString("hex");
    const pwdHash = hashPassword(password);
    const createdAt = Date.now();

    db.prepare("INSERT INTO server_users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, cleanEmail, pwdHash, cleanName, createdAt);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, userId, expiresAt);

    return res.json({
      token,
      user: {
        uid: userId,
        email: cleanEmail,
        displayName: cleanName
      }
    });
  } catch (err: any) {
    console.error("[AUTH REGISTER] Error:", err);
    return res.status(500).json({ error: "Ошибка при регистрации пользователя: " + err.message });
  }
});

// 2. User Login
router.post("/login", (req: Request, res: Response) => {
  const emailInput = req.body.email || req.body.username;
  const { password } = req.body;
  if (!emailInput || !password) {
    return res.status(400).json({ error: "Email и пароль обязательны" });
  }

  const cleanEmail = String(emailInput).trim().toLowerCase();

  const db = getDbConnection("default");

  try {
    const user = db.prepare("SELECT * FROM server_users WHERE email = ?").get(cleanEmail) as any;
    if (!user) {
      return res.status(400).json({ error: "Неверный логин или пароль" });
    }

    const isValid = verifyPassword(password, user.password_hash);
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
        email: user.email,
        displayName: user.display_name
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

    const user = db.prepare("SELECT id, email, display_name FROM server_users WHERE id = ?").get(session.user_id) as any;
    if (!user) {
      return res.status(401).json({ error: "Пользователь не найден" });
    }

    return res.json({
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.display_name
      }
    });
  } catch (err: any) {
    console.error("Auth check error:", err);
    return res.status(500).json({ error: "Ошибка при проверке авторизации: " + err.message });
  }
});

export default router;
