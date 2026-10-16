import AdmZip from "adm-zip";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// ============================================================
// EPUB Parser Helpers
// ============================================================
const EPUB_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image
const EPUB_MAX_IMAGES = 250; // up to 250 images per book

function safeDecodePath(rawPath: string): string {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function normalizeZipPath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
}

function resolveRelativePath(basePath: string, relativePath: string): string {
  const baseParts = normalizeZipPath(basePath).split("/");
  baseParts.pop();

  const relParts = normalizeZipPath(relativePath).split("/");
  for (const part of relParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      if (baseParts.length > 0) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join("/");
}

function resolveOpfHref(opfEntryName: string, href: string): string {
  const decodedHref = safeDecodePath(href);
  const opfParentDir = opfEntryName.includes("/")
    ? opfEntryName.substring(0, opfEntryName.lastIndexOf("/"))
    : "";

  if (!opfParentDir) {
    return normalizeZipPath(decodedHref);
  }

  const hrefParts = decodedHref.split("/");
  const baseParts = opfParentDir.split("/");
  const resolvedParts: string[] = [];

  for (const part of hrefParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      if (baseParts.length > 0) {
        baseParts.pop();
      }
    } else {
      resolvedParts.push(part);
    }
  }

  const fullPath = [...baseParts, ...resolvedParts].join("/");
  return normalizeZipPath(fullPath);
}

type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

function findZipEntry(entries: ZipEntry[], resolvedPath: string): ZipEntry | undefined {
  const normalized = normalizeZipPath(resolvedPath).toLowerCase();
  const basename = normalized.includes("/") ? normalized.substring(normalized.lastIndexOf("/") + 1) : normalized;

  return entries.find((e) => {
    if (e.isDirectory) return false;
    const eName = normalizeZipPath(e.entryName).toLowerCase();
    return (
      eName === normalized ||
      eName.endsWith("/" + normalized) ||
      normalized.endsWith("/" + eName) ||
      eName.endsWith("/" + basename) ||
      eName === basename
    );
  });
}

function getMimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/jpeg";
}

function getTagAttr(tagStr: string, attrName: string): string {
  const quoted = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
  const quotedMatch = tagStr.match(quoted);
  if (quotedMatch) return quotedMatch[1];

  const unquoted = new RegExp(`${attrName}\\s*=\\s*([^\\s>"']+)`, "i");
  const unquotedMatch = tagStr.match(unquoted);
  return unquotedMatch ? unquotedMatch[1] : "";
}

export interface EpubParseResult {
  title: string;
  text: string;
  images?: Record<string, string>;
  coverUrl?: string;
}

function extractEpubCover(entries: ZipEntry[], opfXml: string, opfEntryName: string): string | undefined {
  const resolveCoverEntry = (href: string): ZipEntry | undefined => {
    if (!href) return undefined;
    const cleanHref = href.split("#")[0].trim();
    if (!cleanHref) return undefined;
    const resolvedPath = resolveOpfHref(opfEntryName, cleanHref);
    return findZipEntry(entries, resolvedPath) || findZipEntry(entries, cleanHref);
  };

  const imageBufferToDataUrl = (entry: ZipEntry): string => {
    const mime = getMimeFromPath(entry.entryName);
    const base64 = entry.getData().toString("base64");
    return `data:${mime};base64,${base64}`;
  };

  // 1. EPUB 3: item with properties="cover-image" in manifest
  const epub3Match = opfXml.match(/<item\b[^>]*\bproperties\s*=\s*["'][^"']*\bcover-image\b[^"']*["'][^>]*>/i);
  if (epub3Match) {
    const href = getTagAttr(epub3Match[0], "href");
    if (href) {
      const entry = resolveCoverEntry(href);
      if (entry) return imageBufferToDataUrl(entry);
    }
  }

  // 2. EPUB 2: meta name="cover" content="id"
  const metaCoverMatch = opfXml.match(/<meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i) ||
                        opfXml.match(/<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']cover["'][^>]*>/i);
  if (metaCoverMatch) {
    const coverId = metaCoverMatch[1];
    const escaped = coverId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const itemRegex = new RegExp(`<item\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>`, "i");
    const itemMatch = opfXml.match(itemRegex);
    if (itemMatch) {
      const href = getTagAttr(itemMatch[0], "href");
      if (href) {
        const entry = resolveCoverEntry(href);
        if (entry) return imageBufferToDataUrl(entry);
      }
    }
    const directEntry = resolveCoverEntry(coverId);
    if (directEntry) return imageBufferToDataUrl(directEntry);
  }

  // 3. Guide reference type="cover"
  const guideCoverMatch = opfXml.match(/<reference\b[^>]*\btype\s*=\s*["']cover["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (guideCoverMatch) {
    const href = guideCoverMatch[1];
    if (/\.(jpe?g|png|webp)$/i.test(href)) {
      const entry = resolveCoverEntry(href);
      if (entry) return imageBufferToDataUrl(entry);
    } else {
      const pageEntry = resolveCoverEntry(href);
      if (pageEntry) {
        const pageHtml = pageEntry.getData().toString("utf-8");
        const imgMatch = pageHtml.match(/<(?:img|image)\b[^>]*\b(?:src|xlink:href|href)\s*=\s*["']([^"']+)["'][^>]*>/i);
        if (imgMatch) {
          const imgSrc = imgMatch[1];
          const pageDir = pageEntry.entryName.includes("/") ? pageEntry.entryName.substring(0, pageEntry.entryName.lastIndexOf("/")) : "";
          const resolvedImg = resolveRelativePath(pageDir, safeDecodePath(imgSrc));
          const entry = findZipEntry(entries, resolvedImg) || findZipEntry(entries, imgSrc);
          if (entry) return imageBufferToDataUrl(entry);
        }
      }
    }
  }

  // 4. Manifest item where id or href contains "cover" and is an image
  const manifestItems = opfXml.match(/<item\b[^>]*\/?>/gi) || [];
  for (const it of manifestItems) {
    const mediaType = getTagAttr(it, "media-type");
    const href = getTagAttr(it, "href");
    const id = getTagAttr(it, "id");
    const isImage = (mediaType && mediaType.startsWith("image/")) || /\.(jpe?g|png|webp)$/i.test(href);
    if (isImage && (/cover/i.test(id) || /cover/i.test(href))) {
      const entry = resolveCoverEntry(href);
      if (entry) return imageBufferToDataUrl(entry);
    }
  }

  // 5. Fallback: Search all zip entries for cover.(jpg|jpeg|png|webp)
  const fallbackCover = entries.find((e) => !e.isDirectory && /(?:^|\/)cover[^\/]*\.(jpe?g|png|webp)$/i.test(e.entryName));
  if (fallbackCover) {
    return imageBufferToDataUrl(fallbackCover);
  }

  return undefined;
}

export function parseEpub(epubBuffer: Buffer, includeImages: boolean): EpubParseResult {
  try {
    const zip = new AdmZip(epubBuffer);
    const entries = zip.getEntries();

    let containerXml = "";
    const containerEntry = findZipEntry(entries, "META-INF/container.xml");
    if (containerEntry) {
      containerXml = containerEntry.getData().toString("utf-8");
    }

    let opfPath = "";
    if (containerXml) {
      const fullPathMatch = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
      if (fullPathMatch) {
        opfPath = safeDecodePath(fullPathMatch[1]);
      }
    }

    if (!opfPath) {
      const opfEntry = entries.find((e) => e.entryName.toLowerCase().endsWith(".opf"));
      if (opfEntry) opfPath = opfEntry.entryName;
    }

    if (!opfPath) {
      throw new Error("Could not find .opf file in EPUB archive");
    }

    const opfEntry = findZipEntry(entries, opfPath);
    if (!opfEntry) {
      throw new Error(`OPF file '${opfPath}' not found in EPUB zip entries`);
    }

    const opfXml = opfEntry.getData().toString("utf-8");

    let title = "Imported EPUB Document";
    const titleMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    const manifestMap: Record<string, { href: string; mediaType: string }> = {};
    const manifestMatch = opfXml.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i);
    if (manifestMatch) {
      const itemTags = manifestMatch[1].match(/<item\b[^>]*\/?>/gi) || [];
      for (const itemTag of itemTags) {
        const id = getTagAttr(itemTag, "id");
        const href = getTagAttr(itemTag, "href");
        const mediaType = getTagAttr(itemTag, "media-type");
        if (id && href) {
          manifestMap[id] = { href, mediaType };
        }
      }
    }

    const spineItemRefs: string[] = [];
    const spineMatch = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
    if (spineMatch) {
      const itemrefTags = spineMatch[1].match(/<itemref\b[^>]*\/?>/gi) || [];
      for (const tag of itemrefTags) {
        const idref = getTagAttr(tag, "idref");
        if (idref) spineItemRefs.push(idref);
      }
    }

    const chapterHrefs: string[] = [];
    for (const idref of spineItemRefs) {
      const item = manifestMap[idref];
      if (item && item.href) {
        chapterHrefs.push(item.href);
      }
    }

    if (chapterHrefs.length === 0) {
      for (const item of Object.values(manifestMap)) {
        if (
          item.mediaType === "application/xhtml+xml" ||
          item.mediaType === "text/html" ||
          item.href.endsWith(".html") ||
          item.href.endsWith(".xhtml")
        ) {
          chapterHrefs.push(item.href);
        }
      }
    }

    const extractEpubToc = (): Record<string, Array<{ anchor: string | null; title: string }>> => {
      const tocMap: Record<string, Array<{ anchor: string | null; title: string }>> = {};

      const addTocItem = (basePath: string, src: string, rawTitle: string) => {
        if (!src || !rawTitle) return;
        const [filePart, anchorPart] = src.split("#");
        const resolvedPath = resolveOpfHref(basePath, filePart).toLowerCase();
        if (!tocMap[resolvedPath]) {
          tocMap[resolvedPath] = [];
        }
        const cleanTitle = rawTitle
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&#160;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();
        if (cleanTitle) {
          const exists = tocMap[resolvedPath].some(
            (it) => it.title.toLowerCase() === cleanTitle.toLowerCase() && it.anchor === (anchorPart || null)
          );
          if (!exists) {
            tocMap[resolvedPath].push({
              anchor: anchorPart || null,
              title: cleanTitle,
            });
          }
        }
      };

      const ncxEntry = entries.find((e) => e.entryName.toLowerCase().endsWith(".ncx"));
      if (ncxEntry) {
        const ncxXml = ncxEntry.getData().toString("utf-8");
        ncxXml.replace(
          /<navPoint[^>]*>[\s\S]*?<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>\s*<content\s+src=["']([^"']+)["']/gi,
          (_, text, src) => {
            addTocItem(ncxEntry.entryName, src, text);
            return "";
          }
        );
      }

      const navEntry = entries.find(
        (e) => e.entryName.toLowerCase().includes("nav") && (e.entryName.endsWith(".xhtml") || e.entryName.endsWith(".html"))
      );
      if (navEntry) {
        const navXml = navEntry.getData().toString("utf-8");
        navXml.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
          addTocItem(navEntry.entryName, href, text);
          return "";
        });
      }

      return tocMap;
    };

    const tocMap = extractEpubToc();

    const extractedImages: Record<string, string> = {};
    let totalExtractedImages = 0;
    const textBlocks: string[] = [];

    const extractImageFromSrc = (src: string, baseChapterPath: string): string => {
      if (!src || src.startsWith("data:")) return "";
      if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";

      const resolvedImgPath = resolveRelativePath(baseChapterPath, safeDecodePath(src));
      const imgEntry = findZipEntry(entries, resolvedImgPath);
      if (!imgEntry) return "";

      const imgBuffer = imgEntry.getData();
      if (imgBuffer.length > EPUB_MAX_IMAGE_BYTES) return "";

      const mime = getMimeFromPath(resolvedImgPath);
      if (mime === "image/svg+xml" && imgBuffer.length < 200) return "";

      const base64 = imgBuffer.toString("base64");
      const imgId = `epub_img_${totalExtractedImages + 1}_${Date.now()}_${totalExtractedImages}`;

      extractedImages[imgId] = `data:${mime};base64,${base64}`;
      totalExtractedImages++;

      return imgId;
    };

    for (const href of chapterHrefs) {
      const resolvedChapterPath = resolveOpfHref(opfEntry.entryName, href);
      const chapterEntry = findZipEntry(entries, resolvedChapterPath);
      if (!chapterEntry) continue;

      const htmlContent = chapterEntry.getData().toString("utf-8");
      let processedHtml = htmlContent;

      const bodyMatch = processedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        processedHtml = bodyMatch[1];
      }

      processedHtml = processedHtml
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

      const fileTocItems = tocMap[resolvedChapterPath.toLowerCase()] || [];
      let prependedTitle = "";
      if (fileTocItems.length > 0) {
        const mainItem = fileTocItems.find((it) => !it.anchor) || fileTocItems[0];
        if (mainItem) {
          prependedTitle = `[CHAPTER: ${mainItem.title}]\n\n`;
        }
      }

      for (const it of fileTocItems) {
        if (it.anchor) {
          const anchorRegex = new RegExp(`<[^>]+\\b(?:id|name)=["']${it.anchor}["'][^>]*>`, "i");
          if (anchorRegex.test(processedHtml)) {
            processedHtml = processedHtml.replace(anchorRegex, `\n\n---PAGE---\n\n[CHAPTER: ${it.title}]\n\n$&`);
          }
        }
      }

      if (includeImages && totalExtractedImages < EPUB_MAX_IMAGES) {
        processedHtml = processedHtml.replace(/<img\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
          const src = getTagAttr(imgTag, "src");
          const imgId = extractImageFromSrc(src, resolvedChapterPath);
          return imgId ? ` [IMG:${imgId}] ` : "";
        });

        processedHtml = processedHtml.replace(/<image\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
          const xlinkHref = getTagAttr(imgTag, "xlink:href") || getTagAttr(imgTag, "href");
          if (!xlinkHref) return "";
          const imgId = extractImageFromSrc(xlinkHref, resolvedChapterPath);
          return imgId ? ` [IMG:${imgId}] ` : "";
        });
      }

      const imgPlaceholders: string[] = [];
      let markerIndex = 0;
      processedHtml = processedHtml.replace(/\[IMG:epub_img_[^\]]+\]/g, (match) => {
        const token = `\x00IMG${markerIndex}\x00`;
        imgPlaceholders.push(match);
        markerIndex++;
        return token;
      });

      let cleanText = processedHtml
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n\n")
        .replace(/<\/h[1-6]>/gi, "\n\n")
        .replace(/<\/blockquote>/gi, "\n\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&#160;/g, " ")
        .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");

      imgPlaceholders.forEach((placeholder, idx) => {
        cleanText = cleanText.replace(`\x00IMG${idx}\x00`, placeholder);
      });

      cleanText = cleanText
        .split("\n\n")
        .map((para) => {
          return para
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(" ")
            .replace(/[ \t\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, " ")
            .trim();
        })
        .filter(Boolean)
        .join("\n\n");

      if (cleanText) {
        if (cleanText.startsWith("[CHAPTER:")) {
          textBlocks.push(cleanText);
        } else {
          textBlocks.push((prependedTitle + cleanText).trim());
        }
      }
    }

    let combinedText = textBlocks.join("\n\n---PAGE---\n\n");
    combinedText = combinedText
      .replace(/\r\n/g, "\n")
      .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
      .replace(/[ \t]+([.,!?:;…»)'"”\u2019\u201d\u2018\u201c\]\}]+)/g, "$1")
      .replace(/([«(\[{“\u2018\u201c])[ \t]+/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    const result: EpubParseResult = { title, text: combinedText };
    if (includeImages && Object.keys(extractedImages).length > 0) {
      result.images = extractedImages;
      console.log(`[EPUB] Extracted ${Object.keys(extractedImages).length} images from "${title}"`);
    }

    const coverUrl = extractEpubCover(entries, opfXml, opfEntry.entryName);
    if (coverUrl) {
      result.coverUrl = coverUrl;
      console.log(`[EPUB] Extracted cover image for "${title}"`);
    }

    return result;
  } catch (err: any) {
    console.error(`[EPUB] Parsing failed:`, err);
    throw new Error("Unable to extract epub ZIP content structures: " + err.message);
  }
}

// ============================================================
// Browser-like Headers & Fetch for web article fetching
// ============================================================
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ru;q=0.8,es;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export async function fetchWebPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      throw new Error(`Failed to fetch webpage. HTTP status: ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeImageUrl(rawUrl: string | null | undefined, baseUrl: string): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (url.startsWith("//")) url = "https:" + url;
  if (
    url.startsWith("data:image") ||
    url.includes("placeholder") ||
    url.includes("grey-") ||
    url.includes("1x1") ||
    url.includes("avatar")
  ) {
    return null;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url.startsWith("http") ? url : null;
  }
}

function resolveImgSrc(el: Element, baseUrl: string): string | null {
  const rawCandidates: string[] = [];

  for (const attr of ["data-src", "data-original", "data-lazy-src", "data-lazy", "data-url", "data-image-src"]) {
    const v = el.getAttribute(attr);
    if (v) rawCandidates.push(v);
  }

  for (const attr of ["data-srcset", "srcset"]) {
    const srcset = el.getAttribute(attr);
    if (!srcset) continue;
    const entries = srcset
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const parts = s.split(/\s+/);
        const url = parts[0];
        const desc = parts[1] || "";
        const wMatch = desc.match(/^(\d+)w$/i);
        const xMatch = desc.match(/^([\d.]+)x$/i);
        const weight = wMatch ? parseInt(wMatch[1], 10) : xMatch ? parseFloat(xMatch[1]) * 1000 : 0;
        return { url, weight };
      })
      .filter((e) => !!e.url);
    if (entries.length === 0) continue;
    entries.sort((a, b) => b.weight - a.weight);
    rawCandidates.push(entries[0].url);
  }

  const picture = el.parentElement;
  if (picture && picture.tagName.toLowerCase() === "picture") {
    const sources = Array.from(picture.querySelectorAll("source"));
    for (const source of sources) {
      const srcset = source.getAttribute("srcset") || source.getAttribute("data-srcset");
      if (srcset) {
        const entries = srcset
          .split(",")
          .map((s) => s.trim().split(/\s+/)[0])
          .filter(Boolean);
        if (entries.length > 0) rawCandidates.push(entries[entries.length - 1]);
      }
    }
  }

  const plainSrc = el.getAttribute("src");
  if (plainSrc) rawCandidates.push(plainSrc);

  const JUNK_RE = /^data:|1x1|tracking|pixel|spinner|spacer|blank\.gif|placeholder|transparent|\.svg(\?|$)/i;
  for (const raw of rawCandidates) {
    if (!raw || raw.trim().length < 6) continue;
    if (JUNK_RE.test(raw.trim())) continue;
    try {
      const resolved = new URL(raw.trim(), baseUrl).href;
      if (/^https?:\/\//i.test(resolved)) return resolved;
    } catch {
      continue;
    }
  }
  return null;
}

export function cleanAndFormatArticle(rawHtml: string, baseUrl: string) {
  const dom = new JSDOM(rawHtml, { url: baseUrl });
  const doc = dom.window.document;

  const metaImages: string[] = [];

  const ogImg = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
                doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute("content") ||
                doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content");
  const cleanOg = sanitizeImageUrl(ogImg, baseUrl);
  if (cleanOg) metaImages.push(cleanOg);

  doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const data = JSON.parse(script.textContent || "{}");
      const scanObj = (obj: any) => {
        if (!obj) return;
        if (typeof obj === "string" && (obj.endsWith(".jpg") || obj.endsWith(".jpeg") || obj.endsWith(".png") || obj.endsWith(".webp") || obj.includes("/images/"))) {
          const u = sanitizeImageUrl(obj, baseUrl);
          if (u && !metaImages.includes(u)) metaImages.push(u);
        } else if (Array.isArray(obj)) {
          obj.forEach(scanObj);
        } else if (typeof obj === "object") {
          if (obj.image) scanObj(obj.image);
          if (obj.thumbnailUrl) scanObj(obj.thumbnailUrl);
          if (obj.url && obj["@type"] === "ImageObject") scanObj(obj.url);
        }
      };
      scanObj(data);
    } catch {}
  });

  const removeSelectors = [
    "header", "nav", "footer", "form", "aside",
    '[data-testid="header-search"]', '[data-testid="byline"]',
    '[data-testid="timestamp"]',
    "#search", ".search-box", "button", "input", "style", "noscript",
    "time", ".byline", ".article__metadata",
    '[class*="header-search"]', '[class*="search-bar"]', '[class*="site-search"]',
    '[role="navigation"]', '[role="banner"]',
    '[aria-label*="search" i]', '[aria-label*="navigation" i]',
    '[data-component="byline-block"]',
    ".article__byline",
    'header [data-component="headline-block"] ~ div:not([data-component="text-block"])'
  ];
  removeSelectors.forEach((sel) => {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch (_) {}
  });

  const mainRoot = (doc.querySelector("article") ||
                    doc.querySelector("main") ||
                    doc.querySelector('[role="main"]') ||
                    doc.querySelector(".article-body") ||
                    doc.querySelector(".article__body") ||
                    doc.querySelector(".post-content") ||
                    doc.querySelector("#content") ||
                    doc.body) as HTMLElement;

  const imageContainers = doc.querySelectorAll('figure, picture, [data-component="image-block"], .article__image, .lead-image, .image-container, [class*="image-block"], [class*="figure"], img');

  imageContainers.forEach((container) => {
    if (!container.parentNode) return;

    if (container.tagName === "IMG") {
      if (container.closest('figure, picture, [data-component="image-block"]')) return;
    } else {
      if (container.parentElement?.closest('figure, picture, [data-component="image-block"]')) return;
    }

    let bestUrl: string | null = null;

    const sources = Array.from(container.querySelectorAll("source"));
    for (const src of sources) {
      const srcset = src.getAttribute("srcset") || src.getAttribute("data-srcset");
      if (srcset) {
        const parts = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]);
        const valid = parts.map((p) => sanitizeImageUrl(p, baseUrl)).filter(Boolean) as string[];
        if (valid.length > 0) {
          bestUrl = valid[valid.length - 1];
          break;
        }
      }
    }

    if (!bestUrl) {
      const imgs = container.tagName === "IMG"
        ? [container as HTMLImageElement]
        : Array.from(container.querySelectorAll("img"));

      for (const imgNode of imgs) {
        const candidate = resolveImgSrc(imgNode, baseUrl);
        if (candidate) {
          bestUrl = candidate;
          break;
        }
      }
    }

    const figcap = container.querySelector('figcaption, [class*="caption" i], [data-testid*="caption"], .caption');
    const creditEl = container.querySelector('[class*="credit" i], [data-testid*="credit"], .credit');
    let captionText = figcap?.textContent?.replace(/^image caption[:,]?\s*/i, "").trim() || "";
    const creditText = creditEl && (!figcap || !figcap.contains(creditEl)) ? creditEl.textContent?.trim() || "" : "";

    if (!captionText && container.tagName === "IMG") {
      const alt = container.getAttribute("alt")?.trim();
      if (alt && alt.length > 5 && !alt.toLowerCase().includes("image unavailable") && !alt.toLowerCase().includes("placeholder")) {
        captionText = alt;
      }
    }

    if (creditText && !captionText.includes(creditText)) {
      captionText = captionText ? `${captionText} (${creditText})` : creditText;
    }
    if (captionText && captionText.length > 300) captionText = captionText.slice(0, 300);

    if (bestUrl) {
      const pImg = doc.createElement("p");
      pImg.textContent = `[IMG:${bestUrl}]`;
      container.parentNode?.insertBefore(pImg, container);

      if (captionText) {
        const pCap = doc.createElement("p");
        pCap.textContent = `[CAPTION:${captionText}]`;
        container.parentNode?.insertBefore(pCap, container);
      }
      container.remove();
    } else {
      if (["FIGURE", "PICTURE", "IMG"].includes(container.tagName)) {
        container.remove();
      }
    }
  });

  let parsed: any = null;
  try {
    const reader = new Readability(doc, { keepClasses: false });
    parsed = reader.parse();
  } catch (e) {
    console.warn("[cleanAndFormatArticle] Readability parse error:", e);
  }

  const wordCount = (parsed?.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  let finalText = "";

  if (parsed && parsed.content && wordCount >= 50) {
    const contentDoc = new JSDOM(`<body>${parsed.content}</body>`).window.document;
    const blocks: string[] = [];

    contentDoc.body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li").forEach((el) => {
      const text = el.textContent?.trim();
      if (!text || /^Site search$/i.test(text)) return;

      if (text.startsWith("[IMG:") || text.startsWith("[CAPTION:")) {
        blocks.push(text);
      } else if (el.tagName === "H1" || el.tagName === "H2") {
        blocks.push(`## ${text} ##`);
      } else if (el.tagName === "H3" || el.tagName === "H4" || el.tagName === "H5" || el.tagName === "H6") {
        blocks.push(`# ${text} #`);
      } else if (el.tagName === "LI") {
        blocks.push(`• ${text}`);
      } else {
        blocks.push(text);
      }
    });

    finalText = blocks.join("\n\n");
  } else {
    console.log(`[cleanAndFormatArticle] Fallback triggered! Readability wordCount=${wordCount}`);
    const blocks: string[] = [];
    mainRoot.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote").forEach((el) => {
      if (el.parentElement && ["p", "li", "blockquote"].includes(el.parentElement.tagName.toLowerCase())) {
        return;
      }

      const t = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (!t || /^Site search$/i.test(t)) return;

      const tag = el.tagName.toUpperCase();
      if (t.startsWith("[IMG:") || t.startsWith("[CAPTION:")) {
        blocks.push(t);
      } else if (tag === "H1" || tag === "H2") {
        blocks.push(`## ${t} ##`);
      } else if (tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6") {
        blocks.push(`# ${t} #`);
      } else if (tag === "LI") {
        blocks.push(`• ${t}`);
      } else {
        blocks.push(t);
      }
    });
    finalText = blocks.join("\n\n");
  }

  if (!finalText.includes("[IMG:") && metaImages.length > 0) {
    finalText = `[IMG:${metaImages[0]}]\n\n` + finalText;
  }

  finalText = finalText.replace(/\n{3,}/g, "\n\n").trim();

  const title = (parsed?.title && parsed.title.trim()) ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim() ||
    mainRoot.querySelector("h1")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.title?.trim() ||
    "Web Article";

  return {
    title,
    text: finalText,
    byline: parsed?.byline || null,
    excerpt: parsed?.excerpt || null,
  };
}
