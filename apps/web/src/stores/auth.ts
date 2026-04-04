import { defineStore } from 'pinia';

import { apiGet } from '@/api/http';
import { useAppStore } from '@/stores/app';

type SessionUser = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  roles: string[];
  theme?: string | null;
};

type AuthMeResponse = {
  id: string;
  username: string;
  display_name: string;
  roles: string[];
  theme?: string | null;
};

const tokenStorageKey = 'learnsite-token';
const userStorageKey = 'learnsite-user';
const sessionSyncTtlMs = 30_000;

let syncPromise: Promise<SessionUser | null> | null = null;

function inferRole(roles: string[]) {
  return roles.includes('staff') ? 'staff' : 'student';
}

function normalizeSessionUser(user: SessionUser | AuthMeResponse): SessionUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: 'role' in user ? user.role : inferRole(user.roles),
    roles: [...user.roles],
    theme: 'theme' in user ? user.theme ?? null : null,
  };
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    user: null as SessionUser | null,
    lastSyncedAt: 0,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    isStudent: (state) => state.user?.role === 'student',
    isStaff: (state) => state.user?.role === 'staff',
    isAdmin: (state) => Boolean(state.user?.roles.includes('admin')),
  },
  actions: {
    initialize() {
      const token = localStorage.getItem(tokenStorageKey);
      const user = localStorage.getItem(userStorageKey);
      this.token = token || '';
      this.user = user ? normalizeSessionUser(JSON.parse(user) as SessionUser) : null;
      this.lastSyncedAt = 0;
    },
    setSession(token: string, user: SessionUser) {
      this.token = token;
      this.user = normalizeSessionUser(user);
      this.lastSyncedAt = Date.now();
      localStorage.setItem(tokenStorageKey, token);
      localStorage.setItem(userStorageKey, JSON.stringify(this.user));
    },
    async syncSessionUser(force = false) {
      if (!this.token) {
        return null;
      }

      if (!force && this.user && Date.now() - this.lastSyncedAt < sessionSyncTtlMs) {
        return this.user;
      }

      if (syncPromise) {
        return syncPromise;
      }

      syncPromise = apiGet<AuthMeResponse>('/auth/me', this.token)
        .then((payload) => {
          const nextUser = normalizeSessionUser(payload);
          this.user = nextUser;
          this.lastSyncedAt = Date.now();
          localStorage.setItem(userStorageKey, JSON.stringify(nextUser));
          useAppStore().applySystemTheme(nextUser.theme);
          return nextUser;
        })
        .finally(() => {
          syncPromise = null;
        });

      return syncPromise;
    },
    clearSession() {
      this.token = '';
      this.user = null;
      this.lastSyncedAt = 0;
      localStorage.removeItem(tokenStorageKey);
      localStorage.removeItem(userStorageKey);
      useAppStore().unlockTheme();
    },
  },
});
