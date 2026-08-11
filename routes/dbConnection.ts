import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const RAW_DATA_DIR = process.env.DATA_DIR;
const DATA_DIR = RAW_DATA_DIR ? RAW_DATA_DIR : process.cwd();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
export const SQLITE_DB_PATH = path.join(DATA_DIR, "local_server_db.sqlite");

// Single shared connection — all users share one file, isolated by user_id column
let _sharedDb: Database.Database | null = null;

// ============================================================
// Schema setup and safe migrations
// ============================================================

function setupSchema(db: Database.Database) {
  db.pragma("foreign_keys = OFF");

  db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      code TEXT PRIMARY KEY,
      name TEXT,
      flag TEXT
    );

    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
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
      UNIQUE(user_id, language_code, word)
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
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
      user_id TEXT NOT NULL DEFAULT 'default',
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

  // ── metadata: needs composite PK (user_id, key) ──────────────────────────────
  const metaHasUserId = (db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('metadata') WHERE name='user_id'"
  ).get() as any).c > 0;

  if (!metaHasUserId) {
    // Check if old metadata table exists (key TEXT PRIMARY KEY)
    const metaExists = (db.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='metadata'"
    ).get() as any).c > 0;

    if (metaExists) {
      // Recreate with composite PK preserving existing data
      db.exec(`
        CREATE TABLE metadata_new (
          user_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (user_id, key)
        );
        INSERT OR IGNORE INTO metadata_new (user_id, key, value)
          SELECT 'default', key, value FROM metadata;
        DROP TABLE metadata;
        ALTER TABLE metadata_new RENAME TO metadata;
      `);
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          user_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (user_id, key)
        );
      `);
    }
  }

  // ── word_links: needs user_id in PK ──────────────────────────────────────────
  const linksHasUserId = (db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('word_links') WHERE name='user_id'"
  ).get() as any).c > 0;

  if (!linksHasUserId) {
    const linksExists = (db.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='word_links'"
    ).get() as any).c > 0;

    if (linksExists) {
      db.exec(`
        CREATE TABLE word_links_new (
          user_id TEXT NOT NULL DEFAULT 'default',
          language_code TEXT NOT NULL,
          word_from TEXT NOT NULL,
          word_to TEXT NOT NULL,
          PRIMARY KEY (user_id, language_code, word_from)
        );
        INSERT OR IGNORE INTO word_links_new (user_id, language_code, word_from, word_to)
          SELECT 'default', language_code, word_from, word_to FROM word_links;
        DROP TABLE word_links;
        ALTER TABLE word_links_new RENAME TO word_links;
      `);
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS word_links (
          user_id TEXT NOT NULL DEFAULT 'default',
          language_code TEXT NOT NULL,
          word_from TEXT NOT NULL,
          word_to TEXT NOT NULL,
          PRIMARY KEY (user_id, language_code, word_from)
        );
      `);
    }
  }

  // ── Safe ADD COLUMN migrations for existing tables ───────────────────────────

  // words: user_id column
  try { db.exec(`ALTER TABLE words ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}
  // words: SRS columns
  try { db.exec(`ALTER TABLE words ADD COLUMN spellingCorrectCount INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN spellingIncorrectCount INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN spellingAccentCount INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN lastSpelledCorrectly INTEGER;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN lastSpelledWithAccentError INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN spellingExclude INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN srsNextReview INTEGER;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN srsInterval INTEGER;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN srsEaseFactor REAL;`); } catch (_) {}
  try { db.exec(`ALTER TABLE words ADD COLUMN srsRepetitions INTEGER;`); } catch (_) {}

  // lessons: user_id column
  try { db.exec(`ALTER TABLE lessons ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}

  // reading_history: user_id column
  try { db.exec(`ALTER TABLE reading_history ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}

  // ── Migrate words table: fix old UNIQUE(language_code, word) → UNIQUE(user_id, language_code, word) ─
  // The old constraint prevented multiple users from having the same word in the same language.
  // Detect by checking if the sqlite_master SQL contains the old constraint pattern.
  try {
    const wordsSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='words'").get() as any)?.sql || "";
    const hasOldConstraint = wordsSchema.includes("UNIQUE(language_code, word)") || wordsSchema.includes("UNIQUE( language_code, word)");
    if (hasOldConstraint) {
      console.log("[DB] Migrating words table: fixing UNIQUE constraint to include user_id...");
      const allWords = db.prepare("SELECT * FROM words").all() as any[];
      db.exec("DROP TABLE words");
      db.exec(`
        CREATE TABLE words (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'default',
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
          UNIQUE(user_id, language_code, word)
        )
      `);
      const stmtRestore = db.prepare(`
        INSERT OR IGNORE INTO words (
          id, user_id, language_code, word, translation, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples,
          spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
          srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const restoreTx = db.transaction((words: any[]) => {
        for (const w of words) {
          stmtRestore.run(
            w.id, w.user_id || 'default', w.language_code, w.word, w.translation, w.ipa, w.grammar, w.contextRelation,
            w.status, w.createdAt, w.tags, w.imageUrl, w.examples,
            w.spellingCorrectCount || 0, w.spellingIncorrectCount || 0, w.spellingAccentCount || 0,
            w.lastSpelledCorrectly, w.lastSpelledWithAccentError || 0, w.spellingExclude || 0,
            w.srsNextReview, w.srsInterval, w.srsEaseFactor, w.srsRepetitions
          );
        }
      });
      restoreTx(allWords);
      console.log(`[DB] Words table migrated. Restored ${allWords.length} words with correct UNIQUE(user_id, language_code, word).`);
    }
  } catch (e) {
    console.error("[DB] Failed to migrate words table UNIQUE constraint:", e);
  }

  db.pragma("foreign_keys = ON");
}

// ============================================================
// Auto-migrate legacy usr_*.sqlite files into main DB
// ============================================================

let hasPerformedLegacyMigration = false;

function performLegacyFileMigration(db: Database.Database) {
  if (hasPerformedLegacyMigration) return;
  hasPerformedLegacyMigration = true;

  try {
    const usrFiles = fs.readdirSync(DATA_DIR).filter(
      (f) => f.startsWith("local_server_db_usr_") && f.endsWith(".sqlite")
    );
    if (usrFiles.length === 0) return;

    console.log(`[LegacyMigration] Found ${usrFiles.length} isolated user DB file(s). Consolidating into main DB...`);

    for (const file of usrFiles) {
      const srcPath = path.join(DATA_DIR, file);
      if (srcPath === SQLITE_DB_PATH) continue;
      try {
        const srcDb = new Database(srcPath);

        // Extract userId from filename: local_server_db_usr_XXXXX.sqlite
        const userIdMatch = file.match(/^local_server_db_(usr_[a-zA-Z0-9]+)\.sqlite$/);
        const fileUserId = userIdMatch ? userIdMatch[1] : "default";

        // Merge server_users
        try {
          const users = srcDb.prepare("SELECT * FROM server_users").all() as any[];
          const stmt = db.prepare("INSERT OR IGNORE INTO server_users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const u of users) stmt.run(u.id, u.email, u.password_hash, u.display_name, u.created_at);
        } catch (_) {}

        // Merge server_sessions
        try {
          const sessions = srcDb.prepare("SELECT * FROM server_sessions").all() as any[];
          const stmt = db.prepare("INSERT OR IGNORE INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)");
          for (const s of sessions) stmt.run(s.token, s.user_id, s.expires_at);
        } catch (_) {}

        // Merge languages
        try {
          const langs = srcDb.prepare("SELECT * FROM languages").all() as any[];
          const stmt = db.prepare("INSERT OR IGNORE INTO languages (code, name, flag) VALUES (?, ?, ?)");
          for (const l of langs) stmt.run(l.code, l.name, l.flag);
        } catch (_) {}

        // Merge lessons (with user_id)
        try {
          const lessons = srcDb.prepare("SELECT * FROM lessons").all() as any[];
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO lessons (
              id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage,
              isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned,
              translationText, detectedPhrases, difficulty, difficultyExplanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const l of lessons) {
            const isDel = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?").get(fileUserId, `deleted_lesson_${l.id}`);
            if (isDel) continue;
            stmt.run(
              l.id, fileUserId, l.title, l.text, l.audioUrl, l.audioBase64,
              l.targetLanguage, l.translationLanguage,
              l.isBuiltIn ? 1 : 0, l.isArchived ? 1 : 0,
              l.coverUrl, l.youtubeId, l.lessonType, l.pinned ? 1 : 0,
              l.translationText, l.detectedPhrases, l.difficulty, l.difficultyExplanation
            );
          }
        } catch (_) {}

        // Merge words (with user_id)
        try {
          const words = srcDb.prepare("SELECT * FROM words").all() as any[];
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO words (
              id, user_id, language_code, word, translation, ipa, grammar, contextRelation,
              status, createdAt, tags, imageUrl, examples,
              spellingCorrectCount, spellingIncorrectCount, spellingAccentCount,
              lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
              srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const w of words) {
            stmt.run(
              w.id, fileUserId, w.language_code, w.word, w.translation, w.ipa,
              w.grammar, w.contextRelation, w.status, w.createdAt,
              w.tags, w.imageUrl, w.examples,
              w.spellingCorrectCount || 0, w.spellingIncorrectCount || 0, w.spellingAccentCount || 0,
              w.lastSpelledCorrectly, w.lastSpelledWithAccentError || 0, w.spellingExclude || 0,
              w.srsNextReview, w.srsInterval, w.srsEaseFactor, w.srsRepetitions
            );
          }
        } catch (_) {}

        // Merge reading_history (with user_id)
        try {
          const hist = srcDb.prepare("SELECT * FROM reading_history").all() as any[];
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO reading_history (
              id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
              timestamp, actionType, status, durationSeconds, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const h of hist) {
            stmt.run(
              h.id, fileUserId, h.lessonId, h.lessonTitle, h.lessonType,
              h.coverUrl, h.targetLanguage, h.timestamp, h.actionType,
              h.status, h.durationSeconds, h.notes
            );
          }
        } catch (_) {}

        // Merge metadata (with user_id)
        try {
          const meta = srcDb.prepare("SELECT * FROM metadata").all() as any[];
          const stmt = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)");
          for (const m of meta) stmt.run(fileUserId, m.key, m.value);
        } catch (_) {}

        srcDb.close();
        try {
          fs.unlinkSync(srcPath);
          console.log(`[LegacyMigration] Merged and deleted legacy file: ${file}`);
        } catch (_) {
          console.log(`[LegacyMigration] Merged ${file} → user_id=${fileUserId}`);
        }
      } catch (e) {
        console.error(`[LegacyMigration] Error merging ${file}:`, e);
      }
    }

    console.log("[LegacyMigration] Done consolidating all legacy user DB files.");
  } catch (e) {
    console.error("[LegacyMigration] Failed:", e);
  }
}

// ============================================================
// Auto-assign all 'default' orphan records to the primary user
// This runs once at startup so Rustam's 35 books appear immediately
// ============================================================

function autoAssignDefaultDataToPrimaryUser(db: Database.Database) {
  try {
    // Find primary user
    let primaryUser = db.prepare(
      "SELECT id, email FROM server_users WHERE email = ? LIMIT 1"
    ).get("rustamniy@gmail.com") as any;

    if (!primaryUser) {
      primaryUser = db.prepare(
        "SELECT id, email FROM server_users ORDER BY created_at ASC LIMIT 1"
      ).get() as any;
    }

    if (!primaryUser) {
      console.log("[AutoAssign] No registered users found yet. Skipping.");
      return;
    }

    const uid = primaryUser.id;
    const email = primaryUser.email;

    // Check if the ONE-TIME forced migration has already been done
    const migrationDone = (db.prepare(
      "SELECT value FROM metadata WHERE user_id = '__system__' AND key = 'initial_user_migration_done'"
    ).get() as any)?.value === "1";

    const primaryWordCount = (db.prepare("SELECT COUNT(*) as c FROM words WHERE user_id = ?").get(uid) as any)?.c || 0;
    const totalWords = (db.prepare("SELECT COUNT(*) as c FROM words").get() as any)?.c || 0;

    if (!migrationDone || (primaryWordCount === 0 && totalWords > 50)) {
      // ── ONE-TIME MIGRATION / RESTORE MAIN USER ──────────────────────────────
      // Assign ALL existing data to the primary user rustamniy@gmail.com
      console.log(`[AutoAssign] Assigning main library → "${email}" (${uid})`);

      db.transaction(() => {
        const [lN, wN, hN, mN, liN] = [
          db.prepare("UPDATE OR IGNORE lessons SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE words SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE reading_history SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE word_links SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE metadata SET user_id = ? WHERE user_id != '__system__'").run(uid).changes,
        ];

        // Mark migration complete
        db.prepare(
          "INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES ('__system__', 'initial_user_migration_done', '1')"
        ).run();

        console.log(
          `[AutoAssign] ✅ Main library assigned: ${lN} lessons, ${wN} words, ` +
          `${hN} history → "${email}" (${uid})`
        );
      })();

    } else {
      // ── SUBSEQUENT RUNS: only assign truly orphaned records ─────────────────
      const orphaned = db.transaction(() => {
        const [lN, wN, hN, mN, liN] = [
          db.prepare("UPDATE OR IGNORE lessons SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE words SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE reading_history SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE word_links SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE metadata SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users) AND user_id != '__system__'").run(uid).changes,
        ];
        return lN + wN;
      });
      const changed = orphaned();
      if (changed > 0) {
        console.log(`[AutoAssign] Assigned ${changed} orphaned records → "${email}" (${uid})`);
      } else {
        console.log("[AutoAssign] All records properly assigned. Nothing to fix.");
      }
    }
  } catch (e) {
    console.error("[AutoAssign] Failed:", e);
  }
}

// ============================================================
// Public API
// ============================================================

export function getDbConnection(_rawUserId: string = "default"): Database.Database {
  if (_sharedDb) return _sharedDb;

  _sharedDb = new Database(SQLITE_DB_PATH);
  _sharedDb.pragma("journal_mode = WAL");

  // 1. Create / migrate schema
  setupSchema(_sharedDb);

  // 2. Merge any legacy per-user .sqlite files
  performLegacyFileMigration(_sharedDb);

  // 3. Assign all 'default' orphan data to primary user
  autoAssignDefaultDataToPrimaryUser(_sharedDb);

  console.log("[DB] Shared database ready at:", SQLITE_DB_PATH);
  return _sharedDb;
}
