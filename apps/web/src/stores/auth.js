import { defineStore } from 'pinia';
import { apiGet } from '@/api/http';
const tokenStorageKey = 'learnsite-token';
const userStorageKey = 'learnsite-user';
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
            this.user = user ? normalizeSessionUser(JSON.parse(user)) : null;
            this.lastSyncedAt = 0;
        },
        setSession(token, user) {
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
            syncPromise = apiGet('/auth/me', this.token)
                .then((payload) => {
                const nextUser = normalizeSessionUser(payload);
                this.user = nextUser;
                this.lastSyncedAt = Date.now();
                localStorage.setItem(userStorageKey, JSON.stringify(nextUser));
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
        },
    },
});
