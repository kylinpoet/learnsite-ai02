import type { PlanDetail, PlanFormTask, TaskAssetEditorBindings, TaskAssetSlot } from '../../lessonPlan.types';
import type {
  StudentPreviewFrame,
  StudentPreviewPlan,
  StudentPreviewResource,
  StudentPreviewTask,
} from './studentViewPreview.types';

export const STUDENT_PREVIEW_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function encodeAssetPath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function buildStudentPreviewAssetUrl(
  taskId: number | null,
  slot: TaskAssetSlot,
  entryPath: string,
  token: string | null | undefined
): string {
  if (!taskId || !entryPath.trim() || !token) {
    return '';
  }
  const apiRoot = STUDENT_PREVIEW_API_BASE.endsWith('/')
    ? STUDENT_PREVIEW_API_BASE
    : `${STUDENT_PREVIEW_API_BASE}/`;
  const relativePath = `tasks/${taskId}/assets/${slot}/${encodeAssetPath(entryPath)}`;
  const absoluteUrl = new URL(relativePath, new URL(apiRoot, window.location.origin)).toString();
  const url = new URL(absoluteUrl);
  url.searchParams.set('access_token', token);
  return url.toString();
}

function frameFromParts(input: {
  mode: 'src' | 'srcdoc';
  value: string;
}): StudentPreviewFrame {
  if (!input.value.trim()) {
    return { mode: 'none', value: '' };
  }
  return input;
}

export function emptyStudentPreviewFrame(): StudentPreviewFrame {
  return { mode: 'none', value: '' };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 学生端活动页在描述为空时会展示服务端生成的默认说明，预览保持同样文案 */
function buildFallbackTaskDescription(planTitle: string, taskTitle: string, lessonLabel: string) {
  return [
    `<p>请围绕《${escapeHtml(planTitle)}》中的“${escapeHtml(taskTitle)}”完成学习作品。</p>`,
    '<p>你可以填写作品说明，也可以上传附件；提交后即保存，教师评价前可再次提交覆盖。</p>',
    lessonLabel ? `<p>当前课次属于“${escapeHtml(lessonLabel)}”。</p>` : '',
  ].join('');
}

function buildFallbackPlanContent(planTitle: string, lessonLabel: string) {
  return [
    `<p>欢迎进入《${escapeHtml(planTitle)}》。</p>`,
    lessonLabel
      ? `<p>本课次属于“${escapeHtml(lessonLabel)}”，教师可以在这里发布导读、步骤说明、图片或参考资料。</p>`
      : '<p>这份学案暂未绑定课次，教师可以先保存草稿，后续再绑定到课程体系中。</p>',
  ].join('');
}

function lessonLabelOf(unitTitle: string, lessonTitle: string) {
  return [unitTitle, lessonTitle].filter(Boolean).join(' / ');
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readAssets(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item)) : [];
}

function buildDetailTaskFrame(input: {
  taskId: number;
  slot: TaskAssetSlot;
  entryPath: string;
  assets: unknown[];
  token: string | null | undefined;
}): StudentPreviewFrame {
  if (!input.assets.length || !input.entryPath.trim()) {
    return emptyStudentPreviewFrame();
  }
  const url = buildStudentPreviewAssetUrl(input.taskId, input.slot, input.entryPath, input.token);
  return frameFromParts({ mode: 'src', value: url });
}

function normalizeResource(item: Record<string, unknown>): StudentPreviewResource | null {
  const id = readNumber(item.id);
  if (id === null) {
    return null;
  }
  return {
    id,
    title: readString(item.title) || '未命名资源',
    resourceType: readString(item.resource_type),
    summary: readString(item.summary) || null,
    externalUrl: readString(item.external_url) || null,
  };
}

export function buildStudentPreviewPlanFromDetail(input: {
  plan: PlanDetail;
  token: string | null | undefined;
}): StudentPreviewPlan {
  const { plan, token } = input;
  const lessonLabel = lessonLabelOf(plan.lesson?.unit_title || '', plan.lesson?.title || '');
  const tasks: StudentPreviewTask[] = plan.tasks.map((task) => {
    const config = (task.config || {}) as Record<string, unknown>;
    const taskId = task.id;
    const webFrame =
      task.task_type === 'web_page' && taskId
        ? buildDetailTaskFrame({
            taskId,
            slot: 'web',
            entryPath: readString(config.entry_path),
            assets: readAssets(config.assets),
            token,
          })
        : emptyStudentPreviewFrame();
    const submitFrame =
      task.task_type === 'data_submit' && taskId
        ? buildDetailTaskFrame({
            taskId,
            slot: 'data_submit_form',
            entryPath: readString(config.submit_entry_path),
            assets: readAssets(config.submit_assets),
            token,
          })
        : emptyStudentPreviewFrame();
    const visualizationFrame =
      task.task_type === 'data_submit' && taskId
        ? buildDetailTaskFrame({
            taskId,
            slot: 'data_submit_visualization',
            entryPath: readString(config.visualization_entry_path),
            assets: readAssets(config.visualization_assets),
            token,
          })
        : emptyStudentPreviewFrame();

    const resources = Array.isArray(task.resources)
      ? task.resources
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map(normalizeResource)
          .filter((item): item is StudentPreviewResource => item !== null)
      : [];

    return {
      key: `task-${task.id}`,
      id: task.id,
      title: task.title,
      taskType: task.task_type,
      submissionScope: task.submission_scope,
      description: task.description || buildFallbackTaskDescription(plan.title, task.title, lessonLabel),
      isRequired: task.is_required,
      topic: readString(config.topic),
      resources,
      frames: {
        web: webFrame,
        submit: submitFrame,
        visualization: visualizationFrame,
      },
    };
  });

  return {
    title: plan.title,
    content: plan.content || buildFallbackPlanContent(plan.title, lessonLabel),
    bookTitle: plan.lesson?.book_name || '',
    unitTitle: plan.lesson?.unit_title || '',
    lessonTitle: plan.lesson?.title || '',
    assignedDate: plan.assigned_date,
    tasks,
  };
}

function buildFormTaskFrame(input: {
  task: PlanFormTask;
  slot: TaskAssetSlot;
  assets: unknown[];
  entryPath: string;
  assetBindings: TaskAssetEditorBindings;
}): StudentPreviewFrame {
  const { task, slot, assetBindings } = input;
  // 已保存的活动一律走服务端页面，和学生在活动页里看到的一致，
  // 且 iframe 的写请求会被预览中继拦掉，不会产生真实提交。
  if (task.id) {
    if (!input.assets.length || !input.entryPath.trim()) {
      return emptyStudentPreviewFrame();
    }
    const assetUrl = assetBindings.taskAssetPreviewUrl(task, slot);
    return frameFromParts({ mode: 'src', value: assetUrl });
  }
  // 尚未保存的新活动退回内联源码预览，便于教师在看学生页面的同时检查当前编辑内容。
  if (assetBindings.hasTaskInlinePreview(task, slot)) {
    return frameFromParts({ mode: 'srcdoc', value: assetBindings.taskInlinePreviewSrcdoc(task, slot) });
  }
  return emptyStudentPreviewFrame();
}

export function buildStudentPreviewPlanFromForm(input: {
  title: string;
  content: string;
  assignedDate: string;
  bookTitle: string;
  unitTitle: string;
  lessonTitle: string;
  tasks: PlanFormTask[];
  assetBindings: TaskAssetEditorBindings;
  resourcesByTaskId: Record<number, StudentPreviewResource[]>;
}): StudentPreviewPlan {
  const lessonLabel = lessonLabelOf(input.unitTitle, input.lessonTitle);
  const tasks: StudentPreviewTask[] = input.tasks.map((task) => ({
    key: task.key,
    id: task.id,
    title: task.title,
    taskType: task.task_type,
    submissionScope: task.submission_scope,
    description: task.description || buildFallbackTaskDescription(input.title, task.title, lessonLabel),
    isRequired: task.is_required,
    topic: task.config.topic,
    resources: task.id ? input.resourcesByTaskId[task.id] || [] : [],
    frames: {
      web:
        task.task_type === 'web_page'
          ? buildFormTaskFrame({
              task,
              slot: 'web',
              assets: task.config.assets,
              entryPath: task.config.entry_path,
              assetBindings: input.assetBindings,
            })
          : emptyStudentPreviewFrame(),
      submit:
        task.task_type === 'data_submit'
          ? buildFormTaskFrame({
              task,
              slot: 'data_submit_form',
              assets: task.config.submit_assets,
              entryPath: task.config.submit_entry_path,
              assetBindings: input.assetBindings,
            })
          : emptyStudentPreviewFrame(),
      visualization:
        task.task_type === 'data_submit'
          ? buildFormTaskFrame({
              task,
              slot: 'data_submit_visualization',
              assets: task.config.visualization_assets,
              entryPath: task.config.visualization_entry_path,
              assetBindings: input.assetBindings,
            })
          : emptyStudentPreviewFrame(),
    },
  }));

  return {
    title: input.title,
    content: input.content || buildFallbackPlanContent(input.title, lessonLabel),
    bookTitle: input.bookTitle,
    unitTitle: input.unitTitle,
    lessonTitle: input.lessonTitle,
    assignedDate: input.assignedDate,
    tasks,
  };
}

export function collectStudentPreviewResources(plan: PlanDetail | null): Record<number, StudentPreviewResource[]> {
  const result: Record<number, StudentPreviewResource[]> = {};
  if (!plan) {
    return result;
  }
  for (const task of plan.tasks) {
    const resources = Array.isArray(task.resources)
      ? task.resources
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map(normalizeResource)
          .filter((item): item is StudentPreviewResource => item !== null)
      : [];
    if (resources.length) {
      result[task.id] = resources;
    }
  }
  return result;
}
