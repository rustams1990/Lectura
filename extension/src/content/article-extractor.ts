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

    // 3. Sanitize HTML & extract clean formatted text
    const { cleanHtml, plainText } = this.sanitizeAndFormat(articleRoot);

    return {
      title,
      content: cleanHtml || plainText,
      rawText: plainText,
      sourceUrl: url,
      leadImageUrl,
      author,
      language,
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
   * Sanitizes all HTML elements, strips inline scripts/handlers, keeps only basic typography
   */
  private static sanitizeAndFormat(root: HTMLElement): { cleanHtml: string; plainText: string } {
    const allowedTags = new Set([
      'P',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'BLOCKQUOTE',
      'UL',
      'OL',
      'LI',
      'STRONG',
      'EM',
      'B',
      'I',
      'BR',
      'HR',
    ]);

    const resultBlocks: string[] = [];
    const plainLines: string[] = [];

    // Helper to recursively process content nodes
    const walkNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.replace(/\s+/g, ' ') || '';
        return text;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toUpperCase();

        // Recursively clean children
        let innerText = '';
        el.childNodes.forEach((child) => {
          innerText += walkNode(child);
        });

        innerText = innerText.trim();
        if (!innerText) return '';

        if (tagName === 'P') {
          resultBlocks.push(`<p>${innerText}</p>`);
          plainLines.push(innerText);
          return '';
        } else if (tagName.startsWith('H') && tagName.length === 2) {
          resultBlocks.push(`<${tagName.toLowerCase()}>${innerText}</${tagName.toLowerCase()}>`);
          plainLines.push(`\n### ${innerText}\n`);
          return '';
        } else if (tagName === 'BLOCKQUOTE') {
          resultBlocks.push(`<blockquote>${innerText}</blockquote>`);
          plainLines.push(`> ${innerText}`);
          return '';
        } else if (tagName === 'LI') {
          return `<li>${innerText}</li>`;
        } else if (tagName === 'UL' || tagName === 'OL') {
          resultBlocks.push(`<${tagName.toLowerCase()}>${innerText}</${tagName.toLowerCase()}>`);
          plainLines.push(innerText);
          return '';
        } else if (['STRONG', 'B'].includes(tagName)) {
          return `<strong>${innerText}</strong>`;
        } else if (['EM', 'I'].includes(tagName)) {
          return `<em>${innerText}</em>`;
        } else if (tagName === 'BR') {
          return '<br/>';
        }

        // Default container
        return innerText;
      }

      return '';
    };

    // Process top-level block elements inside article root
    const topElements = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol');
    if (topElements.length > 0) {
      topElements.forEach((el) => {
        const tag = el.tagName.toUpperCase();
        if (!allowedTags.has(tag)) return;

        // Clean text and safe inner markup
        let inner = el.innerHTML || '';
        // Strip all attributes and inline handlers
        inner = inner.replace(/<([a-z0-9]+)[^>]*>/gi, (_match, tag) => {
          const upper = tag.toUpperCase();
          if (['STRONG', 'B', 'EM', 'I', 'BR'].includes(upper)) {
            return `<${tag.toLowerCase()}>`;
          }
          return '';
        });
        inner = inner.replace(/<\/[^>]+>/gi, (match) => {
          const upper = match.replace(/[<>/]/g, '').toUpperCase();
          if (['STRONG', 'B', 'EM', 'I'].includes(upper)) {
            return match.toLowerCase();
          }
          return '';
        });
        inner = inner.trim();

        if (inner.length > 0) {
          resultBlocks.push(`<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`);
          plainLines.push(el.textContent?.trim() || '');
        }
      });
    } else {
      // Fallback to text parsing
      const text = root.innerText || root.textContent || '';
      const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      paragraphs.forEach((p) => {
        resultBlocks.push(`<p>${p}</p>`);
        plainLines.push(p);
      });
    }

    return {
      cleanHtml: resultBlocks.join('\n\n'),
      plainText: plainLines.join('\n\n'),
    };
  }
}
