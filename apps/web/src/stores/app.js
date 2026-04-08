import { defineStore } from 'pinia';
import { apiGet } from '@/api/http';
import { defaultTheme, themeOptions } from '@/utils/themes';
const storageKey = 'learnsite-theme';
const defaultAppTitle = import.meta.env.VITE_APP_TITLE || 'OW³教学评AI平台';
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
function normalizePlatformTitle(value) {
    const text = String(value || '').trim();
    return text || defaultAppTitle;
}
function applyDocumentTitle(title) {
    if (typeof document === 'undefined') {
        return;
    }
    document.title = title;
}
function isThemeCode(value) {
    return typeof value === 'string' && themeOptions.some((item) => item.code === value);
}
export const useAppStore = defineStore('app', {
    state: () => ({
        title: normalizePlatformTitle(defaultAppTitle),
        currentTheme: defaultTheme,
        themeOptions,
        themeLockedBySystem: false,
    }),
    actions: {
        initialize() {
            const savedTheme = localStorage.getItem(storageKey);
            this.currentTheme = isThemeCode(savedTheme)
                ? savedTheme
                : defaultTheme;
            applyTheme(this.currentTheme);
            this.applyPlatformTitle(this.title);
        },
        applyPlatformTitle(title) {
            this.title = normalizePlatformTitle(title);
            applyDocumentTitle(this.title);
        },
        async syncPlatformTitle() {
            try {
                const payload = await apiGet('/settings/system');
                this.applyPlatformTitle(payload.platform_name);
            }
            catch {
                this.applyPlatformTitle(this.title);
            }
        },
        setTheme(theme) {
            if (this.themeLockedBySystem) {
                return;
            }
            this.currentTheme = theme;
            localStorage.setItem(storageKey, theme);
            applyTheme(theme);
        },
        applySystemTheme(themeCode) {
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
