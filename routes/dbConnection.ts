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
      definition TEXT,
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

    UPDATE words 
    SET translation = '' 
    WHERE lower(translation) IN ('translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден');

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
      localVideoUrl TEXT,
      lessonType TEXT,
      pinned INTEGER DEFAULT 0,
      translationText TEXT,
      detectedPhrases TEXT,
      difficulty TEXT,
      difficultyExplanation TEXT,
      createdAt INTEGER,
      channelName TEXT,
      channelTitle TEXT,
      channelAvatarUrl TEXT,
      channelAvatar TEXT,
      channelUrl TEXT,
      playlistId TEXT,
      wordTimestamps TEXT,
      images TEXT
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
      notes TEXT,
      channelName TEXT,
      channelTitle TEXT,
      channelAvatarUrl TEXT,
      channelAvatar TEXT,
      channelUrl TEXT,
      category TEXT,
      customTitle TEXT,
      mode TEXT,
      tags TEXT
    );

    CREATE TABLE IF NOT EXISTS server_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      avatarUrl TEXT,
      passwordHint TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS server_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER,
      FOREIGN KEY(user_id) REFERENCES server_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      settings TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS podcast_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      author TEXT,
      feed_url TEXT NOT NULL,
      artwork_url TEXT,
      language TEXT,
      created_at INTEGER,
      UNIQUE(user_id, feed_url)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      description TEXT,
      thumbnailUrl TEXT,
      sourceType TEXT NOT NULL,
      externalUrl TEXT,
      channelTitle TEXT,
      itemCount INTEGER DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en',
      items TEXT,
      isArchived INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
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

  // Normalize legacy short language codes to full names
  try {
    db.exec(`
      UPDATE words SET language_code = 'Spanish' WHERE language_code = 'es' OR language_code = 'Es';
      UPDATE words SET language_code = 'English' WHERE language_code = 'en' OR language_code = 'En';
      DELETE FROM languages WHERE code IN ('es', 'Es', 'en', 'En', 'de', 'De', 'fr', 'Fr', 'it', 'It', 'ru', 'Ru', 'pt', 'Pt');
    `);
  } catch (_) {}
  const wordsCols = (db.prepare("PRAGMA table_info(words)").all() as any[]).map(c => c.name);
  if (!wordsCols.includes("user_id")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (e) { console.error("Migrate words user_id error:", e); }
  }
  if (!wordsCols.includes("definition")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN definition TEXT;`); } catch (e) { console.error("Migrate words definition error:", e); }
  }
  if (!wordsCols.includes("spellingCorrectCount")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN spellingCorrectCount INTEGER DEFAULT 0;`); } catch (_) {}
  }
  if (!wordsCols.includes("spellingIncorrectCount")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN spellingIncorrectCount INTEGER DEFAULT 0;`); } catch (_) {}
  }
  if (!wordsCols.includes("spellingAccentCount")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN spellingAccentCount INTEGER DEFAULT 0;`); } catch (_) {}
  }
  if (!wordsCols.includes("lastSpelledCorrectly")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN lastSpelledCorrectly INTEGER;`); } catch (_) {}
  }
  if (!wordsCols.includes("lastSpelledWithAccentError")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN lastSpelledWithAccentError INTEGER DEFAULT 0;`); } catch (_) {}
  }
  if (!wordsCols.includes("spellingExclude")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN spellingExclude INTEGER DEFAULT 0;`); } catch (_) {}
  }
  if (!wordsCols.includes("srsNextReview")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN srsNextReview INTEGER;`); } catch (_) {}
  }
  if (!wordsCols.includes("srsInterval")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN srsInterval INTEGER;`); } catch (_) {}
  }
  if (!wordsCols.includes("srsEaseFactor")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN srsEaseFactor REAL;`); } catch (_) {}
  }
  if (!wordsCols.includes("srsRepetitions")) {
    try { db.exec(`ALTER TABLE words ADD COLUMN srsRepetitions INTEGER;`); } catch (_) {}
  }

  // lessons: user_id, localVideoUrl, createdAt, channel columns
  const lessonsCols = (db.prepare("PRAGMA table_info(lessons)").all() as any[]).map(c => c.name);
  if (!lessonsCols.includes("user_id")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}
  }
  if (!lessonsCols.includes("localVideoUrl")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN localVideoUrl TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("createdAt")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN createdAt INTEGER;`); } catch (_) {}
  }
  if (!lessonsCols.includes("wordTimestamps")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN wordTimestamps TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("channelName")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN channelName TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("channelTitle")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN channelTitle TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("channelAvatarUrl")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN channelAvatarUrl TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("channelAvatar")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN channelAvatar TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("channelUrl")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN channelUrl TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("playlistId")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN playlistId TEXT;`); } catch (_) {}
  }
  if (!lessonsCols.includes("images")) {
    try { db.exec(`ALTER TABLE lessons ADD COLUMN images TEXT;`); } catch (_) {}
  }

  // playlists: user_id & isArchived columns
  const playlistsCols = (db.prepare("PRAGMA table_info(playlists)").all() as any[]).map(c => c.name);
  if (!playlistsCols.includes("user_id")) {
    try { db.exec(`ALTER TABLE playlists ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}
  }
  if (!playlistsCols.includes("isArchived")) {
    try { db.exec(`ALTER TABLE playlists ADD COLUMN isArchived INTEGER DEFAULT 0;`); } catch (_) {}
  }

  // Auto-enrich existing lessons missing channelName or title
  setTimeout(async () => {
    try {
      const unpopulated = db.prepare(`
        SELECT id, youtubeId, title, coverUrl, audioUrl FROM lessons 
        WHERE (channelName IS NULL OR TRIM(channelName) = '' OR title = 'YouTube Video')
      `).all() as any[];

      for (const row of unpopulated) {
        try {
          let yId = row.youtubeId;
          if (!yId && row.coverUrl) {
            const m = row.coverUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
            if (m) yId = m[1];
          }
          if (!yId && row.audioUrl) {
            const m = row.audioUrl.match(/(?:youtu\.be\/|v=|\/embed\/)([a-zA-Z0-9_-]{11})/);
            if (m) yId = m[1];
          }
          if (!yId) continue;

          let channelName: string | null = null;
          let newTitle = row.title;
          let avatarUrl: string | null = null;

          // 1. Try YouTube oEmbed
          try {
            const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yId}&format=json`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            if (res.ok) {
              const data: any = await res.json();
              if (data.author_name) channelName = data.author_name;
              if (data.title && (row.title === "YouTube Video" || !row.title)) newTitle = data.title;
              if (data.author_url) {
                try {
                  const cRes = await fetch(data.author_url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                  });
                  if (cRes.ok) {
                    const cHtml = await cRes.text();
                    const ogImg = cHtml.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
                               || cHtml.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
                    if (ogImg) avatarUrl = ogImg[1];
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}

          // 2. Fallback: scrape watch page if oEmbed was blocked or unauthorized
          if (!channelName || channelName === "YouTube Video") {
            try {
              const watchRes = await fetch(`https://www.youtube.com/watch?v=${yId}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept-Language': 'en-US,en;q=0.9'
                }
              });
              if (watchRes.ok) {
                const html = await watchRes.text();
                const itemprop = html.match(/<link itemprop="name" content="([^"]+)">/i);
                const ownerMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/i) || html.match(/"author"\s*:\s*"([^"]+)"/i);
                if (itemprop && itemprop[1]) {
                  channelName = itemprop[1];
                } else if (ownerMatch && ownerMatch[1]) {
                  channelName = ownerMatch[1];
                }
                const avatarMatch = html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-=]+/);
                if (avatarMatch && !avatarUrl) {
                  avatarUrl = avatarMatch[0];
                }
              }
            } catch (_) {}
          }

          if (channelName) {
            db.prepare("UPDATE lessons SET youtubeId = COALESCE(youtubeId, ?), channelName = ?, channelAvatarUrl = COALESCE(?, channelAvatarUrl), title = ? WHERE id = ?")
              .run(yId, channelName, avatarUrl, newTitle, row.id);
            try {
              db.prepare("UPDATE reading_history SET channelName = ?, channelAvatarUrl = COALESCE(?, channelAvatarUrl) WHERE lessonId = ?")
                .run(channelName, avatarUrl, row.id);
            } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {}
  }, 1000);

  // reading_history: user_id, channelName, channelTitle, channelAvatarUrl, channelAvatar, channelUrl, category, customTitle, mode, tags columns
  const historyCols = (db.prepare("PRAGMA table_info(reading_history)").all() as any[]).map(c => c.name);
  if (!historyCols.includes("user_id")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}
  }
  if (!historyCols.includes("channelName")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN channelName TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("channelTitle")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN channelTitle TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("channelAvatarUrl")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN channelAvatarUrl TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("channelAvatar")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN channelAvatar TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("channelUrl")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN channelUrl TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("category")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN category TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("customTitle")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN customTitle TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("mode")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN mode TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("tags")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN tags TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("lastPosition")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN lastPosition REAL DEFAULT 0;`); } catch (_) {}
  }
  if (!historyCols.includes("audioUrl")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN audioUrl TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("guid")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN guid TEXT;`); } catch (_) {}
  }
  if (!historyCols.includes("podcastTitle")) {
    try { db.exec(`ALTER TABLE reading_history ADD COLUMN podcastTitle TEXT;`); } catch (_) {}
  }

  // Ensure activity_history view exists if any external service/query expects it
  try {
    db.exec(`CREATE VIEW IF NOT EXISTS activity_history AS SELECT * FROM reading_history;`);
  } catch (_) {}

  // Auto-backfill reading_history channelName and channelAvatarUrl from lessons table
  try {
    db.exec(`
      UPDATE reading_history
      SET channelName = (
            SELECT channelName FROM lessons 
            WHERE lessons.id = reading_history.lessonId 
              AND lessons.channelName IS NOT NULL 
              AND TRIM(lessons.channelName) != ''
          ),
          channelAvatarUrl = COALESCE(
            reading_history.channelAvatarUrl,
            (
              SELECT channelAvatarUrl FROM lessons 
              WHERE lessons.id = reading_history.lessonId 
                AND lessons.channelAvatarUrl IS NOT NULL 
                AND TRIM(lessons.channelAvatarUrl) != ''
            )
          )
      WHERE (reading_history.channelName IS NULL OR TRIM(reading_history.channelName) = '')
        AND EXISTS (
          SELECT 1 FROM lessons 
          WHERE lessons.id = reading_history.lessonId 
            AND lessons.channelName IS NOT NULL 
            AND TRIM(lessons.channelName) != ''
        );
    `);
  } catch (_) {}

  // server_users & users: passwordHint and avatarUrl columns
  const serverUsersCols = (db.prepare("PRAGMA table_info(server_users)").all() as any[]).map(c => c.name);
  if (!serverUsersCols.includes("passwordHint")) {
    try { db.exec(`ALTER TABLE server_users ADD COLUMN passwordHint TEXT;`); } catch (e) { console.error("Migrate server_users passwordHint error:", e); }
  }
  if (!serverUsersCols.includes("avatarUrl")) {
    try { db.exec(`ALTER TABLE server_users ADD COLUMN avatarUrl TEXT;`); } catch (e) { console.error("Migrate server_users avatarUrl error:", e); }
  }

  const hasUsersTable = (db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='users'").get() as any).c > 0;
  if (hasUsersTable) {
    const usersCols = (db.prepare("PRAGMA table_info(users)").all() as any[]).map(c => c.name);
    if (!usersCols.includes("passwordHint")) {
      try { db.exec(`ALTER TABLE users ADD COLUMN passwordHint TEXT;`); } catch (_) {}
    }
    if (!usersCols.includes("avatarUrl")) {
      try { db.exec(`ALTER TABLE users ADD COLUMN avatarUrl TEXT;`); } catch (_) {}
    }
  }

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
          definition TEXT,
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
          id, user_id, language_code, word, translation, definition, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples,
          spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
          srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const restoreTx = db.transaction((words: any[]) => {
        for (const w of words) {
          stmtRestore.run(
            w.id,
            w.user_id || "default",
            w.language_code,
            w.word,
            w.translation,
            w.definition || null,
            w.ipa,
            w.grammar,
            w.contextRelation,
            w.status,
            w.createdAt,
            w.tags,
            w.imageUrl,
            w.examples,
            w.spellingCorrectCount || 0,
            w.spellingIncorrectCount || 0,
            w.spellingAccentCount || 0,
            w.lastSpelledCorrectly,
            w.lastSpelledWithAccentError || 0,
            w.spellingExclude || 0,
            w.srsNextReview || null,
            w.srsInterval || null,
            w.srsEaseFactor || null,
            w.srsRepetitions || null
          );
        }
      });
      restoreTx(allWords);
      console.log(`[DB] Restored ${allWords.length} words with new user_id-scoped schema.`);
    }
  } catch (err) {
    console.error("[DB] Failed to migrate words UNIQUE constraint:", err);
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
          const stmt = db.prepare("INSERT OR IGNORE INTO server_users (id, email, password_hash, display_name, avatarUrl, passwordHint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
          for (const u of users) stmt.run(u.id, u.email, u.password_hash, u.display_name, u.avatarUrl || null, u.passwordHint || null, u.created_at);
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
        const [lN, wN, hN, mN, liN, pN] = [
          db.prepare("UPDATE OR IGNORE lessons SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE words SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE reading_history SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE word_links SET user_id = ?").run(uid).changes,
          db.prepare("UPDATE OR IGNORE metadata SET user_id = ? WHERE user_id != '__system__'").run(uid).changes,
          db.prepare("UPDATE OR IGNORE playlists SET user_id = ?").run(uid).changes,
        ];

        // Mark migration complete
        db.prepare(
          "INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES ('__system__', 'initial_user_migration_done', '1')"
        ).run();

        console.log(
          `[AutoAssign] ✅ Main library assigned: ${lN} lessons, ${wN} words, ` +
          `${hN} history, ${pN} playlists → "${email}" (${uid})`
        );
      })();

    } else {
      // ── SUBSEQUENT RUNS: only assign truly orphaned records ─────────────────
      const orphaned = db.transaction(() => {
        const [lN, wN, hN, mN, liN, pN] = [
          db.prepare("UPDATE OR IGNORE lessons SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE words SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE reading_history SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE word_links SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
          db.prepare("UPDATE OR IGNORE metadata SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users) AND user_id != '__system__'").run(uid).changes,
          db.prepare("UPDATE OR IGNORE playlists SET user_id = ? WHERE user_id NOT IN (SELECT id FROM server_users)").run(uid).changes,
        ];
        return lN + wN + pN;
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
