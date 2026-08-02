const fs = require('fs');

const utilsCode = `

export function migrateLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const keys = [
    "words", "translation_source", "custom_tags", "lessons", "lessontypes",
    "listening", "aliases", "language_flags", "focus_mode", "layout_width",
    "reader_settings", "interface_zoom", "local_user", "storage_mode",
    "daily_word_goal", "last_active_lesson_id", "reading_history"
  ];
  keys.forEach(k => {
    const oldKey = \`lingq_clone_\${k}\`;
    const newKey = \`vocab_clone_\${k}\`;
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
    }
  });

  const exactKeys = [
    "lingq_default_target_language",
    "lingq_default_translation_language",
    "lingq_books_per_row"
  ];
  exactKeys.forEach(oldKey => {
    const newKey = oldKey.replace("lingq_", "vocab_");
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
    }
  });
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      if (key.startsWith("lingq_clone_dicts_")) {
        const newKey = key.replace("lingq_clone_dicts_", "vocab_clone_dicts_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(key));
        }
      } else if (key.startsWith("lingq_progress_")) {
        const newKey = key.replace("lingq_progress_", "vocab_progress_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(key));
        }
      }
    }
  }
}
migrateLocalStorage();

export function safeParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch (err) {
    console.warn("Failed to parse stored JSON, falling back:", err);
    return fallback;
  }
}

export const isLocalHostname = (): boolean => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.")
  );
};
`;

fs.appendFileSync('src/utils.ts', utilsCode);
console.log('Appended to utils.ts');
