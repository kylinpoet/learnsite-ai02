import { onBeforeUnmount, onMounted, type Ref } from 'vue';

type TaskRuntimeRequestMessage = {
  source: 'learnsite-task-runtime-request';
  requestId: string;
  previewKey?: string;
  taskId: number | null;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyKind?: 'empty' | 'text' | 'base64';
  bodyValue?: string;
  bodyMimeType?: string;
};

type TaskRuntimeResponseMessage = {
  source: 'learnsite-task-runtime-response';
  requestId: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  error?: string;
};

type UseStudentPreviewRuntimeRelayOptions = {
  /** 允许转发的活动 id 集合，避免预览页面访问到别的活动 */
  allowedTaskIds: Ref<number[]>;
  /** 教师令牌，转发时代入 Authorization */
  token: Ref<string | null | undefined>;
  /** 学生端活动接口前缀，默认 /api/v1/tasks */
  apiBaseUrl?: string;
};

function isTaskRuntimeRequestMessage(value: unknown): value is TaskRuntimeRequestMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<TaskRuntimeRequestMessage>;
  return (
    payload.source === 'learnsite-task-runtime-request' &&
    typeof payload.requestId === 'string' &&
    typeof payload.url === 'string'
  );
}

function toResponseMessage(
  requestId: string,
  payload: Omit<TaskRuntimeResponseMessage, 'source' | 'requestId'>
): TaskRuntimeResponseMessage {
  return { source: 'learnsite-task-runtime-response', requestId, ...payload };
}

function postResponse(target: MessageEventSource | null, message: TaskRuntimeResponseMessage) {
  if (!target || typeof (target as WindowProxy).postMessage !== 'function') {
    return;
  }
  (target as WindowProxy).postMessage(message, '*');
}

function decodeBody(message: TaskRuntimeRequestMessage) {
  if (message.bodyKind === 'text') {
    return message.bodyValue || '';
  }
  if (message.bodyKind === 'base64') {
    const binary = window.atob(message.bodyValue || '');
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: message.bodyMimeType || 'application/octet-stream' });
  }
  return undefined;
}

async function encodeBody(response: Response) {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return window.btoa(binary);
}

/**
 * 学生端网页/数据提交页面在 iframe 内会用 postMessage 把活动域请求交回父页面执行。
 * 教师预览需要扮演“父页面”，否则页面里的接口请求会一直挂起。
 * 这里只转发读取类请求，写操作一律拒绝，保证预览不会产生学生提交记录。
 */
export function useStudentPreviewRuntimeRelay(options: UseStudentPreviewRuntimeRelayOptions) {
  const apiBaseUrl = (options.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

  function resolveRequestUrl(rawUrl: string, taskId: number) {
    try {
      const target = new URL(rawUrl, window.location.origin);
      const taskBasePath = new URL(`${apiBaseUrl}/tasks/${taskId}/`, window.location.origin).pathname;
      if (!target.pathname.startsWith(taskBasePath)) {
        return '';
      }
      return target.toString();
    } catch {
      return '';
    }
  }

  async function handleMessage(event: MessageEvent) {
    if (!isTaskRuntimeRequestMessage(event.data)) {
      return;
    }
    const message = event.data;
    const taskId = typeof message.taskId === 'number' ? message.taskId : null;
    if (!taskId || !options.allowedTaskIds.value.includes(taskId)) {
      postResponse(event.source, toResponseMessage(message.requestId, { error: '预览目标不匹配' }));
      return;
    }

    const method = (message.method || 'GET').toUpperCase();
    const targetUrl = resolveRequestUrl(message.url, taskId);
    if (!targetUrl) {
      postResponse(event.source, toResponseMessage(message.requestId, { error: '预览请求地址不被允许' }));
      return;
    }
    if (!options.token.value) {
      postResponse(event.source, toResponseMessage(message.requestId, { error: '教师登录状态已失效' }));
      return;
    }
    if (!['GET', 'HEAD'].includes(method)) {
      postResponse(
        event.source,
        toResponseMessage(message.requestId, {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'content-type': 'application/json' },
          bodyBase64: window.btoa(
            JSON.stringify({ detail: '学生端预览为只读模式，不会保存提交或讨论内容' })
          ),
        })
      );
      return;
    }

    try {
      const headers = new Headers(message.headers || {});
      headers.delete('authorization');
      headers.delete('cookie');
      headers.set('Authorization', `Bearer ${options.token.value}`);
      const response = await fetch(targetUrl, {
        method,
        headers,
        body: decodeBody(message),
        credentials: 'include',
      });
      postResponse(
        event.source,
        toResponseMessage(message.requestId, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          bodyBase64: await encodeBody(response),
        })
      );
    } catch (error) {
      postResponse(
        event.source,
        toResponseMessage(message.requestId, {
          error: error instanceof Error ? error.message : '预览请求失败',
        })
      );
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('message', handleMessage);
  });
}
