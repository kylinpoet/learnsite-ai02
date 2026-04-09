import { defineStore } from 'pinia';
import { apiGet } from '@/api/http';
import { defaultTheme, isThemeCode, themeOptions, type ThemeCode } from '@/utils/themes';

const storageKey = 'learnsite-theme';
const defaultAppTitle = import.meta.env.VITE_APP_TITLE || 'OW³教学评AI平台';

type SystemBrandSettings = {
  platform_name?: string | null;
};

function applyTheme(theme: ThemeCode) {
  document.documentElement.dataset.theme = theme;
}

function normalizePlatformTitle(value: string | null | undefined) {
  const text = String(value || '').trim();
  return text || defaultAppTitle;
}

function applyDocumentTitle(title: string) {
  if (typeof document === 'undefined') {
    return;
  }
  document.title = title;
}

export const useAppStore = defineStore('app', {
  state: () => ({
    title: normalizePlatformTitle(defaultAppTitle),
    currentTheme: defaultTheme as ThemeCode,
    themeOptions,
    themeLockedBySystem: false,
  }),
  actions: {
    initialize() {
      const savedTheme = localStorage.getItem(storageKey);
      this.currentTheme = isThemeCode(savedTheme) ? savedTheme : defaultTheme;
      applyTheme(this.currentTheme);
      this.applyPlatformTitle(this.title);
    },
    applyPlatformTitle(title: string | null | undefined) {
      this.title = normalizePlatformTitle(title);
      applyDocumentTitle(this.title);
    },
    async syncPlatformTitle() {
      try {
        const payload = await apiGet<SystemBrandSettings>('/settings/system');
        this.applyPlatformTitle(payload.platform_name);
      } catch {
        this.applyPlatformTitle(this.title);
      }
    },
    setTheme(theme: ThemeCode) {
      this.currentTheme = theme;
      localStorage.setItem(storageKey, theme);
      applyTheme(theme);
    },
    applySystemTheme(themeCode: string | null | undefined) {
      if (!isThemeCode(themeCode)) {
        return;
      }
      this.themeLockedBySystem = false;
      this.currentTheme = themeCode;
      localStorage.setItem(storageKey, themeCode);
      applyTheme(themeCode);
    },
    unlockTheme() {
      this.themeLockedBySystem = false;
      this.initialize();
    },
  },
});
