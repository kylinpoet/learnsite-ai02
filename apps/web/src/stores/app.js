import { defineStore } from 'pinia';
import { defaultTheme, themeOptions } from '@/utils/themes';
const storageKey = 'learnsite-theme';
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
export const useAppStore = defineStore('app', {
    state: () => ({
        title: import.meta.env.VITE_APP_TITLE || 'LearnSite',
        currentTheme: defaultTheme,
        themeOptions,
    }),
    actions: {
        initialize() {
            const savedTheme = localStorage.getItem(storageKey);
            this.currentTheme = savedTheme && this.themeOptions.some((item) => item.code === savedTheme)
                ? savedTheme
                : defaultTheme;
            applyTheme(this.currentTheme);
        },
        setTheme(theme) {
            this.currentTheme = theme;
            localStorage.setItem(storageKey, theme);
            applyTheme(theme);
        },
    },
});
