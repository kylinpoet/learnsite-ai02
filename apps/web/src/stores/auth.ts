import { defineStore } from 'pinia';

import { apiGet } from '@/api/http';
import { useAppStore } from '@/stores/app';
import {
  clearPersistedSession,
  isSessionExpired,
  persistSession,
  readPersistedSession,
} from '@/stores/authSession';

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
  expires_at?: string | null;
};
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
    sessionExpiresAt: null as string | null,
    lastSyncedAt: 0,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token) && !isSessionExpired(state.sessionExpiresAt),
    isStudent: (state) => state.user?.role === 'student',
    isStaff: (state) => state.user?.role === 'staff',
    isAdmin: (state) => Boolean(state.user?.roles.includes('admin')),
  },
  actions: {
    initialize() {
      const persisted = readPersistedSession<SessionUser>();
      if (persisted.token && isSessionExpired(persisted.expiresAt)) {
        this.clearSession();
        return;
      }
      this.token = persisted.token || '';
      this.user = persisted.user ? normalizeSessionUser(persisted.user) : null;
      this.sessionExpiresAt = persisted.expiresAt;
      this.lastSyncedAt = 0;
    },
    setSession(token: string, user: SessionUser, expiresAt: string | null) {
      this.token = token;
      this.user = normalizeSessionUser(user);
      this.sessionExpiresAt = expiresAt;
      this.lastSyncedAt = Date.now();
      persistSession(token, this.user, expiresAt);
    },
    async syncSessionUser(force = false) {
      if (!this.token) {
        return null;
      }
      if (isSessionExpired(this.sessionExpiresAt)) {
        this.clearSession();
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
          this.sessionExpiresAt = payload.expires_at ?? this.sessionExpiresAt;
          this.lastSyncedAt = Date.now();
          persistSession(this.token, nextUser, this.sessionExpiresAt);
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
      this.sessionExpiresAt = null;
      this.lastSyncedAt = 0;
      clearPersistedSession();
      useAppStore().unlockTheme();
    },
  },
});
