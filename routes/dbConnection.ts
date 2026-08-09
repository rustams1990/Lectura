import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const RAW_DATA_DIR = process.env.DATA_DIR;
const DATA_DIR = RAW_DATA_DIR ? RAW_DATA_DIR : process.cwd();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
export const SQLITE_DB_PATH = path.join(DATA_DIR, "local_server_db.sqlite");

const dbConns = new Map<string, Database.Database>();

let hasPerformedAutoMigration = false;

function performAutoMigrationIfNeeded(mainDb: Database.Database) {
  if (hasPerformedAutoMigration) return;
  hasPerformedAutoMigration = true;

  try {
    const usrFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith("local_server_db_usr_") && f.endsWith(".sqlite"));
    if (usrFiles.length === 0) return;

    console.log(`[AutoMigration] Found ${usrFiles.length} isolated user DB file(s). Consolidating into main DB...`);
    for (const file of usrFiles) {
      const srcPath = path.join(DATA_DIR, file);
      if (srcPath === SQLITE_DB_PATH) continue;
      try {
        const srcDb = new Database(srcPath);
        
        // 1. Merge server_users
        try {
          const users = srcDb.prepare("SELECT * FROM server_users").all();
          const stmt = mainDb.prepare("INSERT OR IGNORE INTO server_users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const u of users as any[]) {
            stmt.run(u.id, u.email, u.password_hash, u.display_name, u.created_at);
          }
        } catch (_) {}

        // 2. Merge server_sessions
        try {
          const sessions = srcDb.prepare("SELECT * FROM server_sessions").all();
          const stmt = mainDb.prepare("INSERT OR IGNORE INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)");
          for (const s of sessions as any[]) {
            stmt.run(s.token, s.user_id, s.expires_at);
          }
        } catch (_) {}

        // 3. Merge languages
        try {
          const langs = srcDb.prepare("SELECT * FROM languages").all();
          const stmt = mainDb.prepare("INSERT OR IGNORE INTO languages (code, name, flag) VALUES (?, ?, ?)");
          for (const l of langs as any[]) {
            stmt.run(l.code, l.name, l.flag);
          }
        } catch (_) {}

        // 4. Merge words
        try {
          const words = srcDb.prepare("SELECT * FROM words").all();
          const stmt = mainDb.prepare(`
            INSERT OR REPLACE INTO words (
              id, language_code, word, translation, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples,
              spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const w of words as any[]) {
            stmt.run(
              w.id, w.language_code, w.word, w.translation, w.ipa, w.grammar, w.contextRelation, w.status, w.createdAt,
              w.tags, w.imageUrl, w.examples, w.spellingCorrectCount || 0, w.spellingIncorrectCount || 0,
              w.spellingAccentCount || 0, w.lastSpelledCorrectly, w.lastSpelledWithAccentError || 0, w.spellingExclude || 0
            );
          }
        } catch (_) {}

        // 5. Merge word_links
        try {
          const links = srcDb.prepare("SELECT * FROM word_links").all();
          const stmt = mainDb.prepare("INSERT OR IGNORE INTO word_links (language_code, word_from, word_to) VALUES (?, ?, ?)");
          for (const link of links as any[]) {
            stmt.run(link.language_code, link.word_from, link.word_to);
          }
        } catch (_) {}

        // 6. Merge lessons
        try {
          const lessons = srcDb.prepare("SELECT * FROM lessons").all();
          const stmt = mainDb.prepare(`
            INSERT OR REPLACE INTO lessons (
              id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const l of lessons as any[]) {
            stmt.run(
              l.id, l.title, l.text, l.audioUrl, l.audioBase64, l.targetLanguage, l.translationLanguage,
              l.isBuiltIn ? 1 : 0, l.isArchived ? 1 : 0, l.coverUrl, l.youtubeId, l.lessonType,
              l.pinned ? 1 : 0, l.translationText, l.detectedPhrases, l.difficulty, l.difficultyExplanation
            );
          }
        } catch (_) {}

        // 7. Merge lesson_types
        try {
          const types = srcDb.prepare("SELECT * FROM lesson_types").all();
          const stmt = mainDb.prepare("INSERT OR IGNORE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)");
          for (const t of types as any[]) {
            stmt.run(t.id, t.name, t.icon);
          }
        } catch (_) {}

        // 8. Merge reading_history
        try {
          const hist = srcDb.prepare("SELECT * FROM reading_history").all();
          const stmt = mainDb.prepare(`
            INSERT OR REPLACE INTO reading_history (
              id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const h of hist as any[]) {
            stmt.run(
              h.id, h.lessonId, h.lessonTitle, h.lessonType, h.coverUrl, h.targetLanguage,
              h.timestamp, h.actionType, h.status, h.durationSeconds, h.notes
            );
          }
        } catch (_) {}

        // 9. Merge metadata (e.g. listeningSeconds)
        try {
          const meta = srcDb.prepare("SELECT * FROM metadata").all();
          const stmt = mainDb.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)");
          for (const m of meta as any[]) {
            if (m.key === "listeningSeconds") {
              const currentVal = mainDb.prepare("SELECT value FROM metadata WHERE key = 'listeningSeconds'").get() as any;
              const valNum = parseFloat(m.value) || 0;
              const curNum = currentVal ? parseFloat(currentVal.value) || 0 : 0;
              stmt.run("listeningSeconds", String(Math.max(valNum, curNum)));
            } else {
              stmt.run(m.key, m.value);
            }
          }
        } catch (_) {}

        srcDb.close();
      } catch (e) {
        console.error(`[AutoMigration] Error merging ${file}:`, e);
      }
    }

    // Two-way synchronization: Copy all lessons from mainDb into each user DB file so no user profile is missing any lessons
    const allMainLessons = mainDb.prepare("SELECT * FROM lessons").all() as any[];
    if (allMainLessons.length > 0) {
      for (const file of usrFiles) {
        const targetPath = path.join(DATA_DIR, file);
        if (targetPath === SQLITE_DB_PATH) continue;
        try {
          const targetDb = new Database(targetPath);
          const insertStmt = targetDb.prepare(`
            INSERT OR IGNORE INTO lessons (
              id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const l of allMainLessons) {
            insertStmt.run(
              l.id, l.title, l.text, l.audioUrl, l.audioBase64, l.targetLanguage, l.translationLanguage,
              l.isBuiltIn ? 1 : 0, l.isArchived ? 1 : 0, l.coverUrl, l.youtubeId, l.lessonType,
              l.pinned ? 1 : 0, l.translationText, l.detectedPhrases, l.difficulty, l.difficultyExplanation
            );
          }
          targetDb.close();
        } catch (e) {
          console.error(`[AutoMigration] Error syncing main lessons to ${file}:`, e);
        }
      }
    }

    console.log(`[AutoMigration] Consolidated and synchronized all database records!`);
  } catch (e) {
    console.error("[AutoMigration] Failed:", e);
  }
}

export function getDbConnection(rawUserId: string = "default"): Database.Database {
  const cleanId = typeof rawUserId === "string" ? rawUserId.trim() : "default";
  const safeUserId = cleanId ? cleanId.replace(/[^a-zA-Z0-9_-]/g, "_") : "default";

  let conn = dbConns.get(safeUserId);
  if (!conn) {
    const dbPath = safeUserId === "default"
      ? SQLITE_DB_PATH
      : path.join(DATA_DIR, `local_server_db_${safeUserId}.sqlite`);

    conn = new Database(dbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");

    // Ensure all tables exist in this database
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
        srsNextReview INTEGER,
        srsInterval INTEGER,
        srsEaseFactor REAL,
        srsRepetitions INTEGER,
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
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN srsNextReview INTEGER;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN srsInterval INTEGER;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN srsEaseFactor REAL;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN srsRepetitions INTEGER;`);
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
