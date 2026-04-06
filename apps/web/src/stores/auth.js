import { defineStore } from 'pinia';
import { apiGet } from '@/api/http';
import { clearPersistedSession, isSessionExpired, persistSession, readPersistedSession } from '@/stores/authSession';
const sessionSyncTtlMs = 30000;
let syncPromise = null;
function inferRole(roles) {
    return roles.includes('staff') ? 'staff' : 'student';
}
function normalizeSessionUser(user) {
    return {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: 'role' in user ? user.role : inferRole(user.roles),
        roles: [...user.roles],
    };
}
export const useAuthStore = defineStore('auth', {
    state: () => ({
        token: '',
        user: null,
        sessionExpiresAt: null,
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
            const persisted = readPersistedSession();
            if (persisted.token && isSessionExpired(persisted.expiresAt)) {
                this.clearSession();
                return;
            }
            this.token = persisted.token || '';
            this.user = persisted.user ? normalizeSessionUser(persisted.user) : null;
            this.sessionExpiresAt = persisted.expiresAt;
            this.lastSyncedAt = 0;
        },
        setSession(token, user, expiresAt) {
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
            syncPromise = apiGet('/auth/me', this.token)
                .then((payload) => {
                const nextUser = normalizeSessionUser(payload);
                this.user = nextUser;
                this.sessionExpiresAt = payload.expires_at ?? this.sessionExpiresAt;
                this.lastSyncedAt = Date.now();
                persistSession(this.token, nextUser, this.sessionExpiresAt);
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
        },
    },
});
