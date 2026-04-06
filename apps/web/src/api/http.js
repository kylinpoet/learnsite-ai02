import { clearPersistedSession, hasPersistedToken, notifySessionExpired } from '@/stores/authSession';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
async function apiFetch(path, options = {}) {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    if (options.body !== undefined && options.formData !== undefined) {
        throw new Error('JSON body and FormData cannot be used together');
    }
    if (options.body !== undefined) {
        headers.set('Content-Type', 'application/json');
    }
    if (options.token) {
        headers.set('Authorization', `Bearer ${options.token}`);
    }
    return fetch(`${apiBaseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.formData ??
            (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
}
async function readApiError(response) {
    if (response.status === 401 && hasPersistedToken()) {
        clearPersistedSession();
        notifySessionExpired();
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const payload = await response.json();
        throw new Error(payload.detail || payload.message || `Request failed: ${response.status}`);
    }
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
}
export async function apiRequest(path, options = {}) {
    const response = await apiFetch(path, options);
    if (!response.ok) {
        await readApiError(response);
    }
    const payload = await response.json();
    if (payload.code && payload.code !== 'OK') {
        throw new Error(payload.message || 'Request failed');
    }
    return payload.data;
}
export async function apiGet(path, token) {
    return apiRequest(path, { method: 'GET', token });
}
export async function apiPost(path, body, token) {
    return apiRequest(path, { method: 'POST', body, token });
}
export async function apiPut(path, body, token) {
    return apiRequest(path, { method: 'PUT', body, token });
}
export async function apiDelete(path, token) {
    return apiRequest(path, { method: 'DELETE', token });
}
export async function apiUpload(path, formData, token) {
    return apiRequest(path, { method: 'POST', formData, token });
}
export async function apiGetBlob(path, token) {
    const response = await apiFetch(path, { method: 'GET', token });
    if (!response.ok) {
        await readApiError(response);
    }
    return response;
}
export async function apiPostBlob(path, body, token) {
    const response = await apiFetch(path, { method: 'POST', body, token });
    if (!response.ok) {
        await readApiError(response);
    }
    return response;
}
