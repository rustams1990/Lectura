import { JSDOM } from "jsdom";

// Helper to clean word prefix (e.g. 'spanish_hola' -> 'hola')
export function cleanWordPrefix(word: string): string {
  if (typeof word !== "string") return "";
  return word.replace(/^[a-zA-Z]+_/, "");
}

export const LANG_MAP: Record<string, string> = {
  en: "English",
  english: "English",
  es: "Spanish",
  spanish: "Spanish",
  de: "German",
  german: "German",
  fr: "French",
  french: "French",
  it: "Italian",
  italian: "Italian",
  ru: "Russian",
  russian: "Russian",
  ja: "Japanese",
  japanese: "Japanese",
  zh: "Chinese",
  chinese: "Chinese",
  pt: "Portuguese",
  portuguese: "Portuguese",
  nl: "Dutch",
  dutch: "Dutch",
  pl: "Polish",
  polish: "Polish",
  sv: "Swedish",
  swedish: "Swedish",
  da: "Danish",
  danish: "Danish",
  fi: "Finnish",
  finnish: "Finnish",
  no: "Norwegian",
  norwegian: "Norwegian",
  ko: "Korean",
  korean: "Korean",
  ar: "Arabic",
  arabic: "Arabic",
  tr: "Turkish",
  turkish: "Turkish",
  hi: "Hindi",
  hindi: "Hindi",
  uk: "Ukrainian",
  ua: "Ukrainian",
  ukrainian: "Ukrainian",
  kk: "Kazakh",
  kazakh: "Kazakh",
  he: "Hebrew",
  hebrew: "Hebrew",
  fa: "Persian",
  persian: "Persian",
  cs: "Czech",
  czech: "Czech",
  vi: "Vietnamese",
  vietnamese: "Vietnamese",
  th: "Thai",
  thai: "Thai",
  el: "Greek",
  greek: "Greek",
};

export function normalizeLang(lang: string): string {
  if (!lang) return "English";
  const lower = lang.trim().toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  const base = lower.split(/[-_]/)[0];
  if (LANG_MAP[base]) return LANG_MAP[base];
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
}

export function matchLanguage(entryLang?: string, targetLang?: string): boolean {
  if (!targetLang || targetLang === "all" || targetLang === "overall") return true;
  if (!entryLang) return false;

  const normalize = (l: string): string => {
    const s = l.toLowerCase().trim();
    if (s.startsWith("es") || s === "spanish" || s === "испанский" || s === "español") return "es";
    if (s.startsWith("en") || s === "english" || s === "английский") return "en";
    if (s.startsWith("ru") || s === "russian" || s === "русский") return "ru";
    if (s.startsWith("de") || s === "german" || s === "deutsch" || s === "немецкий") return "de";
    if (s.startsWith("fr") || s === "french" || s === "français" || s === "французский") return "fr";
    if (s.startsWith("it") || s === "italian" || s === "italiano" || s === "итальянский") return "it";
    if (s.startsWith("pt") || s === "portuguese" || s === "português" || s === "португальский") return "pt";
    if (s.startsWith("zh") || s === "chinese" || s === "китайский") return "zh";
    if (s.startsWith("ja") || s === "japanese" || s === "японский") return "ja";
    if (s.startsWith("ko") || s === "korean" || s === "корейский") return "ko";
    if (s.startsWith("tr") || s === "turkish" || s === "турецкий") return "tr";
    if (s.startsWith("uk") || s.startsWith("ua") || s === "ukrainian" || s === "украинский") return "uk";
    if (s.startsWith("pl") || s === "polish" || s === "польский") return "pl";
    if (s.startsWith("ar") || s === "arabic" || s === "арабский") return "ar";
    if (s.startsWith("nl") || s === "dutch" || s === "голландский") return "nl";
    if (s.startsWith("sv") || s === "swedish" || s === "шведский") return "sv";
    if (s.startsWith("el") || s === "greek" || s === "греческий") return "el";
    if (s.startsWith("cs") || s === "czech" || s === "чешский") return "cs";
    if (s.startsWith("hi") || s === "hindi" || s === "хинди") return "hi";
    if (s.startsWith("vi") || s === "vietnamese" || s === "вьетнамский") return "vi";
    if (s.startsWith("kk") || s === "kazakh" || s === "казахский") return "kk";
    if (s.startsWith("he") || s === "hebrew" || s === "иврит") return "he";
    if (s.startsWith("fa") || s === "persian" || s === "персидский") return "fa";
    const clean = s.replace(/[-_].*$/, "");
    return clean.slice(0, 2);
  };

  return normalize(entryLang) === normalize(targetLang);
}

export function deduplicateDbPlaylistItems(rawItems: any[]): any[] {
  if (!Array.isArray(rawItems) || rawItems.length <= 1) return Array.isArray(rawItems) ? rawItems : [];
  const result: any[] = [];
  for (const item of rawItems) {
    if (!item) continue;
    const existingIdx = result.findIndex((existing) => {
      if (existing.id && item.id && existing.id === item.id) return true;
      if (existing.videoId && item.videoId && existing.videoId === item.videoId) return true;
      if (existing.lessonId && item.lessonId && existing.lessonId === item.lessonId) return true;
      if (
        item.title &&
        existing.title &&
        item.title.trim().toLowerCase() === existing.title.trim().toLowerCase() &&
        item.durationSeconds &&
        existing.durationSeconds &&
        Math.abs(item.durationSeconds - existing.durationSeconds) <= 25
      ) {
        return true;
      }
      return false;
    });

    if (existingIdx === -1) {
      result.push({ ...item });
    } else {
      const prev = result[existingIdx];
      result[existingIdx] = {
        ...prev,
        lessonId: prev.lessonId || item.lessonId || undefined,
        videoId: prev.videoId || item.videoId || undefined,
        transcriptLoaded: Boolean(prev.transcriptLoaded || item.transcriptLoaded),
        title: (prev.title && prev.title.trim().length >= (item.title || "").trim().length) ? prev.title : (item.title || prev.title),
        durationSeconds: Math.max(prev.durationSeconds || 0, item.durationSeconds || 0),
        thumbnailUrl: (
          prev.thumbnailUrl?.includes("maxresdefault")
            ? prev.thumbnailUrl
            : (item.thumbnailUrl?.includes("maxresdefault") ? item.thumbnailUrl : (prev.thumbnailUrl || item.thumbnailUrl || ""))
        ),
      };
    }
  }
  return result;
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.trim();
  }

  try {
    const dom = new JSDOM(`<body>${html}</body>`);
    const doc = dom.window.document;

    // Remove non-content elements
    doc.querySelectorAll("script, style, noscript, svg, button, nav, header, footer, aside, form, input, select, canvas").forEach((el) => el.remove());
    const metaSelectors = [
      '[data-component="byline-block"]',
      '[data-testid="byline"]',
      '[data-testid="timestamp"]',
      ".article__byline",
      ".byline",
      "time",
      'header [data-component="headline-block"] ~ div:not([data-component="text-block"])'
    ];
    metaSelectors.forEach((sel) => {
      try {
        doc.querySelectorAll(sel).forEach((el) => el.remove());
      } catch (_) {}
    });

    // Replace <figure> elements
    doc.querySelectorAll("figure").forEach((fig) => {
      const img = fig.querySelector("img");
      const figcaption = fig.querySelector("figcaption");
      let src = "";
      if (img) {
        src = img.getAttribute("data-src") || img.getAttribute("src") || "";
        if (!src && img.getAttribute("srcset")) {
          const parts = img.getAttribute("srcset")!.split(",");
          const last = parts[parts.length - 1].trim().split(/\s+/)[0];
          if (last) src = last;
        }
      }
      const rawCap = (figcaption?.textContent || "").trim().replace(/\s+/g, " ");
      const cap = rawCap.replace(/^image caption[:,]?\s*/i, "").trim();
      let markerText = "";
      if (src && !src.startsWith("data:") && !src.includes("placeholder") && !src.includes("grey-")) {
        markerText += `[IMG:${src}]`;
      }
      if (cap) {
        markerText += (markerText ? "\n" : "") + `[CAPTION:${cap}]`;
      }
      if (markerText) {
        const p = doc.createElement("p");
        p.textContent = markerText;
        fig.replaceWith(p);
      } else {
        fig.remove();
      }
    });

    // Replace any remaining images with placeholders
    doc.querySelectorAll("img").forEach((img) => {
      let src = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (!src && img.getAttribute("srcset")) {
        const parts = img.getAttribute("srcset")!.split(",");
        const last = parts[parts.length - 1].trim().split(/\s+/)[0];
        if (last) src = last;
      }
      if (src && !src.startsWith("data:") && !src.includes("placeholder") && !src.includes("grey-")) {
        const p = doc.createElement("p");
        p.textContent = `[IMG:${src}]`;
        img.replaceWith(p);
      } else {
        img.remove();
      }
    });

    // Convert headings
    doc.querySelectorAll("h1, h2").forEach((h) => {
      const txt = (h.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `## ${txt} ##`;
        h.replaceWith(p);
      } else {
        h.remove();
      }
    });
    doc.querySelectorAll("h3, h4, h5, h6").forEach((h) => {
      const txt = (h.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `# ${txt} #`;
        h.replaceWith(p);
      } else {
        h.remove();
      }
    });

    // Convert list items
    doc.querySelectorAll("li").forEach((li) => {
      const txt = (li.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `• ${txt}`;
        li.replaceWith(p);
      } else {
        li.remove();
      }
    });

    // Extract pure text from body children without <p>, <b>, <ul>
    return Array.from(doc.body.childNodes)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join("\n\n");
  } catch (err) {
    console.warn("[htmlToPlainText] Parsing failed, fallback:", err);
    return html.replace(/<[^>]+>/g, "").trim();
  }
}
