import { LecturaApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { ExtensionSettings } from '../types/index';
import { applyI18nToDOM, t } from '../services/i18n';

class PopupController {
  private serverUrlInput!: HTMLInputElement;
  private authTokenInput!: HTMLInputElement;
  private interfaceLanguageSelect!: HTMLSelectElement;
  private targetLanguageSelect!: HTMLSelectElement;
  private ttsDialectSelect!: HTMLSelectElement;
  private connectionBadge!: HTMLElement;
  private statusAlert!: HTMLElement;

  private btnTestConnection!: HTMLButtonElement;
  private btnSaveConfig!: HTMLButtonElement;
  private btnImportPage!: HTMLButtonElement;
  private btnOpenLectura!: HTMLButtonElement;
  private btnSyncWords!: HTMLButtonElement;
  private btnOptions!: HTMLButtonElement;
  private btnModeUnderline!: HTMLButtonElement;
  private btnModeColor!: HTMLButtonElement;
  private userProfileSelect!: HTMLSelectElement;
  private subSizeSelect!: HTMLSelectElement;
  private dualSubsCheck!: HTMLInputElement;
  private pauseOnWordClickCheck!: HTMLInputElement;
  private popupThemeSelect!: HTMLSelectElement;
  private currentSubtitleMode: 'underline' | 'color' = 'underline';

  private apiClient: LecturaApiClient = new LecturaApiClient();

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  private async init() {
    this.serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
    this.authTokenInput = document.getElementById('authToken') as HTMLInputElement;
    this.interfaceLanguageSelect = document.getElementById('interfaceLanguage') as HTMLSelectElement;
    this.userProfileSelect = document.getElementById('userProfileSelect') as HTMLSelectElement;
    this.targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
    this.ttsDialectSelect = document.getElementById('ttsDialect') as HTMLSelectElement;
    this.subSizeSelect = document.getElementById('subSizeSelect') as HTMLSelectElement;
    this.dualSubsCheck = document.getElementById('dualSubsCheck') as HTMLInputElement;
    this.pauseOnWordClickCheck = document.getElementById('pauseOnWordClickCheck') as HTMLInputElement;
    this.popupThemeSelect = document.getElementById('popupThemeSelect') as HTMLSelectElement;
    this.connectionBadge = document.getElementById('connectionBadge') as HTMLElement;
    this.statusAlert = document.getElementById('statusAlert') as HTMLElement;

    this.btnTestConnection = document.getElementById('btnTestConnection') as HTMLButtonElement;
    this.btnSaveConfig = document.getElementById('btnSaveConfig') as HTMLButtonElement;
    this.btnImportPage = document.getElementById('btnImportPage') as HTMLButtonElement;
    this.btnOpenLectura = document.getElementById('btnOpenLectura') as HTMLButtonElement;
    this.btnSyncWords = document.getElementById('btnSyncWords') as HTMLButtonElement;
    this.btnOptions = document.getElementById('btnOptions') as HTMLButtonElement;
    this.btnModeUnderline = document.getElementById('btnModeUnderline') as HTMLButtonElement;
    this.btnModeColor = document.getElementById('btnModeColor') as HTMLButtonElement;

    this.bindEvents();
    await this.loadSettings();
    await this.loadProfiles();
    await this.testConnection(false);
  }

  private bindEvents() {
    this.btnTestConnection.addEventListener('click', async () => {
      await this.loadProfiles();
      await this.testConnection(true);
    });
    this.btnSaveConfig.addEventListener('click', () => this.saveConfig());
    this.btnImportPage.addEventListener('click', () => this.importCurrentPage());
    this.btnOpenLectura.addEventListener('click', () => this.openLecturaApp());
    this.btnSyncWords.addEventListener('click', () => this.syncWords());
    this.btnOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    this.btnModeUnderline.addEventListener('click', () => this.setSubtitleMode('underline'));
    this.btnModeColor.addEventListener('click', () => this.setSubtitleMode('color'));

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

    this.userProfileSelect.addEventListener('change', async () => {
      const selectedUserId = this.userProfileSelect.value;
      await StorageService.saveSettings({ selectedUserId });
    });

    this.subSizeSelect.addEventListener('change', async () => {
      const sizePreset = (this.subSizeSelect.value || 'md') as 'sm' | 'md' | 'lg';
      await StorageService.saveSettings({ subtitleSizePreset: sizePreset });
      chrome.storage.local.set({ sub_size_preset: sizePreset });
    });

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

    this.dualSubsCheck.addEventListener('change', async () => {
      const enabled = this.dualSubsCheck.checked;
      await StorageService.saveSettings({ enableDualSubtitles: enabled });
      chrome.storage.local.set({ dual_subs: enabled });
    });

    this.pauseOnWordClickCheck.addEventListener('change', async () => {
      const enabled = this.pauseOnWordClickCheck.checked;
      await StorageService.saveSettings({ pauseOnWordClick: enabled });
    });
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
    this.serverUrlInput.value = settings.serverUrl || 'http://localhost:3000';
    this.authTokenInput.value = settings.authToken || '';
    this.targetLanguageSelect.value = settings.targetLanguage || 'es';
    if (this.interfaceLanguageSelect) {
      this.interfaceLanguageSelect.value = settings.interfaceLanguage || 'en';
    }
    if (this.ttsDialectSelect) {
      this.ttsDialectSelect.value = settings.ttsDialect || 'en-US';
    }
    if (this.subSizeSelect) {
      this.subSizeSelect.value = settings.subtitleSizePreset || 'md';
    }
    if (this.popupThemeSelect) {
      this.popupThemeSelect.value = settings.popupTheme || 'glass';
    }
    if (this.dualSubsCheck) {
      this.dualSubsCheck.checked = settings.enableDualSubtitles ?? false;
    }
    if (this.pauseOnWordClickCheck) {
      this.pauseOnWordClickCheck.checked = settings.pauseOnWordClick ?? false;
    }
    this.currentSubtitleMode = settings.subtitleHighlightMode || 'underline';
    this.updateModeButtonsUI(this.currentSubtitleMode);

    // Apply active UI language translations
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
      serverUrl: this.serverUrlInput.value.trim().replace(/\/+$/, ''),
      authToken: this.authTokenInput.value.trim(),
      selectedUserId: this.userProfileSelect.value,
      targetLanguage: this.targetLanguageSelect.value,
      ttsDialect: this.ttsDialectSelect ? this.ttsDialectSelect.value : 'en-US',
      subtitleSizePreset: sizePreset,
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
    });
    this.showAlert('Settings & Profile saved successfully!', 'success');
    await this.syncWords();
  }

  private async testConnection(showUserFeedback = true) {
    this.connectionBadge.textContent = 'Checking...';
    this.connectionBadge.className = 'badge badge-checking';
    this.btnTestConnection.disabled = true;

    try {
      const formSettings = this.getFormSettings();
      const testClient = new LecturaApiClient({
        serverUrl: formSettings.serverUrl || 'http://localhost:3000',
        authToken: formSettings.authToken || '',
        selectedUserId: formSettings.selectedUserId || '',
        syncKey: '',
        targetLanguage: formSettings.targetLanguage || 'es',
        nativeLanguage: 'ru',
        enableYoutubeOverlay: true,
        enableInSituSelection: true,
        highlightKnownWords: false,
        autoPauseOnHover: true,
        subtitleFontSize: 24,
        subtitleBgOpacity: 75,
        subtitleHighlightMode: formSettings.subtitleHighlightMode || 'underline',
      });

      const health = await testClient.checkHealth() as any;
      const versionStr = health.version ? `v${health.version}` : 'Online';
      const userStr = health.userId ? ` • User: ${health.userId}` : '';

      this.connectionBadge.textContent = `Connected (${versionStr})`;
      this.connectionBadge.className = 'ext-status-badge badge-connected';

      if (showUserFeedback) {
        this.showAlert(`Connected to Lectura! (${versionStr}${userStr})`, 'success');
      }
    } catch (err: any) {
      this.connectionBadge.textContent = 'Disconnected';
      this.connectionBadge.className = 'ext-status-badge badge-disconnected';

      if (showUserFeedback) {
        this.showAlert(`Connection failed: ${err.message || 'Cannot reach server'}`, 'error');
      }
    } finally {
      this.btnTestConnection.disabled = false;
    }
  }

  private async importCurrentPage() {
    this.btnImportPage.disabled = true;
    this.btnImportPage.innerHTML = `<span class="btn-icon">⏳</span> Parsing Article...`;

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

        this.btnImportPage.innerHTML = `<span class="btn-icon">📤</span> Saving to Lectura...`;

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
          this.btnImportPage.innerHTML = `<span class="btn-icon">✅</span> Imported!`;
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
    this.btnImportPage.innerHTML = `<span class="btn-icon">📥</span> Import Current Page`;
  }

  private async openLecturaApp() {
    const settings = await StorageService.getSettings();
    const url = settings.serverUrl || 'http://localhost:3000';
    chrome.tabs.create({ url });
  }

  private async syncWords() {
    this.btnSyncWords.disabled = true;
    this.btnSyncWords.innerHTML = `<span class="btn-icon">⏳</span> Syncing...`;

    try {
      const settings = await StorageService.getSettings();
      const res = await this.apiClient.getWords(settings.targetLanguage);
      this.showAlert(`Synced ${res.count || 0} vocabulary words for ${settings.targetLanguage}!`, 'success');
    } catch (err: any) {
      this.showAlert(`Word sync failed: ${err.message}`, 'error');
    } finally {
      this.btnSyncWords.disabled = false;
      this.btnSyncWords.innerHTML = `<span class="btn-icon">🔄</span> Sync Words`;
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
