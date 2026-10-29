import { apiPost } from '@/api/http';

export type GuestTokenPayload = {
  access_token: string;
  expires_at: string;
  class_id: number;
  class_name: string;
};

// 旁听页之间跳转时复用同一个令牌：班级码只在第一次换令牌，
// 否则每翻一个活动都要重新 POST 一次 /auth/class/guest。
const tokenCache = new Map<string, GuestTokenPayload>();

export async function ensureGuestToken(code: string): Promise<GuestTokenPayload> {
  const normalized = code.toUpperCase();
  const cached = tokenCache.get(normalized);
  if (cached) {
    return cached;
  }
  const payload = await apiPost<GuestTokenPayload>('/auth/class/guest', { class_code: normalized });
  tokenCache.set(normalized, payload);
  return payload;
}

export function clearGuestToken(code: string) {
  tokenCache.delete(code.toUpperCase());
}
