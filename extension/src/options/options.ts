import { LecturaApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { ExtensionSettings } from '../types/index';
import { applyI18nToDOM, t } from '../services/i18n';

class OptionsController {
  private serverUrlInput!: HTMLInputElement;
  private authTokenInput!: HTMLInputElement;
  private syncKeyInput!: HTMLInputElement;
  private userProfileSelect!: HTMLSelectElement;
  private interfaceLanguageSelect!: HTMLSelectElement;
  private targetLanguageSelect!: HTMLSelectElement;
  private nativeLanguageSelect!: HTMLSelectElement;
  private ttsDialectSelect!: HTMLSelectElement;
  private enableYoutubeOverlayCheck!: HTMLInputElement;
  private enableDualSubtitlesCheck!: HTMLInputElement;
  private captureVideoSnapshotCheck!: HTMLInputElement;
  private pauseOnWordClickCheck!: HTMLInputElement;
  private subtitleSizePresetSelect!: HTMLSelectElement;
  private autoPauseOnHoverCheck!: HTMLInputElement;
  private subtitleFontSizeInput!: HTMLInputElement;
  private subtitleFontSizeValue!: HTMLElement;
  private subBgColorPicker!: HTMLInputElement;
  private subBgColorValue!: HTMLElement;
  private currentSubtitleBgColor: string = 'rgba(15, 23, 42, 0.90)';
  private subtitleBgOpacityInput!: HTMLInputElement;
  private subtitleHighlightModeSelect!: HTMLSelectElement;
  private popupThemeSelect!: HTMLSelectElement;
  private enableInSituSelectionCheck!: HTMLInputElement;
  private onlyOnModifierKeyCheck!: HTMLInputElement;
  private modifierKeySelect!: HTMLSelectElement;
  private domainFilterModeSelect!: HTMLSelectElement;
  private disabledDomainsTextarea!: HTMLTextAreaElement;
  private highlightKnownWordsCheck!: HTMLInputElement;

  private serverStatusBadge!: HTMLElement;
  private saveNotification!: HTMLElement;
  private btnTest!: HTMLButtonElement;
  private btnSave!: HTMLButtonElement;

  private apiClient: LecturaApiClient = new LecturaApiClient();

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  private async init() {
    this.serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
    this.authTokenInput = document.getElementById('authToken') as HTMLInputElement;
    this.syncKeyInput = document.getElementById('syncKey') as HTMLInputElement;
    this.userProfileSelect = document.getElementById('userProfileSelect') as HTMLSelectElement;
    this.interfaceLanguageSelect = document.getElementById('interfaceLanguage') as HTMLSelectElement;
    this.targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
    this.nativeLanguageSelect = document.getElementById('nativeLanguage') as HTMLSelectElement;
    this.ttsDialectSelect = document.getElementById('ttsDialect') as HTMLSelectElement;
    this.enableYoutubeOverlayCheck = document.getElementById('enableYoutubeOverlay') as HTMLInputElement;
    this.enableDualSubtitlesCheck = document.getElementById('enableDualSubtitles') as HTMLInputElement;
    this.captureVideoSnapshotCheck = document.getElementById('captureVideoSnapshot') as HTMLInputElement;
    this.pauseOnWordClickCheck = document.getElementById('pauseOnWordClick') as HTMLInputElement;
    this.subtitleSizePresetSelect = document.getElementById('subtitleSizePreset') as HTMLSelectElement;
    this.autoPauseOnHoverCheck = document.getElementById('autoPauseOnHover') as HTMLInputElement;
    this.subtitleFontSizeInput = document.getElementById('subtitleFontSize') as HTMLInputElement;
    this.subtitleFontSizeValue = document.getElementById('subtitleFontSizeValue') as HTMLElement;
    this.subBgColorPicker = document.getElementById('subBgColorPicker') as HTMLInputElement;
    this.subBgColorValue = document.getElementById('subBgColorValue') as HTMLElement;
    this.subtitleBgOpacityInput = document.getElementById('subtitleBgOpacity') as HTMLInputElement;
    this.subtitleHighlightModeSelect = document.getElementById('subtitleHighlightMode') as HTMLSelectElement;
    this.popupThemeSelect = document.getElementById('popupTheme') as HTMLSelectElement;
    this.enableInSituSelectionCheck = document.getElementById('enableInSituSelection') as HTMLInputElement;
    this.onlyOnModifierKeyCheck = document.getElementById('onlyOnModifierKey') as HTMLInputElement;
    this.modifierKeySelect = document.getElementById('modifierKeySelect') as HTMLSelectElement;
    this.domainFilterModeSelect = document.getElementById('domainFilterMode') as HTMLSelectElement;
    this.disabledDomainsTextarea = document.getElementById('disabledDomainsText') as HTMLTextAreaElement;
    this.highlightKnownWordsCheck = document.getElementById('highlightKnownWords') as HTMLInputElement;

    this.serverStatusBadge = document.getElementById('serverStatus') as HTMLElement;
    this.saveNotification = document.getElementById('saveNotification') as HTMLElement;
    this.btnTest = document.getElementById('btnTest') as HTMLButtonElement;
    this.btnSave = document.getElementById('btnSave') as HTMLButtonElement;

    this.bindEvents();
    await this.loadSettings();
    await this.loadProfiles();
    await this.testConnection();
  }

  private applyBgColor(color: string) {
    this.currentSubtitleBgColor = color;
    if (this.subBgColorValue) {
      this.subBgColorValue.textContent = color;
    }
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

  private bindEvents() {
    this.btnTest.addEventListener('click', async () => {
      await this.loadProfiles();
      await this.testConnection();
    });
    this.btnSave.addEventListener('click', () => this.saveSettings());

    if (this.subtitleFontSizeInput) {
      this.subtitleFontSizeInput.addEventListener('input', () => {
        const val = parseInt(this.subtitleFontSizeInput.value, 10) || 22;
        if (this.subtitleFontSizeValue) {
          this.subtitleFontSizeValue.textContent = `${val}px`;
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

    if (this.interfaceLanguageSelect) {
      this.interfaceLanguageSelect.addEventListener('change', async () => {
        const lang = (this.interfaceLanguageSelect.value || 'en') as 'en' | 'ru' | 'es';
        await StorageService.saveSettings({ interfaceLanguage: lang });
        applyI18nToDOM(document, lang);

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

    if (this.popupThemeSelect) {
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
    }
  }

  private async loadSettings() {
    const settings = await StorageService.getSettings();
    this.serverUrlInput.value = settings.serverUrl || 'http://localhost:3000';
    this.authTokenInput.value = settings.authToken || '';
    this.syncKeyInput.value = settings.syncKey || '';
    if (this.interfaceLanguageSelect) {
      this.interfaceLanguageSelect.value = settings.interfaceLanguage || 'en';
    }
    this.targetLanguageSelect.value = settings.targetLanguage || 'es';
    this.nativeLanguageSelect.value = settings.nativeLanguage || 'ru';
    if (this.ttsDialectSelect) {
      this.ttsDialectSelect.value = settings.ttsDialect || 'en-US';
    }

    this.enableYoutubeOverlayCheck.checked = settings.enableYoutubeOverlay ?? true;
    if (this.enableDualSubtitlesCheck) {
      this.enableDualSubtitlesCheck.checked = settings.enableDualSubtitles ?? false;
    }
    if (this.captureVideoSnapshotCheck) {
      this.captureVideoSnapshotCheck.checked = settings.captureVideoSnapshot ?? false;
    }
    if (this.pauseOnWordClickCheck) {
      this.pauseOnWordClickCheck.checked = settings.pauseOnWordClick ?? false;
    }
    if (this.subtitleSizePresetSelect) {
      this.subtitleSizePresetSelect.value = settings.subtitleSizePreset || 'md';
    }
    if (this.popupThemeSelect) {
      this.popupThemeSelect.value = settings.popupTheme || 'glass';
    }
    if (this.autoPauseOnHoverCheck) {
      this.autoPauseOnHoverCheck.checked = settings.autoPauseOnHover ?? true;
    }
    if (this.subtitleFontSizeInput) {
      const size = settings.subtitleFontSize || 22;
      this.subtitleFontSizeInput.value = String(size);
      if (this.subtitleFontSizeValue) {
        this.subtitleFontSizeValue.textContent = `${size}px`;
      }
    }
    this.currentSubtitleBgColor = settings.subtitleBgColor || 'rgba(0, 0, 0, 0.45)';
    if (this.subBgColorValue) {
      this.subBgColorValue.textContent = this.currentSubtitleBgColor;
    }
    if (this.subtitleBgOpacityInput) {
      this.subtitleBgOpacityInput.value = String(settings.subtitleBgOpacity ?? 75);
    }
    this.subtitleHighlightModeSelect.value = settings.subtitleHighlightMode || 'underline';
    this.enableInSituSelectionCheck.checked = settings.enableInSituSelection ?? true;
    if (this.onlyOnModifierKeyCheck) {
      this.onlyOnModifierKeyCheck.checked = settings.onlyOnModifierKey ?? false;
    }
    if (this.modifierKeySelect) {
      this.modifierKeySelect.value = settings.modifierKey || 'alt';
    }
    if (this.domainFilterModeSelect) {
      this.domainFilterModeSelect.value = settings.domainFilterMode || 'blacklist';
    }
    if (this.disabledDomainsTextarea) {
      const defaultDomains = ['chatgpt.com', 'claude.ai', 'gemini.google.com'];
      this.disabledDomainsTextarea.value = (settings.disabledDomains || defaultDomains).join('\n');
    }
    this.highlightKnownWordsCheck.checked = settings.highlightKnownWords ?? false;

    // Apply translations
    applyI18nToDOM(document, settings.interfaceLanguage || 'en');
  }

  private async loadProfiles() {
    try {
      const currentUrl = this.serverUrlInput.value.trim().replace(/\/+$/, '') || 'http://localhost:3000';
      const settings = await StorageService.getSettings();
      const client = new LecturaApiClient({ ...settings, serverUrl: currentUrl });
      const profiles = await client.getProfiles();

      const savedUserId = settings.selectedUserId || '';

      this.userProfileSelect.innerHTML = '';

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

  private getFormSettings(): ExtensionSettings {
    const sizePreset = (this.subtitleSizePresetSelect?.value || 'md') as 'sm' | 'md' | 'lg';
    const rawDomains = (this.disabledDomainsTextarea?.value || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      serverUrl: this.serverUrlInput.value.trim().replace(/\/+$/, ''),
      authToken: this.authTokenInput.value.trim(),
      syncKey: this.syncKeyInput.value.trim(),
      selectedUserId: this.userProfileSelect.value,
      targetLanguage: this.targetLanguageSelect.value,
      nativeLanguage: this.nativeLanguageSelect.value,
      ttsDialect: this.ttsDialectSelect ? this.ttsDialectSelect.value : 'en-US',
      interfaceLanguage: (this.interfaceLanguageSelect?.value || 'en') as 'en' | 'ru' | 'es',
      popupTheme: (this.popupThemeSelect?.value || 'glass') as 'compact' | 'extended' | 'glass' | 'calm_light',
      enableYoutubeOverlay: this.enableYoutubeOverlayCheck.checked,
      enableDualSubtitles: this.enableDualSubtitlesCheck ? this.enableDualSubtitlesCheck.checked : false,
      captureVideoSnapshot: this.captureVideoSnapshotCheck ? this.captureVideoSnapshotCheck.checked : false,
      pauseOnWordClick: this.pauseOnWordClickCheck ? this.pauseOnWordClickCheck.checked : false,
      subtitleSizePreset: sizePreset,
      autoPauseOnHover: this.autoPauseOnHoverCheck ? this.autoPauseOnHoverCheck.checked : true,
      subtitleFontSize: parseInt(this.subtitleFontSizeInput?.value || '22', 10) || 22,
      subtitleBgOpacity: parseInt(this.subtitleBgOpacityInput?.value || '75', 10) || 75,
      subtitleBgColor: this.currentSubtitleBgColor || 'rgba(15, 23, 42, 0.90)',
      subtitleHighlightMode: (this.subtitleHighlightModeSelect.value || 'underline') as 'underline' | 'color',
      enableInSituSelection: this.enableInSituSelectionCheck.checked,
      onlyOnModifierKey: this.onlyOnModifierKeyCheck ? this.onlyOnModifierKeyCheck.checked : false,
      modifierKey: (this.modifierKeySelect?.value || 'alt') as 'alt' | 'ctrl' | 'shift',
      domainFilterMode: (this.domainFilterModeSelect?.value || 'blacklist') as 'blacklist' | 'whitelist',
      disabledDomains: rawDomains,
      highlightKnownWords: this.highlightKnownWordsCheck.checked,
    };
  }

  private async saveSettings() {
    this.btnSave.disabled = true;
    try {
      const settings = this.getFormSettings();
      await StorageService.saveSettings(settings);

      // Also sync shortcuts storage keys
      chrome.storage.local.set({
        dual_subs: settings.enableDualSubtitles ?? false,
        sub_size_preset: settings.subtitleSizePreset || 'md',
        popup_theme: settings.popupTheme || 'glass',
      });

      this.showNotification('All settings saved successfully!', 'success');
      await this.testConnection();
    } catch (err: any) {
      this.showNotification(`Failed to save settings: ${err.message}`, 'error');
    } finally {
      this.btnSave.disabled = false;
    }
  }

  private async testConnection() {
    this.serverStatusBadge.textContent = 'Testing connection...';
    this.serverStatusBadge.className = 'badge';

    try {
      const settings = this.getFormSettings();
      const testClient = new LecturaApiClient(settings);
      const health = await testClient.checkHealth();

      const version = health.version ? `v${health.version}` : 'Online';
      this.serverStatusBadge.textContent = `Connected (${version})`;
      this.serverStatusBadge.className = 'badge badge-success';
    } catch (err: any) {
      this.serverStatusBadge.textContent = 'Server Unreachable';
      this.serverStatusBadge.className = 'badge badge-error';
    }
  }

  private showNotification(msg: string, type: 'success' | 'error') {
    this.saveNotification.textContent = msg;
    this.saveNotification.className = `save-status ${type}`;
    setTimeout(() => {
      if (this.saveNotification.textContent === msg) {
        this.saveNotification.textContent = '';
      }
    }, 4000);
  }
}

new OptionsController();
