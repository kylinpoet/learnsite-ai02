import { defineStore } from 'pinia';

export type NavTab = {
  path: string;
  title: string;
  group?: string;
};

const collapsedStorageKey = 'learnsite-shell-collapsed';
const tabBarStorageKey = 'learnsite-shell-tabbar';

function readFlag(key: string, fallback: boolean) {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  return fallback;
}

function writeFlag(key: string, value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, value ? '1' : '0');
}

export const useNavTabsStore = defineStore('navTabs', {
  state: () => ({
    tabs: [] as NavTab[],
    menuCollapsed: readFlag(collapsedStorageKey, typeof window !== 'undefined' && window.innerWidth < 1100),
    tabBarVisible: readFlag(tabBarStorageKey, true),
  }),
  actions: {
    openTab(tab: NavTab) {
      const existing = this.tabs.find((item) => item.path === tab.path);
      if (existing) {
        existing.title = tab.title;
        existing.group = tab.group;
        return;
      }
      this.tabs.push(tab);
    },
    closeTab(path: string) {
      const index = this.tabs.findIndex((item) => item.path === path);
      if (index < 0) {
        return null;
      }
      this.tabs.splice(index, 1);
      return this.tabs[index] ?? this.tabs[index - 1] ?? null;
    },
    closeOthers(path: string) {
      this.tabs = this.tabs.filter((item) => item.path === path);
    },
    closeAll() {
      this.tabs = [];
    },
    setMenuCollapsed(value: boolean) {
      this.menuCollapsed = value;
      writeFlag(collapsedStorageKey, value);
    },
    setTabBarVisible(value: boolean) {
      this.tabBarVisible = value;
      writeFlag(tabBarStorageKey, value);
    },
    reset() {
      this.tabs = [];
    },
  },
});
