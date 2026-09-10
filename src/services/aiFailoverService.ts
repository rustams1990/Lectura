import { AIProfile, ReaderSettings } from "../types";

const COOLDOWN_STORAGE_KEY = "vocab_ai_cooldowns";
const COOLDOWN_DURATION_MS = 60000; // 60 seconds cooldown for 429 quota exhausted

/**
 * Migration helper: creates default or migrated profiles from legacy settings
 */
export function getOrCreateAiProfiles(settings?: ReaderSettings): AIProfile[] {
  if (settings?.aiProfiles && Array.isArray(settings.aiProfiles) && settings.aiProfiles.length > 0) {
    // Migrate any legacy gemini-2.0-flash to gemini-2.5-flash
    return settings.aiProfiles.map(p => {
      if (p.provider === 'gemini' && (p.model === undefined || p.model === 'gemini-2.0-flash')) {
        return { ...p, model: 'gemini-2.5-flash' };
      }
      return p;
    });
  }

  const profiles: AIProfile[] = [];
  const legacyGeminiKey = settings?.geminiApiKey || localStorage.getItem("vocab_clone_gemini_key") || "";
  const legacyLocalUrl = settings?.localAiUrl || "http://localhost:11434/api/generate";
  const legacyLocalModel = settings?.localAiModel || "phi3.5";

  if (legacyGeminiKey) {
    profiles.push({
      id: "profile_gemini_main",
      name: "Gemini (Main)",
      provider: "gemini",
      apiKey: legacyGeminiKey,
      model: "gemini-2.5-flash",
      isEnabled: true,
      priority: 1,
    });
  } else {
    // Default initial template
    profiles.push({
      id: "profile_gemini_main",
      name: "Gemini (Main)",
      provider: "gemini",
      apiKey: "",
      model: "gemini-2.5-flash",
      isEnabled: true,
      priority: 1,
    });
  }

  if (settings?.aiProvider === "local" || (settings?.localAiUrl && settings.localAiUrl !== "http://localhost:11434/api/generate")) {
    profiles.push({
      id: "profile_ollama_local",
      name: "Ollama (Local)",
      provider: "ollama",
      apiKey: "",
      model: legacyLocalModel,
      baseUrl: legacyLocalUrl,
      isEnabled: true,
      priority: 2,
    });
  }

  return profiles;
}

/**
 * Cross-tab synchronized cooldown tracker
 */
function getCooldowns(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(COOLDOWN_STORAGE_KEY) || localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const active: Record<string, number> = {};
    for (const [id, expiry] of Object.entries(parsed)) {
      if (typeof expiry === "number" && expiry > now) {
        active[id] = expiry;
      }
    }
    return active;
  } catch (_) {
    return {};
  }
}

export function setProfileCooldown(profileId: string, durationMs = COOLDOWN_DURATION_MS) {
  try {
    const cooldowns = getCooldowns();
    cooldowns[profileId] = Date.now() + durationMs;
    const serialized = JSON.stringify(cooldowns);
    sessionStorage.setItem(COOLDOWN_STORAGE_KEY, serialized);
    localStorage.setItem(COOLDOWN_STORAGE_KEY, serialized);
  } catch (_) {}
}

export function isProfileOnCooldown(profileId: string): boolean {
  const cooldowns = getCooldowns();
  const expiry = cooldowns[profileId];
  return !!(expiry && expiry > Date.now());
}

export function getCooldownRemainingSeconds(profileId: string): number {
  const cooldowns = getCooldowns();
  const expiry = cooldowns[profileId];
  if (!expiry || expiry <= Date.now()) return 0;
  return Math.ceil((expiry - Date.now()) / 1000);
}

/**
 * Returns ordered active profiles sorted by priority
 */
export function getSortedActiveProfiles(profiles: AIProfile[]): AIProfile[] {
  return profiles
    .filter(p => p.isEnabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Executes an AI request function with Failover over configured active profiles.
 * If a profile fails with 429 / Quota Exceeded / 503, it records cooldown and falls back to the next profile.
 */
export async function executeAiWithFailover<T>(
  profiles: AIProfile[],
  requestFn: (profile: AIProfile) => Promise<T>,
  options?: {
    onFallback?: (fromProfile: AIProfile, toProfile: AIProfile, error: any) => void;
  }
): Promise<T> {
  const activeProfiles = getSortedActiveProfiles(profiles);
  if (activeProfiles.length === 0) {
    throw new Error("No enabled AI profiles configured. Please add and enable an AI key in Settings.");
  }

  // First try profiles that are NOT currently on cooldown
  const availableProfiles = activeProfiles.filter(p => !isProfileOnCooldown(p.id));
  // If all are on cooldown, as a fallback try the entire active list
  const chainToTry = availableProfiles.length > 0 ? availableProfiles : activeProfiles;

  let lastError: any = null;
  let previousProfile: AIProfile | null = null;

  for (let i = 0; i < chainToTry.length; i++) {
    const currentProfile = chainToTry[i];

    if (previousProfile && options?.onFallback) {
      options.onFallback(previousProfile, currentProfile, lastError);
    }

    try {
      const result = await requestFn(currentProfile);
      return result;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);
      const isQuotaError = 
        err?.status === 429 || 
        err?.isQuotaExceeded || 
        errMsg.includes("429") || 
        errMsg.includes("RESOURCE_EXHAUSTED") || 
        errMsg.includes("QuotaExceeded") || 
        errMsg.includes("rate limit") ||
        errMsg.includes("rate_limit");

      if (isQuotaError) {
        console.warn(`[AI Failover] Profile "${currentProfile.name}" hit quota limit. Cooling down for 60s.`);
        setProfileCooldown(currentProfile.id);
        previousProfile = currentProfile;
        // Continue loop to next profile
        continue;
      }

      // Check if it's a 503 Service Unavailable or network disconnect
      const isTemporaryServerUnavailable = err?.status === 503 || errMsg.includes("503") || errMsg.includes("ECONNREFUSED");
      if (isTemporaryServerUnavailable && i < chainToTry.length - 1) {
        console.warn(`[AI Failover] Profile "${currentProfile.name}" returned ${err.status || '503'}. Trying next profile.`);
        previousProfile = currentProfile;
        continue;
      }

      // If it's a regular error not related to quota/availability on the last profile or validation error
      if (i === chainToTry.length - 1) {
        throw err;
      }
      previousProfile = currentProfile;
    }
  }

  throw new Error(lastError?.message || "All configured AI keys exceeded their limits. Please check your AI API quotas in Settings.");
}

/**
 * Tests an AI Profile connection via backend test-profile endpoint
 */
export async function testAiProfileConnection(profile: AIProfile): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  try {
    const res = await fetch("/api/test-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, latencyMs: data.latencyMs };
    }
    return { success: false, error: data.error || `HTTP ${res.status}`, latencyMs: data.latencyMs };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to connect to server" };
  }
}
