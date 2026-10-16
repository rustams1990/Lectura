/**
 * Centralized authentication & local-server sync helpers.
 * Guarantees strict multi-account isolation (Dogma #1) and consistent headers across all API calls.
 */

export function getActiveSyncUserId(fallbackUserId?: string): string {
  if (fallbackUserId && fallbackUserId.trim()) {
    return fallbackUserId.trim();
  }
  try {
    const savedUserRaw = localStorage.getItem("vocab_clone_local_user");
    if (savedUserRaw) {
      const parsedUser = JSON.parse(savedUserRaw);
      if (parsedUser?.id) return String(parsedUser.id);
    }
  } catch (_) {}
  return "default";
}

export function buildSyncHeaders(
  extraHeaders: Record<string, string> = {},
  options?: { syncKey?: string; userId?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  try {
    const savedToken =
      localStorage.getItem("vocab_clone_server_token") ||
      localStorage.getItem("vocab_clone_auth_token") ||
      "";
    const resolvedSyncKey =
      options?.syncKey ||
      localStorage.getItem("vocab_clone_local_sync_key") ||
      localStorage.getItem("local_sync_key") ||
      "lectura-sync-2026";
    const resolvedUserId = getActiveSyncUserId(options?.userId);

    headers["x-local-sync-key"] = resolvedSyncKey;
    headers["x-user-id"] = resolvedUserId;
    headers["x-local-sync-user"] = resolvedUserId;
    if (savedToken) {
      headers["Authorization"] = `Bearer ${savedToken}`;
    }
  } catch (_) {
    headers["x-local-sync-key"] = options?.syncKey || "lectura-sync-2026";
    headers["x-user-id"] = options?.userId || "default";
    headers["x-local-sync-user"] = options?.userId || "default";
  }

  return headers;
}

export function hashVocabItemForSync(v: any): string {
  if (!v) return "";
  return `${v.status || ""}|${v.translation || ""}|${v.definition || ""}|${v.ipa || ""}|${v.grammar || ""}|${v.contextRelation || ""}|${v.imageUrl || ""}|${v.audioClipUrl || ""}|${v.srsNextReview || 0}|${v.srsInterval || 0}|${v.srsRepetitions || 0}|${v.spellingCorrectCount || 0}|${v.spellingIncorrectCount || 0}|${(v.tags || []).join(",")}|${(v.examples || []).length}`;
}

export function hashLessonForSync(l: any): string {
  if (!l) return "";
  return `${l.title || ""}|${(l.text || "").length}|${l.audioUrl || ""}|${l.targetLanguage || ""}|${l.isArchived ? 1 : 0}|${l.pinned ? 1 : 0}|${l.coverUrl || ""}|${l.playlistId || ""}|${l.audioProgress || 0}|${l.primaryTag || ""}|${(l.tags || []).join(",")}|${l.channelName || ""}`;
}

export function hashHistoryForSync(h: any): string {
  if (!h) return "";
  return `${h.lessonId || ""}|${h.lessonTitle || ""}|${h.status || ""}|${h.durationSeconds || 0}|${h.lastPosition || 0}|${h.timestamp || ""}|${h.notes || ""}|${h.channelName || ""}|${h.primaryTag || ""}|${(h.tags || []).join(",")}`;
}
