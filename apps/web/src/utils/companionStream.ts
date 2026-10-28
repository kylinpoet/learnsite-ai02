import { fetchEventSource } from '@microsoft/fetch-event-source';

export type StreamTokenPayload = {
  text?: string;
};

export type CompanionStreamOptions = {
  body: unknown;
  token: string;
  signal?: AbortSignal;
  onToken?: (text: string) => void;
  onReasoning?: (text: string) => void;
};

async function readStreamError(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return payload.detail || payload.message || `请求失败：${response.status}`;
  }
  const text = await response.text();
  return text || `请求失败：${response.status}`;
}

export async function streamCompanionReply<TDone>(
  url: string,
  options: CompanionStreamOptions
): Promise<TDone> {
  const { body, token, signal, onToken, onReasoning } = options;

  // fetch-event-source 不响应调用前已中止的 signal，提前抛出以保持 fetch(signal) 的原行为。
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  let donePayload: TDone | null = null;
  let streamCompleted = false;

  await fetchEventSource(url, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    // 库默认在页面隐藏时中断并自动重连流，与原 fetch 行为不一致，这里关闭该行为。
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        throw new Error(await readStreamError(response));
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream') || !response.body) {
        throw new Error('流式响应不可用，请稍后重试');
      }
    },
    onmessage(ev) {
      if (ev.event === 'token') {
        try {
          const tokenPayload = JSON.parse(ev.data) as StreamTokenPayload;
          if (tokenPayload.text) {
            onToken?.(tokenPayload.text);
          }
        } catch {
          // ignore malformed token event
        }
        return;
      }
      if (ev.event === 'reasoning') {
        try {
          const tokenPayload = JSON.parse(ev.data) as StreamTokenPayload;
          if (tokenPayload.text) {
            onReasoning?.(tokenPayload.text);
          }
        } catch {
          // ignore malformed reasoning event
        }
        return;
      }
      if (ev.event === 'done') {
        try {
          donePayload = JSON.parse(ev.data) as TDone;
        } catch {
          donePayload = null;
        }
      }
    },
    onclose() {
      streamCompleted = true;
    },
    onerror(err) {
      // 必须重新抛出以禁用库默认的自动重试，错误（含 AbortError）原样向上传递。
      throw err;
    },
  });

  // 库在 signal 中止时直接 resolve 而不是抛 AbortError，
  // 这里补抛，让上层 isAbortError 分支保持与原 fetch 一致的行为。
  if (signal?.aborted && !streamCompleted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  if (donePayload === null) {
    throw new Error('流式响应中断，请稍后重试');
  }
  return donePayload;
}
