import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { Type } from "@google/genai";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getGeminiClient, callLocalAi } from "./geminiClient.ts";

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const IMAGE_CACHE_DIR = path.join(DATA_DIR, "image_cache");
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

// EPUB Parser Helpers
const EPUB_MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const EPUB_MAX_IMAGES = 50;

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

    const extractedImages: Record<string, string> = {};
    let totalExtractedImages = 0;
    const textBlocks: string[] = [];

    for (const href of chapterHrefs) {
      const resolvedChapterPath = resolveOpfHref(opfEntry.entryName, href);
      const chapterEntry = findZipEntry(entries, resolvedChapterPath);
      if (!chapterEntry) continue;

      const htmlContent = chapterEntry.getData().toString("utf-8");

      let processedHtml = htmlContent;

      if (includeImages && totalExtractedImages < EPUB_MAX_IMAGES) {
        processedHtml = processedHtml.replace(/<img\b[^>]*\/?>/gi, (imgTag) => {
          if (totalExtractedImages >= EPUB_MAX_IMAGES) return "";

          const src = getTagAttr(imgTag, "src");
          if (!src || src.startsWith("data:")) return imgTag;

          const resolvedImgPath = resolveRelativePath(resolvedChapterPath, safeDecodePath(src));
          const imgEntry = findZipEntry(entries, resolvedImgPath);
          if (!imgEntry) return imgTag;

          const imgBuffer = imgEntry.getData();
          if (imgBuffer.length > EPUB_MAX_IMAGE_BYTES) return "";

          const mime = getMimeFromPath(resolvedImgPath);
          const base64 = imgBuffer.toString("base64");
          const imgId = `epub_img_${totalExtractedImages + 1}_${Date.now()}`;

          extractedImages[imgId] = `data:${mime};base64,${base64}`;
          totalExtractedImages++;

          return `\n\n[IMG:${imgId}]\n\n`;
        });
      }

      let cleanText = processedHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/h[1-6]>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&#160;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");

      cleanText = cleanText
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (cleanText) {
        textBlocks.push(cleanText);
      }
    }

    let combinedText = textBlocks.join("\n\n");
    combinedText = combinedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const result: EpubParseResult = { title, text: combinedText };
    if (includeImages && Object.keys(extractedImages).length > 0) {
      result.images = extractedImages;
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

  const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
  // Check length of base64 payload first
  const estimatedSize = Math.ceil((fileBase64.length * 3) / 4);
  if (estimatedSize > MAX_FILE_SIZE_BYTES + 1024) {
    return res.status(413).json({ error: "Размер файла превышает максимально допустимый лимит 30 МБ (Payload Too Large)" });
  }

  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ error: "Размер файла превышает максимально допустимый лимит 30 МБ (Payload Too Large)" });
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

// 4. Web Article Importer (URL)
router.post("/import-url", async (req: Request, res: Response) => {
  const { url, aiProvider, localAiUrl, localAiModel } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const fetchRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch webpage. HTTP status: ${fetchRes.status}`);
    }

    const html = await fetchRes.text();

    let extractedCoverUrl = "";
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
                         html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogImageMatch) {
      const rawImgUrl = ogImageMatch[1];
      try {
        extractedCoverUrl = new URL(rawImgUrl, url).href;
      } catch (e) {
        extractedCoverUrl = rawImgUrl;
      }
    }

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
          coverUrl: extractedCoverUrl || null
        });
      } catch (localErr: any) {
        console.warn("Local AI article parsing failed (falling back to offline regex parser):", localErr.message || localErr);
      }
    }

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
  "text": "cleaned paragraph 1\n\ncleaned paragraph 2\n\n..."
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
                text: { type: Type.STRING }
              },
              required: ["title", "text"]
            }
          }
        });

        const parsed = JSON.parse(response.text || "{}");
        return res.json({
          title: parsed.title || "Статья с сайта",
          text: parsed.text || "",
          coverUrl: extractedCoverUrl || null
        });
      } catch (geminiErr: any) {
        console.warn("Gemini AI article parsing failed (falling back to offline regex parser):", geminiErr.message || geminiErr);
      }
    }

    let title = "Статья с сайта";
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<div[^>]*id="mw-navigation"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "")
      .replace(/<div[^>]*id="mw-panel"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*id="mw-head"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class="[^"]*vector-sidebar-container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class="[^"]*vector-header-container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<div[^>]*class="[^"]*toc[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
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
      title: title,
      text: text.substring(0, 500000),
      coverUrl: extractedCoverUrl || null
    });
  } catch (err: any) {
    console.error("Web article parser error:", err);
    return res.status(500).json({ error: "Failed to parse website article: " + (err.message || err) });
  }
});

export default router;
