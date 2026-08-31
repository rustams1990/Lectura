/**
 * High-quality Article and Content Extractor with strict HTML sanitization
 */

export interface ExtractedArticle {
  title: string;
  content: string;
  rawText: string;
  sourceUrl: string;
  leadImageUrl?: string;
  author?: string;
  language?: string;
}

export class ArticleExtractor {
  /**
   * Extracts clean structured article from current document
   */
  static extract(doc: Document = document): ExtractedArticle {
    const url = window.location.href;
    const title = this.extractTitle(doc);
    const author = this.extractAuthor(doc);
    const leadImageUrl = this.extractLeadImage(doc);
    const language = this.extractLanguage(doc);

    // Clone DOM to avoid mutating live page
    const clone = doc.cloneNode(true) as Document;

    // 1. Remove dangerous and non-content elements
    this.removeJunkElements(clone);

    // 2. Locate main content root
    const articleRoot = this.findMainContentElement(clone);

    // 3. Extract article images and captions as [IMG:...] and [CAPTION:...] placeholders
    this.extractImagesAndCaptions(articleRoot, doc);

    // 4. Convert DOM elements into clean plain text without any HTML tags
    const plainText = this.htmlToCleanText(articleRoot);

    return {
      title,
      content: plainText,
      rawText: plainText,
      sourceUrl: url,
      leadImageUrl,
      author,
      language,
      audioUrl: null,
      audioFile: null,
      youtubeId: null,
      sourceType: 'article',
      lessonType: 'article',
    };
  }

  private static extractTitle(doc: Document): string {
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) return ogTitle.trim();

    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    if (twitterTitle && twitterTitle.trim()) return twitterTitle.trim();

    const h1 = doc.querySelector('h1')?.textContent;
    if (h1 && h1.trim()) return h1.trim();

    return doc.title?.trim() || 'Untitled Article';
  }

  private static extractAuthor(doc: Document): string | undefined {
    const metaAuthor =
      doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="article:author"]')?.getAttribute('content');
    if (metaAuthor && metaAuthor.trim()) return metaAuthor.trim();

    const authorEl = doc.querySelector('[rel="author"], .author-name, .byline, .author');
    if (authorEl && authorEl.textContent) return authorEl.textContent.trim();

    return undefined;
  }

  private static extractLeadImage(doc: Document): string | undefined {
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage && ogImage.startsWith('http')) return ogImage;

    const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
    if (twitterImage && twitterImage.startsWith('http')) return twitterImage;

    const leadImg = doc.querySelector('article img, main img, .lead-image img') as HTMLImageElement;
    if (leadImg && leadImg.src && leadImg.src.startsWith('http')) return leadImg.src;

    return undefined;
  }

  private static extractLanguage(doc: Document): string {
    const htmlLang = doc.documentElement.getAttribute('lang') || doc.documentElement.getAttribute('xml:lang');
    if (htmlLang && htmlLang.trim()) {
      return htmlLang.split('-')[0].toLowerCase().trim();
    }

    const metaLang = doc.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content');
    if (metaLang && metaLang.trim()) {
      return metaLang.split('-')[0].toLowerCase().trim();
    }

    return 'auto';
  }

  private static removeJunkElements(root: Document | HTMLElement): void {
    const junkSelectors = [
      'script',
      'style',
      'iframe',
      'noscript',
      'object',
      'embed',
      'svg',
      'canvas',
      'form',
      'button',
      'input',
      'textarea',
      'select',
      'nav',
      'header',
      'footer',
      'aside',
      '.ads',
      '.advertisement',
      '.ad-container',
      '.cookie-banner',
      '.popup',
      '.modal',
      '.social-share',
      '.share-buttons',
      '.comments',
      '.disqus',
      '#comments',
      '.related-articles',
      '.sidebar',
    ];

    const elements = root.querySelectorAll(junkSelectors.join(','));
    elements.forEach((el) => el.remove());
  }

  private static findMainContentElement(doc: Document): HTMLElement {
    // Check semantic containers first
    const candidates = [
      doc.querySelector('article'),
      doc.querySelector('main'),
      doc.querySelector('[role="main"]'),
      doc.querySelector('.article-body'),
      doc.querySelector('.article-content'),
      doc.querySelector('.post-content'),
      doc.querySelector('.entry-content'),
      doc.querySelector('.story-body'),
      doc.querySelector('#content'),
    ];

    for (const el of candidates) {
      if (el && el.textContent && el.textContent.trim().length > 200) {
        return el as HTMLElement;
      }
    }

    return (doc.body || doc.documentElement) as HTMLElement;
  }

  /**
   * Finds all article images and figcaptions, converting them into [IMG:url] and [CAPTION:text] placeholders
   */
  private static extractImagesAndCaptions(root: HTMLElement, liveDoc?: Document): void {
    // 1. Process figures with figcaption
    root.querySelectorAll('figure').forEach((fig) => {
      const img = fig.querySelector('img');
      const figcaption = fig.querySelector('figcaption');
      let src = '';
      if (img) {
        src = (img as any).currentSrc || img.getAttribute('data-src') || img.getAttribute('src') || img.src || '';
        // If it's a relative placeholder or empty, try finding matching image in liveDoc
        if (liveDoc && (!src || src.startsWith('data:') || src.includes('placeholder') || src.includes('grey-'))) {
          const originalSrc = img.getAttribute('src');
          if (originalSrc) {
            const liveImg = liveDoc.querySelector(`img[src="${originalSrc}"]`) as HTMLImageElement;
            if (liveImg && liveImg.currentSrc) {
              src = liveImg.currentSrc;
            }
          }
        }
        if (!src && img.getAttribute('srcset')) {
          const parts = img.getAttribute('srcset')!.split(',');
          const last = parts[parts.length - 1].trim().split(/\s+/)[0];
          if (last) src = last;
        }
      }

      const captionText = (figcaption?.textContent || '').trim().replace(/\s+/g, ' ');
      let markerText = '';
      if (src && !src.startsWith('data:') && !src.includes('placeholder') && !src.includes('grey-')) {
        markerText += `\n\n[IMG:${src}]\n\n`;
      }
      if (captionText) {
        markerText += `\n\n[CAPTION:${captionText}]\n\n`;
      }

      if (markerText) {
        const textNode = root.ownerDocument.createTextNode(markerText);
        fig.replaceWith(textNode);
      } else {
        fig.remove();
      }
    });

    // 2. Process any remaining <img> elements inside the article
    root.querySelectorAll('img').forEach((img) => {
      let src = (img as any).currentSrc || img.getAttribute('data-src') || img.getAttribute('src') || img.src || '';
      if (liveDoc && (!src || src.startsWith('data:') || src.includes('placeholder') || src.includes('grey-'))) {
        const originalSrc = img.getAttribute('src');
        if (originalSrc) {
          const liveImg = liveDoc.querySelector(`img[src="${originalSrc}"]`) as HTMLImageElement;
          if (liveImg && liveImg.currentSrc) {
            src = liveImg.currentSrc;
          }
        }
      }
      if (!src && img.getAttribute('srcset')) {
        const parts = img.getAttribute('srcset')!.split(',');
        const last = parts[parts.length - 1].trim().split(/\s+/)[0];
        if (last) src = last;
      }

      if (src && !src.startsWith('data:') && !src.includes('placeholder') && !src.includes('grey-')) {
        const textNode = root.ownerDocument.createTextNode(`\n\n[IMG:${src}]\n\n`);
        img.replaceWith(textNode);
      } else {
        img.remove();
      }
    });
  }

  /**
   * Converts DOM element tree to pure plain text with paragraph breaks and markdown headings,
   * without ANY raw HTML tags (e.g. <p>, <ul>, <b>, </div>).
   */
  private static htmlToCleanText(root: HTMLElement): string {
    const blocks: string[] = [];

    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.replace(/[ \t]+/g, ' ') || '';
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // Skip non-content tags
        if (['script', 'style', 'noscript', 'svg', 'button', 'nav', 'header', 'footer', 'aside', 'form', 'input', 'select', 'canvas'].includes(tag)) {
          return '';
        }

        // Headings
        if (tag === 'h1' || tag === 'h2') {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (t) blocks.push(`## ${t} ##`);
          return '';
        }
        if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (t) blocks.push(`# ${t} #`);
          return '';
        }

        // List items
        if (tag === 'li') {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (t) blocks.push(`• ${t}`);
          return '';
        }

        // Paragraphs, divs, blockquotes, sections
        if (['p', 'div', 'blockquote', 'section', 'article', 'main'].includes(tag)) {
          const raw = (el.textContent || '').trim();
          if (/^\[IMG:[^\]]+\]$/i.test(raw) || /^\[CAPTION:[^\]]+\]$/i.test(raw)) {
            blocks.push(raw);
            return '';
          }

          let inner = '';
          el.childNodes.forEach((child) => {
            inner += walk(child);
          });
          const clean = inner.replace(/[ \t]+/g, ' ').trim();
          if (clean) {
            const parts = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
            for (const p of parts) {
              blocks.push(p);
            }
          }
          return '';
        }

        if (tag === 'br') {
          return '\n';
        }

        // Inline elements (b, i, strong, em, span, a, etc.) -> collect text without tags!
        let inner = '';
        el.childNodes.forEach((child) => {
          inner += walk(child);
        });
        return inner;
      }

      return '';
    };

    root.childNodes.forEach((child) => {
      const rest = walk(child).trim();
      if (rest) {
        const parts = rest.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          blocks.push(p);
        }
      }
    });

    if (blocks.length === 0) {
      const raw = (root.textContent || '').trim();
      return raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).join('\n\n');
    }

    return blocks
      .map((b) => b.trim())
      .filter(Boolean)
      .join('\n\n');
  }
}
