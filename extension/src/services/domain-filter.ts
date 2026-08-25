/**
 * Domain Filtering & Blacklist / Whitelist Service for Lectura Extension
 */

/**
 * Normalizes a domain or URL string down to a clean hostname (lowercase, no protocol, no port, no path)
 */
export function normalizeDomain(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim().toLowerCase();

  // Strip protocol
  clean = clean.replace(/^https?:\/\//i, '');
  // Strip trailing path & query
  clean = clean.replace(/[\/?#].*$/, '');
  // Strip port
  clean = clean.replace(/:\d+$/, '');
  // Strip leading wildcard *.
  clean = clean.replace(/^\*\./, '');
  // Strip leading/trailing dots and spaces
  clean = clean.replace(/^\.+|\.+$/g, '').trim();

  return clean;
}

/**
 * Checks if a target hostname matches a rule pattern
 * Supports:
 * - Exact match: "chatgpt.com" === "chatgpt.com"
 * - Subdomain match: "app.chatgpt.com" matches rule "chatgpt.com"
 * - Wildcard prefix: "mail.google.com" matches rule "*.google.com" or "google.com"
 */
export function isDomainMatch(hostname: string, pattern: string): boolean {
  const normHost = normalizeDomain(hostname);
  const normPattern = normalizeDomain(pattern);

  if (!normHost || !normPattern) return false;

  // Exact match
  if (normHost === normPattern) return true;

  // Subdomain match (e.g., "chat.openai.com" ends with ".openai.com")
  if (normHost.endsWith('.' + normPattern)) return true;

  return false;
}

/**
 * Determines whether the extension should be disabled on the given hostname
 *
 * @param hostname The current page hostname (e.g. window.location.hostname)
 * @param domainList Array of domain strings from settings
 * @param mode 'blacklist' (default) or 'whitelist'
 * @returns true if the extension should be DISABLED, false if it should run
 */
export function isDomainDisabled(
  hostname: string,
  domainList: string[] = [],
  mode: 'blacklist' | 'whitelist' = 'blacklist'
): boolean {
  if (!hostname) return false;

  const validDomains = (domainList || [])
    .map(normalizeDomain)
    .filter(Boolean);

  if (validDomains.length === 0) {
    // If blacklist is empty -> not disabled anywhere
    // If whitelist is empty -> allow everywhere by default so users don't get locked out
    return false;
  }

  const isMatched = validDomains.some((pattern) => isDomainMatch(hostname, pattern));

  if (mode === 'whitelist') {
    // In whitelist mode, disabled on all sites EXCEPT those matched in the list
    return !isMatched;
  }

  // In blacklist mode, disabled ONLY on matched sites
  return isMatched;
}
