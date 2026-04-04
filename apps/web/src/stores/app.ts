import { defineStore } from 'pinia';
import { defaultTheme, isThemeCode, themeOptions, type ThemeCode } from '@/utils/themes';

const storageKey = 'learnsite-theme';

function applyTheme(theme: ThemeCode) {
  document.documentElement.dataset.theme = theme;
}

export const useAppStore = defineStore('app', {
  state: () => ({
    title: import.meta.env.VITE_APP_TITLE || 'LearnSite 新平台',
    currentTheme: defaultTheme as ThemeCode,
    themeOptions,
    themeLockedBySystem: false,
  }),
  actions: {
    initialize() {
      const savedTheme = localStorage.getItem(storageKey);
      this.currentTheme = isThemeCode(savedTheme) ? savedTheme : defaultTheme;
      applyTheme(this.currentTheme);
    },
    setTheme(theme: ThemeCode) {
      if (this.themeLockedBySystem) {
        return;
      }
      this.currentTheme = theme;
      localStorage.setItem(storageKey, theme);
      applyTheme(theme);
    },
    applySystemTheme(themeCode: string | null | undefined) {
      this.themeLockedBySystem = true;
      this.currentTheme = isThemeCode(themeCode) ? themeCode : defaultTheme;
      applyTheme(this.currentTheme);
    },
    unlockTheme() {
      this.themeLockedBySystem = false;
      this.initialize();
    },
  },
});
