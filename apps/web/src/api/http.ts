import {
  clearPersistedSession,
  hasPersistedToken,
  notifySessionExpired,
} from '@/stores/authSession';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

type RequestOptions = {
  method?: HttpMethod;
  token?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

async function apiFetch(path: string, options: RequestOptions = {}) {
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
    signal: options.signal,
    body:
      options.formData ??
      (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
}

async function readApiError(response: Response) {
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    await readApiError(response);
  }

  const payload = await response.json();
  if (payload.code && payload.code !== 'OK') {
    throw new Error(payload.message || 'Request failed');
  }
  return payload.data as T;
}

export async function apiGet<T>(path: string, token?: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', token, signal });
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string,
  signal?: AbortSignal
): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, token, signal });
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  token?: string,
  signal?: AbortSignal
): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body, token, signal });
}

export async function apiDelete<T>(path: string, token?: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', token, signal });
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  token?: string,
  signal?: AbortSignal
): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', formData, token, signal });
}

export async function apiGetBlob(path: string, token?: string, signal?: AbortSignal): Promise<Response> {
  const response = await apiFetch(path, { method: 'GET', token, signal });
  if (!response.ok) {
    await readApiError(response);
  }
  return response;
}

export async function apiPostBlob(
  path: string,
  body: unknown,
  token?: string,
  signal?: AbortSignal
): Promise<Response> {
  const response = await apiFetch(path, { method: 'POST', body, token, signal });
  if (!response.ok) {
    await readApiError(response);
  }
  return response;
}
