export const tokenStorageKey = 'learnsite-token';
export const userStorageKey = 'learnsite-user';
export const sessionExpiryStorageKey = 'learnsite-session-expires-at';
export const authSessionExpiredEvent = 'learnsite-auth-session-expired';
function canUseLocalStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}
export function parseSessionExpiry(value) {
    if (!value) {
        return null;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}
export function isSessionExpired(value, now = Date.now()) {
    const timestamp = parseSessionExpiry(value);
    return timestamp !== null && timestamp <= now;
}
export function readPersistedSession() {
    if (!canUseLocalStorage()) {
        return { token: '', user: null, expiresAt: null };
    }
    const token = window.localStorage.getItem(tokenStorageKey) || '';
    const rawUser = window.localStorage.getItem(userStorageKey);
    const expiresAt = window.localStorage.getItem(sessionExpiryStorageKey);
    let user = null;
    if (rawUser) {
        try {
            user = JSON.parse(rawUser);
        }
        catch {
            user = null;
        }
    }
    return { token, user, expiresAt };
}
export function persistSession(token, user, expiresAt) {
    if (!canUseLocalStorage()) {
        return;
    }
    window.localStorage.setItem(tokenStorageKey, token);
    window.localStorage.setItem(userStorageKey, JSON.stringify(user));
    if (expiresAt) {
        window.localStorage.setItem(sessionExpiryStorageKey, expiresAt);
    }
    else {
        window.localStorage.removeItem(sessionExpiryStorageKey);
    }
}
export function clearPersistedSession() {
    if (!canUseLocalStorage()) {
        return;
    }
    window.localStorage.removeItem(tokenStorageKey);
    window.localStorage.removeItem(userStorageKey);
    window.localStorage.removeItem(sessionExpiryStorageKey);
}
export function hasPersistedToken() {
    if (!canUseLocalStorage()) {
        return false;
    }
    return Boolean(window.localStorage.getItem(tokenStorageKey));
}
export function notifySessionExpired() {
    if (typeof window === 'undefined') {
        return;
    }
    window.dispatchEvent(new CustomEvent(authSessionExpiredEvent));
}
