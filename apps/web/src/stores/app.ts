import { defineStore } from 'pinia';
import { apiGet } from '@/api/http';
import { defaultTheme, isThemeCode, themeOptions, type ThemeCode } from '@/utils/themes';

const storageKey = 'learnsite-theme';
const schemeStorageKey = 'learnsite-scheme';
const defaultAppTitle = import.meta.env.VITE_APP_TITLE || 'OW³教学评AI平台';

export type ColorSchemeMode = 'light' | 'dark' | 'auto';
export type ResolvedScheme = 'light' | 'dark';

type SystemBrandSettings = {
  platform_name?: string | null;
};

const schemeModes: ColorSchemeMode[] = ['light', 'dark', 'auto'];

function isSchemeMode(value: string | null | undefined): value is ColorSchemeMode {
  return schemeModes.includes(value as ColorSchemeMode);
}

function prefersDarkScheme() {
  return (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyTheme(theme: ThemeCode) {
  document.documentElement.dataset.theme = theme;
}

function applyScheme(scheme: ResolvedScheme) {
  document.documentElement.dataset.scheme = scheme;
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
    schemeMode: 'light' as ColorSchemeMode,
    resolvedScheme: 'light' as ResolvedScheme,
  }),
  actions: {
    initialize() {
      const savedTheme = localStorage.getItem(storageKey);
      this.currentTheme = isThemeCode(savedTheme) ? savedTheme : defaultTheme;
      applyTheme(this.currentTheme);

      const savedScheme = localStorage.getItem(schemeStorageKey);
      this.schemeMode = isSchemeMode(savedScheme) ? savedScheme : 'light';
      this.resolvedScheme = this.schemeMode === 'auto'
        ? (prefersDarkScheme() ? 'dark' : 'light')
        : this.schemeMode;
      applyScheme(this.resolvedScheme);

      this.applyPlatformTitle(this.title);
    },
    /** 切换外观模式；mode='auto' 时跟随系统配色。 */
    setSchemeMode(mode: ColorSchemeMode) {
      this.schemeMode = mode;
      this.resolvedScheme = mode === 'auto' ? (prefersDarkScheme() ? 'dark' : 'light') : mode;
      applyScheme(this.resolvedScheme);
      localStorage.setItem(schemeStorageKey, mode);
    },
    /** 系统配色变化时调用：仅 auto 模式需要重算。 */
    refreshResolvedScheme() {
      if (this.schemeMode !== 'auto') {
        return;
      }
      const next: ResolvedScheme = prefersDarkScheme() ? 'dark' : 'light';
      if (next === this.resolvedScheme) {
        return;
      }
      this.resolvedScheme = next;
      applyScheme(next);
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
    /**
     * 系统主题只作为「首次访问的默认值」使用：
     * 本机已经选过配色时不再覆盖，否则每次登录/会话同步都会把用户的选择冲掉。
     */
    applySystemTheme(themeCode: string | null | undefined) {
      if (!isThemeCode(themeCode)) {
        return;
      }
      const savedTheme = localStorage.getItem(storageKey);
      if (isThemeCode(savedTheme)) {
        this.currentTheme = savedTheme;
        applyTheme(savedTheme);
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
