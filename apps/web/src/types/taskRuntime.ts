export type TaskRuntimeSessionPayload = {
  task_id: number;
  expires_at: string | null;
  asset_base_path: string;
};

export type TaskRuntimeRequestMessage = {
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

export type TaskRuntimeResponseMessage = {
  source: 'learnsite-task-runtime-response';
  requestId: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  error?: string;
};
