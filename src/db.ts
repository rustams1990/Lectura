import localforage from 'localforage';

// Configure stores
const storeOptions = {
  name: 'LecturaDB',
  version: 1.0,
};

export const lessonsStore = localforage.createInstance({ ...storeOptions, storeName: 'lessons' });
export const vocabStore = localforage.createInstance({ ...storeOptions, storeName: 'vocab' });
export const settingsStore = localforage.createInstance({ ...storeOptions, storeName: 'settings' });

export async function migrateFromLocalStorage() {
  const isMigrated = await settingsStore.getItem('vocab_clone_migrated_v1');
  if (isMigrated) return;

  console.log("Migrating data from localStorage to IndexedDB...");
  let hasErrors = false;

  // Migrate lessons
  const localLessonsStr = localStorage.getItem("vocab_clone_lessons");
  if (localLessonsStr) {
    try {
      const parsed = JSON.parse(localLessonsStr);
      await lessonsStore.setItem('lessons', parsed);
    } catch (e) {
      hasErrors = true;
      console.error("Error migrating lessons", e);
    }
  }

  const localLessonTypesStr = localStorage.getItem("vocab_clone_lessontypes");
  if (localLessonTypesStr) {
    try {
      const parsed = JSON.parse(localLessonTypesStr);
      await lessonsStore.setItem('lessontypes', parsed);
    } catch (e) {
      hasErrors = true;
      console.error("Error migrating lessontypes", e);
    }
  }

  // Migrate vocab
  const localWordsStr = localStorage.getItem("vocab_clone_words");
  if (localWordsStr) {
    try {
      const parsed = JSON.parse(localWordsStr);
      await vocabStore.setItem('words', parsed);
    } catch (e) {
      hasErrors = true;
      console.error("Error migrating words", e);
    }
  }
  
  const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
  if (localAliasesStr) {
    try {
      const parsed = JSON.parse(localAliasesStr);
      await vocabStore.setItem('aliases', parsed);
    } catch (e) {
      hasErrors = true;
      console.error("Error migrating aliases", e);
    }
  }

  // Migrate settings (we store them as raw strings in IndexedDB to match how App.tsx previously handled them, or parsed if we refactor)
  const keysToMigrate = [
    "vocab_clone_listening",
    "vocab_clone_reading_history",
    "vocab_clone_language_flags",
    "vocab_clone_focus_mode",
    "vocab_clone_layout_width",
    "vocab_clone_reader_settings",
    "vocab_clone_interface_zoom",
    "vocab_clone_dark_mode",
    "vocab_clone_storage_mode"
  ];

  for (const key of keysToMigrate) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      try {
        await settingsStore.setItem(key, val);
      } catch (e) {
        hasErrors = true;
        console.error(`Error migrating setting key ${key}`, e);
      }
    }
  }

  await settingsStore.setItem('vocab_clone_migrated_v1', true);
  if (!hasErrors) {
    console.log("Migration complete!");
  } else {
    console.warn("Migration completed with non-critical errors. Migrated flag set to prevent endless retry loops.");
  }
}

export async function clearLocalUserDataCache() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("vocab_clone_words") ||
         key.startsWith("vocab_clone_aliases") ||
         key.startsWith("vocab_clone_lessons") ||
         key.startsWith("vocab_clone_lessontypes") ||
         key.startsWith("vocab_clone_listening") ||
         key.startsWith("vocab_clone_reading_history") ||
         key.startsWith("vocab_clone_language_flags") ||
         key.startsWith("youtube_progress_") ||
         key.startsWith("vocab_progress_"))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    await lessonsStore.clear();
    await vocabStore.clear();
    await settingsStore.removeItem("vocab_clone_reading_history");
    await settingsStore.removeItem("vocab_clone_listening");
    await settingsStore.removeItem("vocab_clone_language_flags");
  } catch (e) {
    console.error("Failed to clear local user data cache:", e);
  }
}

