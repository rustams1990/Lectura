import { LecturaApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { ExtMessage } from '../types/index';
import { getSuggestedLemmas } from '../services/morphology';

const apiClient = new LecturaApiClient();

export function cleanWordForTranslation(rawWord: string): string {
  if (!rawWord) return '';
  return rawWord
    .trim()
    .replace(/^[\p{P}\s¿¡«"'(]+|[\p{P}\s?!.,:;"»')]+$/gu, '')
    .toLowerCase();
}

// Initialize Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Lectura Service Worker] Extension installed/updated.');

  // Purge legacy mixed-language caches
  StorageService.purgeLegacyCaches();

  // Create Context Menus
  chrome.contextMenus.create({
    id: 'lectura-import-article',
    title: '📖 Import Page to Lectura',
    contexts: ['page', 'selection'],
  });

  chrome.contextMenus.create({
    id: 'lectura-save-word',
    title: '💾 Save Word "%s" to Lectura',
    contexts: ['selection'],
  });

  // Setup periodic sync alarm (every 30 minutes)
  chrome.alarms.create('sync_words_alarm', { periodInMinutes: 30 });

  // Initial words sync
  syncWordsCache();
});

// Periodic Alarm Listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync_words_alarm') {
    syncWordsCache();
  }
});

async function syncWordsCache() {
  try {
    const settings = await StorageService.getSettings();
    const result = await apiClient.getWords(settings.targetLanguage);
    if (result && result.map) {
      console.log(`[Lectura Service Worker] Synced ${result.count || 0} words for ${settings.targetLanguage}`);
    }
  } catch (err) {
    console.warn('[Lectura Service Worker] Background words sync skipped (offline or unauthenticated)');
  }
}

// Context Menu Click Listener
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'lectura-import-article') {
    try {
      // Send message to active tab to extract clean article
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ARTICLE' }, async (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          console.error('[Lectura Context Menu] Failed to extract article:', chrome.runtime.lastError || response?.error);
          showBadge('ERR', '#ef4444');
          return;
        }

        const article = response.article;
        const settings = await StorageService.getSettings();

        await apiClient.saveLesson({
          title: article.title,
          content: article.content,
          sourceUrl: article.sourceUrl,
          coverUrl: article.leadImageUrl,
          author: article.author,
          targetLanguage: article.language !== 'auto' ? article.language : settings.targetLanguage,
          lessonType: 'article',
        });

        showBadge('OK', '#10b981');
      });
    } catch (err: any) {
      console.error('[Lectura Context Menu] Import error:', err);
      showBadge('ERR', '#ef4444');
    }
  } else if (info.menuItemId === 'lectura-save-word' && info.selectionText) {
    try {
      const word = info.selectionText.trim();
      const settings = await StorageService.getSettings();

      // Translate first
      const transRes = await apiClient.translateText(word);
      const translation = transRes.translation || '';

      await apiClient.saveWord({
        word,
        translation,
        status: '1',
        targetLanguage: settings.targetLanguage,
        tags: ['context_menu_save'],
      });

      showBadge('SAVED', '#3b82f6');
    } catch (err: any) {
      console.error('[Lectura Context Menu] Save word error:', err);
      showBadge('ERR', '#ef4444');
    }
  }
});

function showBadge(text: string, color: string) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 4000);
}

async function translateDirectInWorker(text: string, sourceLang = 'es', targetLang = 'ru'): Promise<string> {
  const clean = text.trim();
  if (!clean) return '';
  const sIso = (sourceLang && sourceLang !== 'auto') ? sourceLang.slice(0, 2).toLowerCase() : 'es';
  const tIso = (targetLang || 'ru').slice(0, 2).toLowerCase();
  const isMultiWord = clean.includes(' ');
  const dtParams = isMultiWord ? 'dt=t' : 'dt=t&dt=bd&dt=rm';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sIso}&tl=${tIso}&${dtParams}&q=${encodeURIComponent(clean)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data) {
        if (data[1] && Array.isArray(data[1]) && data[1].length > 0) {
          const posLines: string[] = [];
          for (const posBlock of data[1]) {
            if (posBlock && typeof posBlock[0] === 'string' && Array.isArray(posBlock[1]) && posBlock[1].length > 0) {
              const posTag = posBlock[0].toLowerCase();
              const topWords = posBlock[1].slice(0, 4).map((w: any) => String(w).trim()).filter(Boolean);
              if (topWords.length > 0) {
                posLines.push(`(${posTag}) ${topWords.join(', ')}`);
              }
            }
          }
          if (posLines.length > 0) return posLines.join('\n');
        }

        const definitions: string[] = [];
        if (Array.isArray(data[0])) {
          const primary = data[0].map((item: any) => (item && item[0] ? item[0] : '')).join('').trim();
          if (primary) definitions.push(primary);
        }

        if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
          for (const item of data[5][0][2]) {
            if (item && typeof item[0] === 'string' && item[0].trim()) {
              const cleanSyn = item[0].trim();
              if (!definitions.some((d) => d.toLowerCase() === cleanSyn.toLowerCase())) {
                definitions.push(cleanSyn);
              }
            }
          }
        }

        if (definitions.length > 0) {
          return definitions.slice(0, 3).join(', ');
        }
      }
    }
  } catch (_) {}

  return '';
}

// Global Message Router
chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  if (message.type === 'CHECK_HEALTH') {
    apiClient
      .checkHealth()
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_LESSON') {
    apiClient
      .saveLesson(message.payload)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_WORD') {
    apiClient
      .saveWord(message.payload)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_WORDS') {
    const { language } = message.payload || {};
    apiClient
      .getWords(language)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'BATCH_WORD_STATUS') {
    const { words, language } = message.payload || {};
    apiClient
      .getBatchWordStatuses(words, language)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_PROFILES') {
    apiClient
      .getProfiles()
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'TRANSLATE_TEXT' || message.type === 'TRANSLATE_WORD') {
    const text = (message.payload?.text || message.payload?.word || (message as any).text || (message as any).word || '').trim();
    const sourceLang = message.payload?.sourceLang || (message as any).sourceLang || 'auto';
    const targetLang = message.payload?.targetLang || (message as any).targetLang || 'ru';

    (async () => {
      console.log('[Lectura ServiceWorker] Translation requested:', { text, sourceLang, targetLang });
      try {
        const timeoutPromise = new Promise<{ translation: string }>((_, reject) =>
          setTimeout(() => reject(new Error('Server timeout (1.8s)')), 1800)
        );
        const res = await Promise.race([
          apiClient.translateText(text, sourceLang, targetLang),
          timeoutPromise,
        ]);
        if (res && res.translation && res.translation.trim()) {
          console.log('[Lectura ServiceWorker] Server response:', res);
          sendResponse({ success: true, data: res });
          return;
        }
      } catch (err: any) {
        console.warn('[Lectura ServiceWorker] Local API skipped/timeout, using direct public GTX fallback:', err?.message || err);
      }

      try {
        const direct = await translateDirectInWorker(text, sourceLang, targetLang);
        console.log('[Lectura ServiceWorker] Direct fallback response:', { text, direct });
        sendResponse({ success: true, data: { text, translation: direct || '— (нет данных)' } });
      } catch (e: any) {
        console.error('[Lectura ServiceWorker] Fallback translation failed:', e?.message || e);
        sendResponse({ success: true, data: { text, translation: '— (нет данных)' } });
      }
    })();
    return true; // CRITICAL: keeps message port open for async response
  }

  if (message.type === 'SAVE_WORD_LINK') {
    apiClient
      .saveWordLink(message.payload)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_WORD_LINKS') {
    const { language } = message.payload || {};
    apiClient
      .getWordLinks(language)
      .then((res) => sendResponse({ success: true, data: { links: res } }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'LEMMATIZE_WORD') {
    const { word, language } = message.payload || {};
    apiClient
      .lemmatizeWord(word, language)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_LEMMA_SUGGESTIONS') {
    const { word, lang, language } = message.payload || {};
    const targetLang = lang || language || 'es';
    const suggestions = getSuggestedLemmas(word, targetLang);
    sendResponse({ success: true, suggestions });
    return true;
  }

  if (message.type === 'TRANSLATE_WORD') {
    const { word, sourceLang, targetLang } = message.payload || {};
    const sIso = (sourceLang || 'es').slice(0, 2).toLowerCase();
    const tIso = (targetLang || 'ru').slice(0, 2).toLowerCase();
    const clean = cleanWordForTranslation(word || '');
    const isMultiWord = clean.includes(' ');
    const dtParams = isMultiWord ? 'dt=t' : 'dt=t&dt=bd&dt=rm';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sIso}&tl=${tIso}&${dtParams}&q=${encodeURIComponent(clean)}`;
    
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((data) => {
        const variants: string[] = [];
        if (data && data[1] && Array.isArray(data[1])) {
          for (const entry of data[1]) {
            if (entry && Array.isArray(entry[1])) {
              for (const term of entry[1]) {
                const cleanTerm = String(term).trim();
                if (cleanTerm && cleanTerm.toLowerCase() !== word.toLowerCase() && !variants.some((v) => v.toLowerCase() === cleanTerm.toLowerCase())) {
                  variants.push(cleanTerm);
                }
              }
            }
          }
        }
        const primary = data?.[0]?.[0]?.[0]?.trim() || '';
        if (primary && primary.toLowerCase() !== word.toLowerCase() && !variants.some((v) => v.toLowerCase() === primary.toLowerCase())) {
          variants.unshift(primary);
        }
        const translationText = variants.length > 0 ? variants.slice(0, 5).join(', ') : primary || '—';
        sendResponse({ success: true, translation: translationText });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message, translation: '—' });
      });
    return true;
  }

  if (message.type === 'LINK_WORD_ROOT') {
    const { wordFrom, wordTo, language } = message.payload || {};
    apiClient
      .saveWordLink({ wordFrom, wordTo, language })
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'LOG_YOUTUBE_ACTIVITY') {
    apiClient
      .logActivity(message.payload)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return true;
  }

  return false;
});
