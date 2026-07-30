import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const RAW_DATA_DIR = process.env.DATA_DIR;
const DATA_DIR = RAW_DATA_DIR ? RAW_DATA_DIR : path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
export const SQLITE_DB_PATH = path.join(DATA_DIR, "local_server_db.sqlite");

const dbConns = new Map<string, Database.Database>();

export function getDbConnection(userId: string = "default"): Database.Database {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  let conn = dbConns.get(safeUserId);
  if (!conn) {
    const userDbPath = safeUserId === "default"
      ? SQLITE_DB_PATH
      : path.join(DATA_DIR, `local_server_db_${safeUserId}.sqlite`);

    conn = new Database(userDbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");

    // Ensure all tables exist
    conn.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS languages (
        code TEXT PRIMARY KEY,
        name TEXT,
        flag TEXT
      );

      CREATE TABLE IF NOT EXISTS words (
        id TEXT PRIMARY KEY,
        language_code TEXT NOT NULL,
        word TEXT NOT NULL,
        translation TEXT,
        ipa TEXT,
        grammar TEXT,
        contextRelation TEXT,
        status TEXT NOT NULL,
        createdAt INTEGER,
        tags TEXT,
        imageUrl TEXT,
        examples TEXT,
        spellingCorrectCount INTEGER DEFAULT 0,
        spellingIncorrectCount INTEGER DEFAULT 0,
        spellingAccentCount INTEGER DEFAULT 0,
        lastSpelledCorrectly INTEGER,
        lastSpelledWithAccentError INTEGER DEFAULT 0,
        spellingExclude INTEGER DEFAULT 0,
        FOREIGN KEY(language_code) REFERENCES languages(code) ON DELETE CASCADE,
        UNIQUE(language_code, word)
      );

      CREATE TABLE IF NOT EXISTS word_links (
        language_code TEXT NOT NULL,
        word_from TEXT NOT NULL,
        word_to TEXT NOT NULL,
        PRIMARY KEY (language_code, word_from),
        FOREIGN KEY(language_code) REFERENCES languages(code) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        audioUrl TEXT,
        audioBase64 TEXT,
        targetLanguage TEXT NOT NULL,
        translationLanguage TEXT NOT NULL,
        isBuiltIn INTEGER DEFAULT 0,
        isArchived INTEGER DEFAULT 0,
        coverUrl TEXT,
        youtubeId TEXT,
        lessonType TEXT,
        pinned INTEGER DEFAULT 0,
        translationText TEXT,
        detectedPhrases TEXT,
        difficulty TEXT,
        difficultyExplanation TEXT
      );

      CREATE TABLE IF NOT EXISTS lesson_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reading_history (
        id TEXT PRIMARY KEY,
        lessonId TEXT NOT NULL,
        lessonTitle TEXT NOT NULL,
        lessonType TEXT,
        coverUrl TEXT,
        targetLanguage TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        actionType TEXT NOT NULL,
        status TEXT,
        durationSeconds INTEGER DEFAULT 0,
        notes TEXT
      );
    `);

    if (safeUserId === "default") {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS server_users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS server_sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at INTEGER,
          FOREIGN KEY(user_id) REFERENCES server_users(id) ON DELETE CASCADE
        );
      `);
    }

    // Ensure spelling statistics columns exist in words table (safe migration)
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingCorrectCount INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingIncorrectCount INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingAccentCount INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN lastSpelledCorrectly INTEGER;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN lastSpelledWithAccentError INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingExclude INTEGER DEFAULT 0;`);
    } catch (_) {}

    // Evict oldest connections if pool size exceeds max limit (20 connections)
    if (dbConns.size >= 20) {
      for (const [k, oldConn] of dbConns.entries()) {
        if (k !== "default" && k !== safeUserId) {
          try { oldConn.close(); } catch (_) {}
          dbConns.delete(k);
          if (dbConns.size < 20) break;
        }
      }
    }

    dbConns.set(safeUserId, conn);
  }
  return conn;
}
