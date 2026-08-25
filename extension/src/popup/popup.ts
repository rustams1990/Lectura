import { LecturaApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { ExtensionSettings } from '../types/index';
import { applyI18nToDOM, t } from '../services/i18n';
import { isDomainDisabled, normalizeDomain } from '../services/domain-filter';

export interface LanguageMeta {
  code: string;
  name: string;
  flag: string;
}

export const LECTURA_LANGUAGES_MAP: Record<string, LanguageMeta> = {
  en: { code: 'en', name: 'English', flag: '🇺🇸' },
  es: { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  ru: { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  fr: { code: 'fr', name: 'French', flag: '🇫🇷' },
  de: { code: 'de', name: 'German', flag: '🇩🇪' },
  pt: { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  it: { code: 'it', name: 'Italian', flag: '🇮🇹' },
  uk: { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  kk: { code: 'kk', name: 'Kazakh', flag: '🇰🇿' },
  zh: { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  ja: { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  ko: { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  tr: { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  pl: { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  sv: { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  nl: { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  ar: { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  he: { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  hi: { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  fa: { code: 'fa', name: 'Persian', flag: '🇮🇷' },
  el: { code: 'el', name: 'Greek', flag: '🇬🇷' },
};

const LANGUAGE_ALIASES: Record<string, string> = {
  sp: 'es',
  spa: 'es',
  spanish: 'es',
  esp: 'es',
  espanol: 'es',
  español: 'es',
  eng: 'en',
  english: 'en',
  rus: 'ru',
  russian: 'ru',
  ger: 'de',
  deu: 'de',
  german: 'de',
  deutsch: 'de',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  por: 'pt',
  portuguese: 'pt',
  ita: 'it',
  italian: 'it',
  ukr: 'uk',
  ukrainian: 'uk',
  kaz: 'kk',
  kazakh: 'kk',
  chi: 'zh',
  zho: 'zh',
  chinese: 'zh',
  jpn: 'ja',
  japanese: 'ja',
  kor: 'ko',
  korean: 'ko',
  tur: 'tr',
  turkish: 'tr',
  pol: 'pl',
  polish: 'pl',
  swe: 'sv',
  swedish: 'sv',
  dut: 'nl',
  nld: 'nl',
  dutch: 'nl',
  ara: 'ar',
  arabic: 'ar',
};

export function normalizeLanguageCode(rawCode: string): string {
  if (!rawCode) return 'en';
  const raw = rawCode.toLowerCase().trim();
  if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw];
  const clean = raw.replace(/[-_].*$/, '');
  if (LANGUAGE_ALIASES[clean]) return LANGUAGE_ALIASES[clean];
  if (LECTURA_LANGUAGES_MAP[clean]) return clean;
  return clean.slice(0, 2);
}

export const DEFAULT_LANGUAGE_FLAGS: Record<string, string> = {
  en: 'us',
  es: 'es',
  ru: 'ru',
  pt: 'br',
  it: 'it',
  fr: 'fr',
  de: 'de',
  uk: 'ua',
  ua: 'ua',
  kk: 'kz',
  zh: 'cn',
  ja: 'jp',
  ko: 'kr',
  ar: 'sa',
  tr: 'tr',
  pl: 'pl',
  sv: 'se',
  nl: 'nl',
  he: 'il',
  hi: 'in',
  fa: 'ir',
  el: 'gr',
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ru: 'Russian',
  pt: 'Portuguese',
  it: 'Italian',
  fr: 'French',
  de: 'German',
  uk: 'Ukrainian',
  ua: 'Ukrainian',
  kk: 'Kazakh',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
  nl: 'Dutch',
  he: 'Hebrew',
  hi: 'Hindi',
  fa: 'Persian',
  el: 'Greek',
};

export const FLAG_EMOJI_TO_CODE: Record<string, string> = {
  "🇺🇸": "us", "🇨🇦": "ca", "🇲🇽": "mx", "🇨🇴": "co", "🇦🇷": "ar", "🇨🇱": "cl",
  "🇵🇪": "pe", "🇻🇪": "ve", "🇪🇨": "ec", "🇬🇹": "gt", "🇨🇺": "cu", "🇩🇴": "do",
  "🇭🇳": "hn", "🇵🇾": "py", "🇸🇻": "sv", "🇳🇮": "ni", "🇨🇷": "cr", "🇵🇦": "pa",
  "🇺🇾": "uy", "🇧🇴": "bo", "🇧🇷": "br", "🇯🇲": "jm", "🇭🇹": "ht", "🇸🇷": "sr",
  "🇬🇧": "gb", "🇪🇸": "es", "🇩🇪": "de", "🇦🇹": "at", "🇨🇭": "ch",
  "🇫🇷": "fr", "🇷🇺": "ru", "🇮🇹": "it", "🇵🇹": "pt", "🇺🇦": "ua", "🇵🇱": "pl",
  "🇸🇪": "se", "🇳🇱": "nl", "🇧🇪": "be", "🇬🇷": "gr", "🇮🇪": "ie", "🇧🇾": "by",
  "🇯🇵": "jp", "🇨🇳": "cn", "🇹🇼": "tw", "🇰🇷": "kr", "🇰🇵": "kp", "🇹🇷": "tr",
  "🇸🇦": "sa", "🇦🇪": "ae", "🇪🇬": "eg", "🇮🇷": "ir", "🇮🇱": "il", "🇮🇳": "in",
  "🇰🇿": "kz", "🇦🇺": "au", "🇳🇿": "nz", "🇻🇳": "vn"
};

export function getLanguageFlagCode(langCode: string, userFlags: Record<string, string> = {}): string {
  const norm = normalizeLanguageCode(langCode);
  const rawLower = (langCode || '').toLowerCase().trim();

  // Check if custom flag is specified
  let customVal = userFlags[norm] || userFlags[rawLower];

  if (!customVal && userFlags && typeof userFlags === 'object') {
    for (const [k, v] of Object.entries(userFlags)) {
      if (normalizeLanguageCode(k) === norm && v) {
        customVal = v;
        break;
      }
    }
  }

  if (customVal && typeof customVal === 'string') {
    const trimmed = customVal.trim();
    if (FLAG_EMOJI_TO_CODE[trimmed]) {
      return FLAG_EMOJI_TO_CODE[trimmed].toLowerCase();
    }
    if (/^[a-zA-Z]{2,3}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }

  const defaults: Record<string, string> = {
    en: 'us',
    es: 'es',
    ru: 'ru',
    pt: 'br',
    it: 'it',
    fr: 'fr',
    de: 'de',
    uk: 'ua',
    ua: 'ua',
    kk: 'kz',
    zh: 'cn',
    ja: 'jp',
    ko: 'kr',
    ar: 'sa',
    tr: 'tr',
    pl: 'pl',
    sv: 'se',
    nl: 'nl',
    he: 'il',
    hi: 'in',
    fa: 'ir',
    el: 'gr',
  };

  return defaults[norm] || norm || 'us';
}

export function getFlagImageUrl(flagCode: string): string {
  const code = (flagCode || 'us').toLowerCase().trim();
  return `https://flagcdn.com/w40/${code}.png`;
}

/**
 * Получить URL круглого флага для языка с учетом настроек пользователя в Lectura
 */
export function getLanguageFlagUrl(langCode: string, userCustomFlags: Record<string, string> = {}): string {
  const flagCode = getLanguageFlagCode(langCode, userCustomFlags);
  return getFlagImageUrl(flagCode);
}

export function getLanguageDisplay(code: string, userCustomFlags?: Record<string, string>): LanguageMeta {
  const normCode = normalizeLanguageCode(code);
  const base = LECTURA_LANGUAGES_MAP[normCode] || {
    code: normCode,
    name: LANGUAGE_NAMES[normCode] || (code.length > 2 ? code.charAt(0).toUpperCase() + code.slice(1) : normCode.toUpperCase()),
    flag: '🌐',
  };

  if (userCustomFlags && userCustomFlags[normCode]) {
    return { ...base, flag: userCustomFlags[normCode] };
  }
  return base;
}

class PopupController {
  private serverUrlInput?: HTMLInputElement | null;
  private authTokenInput?: HTMLInputElement | null;
  private interfaceLanguageSelect?: HTMLSelectElement | null;
  private targetLanguageSelect!: HTMLSelectElement;
  private ttsDialectSelect?: HTMLSelectElement | null;
  private connectionBadge!: HTMLElement;
  private statusAlert!: HTMLElement;
  private studyLangFlagImg?: HTMLImageElement | null;

  private btnTestConnection?: HTMLButtonElement | null;
  private btnSaveConfig?: HTMLButtonElement | null;
  private btnImportPage!: HTMLButtonElement;
  private masterPowerCard!: HTMLElement;
  private globalEnabledToggle!: HTMLInputElement;
  private powerStatusDot!: HTMLElement;
  private powerStatusTitle!: HTMLElement;
  private powerStatusDesc!: HTMLElement;
  private currentTabDomain!: HTMLElement;
  private btnToggleSiteBlacklist!: HTMLButtonElement;
  private activeHostname: string = '';

  private btnOpenLectura!: HTMLButtonElement;
  private btnSyncWords!: HTMLButtonElement;
  private btnOptions!: HTMLButtonElement;
  private btnModeUnderline!: HTMLButtonElement;
  private btnModeColor!: HTMLButtonElement;
  private userProfileSelect?: HTMLSelectElement | null;
  private subSizeSelect?: HTMLSelectElement | null;
  private subFontSizeInput!: HTMLInputElement;
  private subFontSizeValue!: HTMLElement;
  private subBgColorPicker!: HTMLInputElement;
  private currentSubtitleBgColor: string = 'rgba(0, 0, 0, 0.45)';
  private dualSubsCheck!: HTMLInputElement;
  private pauseOnWordClickCheck!: HTMLInputElement;
  private enableYoutubeOverlayCheck!: HTMLInputElement;
  private trackListeningActivityCheck!: HTMLInputElement;
  private popupThemeSelect!: HTMLSelectElement;
  private currentSubtitleMode: 'underline' | 'color' = 'underline';

  // Tabs & Activity Calendar Elements
  private tabBtnSettings!: HTMLButtonElement;
  private tabBtnActivity!: HTMLButtonElement;
  private tabContentSettings!: HTMLElement;
  private tabContentActivity!: HTMLElement;
  private activityLangPillsContainer!: HTMLElement;
  private statWeek!: HTMLElement;
  private statMonth!: HTMLElement;
  private statLangsCount!: HTMLElement;
  private prevMonthBtn!: HTMLButtonElement;
  private nextMonthBtn!: HTMLButtonElement;
  private currentMonthYearLabel!: HTMLElement;
  private calendarDaysGrid!: HTMLElement;
  private calendarGoalBadge!: HTMLElement;
  private selectedDateLabel!: HTMLElement;
  private dayLogsContainer!: HTMLElement;

  private currentCalendarYear: number = new Date().getFullYear();
  private currentCalendarMonth: number = new Date().getMonth(); // 0-indexed (0 = Jan, 7 = Aug)
  private selectedDateStr: string = new Date().toISOString().slice(0, 10);
  private selectedActivityLang: string = 'all';
  private activityHistoryCache: any[] = [];
  private userCustomFlagsCache: Record<string, string> = {};
  private currentUiLang: string = 'en';
  private userGoalsCache: { dailyGoalMinutes?: number; dailyGoalsByLanguage?: Record<string, number> } = {
    dailyGoalMinutes: 15,
    dailyGoalsByLanguage: {},
  };

  private apiClient: LecturaApiClient = new LecturaApiClient();

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  private async init() {
    this.masterPowerCard = document.getElementById('masterPowerCard') as HTMLElement;
    this.globalEnabledToggle = document.getElementById('globalEnabledToggle') as HTMLInputElement;
    this.powerStatusDot = document.getElementById('powerStatusDot') as HTMLElement;
    this.powerStatusTitle = document.getElementById('powerStatusTitle') as HTMLElement;
    this.powerStatusDesc = document.getElementById('powerStatusDesc') as HTMLElement;
    this.currentTabDomain = document.getElementById('currentTabDomain') as HTMLElement;
    this.btnToggleSiteBlacklist = document.getElementById('btnToggleSiteBlacklist') as HTMLButtonElement;

    this.serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement | null;
    this.authTokenInput = document.getElementById('authToken') as HTMLInputElement | null;
    this.interfaceLanguageSelect = document.getElementById('interfaceLanguage') as HTMLSelectElement | null;
    this.userProfileSelect = document.getElementById('userProfileSelect') as HTMLSelectElement | null;
    this.targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
    this.ttsDialectSelect = document.getElementById('ttsDialect') as HTMLSelectElement | null;
    this.studyLangFlagImg = document.getElementById('studyLangFlagImg') as HTMLImageElement | null;
    this.subSizeSelect = document.getElementById('subSizeSelect') as HTMLSelectElement | null;
    this.subFontSizeInput = document.getElementById('subFontSize') as HTMLInputElement;
    this.subFontSizeValue = document.getElementById('subFontSizeValue') as HTMLElement;
    this.subBgColorPicker = document.getElementById('subBgColorPicker') as HTMLInputElement;
    this.dualSubsCheck = document.getElementById('dualSubsCheck') as HTMLInputElement;
    this.pauseOnWordClickCheck = document.getElementById('pauseOnWordClickCheck') as HTMLInputElement;
    this.enableYoutubeOverlayCheck = document.getElementById('enableYoutubeOverlayCheck') as HTMLInputElement;
    this.trackListeningActivityCheck = document.getElementById('trackListeningActivityCheck') as HTMLInputElement;
    this.popupThemeSelect = document.getElementById('popupThemeSelect') as HTMLSelectElement;
    this.connectionBadge = document.getElementById('connectionBadge') as HTMLElement;
    this.statusAlert = document.getElementById('statusAlert') as HTMLElement;

    this.btnTestConnection = document.getElementById('btnTestConnection') as HTMLButtonElement | null;
    this.btnSaveConfig = document.getElementById('btnSaveConfig') as HTMLButtonElement | null;
    this.btnImportPage = document.getElementById('btnImportPage') as HTMLButtonElement;
    this.btnOpenLectura = document.getElementById('btnOpenLectura') as HTMLButtonElement;
    this.btnSyncWords = document.getElementById('btnSyncWords') as HTMLButtonElement;
    this.btnOptions = document.getElementById('btnOptions') as HTMLButtonElement;
    this.btnModeUnderline = document.getElementById('btnModeUnderline') as HTMLButtonElement;
    this.btnModeColor = document.getElementById('btnModeColor') as HTMLButtonElement;

    // Tabs & Activity DOM Elements
    this.tabBtnSettings = document.getElementById('tabBtnSettings') as HTMLButtonElement;
    this.tabBtnActivity = document.getElementById('tabBtnActivity') as HTMLButtonElement;
    this.tabContentSettings = document.getElementById('tabContentSettings') as HTMLElement;
    this.tabContentActivity = document.getElementById('tabContentActivity') as HTMLElement;
    this.activityLangPillsContainer = document.getElementById('activityLangPills') as HTMLElement;
    this.statWeek = document.getElementById('statWeek') as HTMLElement;
    this.statMonth = document.getElementById('statMonth') as HTMLElement;
    this.statLangsCount = document.getElementById('statLangsCount') as HTMLElement;
    this.prevMonthBtn = document.getElementById('prevMonthBtn') as HTMLButtonElement;
    this.nextMonthBtn = document.getElementById('nextMonthBtn') as HTMLButtonElement;
    this.currentMonthYearLabel = document.getElementById('currentMonthYearLabel') as HTMLElement;
    this.calendarDaysGrid = document.getElementById('calendarDaysGrid') as HTMLElement;
    this.calendarGoalBadge = document.getElementById('calendarGoalBadge') as HTMLElement;
    this.selectedDateLabel = document.getElementById('selectedDateLabel') as HTMLElement;
    this.dayLogsContainer = document.getElementById('dayLogsContainer') as HTMLElement;

    this.bindEvents();
    await this.loadSettings();
    await this.detectActiveTabDomain();
    await this.loadProfiles();
    await this.testConnection(false);

    chrome.storage.local.get(['activePopupTab'], (res) => {
      if (res.activePopupTab === 'activity') {
        this.switchTab('activity');
      }
    });
  }

  private updateStudyLanguageFlag(langCode: string) {
    if (!this.studyLangFlagImg) return;
    const flagUrl = getLanguageFlagUrl(langCode, this.userCustomFlagsCache);
    this.studyLangFlagImg.src = flagUrl;
  }

  private bindEvents() {
    if (this.btnTestConnection) {
      this.btnTestConnection.addEventListener('click', async () => {
        await this.loadProfiles();
        await this.testConnection(true);
      });
    }
    if (this.btnSaveConfig) {
      this.btnSaveConfig.addEventListener('click', () => this.saveConfig());
    }
    if (this.btnImportPage) {
      this.btnImportPage.addEventListener('click', () => this.importCurrentPage());
    }
    if (this.btnOpenLectura) {
      this.btnOpenLectura.addEventListener('click', () => this.openLecturaApp());
    }
    if (this.btnSyncWords) {
      this.btnSyncWords.addEventListener('click', () => this.syncWords());
    }
    if (this.btnOptions) {
      this.btnOptions.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }

    if (this.targetLanguageSelect) {
      this.targetLanguageSelect.addEventListener('change', async () => {
        const lang = this.targetLanguageSelect.value;
        await StorageService.saveSettings({ targetLanguage: lang });
        this.updateStudyLanguageFlag(lang);
        try {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_TARGET_LANGUAGE',
                language: lang,
              }).catch(() => {});
            }
          }
        } catch (_) {}
      });
    }

    if (this.btnModeUnderline) {
      this.btnModeUnderline.addEventListener('click', () => this.setSubtitleMode('underline'));
    }
    if (this.btnModeColor) {
      this.btnModeColor.addEventListener('click', () => this.setSubtitleMode('color'));
    }

    if (this.interfaceLanguageSelect) {
      this.interfaceLanguageSelect.addEventListener('change', async () => {
        const lang = (this.interfaceLanguageSelect?.value || 'en') as 'en' | 'ru' | 'es';
        this.currentUiLang = lang;
        await StorageService.saveSettings({ interfaceLanguage: lang });
        applyI18nToDOM(document, lang);
        this.renderLanguageFilters();
        this.renderCalendar();
        this.loadDayLogs(this.selectedDateStr);

        try {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_UI_LANGUAGE',
                language: lang,
              }).catch(() => {});
            }
          }
        } catch (_) {}
      });
    }

    if (this.userProfileSelect) {
      this.userProfileSelect.addEventListener('change', async () => {
        const selectedUserId = this.userProfileSelect?.value;
        if (selectedUserId) {
          await StorageService.saveSettings({ selectedUserId });
        }
      });
    }

    if (this.subSizeSelect) {
      this.subSizeSelect.addEventListener('change', async () => {
        const sizePreset = (this.subSizeSelect?.value || 'md') as 'sm' | 'md' | 'lg';
        await StorageService.saveSettings({ subtitleSizePreset: sizePreset });
        chrome.storage.local.set({ sub_size_preset: sizePreset });
      });
    }

    this.popupThemeSelect.addEventListener('change', async () => {
      const theme = (this.popupThemeSelect.value || 'compact') as 'compact' | 'extended' | 'glass' | 'calm_light';
      await StorageService.saveSettings({ popupTheme: theme });
      await chrome.storage.local.set({ popup_theme: theme, popupTheme: theme });

      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'UPDATE_POPUP_THEME',
              theme,
            }).catch(() => {});
          }
        }
      } catch (_) {}
    });

    if (this.enableYoutubeOverlayCheck) {
      this.enableYoutubeOverlayCheck.addEventListener('change', async () => {
        const enabled = this.enableYoutubeOverlayCheck.checked;
        await StorageService.saveSettings({ enableYoutubeOverlay: enabled });
        chrome.storage.local.set({ enableYoutubeOverlay: enabled });
        try {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_YOUTUBE_OVERLAY_ENABLED',
                enabled,
              }).catch(() => {});
            }
          }
        } catch (_) {}
      });
    }

    if (this.trackListeningActivityCheck) {
      this.trackListeningActivityCheck.addEventListener('change', async () => {
        const enabled = this.trackListeningActivityCheck.checked;
        await StorageService.saveSettings({ trackListeningActivity: enabled });
        chrome.storage.local.set({ trackListeningActivity: enabled });
        try {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_TRACK_ACTIVITY_ENABLED',
                enabled,
              }).catch(() => {});
            }
          }
        } catch (_) {}
      });
    }

    this.dualSubsCheck.addEventListener('change', async () => {
      const enabled = this.dualSubsCheck.checked;
      await StorageService.saveSettings({ enableDualSubtitles: enabled });
      chrome.storage.local.set({ dual_subs: enabled });
    });

    if (this.subFontSizeInput) {
      this.subFontSizeInput.addEventListener('input', () => {
        const val = parseInt(this.subFontSizeInput.value, 10) || 22;
        if (this.subFontSizeValue) {
          this.subFontSizeValue.textContent = `${val}px`;
        }
        chrome.storage.local.set({ subtitleFontSize: val });
        document.documentElement.style.setProperty('--lectura-sub-font-size', `${val}px`);
        try {
          chrome.tabs.query({}).then((tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: 'UPDATE_SUB_FONT_SIZE',
                  size: val,
                }).catch(() => {});
              }
            }
          }).catch(() => {});
        } catch (_) {}
      });
    }

    document.querySelectorAll('.sub-bg-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const color = (e.currentTarget as HTMLElement).dataset.color;
        if (color) {
          this.applyBgColor(color);
        }
      });
    });

    if (this.subBgColorPicker) {
      this.subBgColorPicker.addEventListener('input', (e) => {
        const hex = (e.target as HTMLInputElement).value;
        this.applyBgColor(`${hex}E6`);
      });
    }

    this.pauseOnWordClickCheck.addEventListener('change', async () => {
      const enabled = this.pauseOnWordClickCheck.checked;
      await StorageService.saveSettings({ pauseOnWordClick: enabled });
    });

    if (this.globalEnabledToggle) {
      this.globalEnabledToggle.addEventListener('change', async () => {
        const isEnabled = this.globalEnabledToggle.checked;
        await StorageService.saveSettings({ isEnabled });
        this.updatePowerSwitchUI(isEnabled);
      });
    }

    if (this.btnToggleSiteBlacklist) {
      this.btnToggleSiteBlacklist.addEventListener('click', async () => {
        if (!this.activeHostname) return;
        const settings = await StorageService.getSettings();
        const domains = [...(settings.disabledDomains || [])];
        const isCurrentlyDisabled = isDomainDisabled(this.activeHostname, domains, settings.domainFilterMode || 'blacklist');

        if (isCurrentlyDisabled) {
          // Remove from blacklist
          const norm = normalizeDomain(this.activeHostname);
          const filtered = domains.filter((d) => normalizeDomain(d) !== norm);
          await StorageService.saveSettings({ disabledDomains: filtered });
        } else {
          // Add to blacklist
          const norm = normalizeDomain(this.activeHostname);
          if (!domains.some((d) => normalizeDomain(d) === norm)) {
            domains.push(norm);
          }
          await StorageService.saveSettings({ disabledDomains: domains });
        }
        await this.updateSiteToggleUI();
      });
    }

    // Tab Switching
    this.tabBtnSettings?.addEventListener('click', () => this.switchTab('settings'));
    this.tabBtnActivity?.addEventListener('click', () => this.switchTab('activity'));

    // Calendar Navigation
    this.prevMonthBtn?.addEventListener('click', () => {
      this.currentCalendarMonth--;
      if (this.currentCalendarMonth < 0) {
        this.currentCalendarMonth = 11;
        this.currentCalendarYear--;
      }
      this.renderCalendar();
      this.renderSummaryStats();
    });

    this.nextMonthBtn?.addEventListener('click', () => {
      this.currentCalendarMonth++;
      if (this.currentCalendarMonth > 11) {
        this.currentCalendarMonth = 0;
        this.currentCalendarYear++;
      }
      this.renderCalendar();
      this.renderSummaryStats();
    });

    // Language pills filter selection
    this.activityLangPillsContainer?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.lang-pill') as HTMLElement | null;
      if (!btn) return;
      const lang = btn.dataset.lang || 'all';
      this.selectedActivityLang = lang;
      this.renderLanguageFilters();
      this.renderCalendar();
      this.renderSummaryStats();
      this.loadDayLogs(this.selectedDateStr);
    });

    // Calendar day cell click
    this.calendarDaysGrid?.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest('.cal-day-cell') as HTMLElement | null;
      if (!cell || !cell.dataset.date) return;
      this.selectedDateStr = cell.dataset.date;
      this.calendarDaysGrid.querySelectorAll('.cal-day-cell').forEach((c) => c.classList.remove('selected-day'));
      cell.classList.add('selected-day');
      this.loadDayLogs(this.selectedDateStr);
    });

    // Delete activity log click
    this.dayLogsContainer?.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('.delete-log-btn') as HTMLElement | null;
      if (!btn || !btn.dataset.id) return;
      const logId = btn.dataset.id;
      await this.handleDeleteActivityLog(logId, this.selectedDateStr);
    });
  }

  private switchTab(activeTab: 'settings' | 'activity') {
    if (activeTab === 'settings') {
      this.tabContentSettings?.classList.remove('hidden');
      this.tabContentActivity?.classList.add('hidden');
      this.tabBtnSettings?.classList.add('active');
      this.tabBtnActivity?.classList.remove('active');
    } else {
      this.tabContentActivity?.classList.remove('hidden');
      this.tabContentSettings?.classList.add('hidden');
      this.tabBtnActivity?.classList.add('active');
      this.tabBtnSettings?.classList.remove('active');
      this.loadActivityHistory();
      this.loadDayLogs(this.selectedDateStr);
    }
    chrome.storage.local.set({ activePopupTab: activeTab });
  }

  private async loadActivityHistory() {
    try {
      const res = await this.apiClient.getActivityHistory();
      if (res.success) {
        if (Array.isArray(res.history)) {
          this.activityHistoryCache = res.history;
        }
        if (res.userGoals) {
          this.userGoalsCache = res.userGoals;
        }
        if (res.customFlags) {
          this.userCustomFlagsCache = { ...this.userCustomFlagsCache, ...res.customFlags };
          chrome.storage.local.set({ userCustomFlags: this.userCustomFlagsCache });
        }
      }
    } catch (_) {}
    this.renderLanguageFilters();
    this.renderCalendar();
    this.renderSummaryStats();
  }

  private getTargetGoalMinutes(langCode: string): number {
    if (langCode === 'all') {
      const goals = this.userGoalsCache?.dailyGoalsByLanguage;
      if (goals && Object.keys(goals).length > 0) {
        const sum = Object.values(goals).reduce((acc, g) => acc + (Number(g) || 0), 0);
        if (sum > 0) return sum;
      }
      return this.userGoalsCache?.dailyGoalMinutes || 60;
    }

    const goals = this.userGoalsCache?.dailyGoalsByLanguage || {};
    const normLang = normalizeLanguageCode(langCode);
    const langMeta = LECTURA_LANGUAGES_MAP[normLang];

    for (const [k, v] of Object.entries(goals)) {
      const normK = normalizeLanguageCode(k);
      if (normK === normLang || (langMeta && k.toLowerCase() === langMeta.name.toLowerCase())) {
        if (typeof v === 'number' && v > 0) return v;
      }
    }

    return this.userGoalsCache?.dailyGoalMinutes || 15;
  }

  private renderLanguageFilters() {
    if (!this.activityLangPillsContainer) return;

    // Calculate total minutes per language from activity history
    const langMinutesMap: Record<string, number> = {};
    for (const item of this.activityHistoryCache) {
      const code = normalizeLanguageCode(item.targetLanguage || 'en');
      const sec = Number(item.durationSeconds) || 0;
      langMinutesMap[code] = (langMinutesMap[code] || 0) + Math.round(sec / 60);
    }

    // Filter only languages that have activity records (> 0 minutes or > 0 seconds)
    const activeLangCodes = Object.keys(langMinutesMap).filter((code) => langMinutesMap[code] > 0);

    // If selected language is no longer valid, reset to 'all'
    if (this.selectedActivityLang !== 'all' && !activeLangCodes.includes(this.selectedActivityLang)) {
      this.selectedActivityLang = 'all';
    }

    const overallLabel = t('overall', this.currentUiLang);
    let html = `
      <button type="button" class="lang-pill ${this.selectedActivityLang === 'all' ? 'active' : ''}" data-lang="all">
        <span class="text-base">🌐</span>
        <span class="font-semibold text-xs">${overallLabel}</span>
      </button>
    `;

    for (const code of activeLangCodes) {
      const name = LANGUAGE_NAMES[code] || LECTURA_LANGUAGES_MAP[code]?.name || code.toUpperCase();
      const flagUrl = getLanguageFlagUrl(code, this.userCustomFlagsCache);
      const isSel = this.selectedActivityLang === code ? 'active' : '';
      html += `
        <button type="button" class="lang-pill ${isSel}" data-lang="${code}">
          <img src="${flagUrl}" alt="${name}" class="w-4 h-4 rounded-full object-cover shadow-xs" />
          <span class="font-semibold text-xs">${name}</span>
        </button>
      `;
    }

    this.activityLangPillsContainer.innerHTML = html;
  }

  private renderCalendar() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (this.currentMonthYearLabel) {
      this.currentMonthYearLabel.textContent = `${monthNames[this.currentCalendarMonth]} ${this.currentCalendarYear}`;
    }

    const targetGoalMinutes = this.getTargetGoalMinutes(this.selectedActivityLang);
    if (this.calendarGoalBadge) {
      const goalLabel = t('goal_per_day', this.currentUiLang);
      this.calendarGoalBadge.textContent = `${goalLabel}: ${targetGoalMinutes} m/day`;
    }

    if (!this.calendarDaysGrid) return;
    this.calendarDaysGrid.innerHTML = '';

    const year = this.currentCalendarYear;
    const month = this.currentCalendarMonth;

    const firstDayDate = new Date(year, month, 1);
    const startingDay = (firstDayDate.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonthAndYear = today.getFullYear() === year && today.getMonth() === month;
    const todayDate = today.getDate();

    // Map activity minutes by day number for current month
    const dailySecondsMap: Record<number, number> = {};
    for (const item of this.activityHistoryCache) {
      const itemCode = normalizeLanguageCode(item.targetLanguage || 'en');
      if (this.selectedActivityLang !== 'all' && itemCode !== this.selectedActivityLang) {
        continue;
      }
      if (!item.timestamp) continue;
      const d = new Date(item.timestamp);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dayNum = d.getDate();
        dailySecondsMap[dayNum] = (dailySecondsMap[dayNum] || 0) + (Number(item.durationSeconds) || 0);
      }
    }

    // 1. Render previous month trailing days
    for (let i = startingDay - 1; i >= 0; i--) {
      const prevDay = prevMonthDays - i;
      const prevMonthIdx = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevDateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;

      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.dataset.date = prevDateStr;
      if (this.selectedDateStr === prevDateStr) cell.classList.add('selected-day');
      cell.textContent = String(prevDay);
      this.calendarDaysGrid.appendChild(cell);
    }

    // 2. Render current month days
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const cell = document.createElement('div');
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cell.dataset.date = dateStr;

      const totalSec = dailySecondsMap[day] || 0;
      const totalMin = Math.round(totalSec / 60);

      const isToday = isCurrentMonthAndYear && day === todayDate;
      const isSelected = this.selectedDateStr === dateStr;

      if (totalMin > 0) {
        const isGoalReached = totalMin >= targetGoalMinutes;
        const statusClass = isGoalReached ? 'cal-day-completed' : 'cal-day-partial';
        cell.className = `cal-day-cell ${statusClass}${isToday ? ' cal-day-today today' : ''}${isSelected ? ' selected-day' : ''}`;
        const timeLabel = totalMin < 60 ? `${totalMin}m` : `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
        cell.innerHTML = `
          <span class="day-num">${day}</span>
          <span class="day-time">${timeLabel}</span>
        `;
      } else {
        cell.className = `cal-day-cell cal-day-empty inactive${isToday ? ' cal-day-today today' : ''}${isSelected ? ' selected-day' : ''}`;
        cell.textContent = String(day);
      }
      this.calendarDaysGrid.appendChild(cell);
    }

    // 3. Render next month leading days to complete the 7-column grid
    const totalRendered = startingDay + totalDaysInMonth;
    const remaining = (7 - (totalRendered % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextMonthIdx = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const nextDateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.dataset.date = nextDateStr;
      if (this.selectedDateStr === nextDateStr) cell.classList.add('selected-day');
      cell.textContent = String(day);
      this.calendarDaysGrid.appendChild(cell);
    }
  }

  private async loadDayLogs(dateStr: string) {
    if (!this.dayLogsContainer) return;

    if (this.selectedDateLabel) {
      try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          this.selectedDateLabel.textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } else {
          this.selectedDateLabel.textContent = dateStr;
        }
      } catch (_) {
        this.selectedDateLabel.textContent = dateStr;
      }
    }

    try {
      const res = await this.apiClient.getDayActivity(dateStr, this.selectedActivityLang);
      if (res.success && Array.isArray(res.logs) && res.logs.length > 0) {
        let html = '';
        for (const log of res.logs) {
          const normCode = normalizeLanguageCode(log.language);
          const name = LANGUAGE_NAMES[normCode] || LECTURA_LANGUAGES_MAP[normCode]?.name || normCode.toUpperCase();
          const flagUrl = getLanguageFlagUrl(log.language, this.userCustomFlagsCache);
          const safeTitle = (log.title || 'YouTube Video').replace(/"/g, '&quot;');
          const safeChannel = (log.channel || 'YouTube').replace(/"/g, '&quot;');
          const safeSource = (log.source || 'YouTube').replace(/"/g, '&quot;');

          html += `
            <div class="history-item">
              <div class="history-item-content">
                <div class="history-item-header">
                  <a href="${log.url || '#'}" target="_blank" class="history-item-title" title="${safeTitle}">
                    ${safeTitle}
                  </a>
                  <span class="history-item-minutes">${log.minutes} m</span>
                </div>
                <div class="history-item-meta">
                  <span class="inline-flex items-center gap-1.5">
                    <img src="${flagUrl}" alt="${name}" class="w-3.5 h-3.5 rounded-full object-cover shadow-xs inline-block" />
                    <span>${name}</span>
                  </span>
                  <span>•</span>
                  <span>${safeSource}</span>
                  <span>•</span>
                  <span class="truncate">${safeChannel}</span>
                </div>
              </div>
              <button type="button" class="delete-log-btn" data-id="${log.id}" title="${t('delete_entry', this.currentUiLang)}">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          `;
        }
        this.dayLogsContainer.innerHTML = html;
      } else {
        this.dayLogsContainer.innerHTML = `<div class="day-logs-empty">${t('no_activity_day', this.currentUiLang)}</div>`;
      }
    } catch (err) {
      this.dayLogsContainer.innerHTML = `<div class="day-logs-empty">${t('failed_load_day_activity', this.currentUiLang)}</div>`;
    }
  }

  private async handleDeleteActivityLog(logId: string | number, dateStr: string) {
    const confirmed = window.confirm(t('confirm_delete_log', this.currentUiLang));
    if (!confirmed) return;

    try {
      const res = await this.apiClient.deleteActivityLog(logId);
      if (res.success) {
        // 1. Reload day logs
        await this.loadDayLogs(dateStr);
        // 2. Refresh calendar and summary metrics
        await this.loadActivityHistory();
      } else {
        alert(t('failed_delete_log', this.currentUiLang));
      }
    } catch (err) {
      console.error('Failed to delete log:', err);
      alert(t('failed_delete_log', this.currentUiLang));
    }
  }

  private renderSummaryStats() {
    const filtered = this.activityHistoryCache.filter((item) => {
      if (this.selectedActivityLang === 'all') return true;
      const code = normalizeLanguageCode(item.targetLanguage || 'en');
      return code === this.selectedActivityLang;
    });

    // Languages count: number of unique active languages in history
    const activeLangs = new Set(
      this.activityHistoryCache
        .filter((h) => (Number(h.durationSeconds) || 0) > 0)
        .map((h) => normalizeLanguageCode(h.targetLanguage || 'en'))
    );
    if (this.statLangsCount) {
      this.statLangsCount.textContent = String(Math.max(1, activeLangs.size));
    }

    // Week stats: find Monday 00:00 of current week
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
    const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);

    let weekSeconds = 0;
    let monthSeconds = 0;

    const currentYear = this.currentCalendarYear;
    const currentMonth = this.currentCalendarMonth;

    for (const item of filtered) {
      if (!item.timestamp) continue;
      const d = new Date(item.timestamp);
      const sec = Number(item.durationSeconds) || 0;

      if (d >= monday && d < sunday) {
        weekSeconds += sec;
      }
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        monthSeconds += sec;
      }
    }

    if (this.statWeek) {
      const weekMin = Math.round(weekSeconds / 60);
      this.statWeek.textContent = weekMin < 60 ? `${weekMin} m` : `${Math.floor(weekMin / 60)} h ${weekMin % 60} m`;
    }

    if (this.statMonth) {
      const monthMin = Math.round(monthSeconds / 60);
      this.statMonth.textContent = monthMin < 60 ? `${monthMin} m` : `${Math.floor(monthMin / 60)} h ${monthMin % 60} m`;
    }
  }

  private applyBgColor(color: string) {
    this.currentSubtitleBgColor = color;
    chrome.storage.local.set({ subtitleBgColor: color });
    document.documentElement.style.setProperty('--lectura-sub-bg-color', color);
    try {
      chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'UPDATE_SUB_BG_COLOR',
              color,
            }).catch(() => {});
          }
        }
      }).catch(() => {});
    } catch (_) {}
  }

  private async setSubtitleMode(mode: 'underline' | 'color') {
    this.currentSubtitleMode = mode;
    this.updateModeButtonsUI(mode);
    await StorageService.saveSettings({ subtitleHighlightMode: mode });
  }

  private updateModeButtonsUI(mode: 'underline' | 'color') {
    if (mode === 'underline') {
      this.btnModeUnderline.classList.add('active');
      this.btnModeColor.classList.remove('active');
    } else {
      this.btnModeColor.classList.add('active');
      this.btnModeUnderline.classList.remove('active');
    }
  }

  private async loadSettings() {
    const settings = await StorageService.getSettings();
    if (this.serverUrlInput) {
      this.serverUrlInput.value = settings.serverUrl || 'http://localhost:3000';
    }
    if (this.authTokenInput) {
      this.authTokenInput.value = settings.authToken || '';
    }
    if (this.targetLanguageSelect) {
      this.targetLanguageSelect.value = settings.targetLanguage || 'es';
      this.updateStudyLanguageFlag(this.targetLanguageSelect.value);
    }
    if (this.interfaceLanguageSelect) {
      this.interfaceLanguageSelect.value = settings.interfaceLanguage || 'en';
    }
    if (this.ttsDialectSelect) {
      this.ttsDialectSelect.value = settings.ttsDialect || 'en-US';
    }
    if (this.subSizeSelect) {
      this.subSizeSelect.value = settings.subtitleSizePreset || 'md';
    }
    if (this.subFontSizeInput) {
      const size = settings.subtitleFontSize || 22;
      this.subFontSizeInput.value = String(size);
      if (this.subFontSizeValue) {
        this.subFontSizeValue.textContent = `${size}px`;
      }
    }
    this.currentSubtitleBgColor = settings.subtitleBgColor || 'rgba(0, 0, 0, 0.45)';
    if (this.popupThemeSelect) {
      this.popupThemeSelect.value = settings.popupTheme || 'glass';
    }
    if (this.enableYoutubeOverlayCheck) {
      this.enableYoutubeOverlayCheck.checked = settings.enableYoutubeOverlay ?? true;
    }
    if (this.trackListeningActivityCheck) {
      this.trackListeningActivityCheck.checked = settings.trackListeningActivity ?? true;
    }
    if (this.dualSubsCheck) {
      this.dualSubsCheck.checked = settings.enableDualSubtitles ?? false;
    }
    if (this.pauseOnWordClickCheck) {
      this.pauseOnWordClickCheck.checked = settings.pauseOnWordClick ?? false;
    }
    this.currentSubtitleMode = settings.subtitleHighlightMode || 'underline';
    this.updateModeButtonsUI(this.currentSubtitleMode);

    const isEnabled = settings.isEnabled !== false;
    if (this.globalEnabledToggle) {
      this.globalEnabledToggle.checked = isEnabled;
    }
    this.updatePowerSwitchUI(isEnabled);

    // Apply active UI language translations
    this.currentUiLang = settings.interfaceLanguage || 'en';
    applyI18nToDOM(document, this.currentUiLang);

    chrome.storage.local.get(['userCustomFlags', 'userProfile', 'lecturaServerSettings'], (res) => {
      const storedFlags = res.userCustomFlags || res.userProfile?.languageFlags || res.lecturaServerSettings?.languageFlags || {};
      if (storedFlags && typeof storedFlags === 'object') {
        this.userCustomFlagsCache = { ...this.userCustomFlagsCache, ...storedFlags };
        if (this.targetLanguageSelect) {
          this.updateStudyLanguageFlag(this.targetLanguageSelect.value);
        }
      }
    });

    await this.updateSiteToggleUI();
  }

  private updatePowerSwitchUI(isEnabled: boolean) {
    if (!this.masterPowerCard) return;
    if (isEnabled) {
      this.masterPowerCard.classList.remove('disabled');
      if (this.powerStatusDot) this.powerStatusDot.classList.add('active');
      if (this.powerStatusTitle) {
        this.powerStatusTitle.textContent = t('ext_enabled', this.currentUiLang as any) || 'Lectura Active';
      }
      if (this.powerStatusDesc) {
        this.powerStatusDesc.textContent = t('ext_enabled_desc', this.currentUiLang as any) || 'Translating & capturing vocabulary';
      }
    } else {
      this.masterPowerCard.classList.add('disabled');
      if (this.powerStatusDot) this.powerStatusDot.classList.remove('active');
      if (this.powerStatusTitle) {
        this.powerStatusTitle.textContent = t('ext_disabled', this.currentUiLang as any) || 'Lectura Paused';
      }
      if (this.powerStatusDesc) {
        this.powerStatusDesc.textContent = t('ext_disabled_desc', this.currentUiLang as any) || 'All translations and overlays paused';
      }
    }
  }

  private async detectActiveTabDomain() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab && activeTab.url) {
        const urlObj = new URL(activeTab.url);
        if (urlObj.protocol.startsWith('http')) {
          this.activeHostname = urlObj.hostname;
          if (this.currentTabDomain) {
            this.currentTabDomain.textContent = this.activeHostname;
          }
          await this.updateSiteToggleUI();
          return;
        }
      }
    } catch (_) {}

    this.activeHostname = '';
    if (this.currentTabDomain) {
      this.currentTabDomain.textContent = 'Current tab';
    }
  }

  private async updateSiteToggleUI() {
    if (!this.btnToggleSiteBlacklist) return;
    if (!this.activeHostname) {
      this.btnToggleSiteBlacklist.style.display = 'none';
      return;
    }
    this.btnToggleSiteBlacklist.style.display = '';

    const settings = await StorageService.getSettings();
    const isSiteDisabled = isDomainDisabled(
      this.activeHostname,
      settings.disabledDomains || [],
      settings.domainFilterMode || 'blacklist'
    );

    if (isSiteDisabled) {
      this.btnToggleSiteBlacklist.classList.add('is-disabled-site');
      this.btnToggleSiteBlacklist.textContent = t('enable_on_site', this.currentUiLang as any) || 'Enable on this site';
      this.btnToggleSiteBlacklist.title = 'Enable Lectura on ' + this.activeHostname;
    } else {
      this.btnToggleSiteBlacklist.classList.remove('is-disabled-site');
      this.btnToggleSiteBlacklist.textContent = t('disable_on_site', this.currentUiLang as any) || 'Disable on this site';
      this.btnToggleSiteBlacklist.title = 'Disable Lectura on ' + this.activeHostname;
    }
  }

  private async loadProfiles() {
    if (!this.userProfileSelect) return;
    try {
      const settings = await StorageService.getSettings();
      const currentUrl = (this.serverUrlInput?.value?.trim() || settings.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
      const client = new LecturaApiClient({ ...settings, serverUrl: currentUrl });
      const profiles = await client.getProfiles();

      const savedUserId = settings.selectedUserId || '';

      this.userProfileSelect.innerHTML = '';

      // Default option
      const defaultOpt = document.createElement('option');
      defaultOpt.value = 'default';
      defaultOpt.textContent = '🌐 Default Profile (Single User / Guest)';
      this.userProfileSelect.appendChild(defaultOpt);

      if (profiles && profiles.length > 0) {
        for (const p of profiles) {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `👤 ${p.displayName} (${p.email || p.id})`;
          if (p.id === savedUserId || p.email === savedUserId) {
            opt.selected = true;
          }
          this.userProfileSelect.appendChild(opt);
        }
      }

      if (savedUserId && savedUserId !== 'default') {
        this.userProfileSelect.value = savedUserId;
      }
    } catch (_) {}
  }

  private getFormSettings(): Partial<ExtensionSettings> {
    const sizePreset = (this.subSizeSelect?.value || 'md') as 'sm' | 'md' | 'lg';
    return {
      serverUrl: this.serverUrlInput ? this.serverUrlInput.value.trim().replace(/\/+$/, '') : undefined,
      authToken: this.authTokenInput ? this.authTokenInput.value.trim() : undefined,
      selectedUserId: this.userProfileSelect ? this.userProfileSelect.value : undefined,
      targetLanguage: this.targetLanguageSelect ? this.targetLanguageSelect.value : 'es',
      ttsDialect: this.ttsDialectSelect ? this.ttsDialectSelect.value : 'en-US',
      subtitleSizePreset: sizePreset,
      subtitleFontSize: parseInt(this.subFontSizeInput?.value || '22', 10) || 22,
      subtitleBgColor: this.currentSubtitleBgColor || 'rgba(0, 0, 0, 0.45)',
      enableDualSubtitles: this.dualSubsCheck ? this.dualSubsCheck.checked : false,
      pauseOnWordClick: this.pauseOnWordClickCheck ? this.pauseOnWordClickCheck.checked : false,
      subtitleHighlightMode: this.currentSubtitleMode,
      interfaceLanguage: (this.interfaceLanguageSelect?.value || 'en') as 'en' | 'ru' | 'es',
      popupTheme: (this.popupThemeSelect?.value || 'glass') as 'compact' | 'extended' | 'glass' | 'calm_light',
    };
  }

  private async saveConfig() {
    const newSettings = this.getFormSettings();
    await StorageService.saveSettings(newSettings);
    chrome.storage.local.set({
      dual_subs: newSettings.enableDualSubtitles ?? false,
      sub_size_preset: newSettings.subtitleSizePreset || 'md',
      popup_theme: newSettings.popupTheme || 'glass',
      subtitleBgColor: newSettings.subtitleBgColor || 'rgba(0, 0, 0, 0.45)',
    });
    this.showAlert('Settings & Profile saved successfully!', 'success');
    await this.syncWords();
  }

  private async testConnection(showUserFeedback = true) {
    if (this.connectionBadge) {
      this.connectionBadge.textContent = 'Checking...';
      this.connectionBadge.className = 'ext-status-badge badge-checking';
    }
    if (this.btnTestConnection) {
      this.btnTestConnection.disabled = true;
    }

    try {
      const formSettings = this.getFormSettings();
      const settings = await StorageService.getSettings();
      const testClient = new LecturaApiClient({
        serverUrl: formSettings.serverUrl || settings.serverUrl || 'http://localhost:3000',
        authToken: formSettings.authToken || settings.authToken || '',
        selectedUserId: formSettings.selectedUserId || settings.selectedUserId || '',
        syncKey: '',
        targetLanguage: formSettings.targetLanguage || settings.targetLanguage || 'es',
        nativeLanguage: 'ru',
        enableYoutubeOverlay: true,
        enableInSituSelection: true,
        highlightKnownWords: false,
        autoPauseOnHover: true,
        subtitleFontSize: 22,
        subtitleBgOpacity: 75,
        subtitleHighlightMode: formSettings.subtitleHighlightMode || 'underline',
      });

      const health = await testClient.checkHealth() as any;
      const versionStr = health.version ? `v${health.version}` : 'Online';
      const userStr = health.userId ? ` • User: ${health.userId}` : '';

      if (this.connectionBadge) {
        this.connectionBadge.textContent = `Connected (${versionStr})`;
        this.connectionBadge.className = 'ext-status-badge badge-connected';
      }

      if (showUserFeedback) {
        this.showAlert(`Connected to Lectura! (${versionStr}${userStr})`, 'success');
      }
    } catch (err: any) {
      if (this.connectionBadge) {
        this.connectionBadge.textContent = 'Disconnected';
        this.connectionBadge.className = 'ext-status-badge badge-disconnected';
      }

      if (showUserFeedback) {
        this.showAlert(`Connection failed: ${err.message || 'Cannot reach server'}`, 'error');
      }
    } finally {
      if (this.btnTestConnection) {
        this.btnTestConnection.disabled = false;
      }
    }
  }

  private async importCurrentPage() {
    this.btnImportPage.disabled = true;
    this.btnImportPage.innerHTML = `<span class="btn-icon">⏳</span> ${t('importing', this.currentUiLang)}`;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active browser tab found');
      }

      // Send extraction request to content script
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ARTICLE' }, async (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          this.showAlert(
            'Could not extract article text from this page. Try refreshing the tab.',
            'error'
          );
          this.resetImportButton();
          return;
        }

        const article = response.article;
        if (!article.content || article.content.trim().length < 20) {
          this.showAlert('Page content is too short or empty to import.', 'error');
          this.resetImportButton();
          return;
        }

        this.btnImportPage.innerHTML = `<span class="btn-icon">📤</span> ${t('saving_to_lectura', this.currentUiLang)}`;

        try {
          const settings = await StorageService.getSettings();
          const saveRes = await this.apiClient.saveLesson({
            title: article.title,
            content: article.content,
            sourceUrl: article.sourceUrl || tab.url,
            coverUrl: article.leadImageUrl,
            author: article.author,
            targetLanguage: article.language !== 'auto' ? article.language : settings.targetLanguage,
            lessonType: 'article',
          });

          this.showAlert(`Lesson "${article.title}" saved to Lectura!`, 'success');
          this.btnImportPage.innerHTML = `<span class="btn-icon">✅</span> ${t('imported', this.currentUiLang)}`;
        } catch (err: any) {
          this.showAlert(`Failed to import lesson: ${err.message || 'Server error'}`, 'error');
          this.resetImportButton();
        }
      });
    } catch (err: any) {
      this.showAlert(`Import error: ${err.message}`, 'error');
      this.resetImportButton();
    }
  }

  private resetImportButton() {
    this.btnImportPage.disabled = false;
    this.btnImportPage.innerHTML = `<span class="btn-icon">📥</span> ${t('import_video_page', this.currentUiLang)}`;
  }

  private async openLecturaApp() {
    const settings = await StorageService.getSettings();
    const url = settings.serverUrl || 'http://localhost:3000';
    chrome.tabs.create({ url });
  }

  private async syncWords() {
    this.btnSyncWords.disabled = true;
    this.btnSyncWords.innerHTML = `<span class="btn-icon">⏳</span> ${t('syncing', this.currentUiLang)}`;

    try {
      const settings = await StorageService.getSettings();
      const res = await this.apiClient.getWords(settings.targetLanguage);
      this.showAlert(`Synced ${res.count || 0} vocabulary words for ${settings.targetLanguage}!`, 'success');
    } catch (err: any) {
      this.showAlert(`Word sync failed: ${err.message}`, 'error');
    } finally {
      this.btnSyncWords.disabled = false;
      this.btnSyncWords.innerHTML = `<span class="btn-icon">🔄</span> ${t('sync_words', this.currentUiLang)}`;
    }
  }

  private showAlert(message: string, type: 'success' | 'error' | 'info') {
    this.statusAlert.textContent = message;
    this.statusAlert.className = `ext-alert alert-${type}`;
    setTimeout(() => {
      if (this.statusAlert.textContent === message) {
        this.statusAlert.className = 'ext-alert hidden';
      }
    }, 4500);
  }
}

new PopupController();
