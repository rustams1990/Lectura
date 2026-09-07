import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { Type } from "@google/genai";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getGeminiClient, callLocalAi } from "./geminiClient.ts";
import { formatGeminiTranscript } from "./youtube.ts";
import { getYtDlp } from "./ytdlpWrapper.ts";
import { getDbConnection } from "./dbConnection.ts";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const IMAGE_CACHE_DIR = path.join(DATA_DIR, "image_cache");
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
if (!fs.existsSync(VIDEO_STORAGE_DIR)) {
  fs.mkdirSync(VIDEO_STORAGE_DIR, { recursive: true });
}

// EPUB Parser Helpers
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

interface EpubParseResult {
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

  // 2. EPUB 2: meta name="cover" content="id" (or meta content="id" name="cover")
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

function parseEpub(epubBuffer: Buffer, includeImages: boolean): EpubParseResult {
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

    // Helper: Extract Table of Contents from NCX (EPUB 2) or Nav (EPUB 3)
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
          // Avoid duplicate titles for the same anchor/file
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

      // 1. Try NCX (EPUB 2)
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

      // 2. Try Nav (EPUB 3)
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

    // Helper: extract and replace a single img src path with [IMG:id] placeholder
    const extractImageFromSrc = (src: string, baseChapterPath: string): string => {
      if (!src || src.startsWith("data:")) return "";
      if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";

      const resolvedImgPath = resolveRelativePath(baseChapterPath, safeDecodePath(src));
      const imgEntry = findZipEntry(entries, resolvedImgPath);
      if (!imgEntry) return "";

      const imgBuffer = imgEntry.getData();
      if (imgBuffer.length > EPUB_MAX_IMAGE_BYTES) return "";

      const mime = getMimeFromPath(resolvedImgPath);
      // Skip SVG images used for decorative purposes (very small files < 200 bytes)
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

      // Extract body if present to avoid any head/meta/title leakage
      const bodyMatch = processedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        processedHtml = bodyMatch[1];
      }

      // Immediately strip script, style, and head tags before anything else
      processedHtml = processedHtml
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

      // Check TOC items mapped to this chapter file
      const fileTocItems = tocMap[resolvedChapterPath.toLowerCase()] || [];
      let prependedTitle = "";
      if (fileTocItems.length > 0) {
        // Find main file-level title (without anchor, or first item)
        const mainItem = fileTocItems.find((it) => !it.anchor) || fileTocItems[0];
        if (mainItem) {
          prependedTitle = `[CHAPTER: ${mainItem.title}]\n\n`;
        }
      }

      // If there are anchor-based TOC items inside this file, insert section breaks at anchors
      for (const it of fileTocItems) {
        if (it.anchor) {
          const anchorRegex = new RegExp(`<[^>]+\\b(?:id|name)=["']${it.anchor}["'][^>]*>`, "i");
          if (anchorRegex.test(processedHtml)) {
            processedHtml = processedHtml.replace(anchorRegex, `\n\n---PAGE---\n\n[CHAPTER: ${it.title}]\n\n$&`);
          }
        }
      }

      if (includeImages && totalExtractedImages < EPUB_MAX_IMAGES) {
        // Replace <img ...> tags (standard HTML/XHTML)
        processedHtml = processedHtml.replace(/<img\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
          const src = getTagAttr(imgTag, "src");
          const imgId = extractImageFromSrc(src, resolvedChapterPath);
          return imgId ? ` [IMG:${imgId}] ` : "";
        });

        // Replace <image ...> tags (SVG/XHTML with xlink:href or href)
        processedHtml = processedHtml.replace(/<image\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";
          // Try xlink:href first, then href
          const xlinkHref = getTagAttr(imgTag, "xlink:href") || getTagAttr(imgTag, "href");
          if (!xlinkHref) return "";
          const imgId = extractImageFromSrc(xlinkHref, resolvedChapterPath);
          return imgId ? ` [IMG:${imgId}] ` : "";
        });
      }

      // Clean HTML to plain text, but preserve our [IMG:...] placeholders
      // Step 1: Extract [IMG:...] markers before stripping tags
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

      // Step 2: Restore [IMG:...] markers
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
        // If cleanText already has a [CHAPTER: ...] at the very beginning (e.g. from anchor split on first element), don't duplicate
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
// Media & Parser Routes
// ============================================================

// 1. Image Proxy
router.get("/image-proxy", async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: "URL parameter 'url' is required" });
  }

  try {
    const hash = crypto.createHash("md5").update(imageUrl).digest("hex");
    
    const parsedUrl = new URL(imageUrl);
    const pathname = parsedUrl.pathname;
    let ext = path.extname(pathname) || ".jpg";
    if (!/^\.[a-zA-Z0-5]+$/.test(ext) || ext.length > 5) {
      ext = ".jpg";
    }
    
    const cacheFilename = `img_${hash}${ext}`;
    const cacheFilePath = path.join(IMAGE_CACHE_DIR, cacheFilename);

    if (fs.existsSync(cacheFilePath)) {
      res.set("Cache-Control", "public, max-age=31536000");
      return res.sendFile(cacheFilePath);
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Image fetch failed with status ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.promises.writeFile(cacheFilePath, buffer);

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000");
    return res.send(buffer);
  } catch (err: any) {
    console.error("Image proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy image" });
  }
});

// 2. Image Search Proxy (DuckDuckGo Scraper)
router.get("/image-search", async (req: Request, res: Response) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const htmlUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query as string)}`;
    const htmlResponse = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });

    if (!htmlResponse.ok) {
      throw new Error(`DuckDuckGo HTML query returned status ${htmlResponse.status}`);
    }

    const html = await htmlResponse.text();

    let vqd: string | null = null;
    const match1 = html.match(/vqd=([\d-]+)\&/);
    if (match1) {
      vqd = match1[1];
    }
    if (!vqd) {
      const match2 = html.match(/vqd\s*=\s*['"]([^'"]+)['"]/);
      if (match2) {
        vqd = match2[1];
      }
    }
    if (!vqd) {
      const match3 = html.match(/vqd="([\d-]+)"/);
      if (match3) {
        vqd = match3[1];
      }
    }

    if (!vqd) {
      throw new Error("Could not extract vqd token from DuckDuckGo response");
    }

    const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query as string)}&vqd=${vqd}&f=,,,;&p=1`;
    const apiResponse = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://duckduckgo.com/"
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`DuckDuckGo image API returned status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    let results = (data.results || []).slice(0, 16).map((item: any, idx: number) => {
      const imgUrl = item.image || item.thumbnail || "";
      const thumbUrl = item.thumbnail || item.image || "";
      return {
        id: `ddg_${idx}_${Date.now()}`,
        url: imgUrl,
        thumb: thumbUrl,
        image: imgUrl,
        thumbnail: thumbUrl,
        author: item.source || "DuckDuckGo",
        source: item.source || "DuckDuckGo",
        description: item.title || "",
        title: item.title || ""
      };
    });

    if (!results || results.length === 0) {
      results = await searchWikimedia(query as string);
    }

    return res.json({ results });
  } catch (err: any) {
    console.error("DuckDuckGo Image search error, trying Wikimedia fallback:", err);
    try {
      const wikiResults = await searchWikimedia(query as string);
      if (wikiResults.length > 0) {
        return res.json({ results: wikiResults });
      }
    } catch (wikiErr) {
      console.error("Wikimedia fallback error:", wikiErr);
    }
    return res.status(500).json({ error: err.message || "Failed to search images" });
  }
});

async function searchWikimedia(query: string) {
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=16&prop=imageinfo&iiprop=url|mime&format=json`;
    const resp = await fetch(wikiUrl, {
      headers: { "User-Agent": "LecturaApp/1.0 (https://lectura.app)" }
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const pages = json.query?.pages || {};
    return Object.values(pages).map((page: any, idx: number) => {
      const ii = page.imageinfo?.[0];
      const imgUrl = ii?.url || "";
      return {
        id: `wiki_${page.pageid || idx}`,
        url: imgUrl,
        thumb: imgUrl,
        image: imgUrl,
        thumbnail: imgUrl,
        author: "Wikimedia Commons",
        source: "Wikimedia Commons",
        description: page.title || query,
        title: page.title || query
      };
    }).filter((item: any) => item.url);
  } catch (err) {
    return [];
  }
}

// 3. Document Import (EPUB & PDF)
router.post("/import-file", async (req: Request, res: Response) => {
  const { fileBase64, filename, fileType, importImages } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: "File data base64 is required" });
  }

  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
  // Check length of base64 payload first
  const estimatedSize = Math.ceil((fileBase64.length * 3) / 4);
  if (estimatedSize > MAX_FILE_SIZE_BYTES + 1024) {
    return res.status(413).json({ error: "Размер файла превышает максимально допустимый лимит 50 МБ (Payload Too Large)" });
  }

  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ error: "Размер файла превышает максимально допустимый лимит 50 МБ (Payload Too Large)" });
  }

  const extension = filename ? filename.split(".").pop().toLowerCase() : "";

  try {
    if (fileType === "application/pdf" || extension === "pdf") {
      let pdfResult: any;
      try {
        pdfResult = await pdfParse(buffer);
      } catch (err) {
        console.error("PDF parsing failed:", err);
        throw err;
      }

      let text = typeof pdfResult === "string" ? pdfResult : (pdfResult?.text || "");

      text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");
      text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported PDF Document";
      return res.json({ title, text });
    } else if (
      fileType === "application/epub+zip" || 
      fileType === "application/epub" || 
      extension === "epub" ||
      fileType === "application/octet-stream" && extension === "epub"
    ) {
      const parsed = parseEpub(buffer, !!importImages);
      if (!parsed.text) {
        throw new Error("Extracted text is empty. EPUB might contain scanned pages or empty chapters.");
      }
      return res.json(parsed);
    } else {
      const textContent = buffer.toString("utf-8");
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported Document";
      return res.json({ title, text: textContent });
    }
  } catch (err: any) {
    console.error("Document parser error in /api/import-file:", err);
    return res.status(500).json({ error: "Не удалось импортировать файл: " + (err.message || err) });
  }
});

// ============================================================
// Browser-like Headers & Fetch for web article fetching
// ============================================================
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8,es;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export async function fetchWebPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`Failed to fetch webpage. HTTP status: ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// Mozilla Readability article parser
// ============================================================
interface ReadabilityResult {
  title: string;
  byline: string | null;
  contentHtml: string;
  textContent: string;
  excerpt: string | null;
}

function sanitizeImageUrl(rawUrl: string | null | undefined, baseUrl: string): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (url.startsWith('//')) url = 'https:' + url;
  if (
    url.startsWith('data:image') ||
    url.includes('placeholder') ||
    url.includes('grey-') ||
    url.includes('1x1') ||
    url.includes('avatar')
  ) {
    return null;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url.startsWith('http') ? url : null;
  }
}

/**
 * Resolve an img src to an absolute URL.
 * Handles relative paths, srcset, and lazy-load data-src.
 */
function resolveImgSrc(el: Element, baseUrl: string): string | null {
  // ── 1. Collect all candidate URL attributes in priority order ──────────────
  // data-src / data-original / data-lazy-src come BEFORE src because sites like BBC
  // put a transparent base64 placeholder in src= and the real URL in data-src=
  const rawCandidates: string[] = [];

  // Lazy-load attributes (highest priority)
  for (const attr of ["data-src", "data-original", "data-lazy-src", "data-lazy", "data-url", "data-image-src"]) {
    const v = el.getAttribute(attr);
    if (v) rawCandidates.push(v);
  }

  // ── 2. srcset / data-srcset: pick entry with the largest width descriptor ──
  // BBC uses srcset="url1 240w, url2 480w, url3 960w" — we want the last (largest)
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

  // ── 3. Also check <picture><source> siblings for srcset ───────────────────
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

  // ── 4. Plain src last (lowest priority — often a placeholder on lazy sites) ─
  const plainSrc = el.getAttribute("src");
  if (plainSrc) rawCandidates.push(plainSrc);

  // ── 5. Resolve and validate each candidate ────────────────────────────────
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

  // 1. Извлекаем резервные изображения (Lead Image) из Meta-тегов и JSON-LD ДО очистки DOM
  const metaImages: string[] = [];

  // OpenGraph & Twitter
  const ogImg = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content') ||
                doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
  const cleanOg = sanitizeImageUrl(ogImg, baseUrl);
  if (cleanOg) metaImages.push(cleanOg);

  // JSON-LD
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '{}');
      const scanObj = (obj: any) => {
        if (!obj) return;
        if (typeof obj === 'string' && (obj.endsWith('.jpg') || obj.endsWith('.jpeg') || obj.endsWith('.png') || obj.endsWith('.webp') || obj.includes('/images/'))) {
          const u = sanitizeImageUrl(obj, baseUrl);
          if (u && !metaImages.includes(u)) metaImages.push(u);
        } else if (Array.isArray(obj)) {
          obj.forEach(scanObj);
        } else if (typeof obj === 'object') {
          if (obj.image) scanObj(obj.image);
          if (obj.thumbnailUrl) scanObj(obj.thumbnailUrl);
          if (obj.url && obj['@type'] === 'ImageObject') scanObj(obj.url);
        }
      };
      scanObj(data);
    } catch {}
  });

  // 2. Очищаем навигационный мусор
  const removeSelectors = [
    'header', 'nav', 'footer', 'form', 'aside',
    '[data-testid="header-search"]', '[data-testid="byline"]',
    '[data-testid="timestamp"]',
    '#search', '.search-box', 'button', 'input', 'style', 'noscript',
    'time', '.byline', '.article__metadata',
    '[class*="header-search"]', '[class*="search-bar"]', '[class*="site-search"]',
    '[role="navigation"]', '[role="banner"]',
    '[aria-label*="search" i]', '[aria-label*="navigation" i]',
    '[data-component="byline-block"]',
    '.article__byline',
    'header [data-component="headline-block"] ~ div:not([data-component="text-block"])'
  ];
  removeSelectors.forEach(sel => {
    try {
      doc.querySelectorAll(sel).forEach(el => el.remove());
    } catch (_) {}
  });

  // 1. Предварительный выбор корневого контейнера статьи (Target Main Content)
  const mainRoot = (doc.querySelector('article') || 
                    doc.querySelector('main') || 
                    doc.querySelector('[role="main"]') || 
                    doc.querySelector('.article-body') || 
                    doc.querySelector('.article__body') || 
                    doc.querySelector('.post-content') || 
                    doc.querySelector('#content') || 
                    doc.body) as HTMLElement;

  // 3. Заменяем встроенные картинки на параграфы маркеров прямо в DOM статьи
  const imageContainers = doc.querySelectorAll('figure, picture, [data-component="image-block"], .article__image, .lead-image, .image-container, [class*="image-block"], [class*="figure"], img');
  
  imageContainers.forEach(container => {
    if (!container.parentNode) return;

    // Avoid double processing child elements if their outer container was already selected
    if (container.tagName === 'IMG') {
      if (container.closest('figure, picture, [data-component="image-block"]')) return;
    } else {
      if (container.parentElement?.closest('figure, picture, [data-component="image-block"]')) return;
    }

    let bestUrl: string | null = null;

    // source srcset
    const sources = Array.from(container.querySelectorAll('source'));
    for (const src of sources) {
      const srcset = src.getAttribute('srcset') || src.getAttribute('data-srcset');
      if (srcset) {
        const parts = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
        const valid = parts.map(p => sanitizeImageUrl(p, baseUrl)).filter(Boolean) as string[];
        if (valid.length > 0) {
          bestUrl = valid[valid.length - 1];
          break;
        }
      }
    }

    // img attributes (inspect all <img> tags inside container, not just the first one)
    if (!bestUrl) {
      const imgs = container.tagName === 'IMG'
        ? [container as HTMLImageElement]
        : Array.from(container.querySelectorAll('img'));

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
    let captionText = figcap?.textContent?.replace(/^image caption[:,]?\s*/i, '').trim() || '';
    const creditText = creditEl && (!figcap || !figcap.contains(creditEl)) ? creditEl.textContent?.trim() || '' : '';

    if (!captionText && container.tagName === 'IMG') {
      const alt = container.getAttribute('alt')?.trim();
      if (alt && alt.length > 5 && !alt.toLowerCase().includes('image unavailable') && !alt.toLowerCase().includes('placeholder')) {
        captionText = alt;
      }
    }

    if (creditText && !captionText.includes(creditText)) {
      captionText = captionText ? `${captionText} (${creditText})` : creditText;
    }
    if (captionText && captionText.length > 300) captionText = captionText.slice(0, 300);

    if (bestUrl) {
      const pImg = doc.createElement('p');
      pImg.textContent = `[IMG:${bestUrl}]`;
      container.parentNode?.insertBefore(pImg, container);

      if (captionText) {
        const pCap = doc.createElement('p');
        pCap.textContent = `[CAPTION:${captionText}]`;
        container.parentNode?.insertBefore(pCap, container);
      }
      container.remove();
    } else {
      if (['FIGURE', 'PICTURE', 'IMG'].includes(container.tagName)) {
        container.remove();
      }
    }
  });

  // 4. Запуск Mozilla Readability
  let parsed: any = null;
  try {
    const reader = new Readability(doc, { keepClasses: false });
    parsed = reader.parse();
  } catch (e) {
    console.warn('[cleanAndFormatArticle] Readability parse error:', e);
  }

  const wordCount = (parsed?.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  let finalText = '';

  // 5. Конвертируем контент в чистые абзацы
  if (parsed && parsed.content && wordCount >= 50) {
    const contentDoc = new JSDOM(`<body>${parsed.content}</body>`).window.document;
    const blocks: string[] = [];

    contentDoc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li').forEach(el => {
      const text = el.textContent?.trim();
      if (!text || /^Site search$/i.test(text)) return;

      if (text.startsWith('[IMG:') || text.startsWith('[CAPTION:')) {
        blocks.push(text);
      } else if (el.tagName === 'H1' || el.tagName === 'H2') {
        blocks.push(`## ${text} ##`);
      } else if (el.tagName === 'H3' || el.tagName === 'H4' || el.tagName === 'H5' || el.tagName === 'H6') {
        blocks.push(`# ${text} #`);
      } else if (el.tagName === 'LI') {
        blocks.push(`• ${text}`);
      } else {
        blocks.push(text);
      }
    });

    finalText = blocks.join('\n\n');
  } else {
    // Fallback: собираем все заголовки, параграфы и наши плейсхолдеры [IMG:...] напрямую из mainRoot
    console.log(`[cleanAndFormatArticle] Fallback triggered! Readability wordCount=${wordCount}`);
    const blocks: string[] = [];
    mainRoot.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote').forEach(el => {
      if (el.parentElement && ['p', 'li', 'blockquote'].includes(el.parentElement.tagName.toLowerCase())) {
        return;
      }

      const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (!t || /^Site search$/i.test(t)) return;

      const tag = el.tagName.toUpperCase();
      if (t.startsWith('[IMG:') || t.startsWith('[CAPTION:')) {
        blocks.push(t);
      } else if (tag === 'H1' || tag === 'H2') {
        blocks.push(`## ${t} ##`);
      } else if (tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
        blocks.push(`# ${t} #`);
      } else if (tag === 'LI') {
        blocks.push(`• ${t}`);
      } else {
        blocks.push(t);
      }
    });
    finalText = blocks.join('\n\n');
  }

  // 6. Гарантированный Fallback: если картинок в теле статьи не оказалось, вставляем Lead Image из метатегов
  if (!finalText.includes('[IMG:') && metaImages.length > 0) {
    finalText = `[IMG:${metaImages[0]}]\n\n` + finalText;
  }

  finalText = finalText.replace(/\n{3,}/g, '\n\n').trim();

  const foundImgs = finalText.match(/\[IMG:[^\]]+\]/g);
  console.log('🖼️ Found Images in imported text:', foundImgs);

  const title = (parsed?.title && parsed.title.trim()) ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')?.trim() ||
    mainRoot.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.title?.trim() ||
    "Web Article";

  return {
    title,
    text: finalText,
    byline: parsed?.byline || null,
    excerpt: parsed?.excerpt || null,
  };
}

/**
 * Обработка блока с картинкой и подписью (<figure>):
 * Извлекает URL картинки и подпись/автора, формируя:
 * \n\n[IMG:url]\n\n[CAPTION:text]\n\n
 */
function processFigureElement(figure: Element, baseUrl: string): string {
  // 1. Ищем URL картинки
  const sources = Array.from(figure.querySelectorAll('source'));
  let fullImageUrl: string | null = null;
  for (const src of sources) {
    const srcset = src.getAttribute('srcset') || src.getAttribute('data-srcset');
    if (srcset) {
      const parts = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]);
      const valid = parts.map((p) => sanitizeImageUrl(p, baseUrl)).filter(Boolean) as string[];
      if (valid.length > 0) {
        fullImageUrl = valid[valid.length - 1];
        break;
      }
    }
  }

  if (!fullImageUrl) {
    const imgs = Array.from(figure.querySelectorAll('img'));
    for (const img of imgs) {
      const candidate = resolveImgSrc(img, baseUrl);
      if (candidate) {
        fullImageUrl = candidate;
        break;
      }
    }
  }

  if (!fullImageUrl) {
    return '';
  }

  let result = `\n\n[IMG:${fullImageUrl}]\n\n`;

  const figcaption = figure.querySelector('figcaption, [class*="caption" i], [data-testid*="caption"], .caption');
  let rawCap = figcaption ? (figcaption.textContent || '').trim().replace(/\s+/g, ' ') : '';
  let captionText = rawCap.replace(/^image caption[:,]?\s*/i, '').trim();

  // Также извлекаем кредиты автора/агентства внутри figure (если не внутри figcaption)
  const creditEl = figure.querySelector('[class*="credit" i], [class*="copyright" i], [data-testid*="credit" i], [class*="author" i]');
  if (creditEl && figcaption && !figcaption.contains(creditEl)) {
    const cred = (creditEl.textContent || '').trim().replace(/\s+/g, ' ');
    if (cred && !captionText.includes(cred)) {
      captionText = captionText ? `${captionText} (${cred})` : cred;
    }
  } else if (!captionText && creditEl) {
    captionText = (creditEl.textContent || '').trim().replace(/\s+/g, ' ');
  }

  if (captionText && captionText.length < 300) {
    result += `[CAPTION:${captionText}]\n\n`;
  }

  return result;
}

/**
 * Convert Readability contentHtml into the Lectura internal text format:
 *  - Headings → ## Heading text ## (h1/h2), # Heading text # (h3/h4/h5/h6)
 *  - Paragraphs → plain text + double newline
 *  - Images → [IMG:https://absolute-url]
 *  - List items → • item text
 *  - Figure captions → [CAPTION:text]
 *  - Blockquotes → quoted paragraph text
 */
function convertArticleHtmlToText(contentHtml: string, baseUrl: string): string {
  if (!contentHtml) return "";

  let dom: JSDOM;
  try {
    dom = new JSDOM(`<body>${contentHtml}</body>`, { url: baseUrl });
  } catch {
    return "";
  }

  const body = dom.window.document.body;

  // ── Pre-walk DOM cleanup: strip known navigation/metadata noise ────────────
  // Readability sometimes leaves in time tags, bylines, share buttons, etc.
  const JUNK_SELECTORS = [
    "time",                           // publication dates
    "button",                         // share/save buttons
    "[data-component='byline-block']",
    "[data-testid='byline']",
    "[data-testid='header-search']",
    "[data-testid='timestamp']",
    ".article__byline",
    ".byline",
    "header [data-component='headline-block'] ~ div:not([data-component='text-block'])",
    "[class*='byline']",
    "[class*='Byline']",
    "[class*='share']",
    "[class*='Share']",
    "[class*='social']",
    "[class*='Social']",
    "[class*='navigation']",
    "[class*='cookie']",
    "[class*='consent']",
    "[class*='subscribe']",
    "[class*='newsletter']",
    "[class*='advertisement']",
    "[class*='ad-']",
    "[class*='-ad']",
    "[role='navigation']",
    "[role='banner']",
    "[role='complementary']",
    "[aria-label*='search' i]",
    "[aria-label*='navigation' i]",
    "[aria-label*='share' i]",
    "[aria-label*='subscribe' i]",
  ];
  for (const sel of JUNK_SELECTORS) {
    try {
      body.querySelectorAll(sel).forEach((el) => el.remove());
    } catch { /* ignore invalid selectors */ }
  }

  const lines: string[] = [];

  /** Recursively walk an element's children and emit text blocks. */
  function walk(el: Element) {
    const tag = el.tagName.toLowerCase();

    // Skip elements that rarely contain article text
    if (["script", "style", "noscript", "form", "button", "nav", "aside", "header", "footer", "time", "address", "svg", "figure > figcaption > span"].includes(tag)) return;


    // ── Headings ──────────────────────────────────────────────
    if (tag === "h1" || tag === "h2") {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) lines.push(`\n## ${text} ##\n`);
      return;
    }
    if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) lines.push(`\n# ${text} #\n`);
      return;
    }

    const pushImage = (src: string | null) => {
      if (!src) return;
      const marker = `[IMG:${src}]`;
      if (lines[lines.length - 1] === marker) return;
      lines.push(marker);
    };

    // ── Figures / images ──────────────────────────────────────
    if (tag === "figure") {
      const figBlock = processFigureElement(el, baseUrl);
      if (figBlock) {
        const parts = figBlock.trim().split(/\n\s*\n/).filter(Boolean);
        for (const p of parts) {
          lines.push(p.trim());
        }
      }
      return;
    }

    if (tag === "figcaption") {
      const rawText = (el.textContent || "").trim().replace(/\s+/g, " ");
      const capText = rawText.replace(/^image caption[:,]?\s*/i, "").trim();
      if (capText.length > 0) {
        lines.push(`[CAPTION:${capText}]`);
      }
      return;
    }

    if (tag === "picture") {
      const img = el.querySelector("img");
      if (img) {
        pushImage(resolveImgSrc(img, baseUrl));
      }
      return;
    }

    if (tag === "img") {
      pushImage(resolveImgSrc(el, baseUrl));
      return;
    }

    // ── Lists ─────────────────────────────────────────────────
    if (tag === "li") {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) lines.push(`• ${text}`);
      return;
    }

    // ── Blockquotes ───────────────────────────────────────────
    if (tag === "blockquote") {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) lines.push(`"${text}"`);
      return;
    }

    // ── Div container ─────────────────────────────────────────
    if (tag === "div") {
      // If div has element children, recurse into them
      if (el.children.length > 0) {
        for (const child of Array.from(el.children)) {
          walk(child as Element);
        }
        return;
      }
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text.length > 0) lines.push(text);
      return;
    }

    // ── Paragraphs ────────────────────────────────────────────
    if (tag === "p") {
      // Extract any images directly inside or nested in this paragraph
      const imgs = Array.from(el.querySelectorAll("img"));
      for (const img of imgs) {
        pushImage(resolveImgSrc(img, baseUrl));
      }

      // If p has block-level children, recurse into them
      const hasBlockChildren = Array.from(el.children).some((c) =>
        ["div", "p", "figure", "picture", "ul", "ol", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"].includes(c.tagName.toLowerCase())
      );
      if (hasBlockChildren) {
        for (const child of Array.from(el.children)) {
          walk(child as Element);
        }
        return;
      }

      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text.length > 0) lines.push(text);
      return;
    }

    // ── Generic container — recurse ───────────────────────────
    for (const child of Array.from(el.children)) {
      walk(child as Element);
    }
  }

  // Walk all direct children of body
  for (const child of Array.from(body.children)) {
    walk(child as Element);
  }

  // ── Post-process: clean up / merge stray image credits (e.g. "BBC / Emmanuel Lafont") ─
  const CREDIT_RE = /^(?:(?:credit|photo|image|source|фото|источник|автор|illustration)\s*[:：]|(?:BBC|Reuters|AFP|Getty|AP|Shutterstock|Alamy)\s*[\/|]|^\(?\s*(?:©|credit:))/i;
  const AGENCY_SLASH_RE = /^[A-Z][\w\s]{1,25}\s*[\/|]\s*[\w\s]{1,30}$/;

  const cleanedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isCredit = line.length < 100 && (CREDIT_RE.test(line) || AGENCY_SLASH_RE.test(line));
    const prev = cleanedLines[cleanedLines.length - 1] || "";

    if (isCredit) {
      if (prev.startsWith("[IMG:")) {
        // Next line might be a caption
        const next = (lines[i + 1] || "").trim();
        if (next.startsWith("[CAPTION:")) {
          const nextCap = next.replace(/^\[CAPTION:\s*/i, "").replace(/\]$/, "").trim();
          lines[i + 1] = `[CAPTION:${nextCap} (${line})]`;
          continue; // absorbed into upcoming caption
        } else {
          // No upcoming caption: make this credit the caption!
          cleanedLines.push(`[CAPTION:${line}]`);
          continue;
        }
      } else if (prev.startsWith("[CAPTION:")) {
        // Merge into previous caption if not already present
        const prevCap = prev.replace(/^\[CAPTION:\s*/i, "").replace(/\]$/, "").trim();
        if (!prevCap.toLowerCase().includes(line.toLowerCase())) {
          cleanedLines[cleanedLines.length - 1] = `[CAPTION:${prevCap} (${line})]`;
        }
        continue;
      }
    }

    cleanedLines.push(line);
  }

  // Post-process: join lines, collapse excessive blanks
  const result = cleanedLines
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}

// ============================================================
// 4. Web Article Importer (URL)
// ============================================================
router.post("/import-url", async (req: Request, res: Response) => {
  const { url, aiProvider, localAiUrl, localAiModel } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const html = await fetchWebPage(url);

    // ── Extract og:image / twitter:image for cover ──────────
    let extractedCoverUrl = "";
    const ogImageMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogImageMatch) {
      try {
        extractedCoverUrl = new URL(ogImageMatch[1], url).href;
      } catch {
        extractedCoverUrl = ogImageMatch[1];
      }
    }

    // ── Podcast detection (unchanged) ────────────────────────
    const isPodcastUrl =
      url.toLowerCase().includes("podcasts.apple.com") ||
      url.toLowerCase().includes("podcast") ||
      html.includes("schema:episode") ||
      html.includes('"assetUrl"');

    if (isPodcastUrl) {
      console.log(`[Import URL] Podcast URL detected: ${url}`);

      // 1. Extract Title
      let podcastTitle = "Podcast Episode";
      const ogTitleMatch =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (ogTitleMatch) {
        podcastTitle = ogTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*-\s*Apple Podcasts.*$/i, "").trim();
      }

      // 2. Extract Direct MP3 Audio URL
      let directAudioUrl: string | null = null;
      const assetUrlMatch = html.match(/"assetUrl"\s*:\s*"(https?:\/\/[^"]+)"/i);
      if (assetUrlMatch) {
        directAudioUrl = assetUrlMatch[1];
      } else {
        const audioMatches = html.match(/https?:\/\/[^\s"']+\.(?:mp3|m4a|aac)[^\s"']*/gi);
        if (audioMatches && audioMatches.length > 0) {
          directAudioUrl = audioMatches[0];
        }
      }

      console.log(`[Import URL] Direct audio URL found: ${directAudioUrl}`);

      let audioBase64: string | null = null;
      let audioUrl: string | null = directAudioUrl;
      let transcriptText = "";

      if (directAudioUrl) {
        try {
          console.log(`[Import URL] Downloading audio stream from ${directAudioUrl}...`);
          const audioFetch = await fetch(directAudioUrl, {
            headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
          });

          if (audioFetch.ok) {
            const arrayBuf = await audioFetch.arrayBuffer();
            const buf = Buffer.from(arrayBuf);

            const DATA_DIR = process.env.DATA_DIR || process.cwd();
            const audioStorageDir = path.join(DATA_DIR, "audio_files");
            if (!fs.existsSync(audioStorageDir)) {
              fs.mkdirSync(audioStorageDir, { recursive: true });
            }

            const audioFileName = `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`;
            const diskPath = path.join(audioStorageDir, audioFileName);
            fs.writeFileSync(diskPath, buf);

            audioUrl = `/api/audio-files/${audioFileName}`;
            audioBase64 = null;

            const userApiKey = (req.headers["x-gemini-key"] as string) || req.body.geminiApiKey;
            const ai = getGeminiClient(userApiKey);
            if (ai && buf.length > 0) {
              console.log(`[Import URL] Running Gemini Speech-to-Text on ${buf.length} bytes of podcast audio...`);

              let uploadedFile: any = null;
              try {
                uploadedFile = await (ai.files as any).upload({
                  file: diskPath,
                  mimeType: "audio/mp3",
                });

                const prompt = `Listen carefully to this entire audio recording titled "${podcastTitle}".
Transcribe all spoken words accurately from the very beginning (0:00) ALL THE WAY TO THE VERY END of the audio file.
For EVERY single spoken sentence or dialogue phrase, provide the exact start timestamp in seconds or minutes (e.g. 0s\t..., 15s\t..., 1m15s\t..., 15m40s\t..., 25m10s\t...).
Do NOT stop early. Continue generating timestamped entries for the entire duration of the audio recording until the final closing words.

IMPORTANT: Output ONLY the line-by-line timestamped transcript entries. Do not provide titles, introductory explanations, translation notes, bracketed remarks, or markdown code blocks.`;

                const aiRes = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [
                    { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType || "audio/mp3" } },
                    prompt,
                  ],
                  config: { maxOutputTokens: 8192 },
                });

                if (aiRes.text) {
                  transcriptText = formatGeminiTranscript(aiRes.text);
                }
              } catch (tErr) {
                console.error("[Import URL] Podcast Gemini transcription error:", tErr);
              } finally {
                if (uploadedFile?.name) {
                  try { await ai.files.delete({ name: uploadedFile.name }); } catch (_) {}
                }
              }
            }
          }
        } catch (aErr) {
          console.error("[Import URL] Failed to fetch podcast MP3 stream:", aErr);
        }
      }

      if (!transcriptText.trim()) {
        const descMatch =
          html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        transcriptText = descMatch
          ? descMatch[1].trim()
          : "Подкаст импортирован. Нажмите 'Создать субтитры' для автоматического распознавания текста речи.";
      }

      return res.json({
        title: podcastTitle,
        text: transcriptText,
        lessonType: "podcast",
        coverUrl: extractedCoverUrl || null,
        audioUrl: audioUrl || directAudioUrl || null,
        audioBase64: null,
      });
    }

    // ── PRIMARY: cleanAndFormatArticle with Mozilla Readability ────────────
    let articleData: { title: string; text: string; byline?: string | null; excerpt?: string | null } | null = null;
    try {
      articleData = cleanAndFormatArticle(html, url);
    } catch (parseErr) {
      console.warn("[Import URL] cleanAndFormatArticle error:", parseErr);
    }

    if (articleData && articleData.text) {
      let text = articleData.text;

      // Normalize any image markers to standard [IMG:url] with guaranteed double newlines
      text = text.replace(/\[(?:\[LECTURA_)?IMG:(https?:\/\/[^\]]+)\]/gi, "\n\n[IMG:$1]\n\n");
      // Normalize any legacy caption markers to [CAPTION:text]
      text = text.replace(/^\[caption\]\s*(.+)$/gim, "[CAPTION:$1]");
      // Clean up multiple newlines that might have been created
      text = text.replace(/\n{3,}/g, "\n\n").trim();

      const wordCount = text
        .replace(/\[(?:\[LECTURA_)?IMG:[^\]]+\]/gi, "")
        .replace(/\[CAPTION:[^\]]+\]/gi, "")
        .replace(/\[caption\][^\n]*/gi, "")
        .split(/\s+/)
        .filter(Boolean).length;

      if (wordCount >= 30) {
        console.log(`[Import URL] Clean & Format OK — ${wordCount} words extracted from ${url}`);
        const imageMatches = text.match(/\[IMG:[^\]]+\]/g);
        console.log('🖼️ Found Images in imported text:', imageMatches);
        console.log('Saved Article Text Preview:', text.slice(0, 500));

        // Resolve cover: og:image → first inline image in text
        let coverUrl = extractedCoverUrl;
        if (!coverUrl) {
          const firstImg = text.match(/\[IMG:(https?:\/\/[^\]]+)\]/);
          if (firstImg) coverUrl = firstImg[1];
        }

        return res.json({
          title: articleData.title || "Web Article",
          text,
          coverUrl: coverUrl || null,
          byline: articleData.byline || null,
          excerpt: articleData.excerpt || null,
        });
      }

      console.warn(`[Import URL] Extracted only ${wordCount} words — trying AI fallback`);
    } else {
      console.warn(`[Import URL] cleanAndFormatArticle returned empty — trying AI fallback`);
    }

    // ── FALLBACK 1: Local AI ─────────────────────────────────
    if (aiProvider === "local") {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 45000)}
---

Return your answer strictly in JSON format with these exact keys:
- "title": creative/extracted title of the article
- "text": the cleaned text content (paragraphs separated by double newlines \\n\\n)

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
        const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
        return res.json({
          title: data.title || "Статья с сайта",
          text: data.text || "",
          coverUrl: extractedCoverUrl || null,
        });
      } catch (localErr: any) {
        console.warn("Local AI article parsing failed (falling back to Gemini):", localErr.message || localErr);
      }
    }

    // ── FALLBACK 2: Gemini AI ────────────────────────────────
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 60000)}
---

Output your result as a JSON object matching this schema:
{
  "title": "extracted article title",
  "text": "cleaned paragraph 1\\n\\ncleaned paragraph 2\\n\\n..."
}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ["title", "text"],
            },
          },
        });

        const parsed = JSON.parse(response.text || "{}");
        return res.json({
          title: parsed.title || "Статья с сайта",
          text: parsed.text || "",
          coverUrl: extractedCoverUrl || null,
        });
      } catch (geminiErr: any) {
        console.warn("Gemini AI article parsing failed (falling back to offline regex parser):", geminiErr.message || geminiErr);
      }
    }

    // ── FALLBACK 3: Offline regex parser ─────────────────────
    let title = "Статья с сайта";
    const titleMatch =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

    text = text
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return res.json({
      title,
      text: text.substring(0, 500000),
      coverUrl: extractedCoverUrl || null,
    });
  } catch (err: any) {
    console.error("Web article parser error:", err);
    return res.status(500).json({ error: "Failed to parse website article: " + (err.message || err) });
  }
});

// ============================================================
// Audio Speech-to-Text Transcription via Gemini AI API
// ============================================================
router.post("/transcribe-audio", async (req: Request, res: Response) => {
  // Set 10-minute socket timeout for large audio files & Gemini processing
  req.setTimeout(600000);
  res.setTimeout(600000);

  try {
    const userApiKey = (req.headers["x-gemini-key"] as string) || (req.body && req.body.geminiApiKey);
    const targetLanguage = (req.headers["x-target-language"] as string) || (req.body && req.body.targetLanguage);
    const filenameRaw = (req.headers["x-filename"] as string) || (req.body && req.body.filename);
    const filename = filenameRaw ? decodeURIComponent(filenameRaw) : "";
    const mimeTypeHeader = (req.headers["content-type"] as string) || (req.body && req.body.mimeType) || "audio/mp3";

    let buffer: Buffer | null = null;
    let mimeType = mimeTypeHeader.split(";")[0].trim();

    // Case A: Binary raw audio body
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
    } 
    // Case B: JSON body with audioBase64 string
    else if (req.body && typeof req.body.audioBase64 === "string") {
      const base64Data = req.body.audioBase64.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
      if (req.body.mimeType) mimeType = req.body.mimeType;
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Передан пустой или некорректный аудиофайл." });
    }

    const ai = getGeminiClient(userApiKey);
    if (!ai) {
      return res.status(400).json({
        error: "Для распознавания речи требуется Gemini API Key. Укажите ключ в настройках приложения или при запуске сервера."
      });
    }

    // Determine extension
    let ext = "mp3";
    const rawType = (mimeType || "").toLowerCase();
    if (rawType.includes("wav")) ext = "wav";
    else if (rawType.includes("ogg")) ext = "ogg";
    else if (rawType.includes("m4a") || rawType.includes("aac")) ext = "m4a";
    else if (rawType.includes("webm")) ext = "webm";

    const tempAudioDir = os.tmpdir();
    const tempAudioPath = path.join(tempAudioDir, `transcribe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`);

    fs.writeFileSync(tempAudioPath, buffer);

    let uploadedGeminiFile: any = null;
    try {
      console.log(`[Audio Transcribe] Uploading ${buffer.length} bytes to Gemini File API (${mimeType})...`);
      uploadedGeminiFile = await (ai.files as any).upload({
        file: tempAudioPath,
        mimeType: mimeType || "audio/mp3"
      });

      const prompt = `You are a professional transcription service. Listen to this entire audio recording${filename ? ` ("${filename}")` : ""}${targetLanguage ? ` in ${targetLanguage}` : ""} from START to FINISH.

Your ONLY task: output a timestamped transcript where each line starts with the REAL audio timestamp (the exact position in the audio file where that sentence begins).

Rules:
- Timestamps MUST match the actual audio position exactly — do NOT estimate or guess, use what you hear.
- Format: \`M:SS sentence text\` — for example: \`0:07 Hola, bienvenidos al podcast.\`
- One sentence per line. Each line must start with its correct timestamp.
- Do NOT merge multiple minutes into a single line.
- Do NOT skip any content. Transcribe everything from 0:00 to the very last word.
- Do NOT add headers, titles, notes, or markdown. Plain timestamped lines only.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            fileData: {
              fileUri: uploadedGeminiFile.uri,
              mimeType: uploadedGeminiFile.mimeType || mimeType || "audio/mp3"
            }
          },
          prompt
        ],
        config: {
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      const aiText = response.text || "";
      if (!aiText.trim()) {
        throw new Error("Gemini AI вернул пустой текст распознавания.");
      }

      const formattedTranscript = formatGeminiTranscript(aiText);

      return res.json({
        text: formattedTranscript,
        success: true
      });
    } finally {
      if (fs.existsSync(tempAudioPath)) {
        try { fs.unlinkSync(tempAudioPath); } catch (e) {}
      }
      if (uploadedGeminiFile?.name) {
        try { await ai.files.delete({ name: uploadedGeminiFile.name }); } catch (e) {}
      }
    }
  } catch (err: any) {
    console.error("Audio Transcription error:", err);
    return res.status(500).json({ error: "Ошибка распознавания речи: " + (err.message || String(err)) });
  }
});

// In-memory lock and progress tracker
const activeDownloads = new Map<string, Promise<{ url: string; isAudio: boolean; filename: string; sizeBytes: number }>>();
const downloadProgressMap = new Map<string, { percent: number; speed: string; eta: string; status: string }>();

// ============================================================================
// Media Downloader & Range Streaming (YouTube restricted / offline playback)
// ============================================================================

/**
 * GET /api/media/progress
 * Returns real-time percentage and download speed for active downloads.
 */
router.get("/media/progress", (req: Request, res: Response) => {
  const { videoId, lessonId, onlyAudio } = req.query;
  const cleanVideoId = (videoId ? String(videoId) : "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
  const isAudio = onlyAudio === "true" || onlyAudio === "1";
  const ext = isAudio ? "m4a" : "mp4";
  const lockKey = `${fileId}_${ext}`;

  const isDownloading = activeDownloads.has(lockKey);
  const progress = downloadProgressMap.get(lockKey) || { percent: isDownloading ? 5 : 0, speed: "", eta: "", status: isDownloading ? "downloading" : "idle" };

  return res.json({
    downloading: isDownloading,
    percent: progress.percent,
    speed: progress.speed,
    eta: progress.eta,
    status: progress.status
  });
});

/**
 * POST /api/media/download
 * Downloads YouTube video (720p mp4) or audio (m4a) using yt-dlp with real-time progress.
 */
router.post("/media/download", async (req: Request, res: Response) => {
  try {
    const { videoId, lessonId, onlyAudio } = req.body;
    if (!videoId && !lessonId) {
      return res.status(400).json({ error: "Параметр videoId или lessonId обязателен" });
    }

    const cleanVideoId = (videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanVideoId || cleanVideoId.length !== 11) {
      return res.status(400).json({ error: "Некорректный формат YouTube videoId" });
    }

    const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
    const isAudio = !!onlyAudio;
    const ext = isAudio ? "m4a" : "mp4";
    const filename = `${fileId}.${ext}`;
    const targetFilePath = path.join(VIDEO_STORAGE_DIR, filename);

    // If file is already downloaded and valid, return ready immediately
    if (fs.existsSync(targetFilePath)) {
      const stat = fs.statSync(targetFilePath);
      if (stat.size > 100000) {
        return res.json({
          ready: true,
          url: `/api/media/stream/${filename}`,
          filename,
          isAudio,
          sizeBytes: stat.size
        });
      }
    }

    // Race condition prevention: check if this file is already downloading
    const lockKey = `${fileId}_${ext}`;
    let downloadPromise = activeDownloads.get(lockKey);

    if (!downloadPromise) {
      downloadProgressMap.set(lockKey, { percent: 1, speed: "", eta: "", status: "starting" });

      downloadPromise = new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const tempPath = path.join(VIDEO_STORAGE_DIR, `${fileId}_tmp_${Date.now()}.${ext}`);

        const ytArgs: Record<string, any> = {
          output: tempPath,
          noPlaylist: true,
          newline: true,
          noWarnings: true,
          extractorArgs: "youtube:player_client=ios,web,mweb",
        };

        if (isAudio) {
          ytArgs.format = "ba/b";
        } else {
          ytArgs.format = "best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        }

        let processErrorMsg = "";

        const cp = (getYtDlp() as any).exec(videoUrl, ytArgs);

        cp.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          // Match lines like: [download]  45.2% of ~  25.40MiB at  3.50MiB/s ETA 00:05
          const match = text.match(/\[download\]\s+([\d\.]+)%(?:\s+of\s+~?\s*([\d\.]+[A-Za-z]+))?(?:\s+at\s+([\d\.]+[A-Za-z]+\/s))?(?:\s+ETA\s+(\S+))?/);
          if (match) {
            const pct = parseFloat(match[1]);
            const speed = match[3] || "";
            const eta = match[4] || "";
            downloadProgressMap.set(lockKey, {
              percent: !isNaN(pct) ? Math.min(99, pct) : 50,
              speed,
              eta,
              status: "downloading"
            });
          } else if (text.includes("[Merger]") || text.includes("Merging formats") || text.includes("[ffmpeg]")) {
            downloadProgressMap.set(lockKey, {
              percent: 99,
              speed: "Обработка...",
              eta: "00:01",
              status: "merging"
            });
          }
        });

        cp.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (text.includes("ERROR:") || text.includes("Error")) {
            processErrorMsg += " " + text.trim();
          }
        });

        cp.on("close", (code: number) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);

          if (code === 0 && fs.existsSync(tempPath)) {
            try {
              if (fs.existsSync(targetFilePath)) {
                try { fs.unlinkSync(targetFilePath); } catch (_) {}
              }
              fs.renameSync(tempPath, targetFilePath);

              // Update lesson record in SQLite if lessonId is given
              if (lessonId) {
                try {
                  const db = getDbConnection("default");
                  if (isAudio) {
                    db.prepare("UPDATE lessons SET audioUrl = ? WHERE id = ?").run(`/api/media/stream/${filename}`, lessonId);
                  } else {
                    db.prepare("UPDATE lessons SET localVideoUrl = ? WHERE id = ?").run(`/api/media/stream/${filename}`, lessonId);
                  }
                } catch (dbErr) {
                  console.warn("Could not update lesson media URL in SQLite:", dbErr);
                }
              }

              const stat = fs.existsSync(targetFilePath) ? fs.statSync(targetFilePath) : null;
              resolve({
                url: `/api/media/stream/${filename}`,
                filename,
                isAudio,
                sizeBytes: stat?.size || 0
              });
            } catch (err: any) {
              reject(new Error("Ошибка перемещения скачанного файла: " + err.message));
            }
          } else {
            if (fs.existsSync(tempPath)) {
              try { fs.unlinkSync(tempPath); } catch (_) {}
            }
            reject(new Error(processErrorMsg || `yt-dlp завершился с кодом ошибки ${code}`));
          }
        });

        cp.on("error", (err: Error) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);
          if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (_) {}
          }
          reject(err);
        });
      });

      activeDownloads.set(lockKey, downloadPromise);
    }

    const result = await downloadPromise;

    return res.json(result);
  } catch (err: any) {
    console.error("Media download error:", err);
    return res.status(500).json({ error: err.message || "Ошибка загрузки медиа через yt-dlp" });
  }
});

/**
 * GET /api/media/status
 * Check if media file is already downloaded or currently in progress.
 */
router.get("/media/status", (req: Request, res: Response) => {
  const { videoId, lessonId, onlyAudio } = req.query;
  const cleanVideoId = (videoId ? String(videoId) : "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
  const isAudio = onlyAudio === "true" || onlyAudio === "1";
  const ext = isAudio ? "m4a" : "mp4";
  const filename = `${fileId}.${ext}`;
  const targetFilePath = path.join(VIDEO_STORAGE_DIR, filename);

  const lockKey = `${fileId}_${ext}`;
  const isDownloading = activeDownloads.has(lockKey);

  if (fs.existsSync(targetFilePath)) {
    const stat = fs.statSync(targetFilePath);
    if (stat.size > 100000) {
      return res.json({
        exists: true,
        ready: true,
        downloading: false,
        url: `/api/media/stream/${filename}`,
        filename,
        isAudio,
        sizeBytes: stat.size
      });
    }
  }

  // Also check if .mp4 exists when onlyAudio wasn't explicitly requested
  if (!isAudio) {
    const audioFilename = `${fileId}.m4a`;
    const audioPath = path.join(VIDEO_STORAGE_DIR, audioFilename);
    if (fs.existsSync(audioPath)) {
      const stat = fs.statSync(audioPath);
      if (stat.size > 100000) {
        return res.json({
          exists: true,
          ready: true,
          downloading: false,
          url: `/api/media/stream/${audioFilename}`,
          filename: audioFilename,
          isAudio: true,
          sizeBytes: stat.size
        });
      }
    }
  }

  return res.json({
    exists: false,
    ready: false,
    downloading: isDownloading
  });
});

/**
 * Helper function to stream any media file with Range headers (HTTP 206 Partial Content)
 */
function streamFile(filePath: string, req: Request, res: Response, defaultContentType?: string) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Media file not found" });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  let contentType = defaultContentType || "video/mp4";
  if (ext === ".m4a" || ext === ".aac") contentType = "audio/mp4";
  else if (ext === ".mp3") contentType = "audio/mpeg";
  else if (ext === ".webm") contentType = "video/webm";

  res.setHeader("Accept-Ranges", "bytes");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

/**
 * GET /api/media/stream/:filename
 * Stream video/audio files with HTTP 206 Partial Content (Range header) for fast seeking.
 */
router.get("/media/stream/:filename", (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(VIDEO_STORAGE_DIR, filename);
  return streamFile(filePath, req, res);
});

/**
 * GET /api/media/youtube-stream/:videoId
 * Provides direct audio stream for a YouTube video in GlobalAudioPlayer / background playlist.
 * If file already exists locally, streams it immediately with 206 Partial Content.
 * If not, fetches the audio via yt-dlp on-demand and streams it.
 */
router.get("/media/youtube-stream/:videoId", async (req: Request, res: Response) => {
  try {
    const cleanVideoId = (req.params.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanVideoId || cleanVideoId.length !== 11) {
      return res.status(400).json({ error: "Invalid video ID format" });
    }
    const lessonId = req.query.lessonId ? String(req.query.lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
    const filename = `${lessonId}.m4a`;
    const targetFilePath = path.join(VIDEO_STORAGE_DIR, filename);

    // 1. Check if local media file is already downloaded
    if (fs.existsSync(targetFilePath)) {
      const stat = fs.statSync(targetFilePath);
      if (stat.size > 50000) {
        return streamFile(targetFilePath, req, res, "audio/mp4");
      }
    }

    // Also check cleanVideoId.m4a or mp4
    for (const altExt of ["m4a", "mp4"]) {
      const altPath = path.join(VIDEO_STORAGE_DIR, `${cleanVideoId}.${altExt}`);
      if (fs.existsSync(altPath)) {
        const stat = fs.statSync(altPath);
        if (stat.size > 50000) {
          return streamFile(altPath, req, res, altExt === "m4a" ? "audio/mp4" : "video/mp4");
        }
      }
    }

    // 2. On-demand download with yt-dlp
    const lockKey = `${lessonId}_m4a`;
    let downloadPromise = activeDownloads.get(lockKey);

    if (!downloadPromise) {
      downloadProgressMap.set(lockKey, { percent: 1, speed: "", eta: "", status: "starting" });

      downloadPromise = new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const tempPath = path.join(VIDEO_STORAGE_DIR, `${lessonId}_tmp_${Date.now()}.m4a`);

        const ytArgs: Record<string, any> = {
          output: tempPath,
          noPlaylist: true,
          newline: true,
          noWarnings: true,
          format: "ba/b",
          extractorArgs: "youtube:player_client=ios,web,mweb",
        };

        let processErrorMsg = "";
        const cp = (getYtDlp() as any).exec(videoUrl, ytArgs);

        cp.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          const match = text.match(/\[download\]\s+([\d\.]+)%/);
          if (match) {
            const pct = parseFloat(match[1]);
            downloadProgressMap.set(lockKey, {
              percent: !isNaN(pct) ? pct : 50,
              speed: "",
              eta: "",
              status: "downloading"
            });
          }
        });

        cp.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (text.includes("ERROR:") || text.includes("Error")) {
            processErrorMsg += " " + text.trim();
          }
        });

        cp.on("close", (code: number) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);

          if (code === 0 && fs.existsSync(tempPath)) {
            try {
              if (fs.existsSync(targetFilePath)) {
                try { fs.unlinkSync(targetFilePath); } catch (_) {}
              }
              fs.renameSync(tempPath, targetFilePath);

              if (lessonId) {
                try {
                  const db = getDbConnection("default");
                  db.prepare("UPDATE lessons SET audioUrl = ? WHERE id = ?").run(`/api/media/stream/${filename}`, lessonId);
                } catch (_) {}
              }

              const stat = fs.existsSync(targetFilePath) ? fs.statSync(targetFilePath) : null;
              resolve({
                url: `/api/media/stream/${filename}`,
                filename,
                isAudio: true,
                sizeBytes: stat?.size || 0
              });
            } catch (err: any) {
              reject(err);
            }
          } else {
            if (fs.existsSync(tempPath)) {
              try { fs.unlinkSync(tempPath); } catch (_) {}
            }
            reject(new Error(processErrorMsg || `yt-dlp exited with code ${code}`));
          }
        });
      });

      activeDownloads.set(lockKey, downloadPromise);
    }

    await downloadPromise;
    return streamFile(targetFilePath, req, res, "audio/mp4");
  } catch (err: any) {
    console.error("[YouTube Audio Stream Error]:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Error resolving YouTube stream" });
  }
});

export default router;
