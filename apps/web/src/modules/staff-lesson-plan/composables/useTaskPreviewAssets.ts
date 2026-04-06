import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';

import { apiUpload } from '@/api/http';
import type {
  PlanFormTask,
  TaskAssetManifestItem,
  TaskAssetPickerMode,
  TaskAssetSlot,
  TaskHtmlPromptBuildOptions,
  TaskPreviewFeedback,
  TaskPreviewFeedbackLevel,
} from '../lessonPlan.types';

type TaskPreviewMessagePayload = {
  source: 'learnsite-task-preview';
  previewKey: string;
  code: string;
  message?: string;
  detail?: string;
};

type TaskPreviewRuntimeIssue = {
  code?: string;
  message?: string;
  detail?: string;
};

type TaskAssetUploadResponse = {
  task_id: number;
  slot: TaskAssetSlot;
  entry_path: string | null;
  preview_url: string | null;
  config: Record<string, unknown> | null;
  assets: TaskAssetManifestItem[];
};

type TaskRuntimeSessionPayload = {
  task_id: number;
  expires_at: string | null;
  asset_base_path: string;
};

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

type UseTaskPreviewAssetsOptions = {
  authToken: Ref<string | null | undefined>;
  apiBaseUrl: string;
  errorMessage: Ref<string>;
  generatingTaskHtmlKey: Ref<string | null>;
  getTaskAssetEntryPath: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  setTaskAssetEntryPath: (task: PlanFormTask, slot: TaskAssetSlot, value: string) => void;
  getTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  setTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot, value: string) => void;
  taskAssetGenerationKey: (task: Pick<PlanFormTask, 'key'>, slot: TaskAssetSlot) => string;
  buildAbsoluteApiUrl: (path: string) => string;
  copyPlainText: (value: string, label: string) => Promise<void>;
  requestHtmlDraft: (prompt: string) => Promise<string>;
  buildTaskHtmlPrompt: (
    task: PlanFormTask,
    slot: TaskAssetSlot,
    options?: TaskHtmlPromptBuildOptions
  ) => string;
  taskDataSubmitApiPath: (task: PlanFormTask) => string;
  taskDataSubmitRecordsPath: (task: PlanFormTask) => string;
  canUploadTaskAssets: (task: Pick<PlanFormTask, 'id'>) => boolean;
  mergeTaskConfigFromServer: (
    task: PlanFormTask,
    serverConfig: Record<string, unknown> | null | undefined
  ) => void;
  revealTaskPreview: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  isTaskPersisted: (task: Pick<PlanFormTask, 'id'>) => boolean;
  findTaskById?: (taskId: number) => PlanFormTask | null;
};

function encodeAssetPath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function isTaskPreviewMessagePayload(value: unknown): value is TaskPreviewMessagePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<TaskPreviewMessagePayload>;
  return (
    payload.source === 'learnsite-task-preview' &&
    typeof payload.previewKey === 'string' &&
    typeof payload.code === 'string'
  );
}


export function useTaskPreviewAssets(options: UseTaskPreviewAssetsOptions) {
  const uploadingTaskAssetKey = ref<string | null>(null);
  const taskPreviewFeedbackMap = ref<Record<string, TaskPreviewFeedback>>({});
  const taskPreviewDetailExpandedMap = ref<Record<string, boolean>>({});
  const taskPreviewReloadVersion = ref<Record<string, number>>({});

  function taskAssetInputId(task: PlanFormTask, slot: TaskAssetSlot, mode: TaskAssetPickerMode) {
    return `task-asset-${task.key}-${slot}-${mode}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function openTaskAssetPicker(task: PlanFormTask, slot: TaskAssetSlot, mode: TaskAssetPickerMode) {
    const input = document.getElementById(taskAssetInputId(task, slot, mode)) as HTMLInputElement | null;
    input?.click();
  }

  function taskPreviewChannelKey(task: PlanFormTask, slot: TaskAssetSlot) {
    return task.id ? `task:${task.id}:${slot}` : `draft:${task.key}:${slot}`;
  }

  function hasTaskInlinePreview(task: PlanFormTask, slot: TaskAssetSlot) {
    return Boolean(options.getTaskHtmlSource(task, slot).trim());
  }

  function taskAssetPreviewUrl(task: PlanFormTask, slot: TaskAssetSlot) {
    if (!task.id || !options.authToken.value) {
      return '';
    }
    const hasAssets =
      slot === 'web'
        ? task.config.assets.length > 0
        : slot === 'data_submit_form'
          ? task.config.submit_assets.length > 0
          : task.config.visualization_assets.length > 0;
    if (!hasAssets) {
      return '';
    }
    const entryPath = options.getTaskAssetEntryPath(task, slot);
    if (!entryPath) {
      return '';
    }
    return `${options.apiBaseUrl}/tasks/${task.id}/assets/${slot}/${encodeAssetPath(entryPath)}?access_token=${encodeURIComponent(options.authToken.value)}`;
  }

  function taskPreviewFrameKey(task: PlanFormTask, slot: TaskAssetSlot) {
    const previewKey = taskPreviewChannelKey(task, slot);
    const reloadVersion = taskPreviewReloadVersion.value[previewKey] || 0;
    const inlineMode = hasTaskInlinePreview(task, slot);
    return [
      previewKey,
      reloadVersion,
      inlineMode ? 'inline' : 'asset',
      inlineMode ? options.getTaskHtmlSource(task, slot) : taskAssetPreviewUrl(task, slot),
      options.getTaskAssetEntryPath(task, slot),
    ].join('::');
  }

  function taskPreviewFeedback(task: PlanFormTask, slot: TaskAssetSlot) {
    return taskPreviewFeedbackMap.value[taskPreviewChannelKey(task, slot)] || null;
  }

  function clearTaskPreviewDetailExpandedByKey(previewKey: string) {
    if (!(previewKey in taskPreviewDetailExpandedMap.value)) {
      return;
    }
    const nextExpandedMap = { ...taskPreviewDetailExpandedMap.value };
    delete nextExpandedMap[previewKey];
    taskPreviewDetailExpandedMap.value = nextExpandedMap;
  }

  function setTaskPreviewFeedbackByKey(previewKey: string, feedback: TaskPreviewFeedback) {
    clearTaskPreviewDetailExpandedByKey(previewKey);
    taskPreviewFeedbackMap.value = {
      ...taskPreviewFeedbackMap.value,
      [previewKey]: feedback,
    };
  }

  function clearTaskPreviewFeedbackByKey(previewKey: string) {
    if (!(previewKey in taskPreviewFeedbackMap.value)) {
      return;
    }
    const nextFeedbackMap = { ...taskPreviewFeedbackMap.value };
    delete nextFeedbackMap[previewKey];
    taskPreviewFeedbackMap.value = nextFeedbackMap;
    clearTaskPreviewDetailExpandedByKey(previewKey);
  }

  function retryTaskPreview(task: PlanFormTask, slot: TaskAssetSlot) {
    const previewKey = taskPreviewChannelKey(task, slot);
    clearTaskPreviewFeedbackByKey(previewKey);
    taskPreviewReloadVersion.value = {
      ...taskPreviewReloadVersion.value,
      [previewKey]: (taskPreviewReloadVersion.value[previewKey] || 0) + 1,
    };
  }

  function normalizeTaskPreviewDetail(value: unknown, maxLength = 12_000) {
    const normalized = String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u0000/g, '')
      .trim();
    if (!normalized) {
      return '';
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength)}\n...[detail truncated]`;
  }

  function normalizeTaskPreviewText(value: unknown, maxLength = 220) {
    const normalized = normalizeTaskPreviewDetail(value).replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  }

  function buildTaskPreviewFeedback(
    level: TaskPreviewFeedbackLevel,
    title: string,
    message: string,
    detail = ''
  ): TaskPreviewFeedback {
    const normalizedDetail = normalizeTaskPreviewDetail(detail);
    const detailPreview = normalizedDetail ? normalizeTaskPreviewText(normalizedDetail, 320) : '';
    return {
      level,
      title: normalizeTaskPreviewText(title, 120) || title,
      message: normalizeTaskPreviewText(message, 220) || message,
      detail: normalizedDetail,
      detailPreview,
      hasExpandableDetail:
        Boolean(normalizedDetail) && (normalizedDetail.includes('\n') || normalizedDetail.length > 320),
    };
  }

  function isTaskPreviewDetailExpanded(task: PlanFormTask, slot: TaskAssetSlot) {
    return Boolean(taskPreviewDetailExpandedMap.value[taskPreviewChannelKey(task, slot)]);
  }

  function taskPreviewDisplayDetail(task: PlanFormTask, slot: TaskAssetSlot) {
    const feedback = taskPreviewFeedback(task, slot);
    if (!feedback) {
      return '';
    }
    if (!feedback.hasExpandableDetail || isTaskPreviewDetailExpanded(task, slot)) {
      return feedback.detail;
    }
    return feedback.detailPreview;
  }

  function taskPreviewDetailToggleLabel(task: PlanFormTask, slot: TaskAssetSlot) {
    return isTaskPreviewDetailExpanded(task, slot) ? '收起详情' : '展开详情';
  }

  function toggleTaskPreviewDetail(task: PlanFormTask, slot: TaskAssetSlot) {
    const feedback = taskPreviewFeedback(task, slot);
    if (!feedback?.hasExpandableDetail) {
      return;
    }
    const previewKey = taskPreviewChannelKey(task, slot);
    const isExpanded = Boolean(taskPreviewDetailExpandedMap.value[previewKey]);
    if (isExpanded) {
      clearTaskPreviewDetailExpandedByKey(previewKey);
      return;
    }
    taskPreviewDetailExpandedMap.value = {
      ...taskPreviewDetailExpandedMap.value,
      [previewKey]: true,
    };
  }

  function buildTaskPreviewDetailClipboardText(feedback: TaskPreviewFeedback) {
    return [feedback.title, feedback.message, feedback.detail].filter((item) => item.trim()).join('\n\n');
  }

  async function copyTaskPreviewDetail(task: PlanFormTask, slot: TaskAssetSlot) {
    const feedback = taskPreviewFeedback(task, slot);
    if (!feedback?.detail) {
      return;
    }
    await options.copyPlainText(buildTaskPreviewDetailClipboardText(feedback), '错误详情');
  }

  function taskPreviewFeedbackFromRuntimeIssue(issue: TaskPreviewRuntimeIssue | null | undefined) {
    if (!issue) {
      return null;
    }
    const code = normalizeTaskPreviewText(issue.code, 80);
    const message = normalizeTaskPreviewText(issue.message, 160);
    const detail = normalizeTaskPreviewDetail(issue.detail);
    if (!message) {
      return null;
    }
    if (code === 'resource_error') {
      return buildTaskPreviewFeedback(
        'error',
        'Preview resource failed to load',
        message,
        detail || 'Check asset paths and confirm required files have been uploaded.'
      );
    }
    if (code === 'fetch_error' || code === 'http_error' || code === 'response_error') {
      return buildTaskPreviewFeedback(
        'error',
        'Preview request failed',
        message,
        detail || 'Check the request URL, auth state, or backend response.'
      );
    }
    if (code === 'unhandled_rejection') {
      return buildTaskPreviewFeedback(
        'error',
        'Preview has an unhandled async error',
        message,
        detail || 'Check Promise / async logic and make sure errors are handled.'
      );
    }
    return buildTaskPreviewFeedback(
      'error',
      'Preview script failed',
      message,
      detail || 'Check the page script, variable names, and required dependencies.'
    );
  }

  function taskPreviewIssuesFromFrame(frame: HTMLIFrameElement): TaskPreviewRuntimeIssue[] {
    try {
      const runtimeIssues = (
        frame.contentWindow as { __LEARNSITE_PREVIEW_ERRORS__?: unknown } | null
      )?.__LEARNSITE_PREVIEW_ERRORS__;
      if (Array.isArray(runtimeIssues)) {
        return runtimeIssues.filter((item) => item && typeof item === 'object') as TaskPreviewRuntimeIssue[];
      }
    } catch {
      return [];
    }
    return [];
  }

  function taskPreviewDiagnosticFromFrame(frame: HTMLIFrameElement) {
    const documentRef = frame.contentDocument;
    if (!documentRef) {
      return buildTaskPreviewFeedback(
        'error',
        'Preview document is unavailable',
        'The browser did not return a readable document for this preview.',
        'Try reloading the preview or check whether the page was blocked by the browser.'
      );
    }

    const runtimeFeedback = taskPreviewFeedbackFromRuntimeIssue(taskPreviewIssuesFromFrame(frame)[0]);
    if (runtimeFeedback) {
      return runtimeFeedback;
    }

    const contentType = (documentRef.contentType || '').toLowerCase();
    const bodyDetail = normalizeTaskPreviewDetail(documentRef.body?.innerText || '');
    const bodyText = normalizeTaskPreviewText(bodyDetail, 320);
    if (contentType.includes('json')) {
      return buildTaskPreviewFeedback(
        'error',
        'Preview did not return HTML',
        'The preview URL returned an error payload instead of a renderable page.',
        bodyDetail || 'Check the asset URL, auth state, or backend response body.'
      );
    }

    const hasRenderableElements = Boolean(
      documentRef.body?.querySelector(
        'main,section,article,form,table,canvas,svg,img,video,audio,iframe,embed,object,input,button,select,textarea'
      )
    );
    const hasMeaningfulChildren = Boolean(
      documentRef.body &&
        Array.from(documentRef.body.children).some((element) => {
          const tagName = element.tagName.toLowerCase();
          if (['script', 'style', 'link', 'meta', 'base', 'template'].includes(tagName)) {
            return false;
          }
          return Boolean(normalizeTaskPreviewText(element.textContent || '', 80)) || element.childElementCount > 0;
        })
    );

    if (!bodyText && !hasRenderableElements && !hasMeaningfulChildren) {
      return buildTaskPreviewFeedback(
        'warning',
        'Preview loaded but nothing is visible',
        'The current HTML did not render visible content, or the page stopped very early during startup.',
        'Check whether the body has visible output and whether scripts failed during initialization.'
      );
    }

    if (bodyText.startsWith('{"detail"') || bodyText.startsWith('{"code"')) {
      return buildTaskPreviewFeedback(
        'error',
        'Preview returned an error response',
        'The current preview target did not render a normal page.',
        bodyDetail || bodyText
      );
    }

    return null;
  }

  function handleTaskPreviewLoad(task: PlanFormTask, slot: TaskAssetSlot, event: Event) {
    const frame = event.target as HTMLIFrameElement | null;
    if (!frame) {
      return;
    }
    const previewKey = taskPreviewChannelKey(task, slot);
    const feedback = taskPreviewDiagnosticFromFrame(frame);
    if (feedback) {
      setTaskPreviewFeedbackByKey(previewKey, feedback);
      return;
    }
    clearTaskPreviewFeedbackByKey(previewKey);
  }

  function handleTaskPreviewError(task: PlanFormTask, slot: TaskAssetSlot) {
    setTaskPreviewFeedbackByKey(
      taskPreviewChannelKey(task, slot),
      buildTaskPreviewFeedback(
        'error',
        'Preview failed to load',
        'The browser could not open this preview page successfully.',
        'Check the HTML, entry path, or click reload preview to try again.'
      )
    );
  }

  function buildTaskInlinePreviewBaseHref(task: PlanFormTask, slot: TaskAssetSlot) {
    if (!task.id) {
      return window.location.origin;
    }
    const entryPath = options.getTaskAssetEntryPath(task, slot);
    const segments = entryPath
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length <= 1) {
      return options.buildAbsoluteApiUrl(`tasks/${task.id}/assets/${slot}/`);
    }
    const directoryPath = encodeAssetPath(segments.slice(0, -1).join('/'));
    return options.buildAbsoluteApiUrl(`tasks/${task.id}/assets/${slot}/${directoryPath}/`);
  }

  function injectTaskPreviewRuntime(htmlSource: string, runtimeBlocks: string[]) {
    const injection = runtimeBlocks.join('');
    const headOpenMatch = htmlSource.match(/<head\b[^>]*>/i);
    if (headOpenMatch && typeof headOpenMatch.index === 'number') {
      const insertAt = headOpenMatch.index + headOpenMatch[0].length;
      return `${htmlSource.slice(0, insertAt)}${injection}${htmlSource.slice(insertAt)}`;
    }
    const wrappedInjection = `<head>${injection}</head>`;
    const htmlOpenMatch = htmlSource.match(/<html\b[^>]*>/i);
    if (htmlOpenMatch && typeof htmlOpenMatch.index === 'number') {
      const insertAt = htmlOpenMatch.index + htmlOpenMatch[0].length;
      return `${htmlSource.slice(0, insertAt)}${wrappedInjection}${htmlSource.slice(insertAt)}`;
    }
    const doctypeMatch = htmlSource.match(/<!doctype[^>]*>/i);
    if (doctypeMatch && typeof doctypeMatch.index === 'number') {
      const insertAt = doctypeMatch.index + doctypeMatch[0].length;
      return `${htmlSource.slice(0, insertAt)}${wrappedInjection}${htmlSource.slice(insertAt)}`;
    }
    const bodyOpenMatch = htmlSource.match(/<body\b[^>]*>/i);
    if (bodyOpenMatch && typeof bodyOpenMatch.index === 'number') {
      return `${htmlSource.slice(0, bodyOpenMatch.index)}${wrappedInjection}${htmlSource.slice(bodyOpenMatch.index)}`;
    }
    const lowered = htmlSource.toLowerCase();
    const headIndex = lowered.indexOf('</head>');
    if (headIndex >= 0) {
      return `${htmlSource.slice(0, headIndex)}${injection}${htmlSource.slice(headIndex)}`;
    }
    const bodyIndex = lowered.indexOf('</body>');
    if (bodyIndex >= 0) {
      return `${htmlSource.slice(0, bodyIndex)}${injection}${htmlSource.slice(bodyIndex)}`;
    }
    return `${injection}${htmlSource}`;
  }

  function buildTaskInlinePreviewRuntimeScript(task: PlanFormTask, slot: TaskAssetSlot) {
    const entryPath = options.getTaskAssetEntryPath(task, slot);
    const runtimeCookiePath = task.id ? new URL(options.buildAbsoluteApiUrl(`tasks/${task.id}/`)).pathname : '';
    const previewKey = taskPreviewChannelKey(task, slot);
    const previewParentOrigin = window.location.origin;
    const context = {
      taskId: task.id,
      taskType: task.task_type,
      slot,
      assetPath: entryPath,
      assetBasePath: task.id ? options.buildAbsoluteApiUrl(`tasks/${task.id}/assets/${slot}`) : '',
      assetEntryUrl: task.id
        ? options.buildAbsoluteApiUrl(`tasks/${task.id}/assets/${slot}/${encodeAssetPath(entryPath)}`)
        : '',
      taskBasePath: task.id ? options.buildAbsoluteApiUrl(`tasks/${task.id}`) : '',
      apiBasePath: options.buildAbsoluteApiUrl(options.apiBaseUrl),
      config: {
        entry_path: task.config.entry_path,
        submit_entry_path: task.config.submit_entry_path,
        visualization_entry_path: task.config.visualization_entry_path,
        submit_api_path: options.taskDataSubmitApiPath(task),
        records_api_path: options.taskDataSubmitRecordsPath(task),
      },
      dataSubmit: {
        endpointToken: task.config.endpoint_token.trim(),
        submitApiPath: options.taskDataSubmitApiPath(task),
        recordsApiPath: options.taskDataSubmitRecordsPath(task),
      },
    };
    const previewStorageKey = `learnsite:lesson-plan-inline-preview:${task.id || task.key}`;
    return [
      '<script>',
      '(function(){',
      `const context=${JSON.stringify(context)};`,
      `const authToken=${JSON.stringify(options.authToken.value || '')};`,
      `const previewKey=${JSON.stringify(previewKey)};`,
      `const previewParentOrigin=${JSON.stringify(previewParentOrigin)};`,
      `const runtimeCookiePath=${JSON.stringify(runtimeCookiePath)};`,
      `const previewStorageKey=${JSON.stringify(previewStorageKey)};`,
      `const previewPersisted=${options.isTaskPersisted(task) ? 'true' : 'false'};`,
      `const submitApiPath=${JSON.stringify(options.taskDataSubmitApiPath(task))};`,
      `const recordsApiPath=${JSON.stringify(options.taskDataSubmitRecordsPath(task))};`,
      'window.__LEARNSITE_TASK_CONTEXT__=context;',
      'const previewErrors=[];',
      'const previewErrorKeys=new Set();',
      'window.__LEARNSITE_PREVIEW_ERRORS__=previewErrors;',
      'const reportPreviewIssue=(code,message,detail)=>{const normalizedMessage=String(message||"Preview failed").trim()||"Preview failed";const normalizedDetail=String(detail||"").trim();const dedupeKey=[code,normalizedMessage,normalizedDetail].join("::");if(previewErrorKeys.has(dedupeKey)){return;}previewErrorKeys.add(dedupeKey);const payload={code,message:normalizedMessage,detail:normalizedDetail};if(previewErrors.length<12){previewErrors.push(payload);}try{if(window.parent&&window.parent!==window){window.parent.postMessage({source:"learnsite-task-preview",previewKey,code:payload.code,message:payload.message,detail:payload.detail},previewParentOrigin||"*");}}catch(error){}};',
      'if(authToken&&runtimeCookiePath){document.cookie=`learnsite_task_token=${encodeURIComponent(authToken)}; path=${runtimeCookiePath}; SameSite=Lax`;}',
      'window.addEventListener("error",(event)=>{const target=event.target;if(target&&target!==window&&typeof HTMLElement!=="undefined"&&target instanceof HTMLElement){const source=target.getAttribute("src")||target.getAttribute("href")||"";reportPreviewIssue("resource_error",String(target.tagName||"RESOURCE").toUpperCase()+" resource failed to load",source);return;}const location=[event.filename||"",event.lineno||"",event.colno||""].filter(Boolean).join(":");const stack=event.error&&typeof event.error==="object"&&"stack" in event.error?String(event.error.stack||""):"";reportPreviewIssue("runtime_error",event.message||"Page script failed",stack||location);},true);',
      'window.addEventListener("unhandledrejection",(event)=>{const reason=event.reason;const message=reason&&typeof reason==="object"&&"message" in reason?String(reason.message||""):String(reason||"");const detail=reason&&typeof reason==="object"&&"stack" in reason?String(reason.stack||""):"Check Promise / async logic.";reportPreviewIssue("unhandled_rejection",message||"Page has an unhandled async error",detail||"Check Promise / async logic.");});',
      'const nativeFetch=window.fetch.bind(window);',
      'const toAbsoluteUrl=(input)=>{try{if(typeof input==="string"){return new URL(input,window.location.href).toString();}if(input&&typeof input.url==="string"){return new URL(input.url,window.location.href).toString();}}catch(error){}return String(input||"");};',
      'const previewRequestOrigin=previewParentOrigin||window.location.origin||"";',
      'const isSameOriginTarget=(value)=>{try{return new URL(value,window.location.href).origin===previewRequestOrigin;}catch(error){return false;}};',
      'const buildJsonResponse=(payload,status)=>new Response(JSON.stringify(payload),{status:status||200,headers:{"Content-Type":"application/json"}});',
      'const readPreviewItems=()=>{try{const raw=window.localStorage.getItem(previewStorageKey)||"[]";const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed:[];}catch(error){return [];}};',
      'const writePreviewItems=(items)=>{try{window.localStorage.setItem(previewStorageKey,JSON.stringify(items));}catch(error){}};',
      'const previewFetch=async (input,init)=>{',
      'const absoluteUrl=toAbsoluteUrl(input);',
      'if(context.taskType==="data_submit"&&!previewPersisted){',
      'if(submitApiPath&&absoluteUrl===submitApiPath){',
      'const requestInit=Object.assign({},init||{});',
      'let payload={};',
      'if(typeof requestInit.body==="string"&&requestInit.body){try{payload=JSON.parse(requestInit.body);}catch(error){payload={raw_body:requestInit.body};}}',
      'const items=readPreviewItems();',
      'const nextItem={id:Date.now(),payload,created_at:new Date().toISOString(),submitted_by:{display_name:"Preview student"}};',
      'items.unshift(nextItem);',
      'writePreviewItems(items);',
      'return buildJsonResponse({code:"OK",message:"preview",data:{item:nextItem,count:items.length}},200);',
      '}',
      'if(recordsApiPath&&absoluteUrl===recordsApiPath){',
      'const items=readPreviewItems();',
      'return buildJsonResponse({code:"OK",message:"preview",data:{count:items.length,items}},200);',
      '}',
      '}',
      'const requestInit=Object.assign({credentials:"same-origin"},init||{});',
      'const baseHeaders=requestInit.headers||((typeof Request!=="undefined"&&input instanceof Request)?input.headers:undefined)||{};',
      'const headers=new Headers(baseHeaders);',
      'if(authToken&&absoluteUrl&&isSameOriginTarget(absoluteUrl)&&!headers.has("Authorization")){headers.set("Authorization",`Bearer ${authToken}`);}',
      'requestInit.headers=headers;',
      'let response;',
      'try{response=await nativeFetch(input,requestInit);}catch(error){reportPreviewIssue("fetch_error",error instanceof Error?error.message:String(error||"Request failed"),absoluteUrl);throw error;}',
      'if(response&&response.status>=400&&absoluteUrl&&isSameOriginTarget(absoluteUrl)){reportPreviewIssue("http_error",`Request returned ${response.status}`,absoluteUrl);}',
      'return response;',
      '};',
      'window.fetch=previewFetch;',
      'window.__LEARNSITE_TASK_HELPERS__={',
      'fetch:previewFetch,',
      'async getJson(input,init){const response=await previewFetch(input,init);if(!response.ok){throw new Error((await response.text())||`Request failed: ${response.status}`);}return response.json();},',
      'async postJson(input,data,init){const options=Object.assign({},init||{});const headers=new Headers(options.headers||{});if(!headers.has("Content-Type")){headers.set("Content-Type","application/json");}options.method=options.method||"POST";options.headers=headers;options.body=JSON.stringify(data);return previewFetch(input,options);}',
      '};',
      '})();',
      '</scr' + 'ipt>',
    ].join('');
  }

  function taskInlinePreviewSrcdoc(task: PlanFormTask, slot: TaskAssetSlot) {
    const htmlSource = options.getTaskHtmlSource(task, slot).trim();
    if (!htmlSource) {
      return '';
    }
    const baseHref = buildTaskInlinePreviewBaseHref(task, slot);
    const baseBlock = `<base href="${baseHref}" />`;
    return injectTaskPreviewRuntime(htmlSource, [baseBlock, buildTaskInlinePreviewRuntimeScript(task, slot)]);
  }

  function handleTaskPreviewMessage(event: MessageEvent) {
    if (!isTaskPreviewMessagePayload(event.data)) {
      return;
    }
    const feedback = taskPreviewFeedbackFromRuntimeIssue({
      code: event.data.code,
      message: event.data.message,
      detail: event.data.detail,
    });
    if (!feedback) {
      return;
    }
    setTaskPreviewFeedbackByKey(event.data.previewKey, feedback);
  }

  async function uploadTaskAssets(
    task: PlanFormTask,
    slot: TaskAssetSlot,
    files: File[],
    paths: string[]
  ) {
    if (!options.authToken.value) {
      throw new Error('请先登录教师账号');
    }
    if (!options.canUploadTaskAssets(task)) {
      throw new Error('请先保存学案，再上传任务页面资源');
    }
    if (!files.length) {
      throw new Error('请选择要上传的文件');
    }
    if (uploadingTaskAssetKey.value === `${task.key}:${slot}`) {
      return;
    }

    uploadingTaskAssetKey.value = `${task.key}:${slot}`;
    try {
      const formData = new FormData();
      formData.append('slot', slot);
      formData.append('entry_path', options.getTaskAssetEntryPath(task, slot));
      formData.append('clear_existing', 'true');
      formData.append('extract_zip', 'true');
      files.forEach((file, index) => {
        formData.append('files', file);
        if (paths[index]) {
          formData.append('paths', paths[index]);
        }
      });

      const response = await apiUpload<TaskAssetUploadResponse>(
        `/lesson-plans/staff/tasks/${task.id}/assets`,
        formData,
        options.authToken.value
      );

      if (response.entry_path) {
        options.setTaskAssetEntryPath(task, slot, response.entry_path);
      }
      options.mergeTaskConfigFromServer(task, response.config);
      options.revealTaskPreview(task, slot);
      ElMessage.success('任务页面资源已更新');
    } finally {
      uploadingTaskAssetKey.value = null;
    }
  }

  async function handleTaskAssetChange(
    task: PlanFormTask,
    slot: TaskAssetSlot,
    isFolder: boolean,
    event: Event
  ) {
    const input = event.target as HTMLInputElement | null;
    const selectedFiles = input?.files ? Array.from(input.files) : [];
    if (!selectedFiles.length) {
      return;
    }

    const paths = selectedFiles.map((file) => {
      const withRelativePath = file as File & { webkitRelativePath?: string };
      return isFolder ? withRelativePath.webkitRelativePath || file.name : file.name;
    });

    try {
      await uploadTaskAssets(task, slot, selectedFiles, paths);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传任务资源失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  async function persistTaskHtmlSource(task: PlanFormTask, slot: TaskAssetSlot) {
    const html = options.getTaskHtmlSource(task, slot).trim();
    if (!html) {
      throw new Error('请先填写 HTML 源码内容');
    }

    const entryPath = options.getTaskAssetEntryPath(task, slot);
    const fileName = entryPath.split('/').filter(Boolean).pop() || 'index.html';
    const htmlFile = new File([html], fileName, { type: 'text/html' });
    await uploadTaskAssets(task, slot, [htmlFile], [entryPath]);
  }

  async function uploadTaskHtmlSource(task: PlanFormTask, slot: TaskAssetSlot) {
    try {
      await persistTaskHtmlSource(task, slot);
      ElMessage.success('HTML 源码已保存为任务页面');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存任务页面失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    }
  }

  async function generateTaskHtmlAndUpload(
    task: PlanFormTask,
    slot: TaskAssetSlot,
    optionsOverride?: TaskHtmlPromptBuildOptions,
    requestHtmlDraftOverride?: (prompt: string) => Promise<string>
  ) {
    const loadingKey = options.taskAssetGenerationKey(task, slot);
    options.generatingTaskHtmlKey.value = loadingKey;
    try {
      const requestHtmlDraft = requestHtmlDraftOverride || options.requestHtmlDraft;
      const html = await requestHtmlDraft(options.buildTaskHtmlPrompt(task, slot, optionsOverride));
      options.setTaskHtmlSource(task, slot, html);
      options.revealTaskPreview(task, slot);
      if (options.canUploadTaskAssets(task)) {
        await persistTaskHtmlSource(task, slot);
        ElMessage.success('任务页面已生成并同步到资源文件');
      } else {
        ElMessage.success('任务页面源码已生成，可直接在下方预览；保存学案后再上传为正式页面资源。');
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成任务页面失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
      return false;
    } finally {
      if (options.generatingTaskHtmlKey.value === loadingKey) {
        options.generatingTaskHtmlKey.value = null;
      }
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleTaskPreviewMessage);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('message', handleTaskPreviewMessage);
  });

  return {
    uploadingTaskAssetKey,
    taskPreviewFeedbackMap,
    taskPreviewDetailExpandedMap,
    taskPreviewReloadVersion,
    taskAssetInputId,
    openTaskAssetPicker,
    taskPreviewFrameKey,
    taskAssetPreviewUrl,
    hasTaskInlinePreview,
    taskPreviewFeedback,
    taskPreviewDisplayDetail,
    taskPreviewDetailToggleLabel,
    toggleTaskPreviewDetail,
    copyTaskPreviewDetail,
    retryTaskPreview,
    handleTaskPreviewLoad,
    handleTaskPreviewError,
    taskInlinePreviewSrcdoc,
    handleTaskAssetChange,
    uploadTaskHtmlSource,
    generateTaskHtmlAndUpload,
  };
}
