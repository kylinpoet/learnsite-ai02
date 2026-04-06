import { computed, ref } from 'vue';

import type {
  LessonPlanDraftState,
  PersistedLessonPlanDraft,
  PlanDetail,
  PlanEditorTab,
  PlanFormTask,
  TaskAssetManifestItem,
  TaskConfigState,
} from '../lessonPlan.types';

type UseLessonPlanEditorStateOptions = {
  normalizeTaskSubmissionScope: (taskType: string, currentScope?: string) => string;
  generateTaskEndpointToken: () => string;
  ensureDataSubmitTaskConfig: (task: PlanFormTask) => void;
};

export function useLessonPlanEditorState(options: UseLessonPlanEditorStateOptions) {
  const editorVisible = ref(false);
  const editingPlanId = ref<number | null>(null);
  const taskSeed = ref(1);
  const editorActiveTab = ref<PlanEditorTab>('content');
  const activeTaskEditorKey = ref('');
  const committedEditorSnapshot = ref('');
  let draftAutoSaveTimer: number | null = null;

  const planForm = ref({
    lesson_id: null as number | null,
    title: '',
    content: '',
    content_mode: 'visual' as 'visual' | 'source',
    assigned_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    tasks: [] as PlanFormTask[],
  });

  const currentEditorSnapshot = computed(() => serializeCurrentEditorState());
  const hasUnsavedChanges = computed(
    () => editorVisible.value && currentEditorSnapshot.value !== committedEditorSnapshot.value
  );

  function createEmptyTaskConfig(): TaskConfigState {
    return {
      topic: '',
      entry_path: 'index.html',
      assets: [],
      entry_html_source: '',
      entry_editor_tab: 'source',
      endpoint_token: '',
      submit_entry_path: 'index.html',
      visualization_entry_path: 'index.html',
      submit_assets: [],
      visualization_assets: [],
      submit_html_source: '',
      visualization_html_source: '',
      submit_api_path: '',
      records_api_path: '',
      data_submit_active_tab: 'submit',
      submit_editor_tab: 'source',
      visualization_editor_tab: 'source',
    };
  }

  function parseAssetManifest(value: unknown): TaskAssetManifestItem[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        path: typeof item.path === 'string' ? item.path : '',
        size_kb: typeof item.size_kb === 'number' ? item.size_kb : 0,
        mime_type: typeof item.mime_type === 'string' ? item.mime_type : null,
        slot: typeof item.slot === 'string' ? item.slot : undefined,
      }))
      .filter((item) => item.path);
  }

  function normalizeTaskConfigState(taskType: string, rawConfig: unknown): TaskConfigState {
    const base = createEmptyTaskConfig();
    if (!rawConfig || typeof rawConfig !== 'object') {
      if (taskType === 'data_submit' && !base.endpoint_token) {
        base.endpoint_token = options.generateTaskEndpointToken();
      }
      return base;
    }
    const config = rawConfig as Record<string, unknown>;
    base.topic = typeof config.topic === 'string' ? config.topic : '';
    base.entry_path = typeof config.entry_path === 'string' ? config.entry_path : base.entry_path;
    base.assets = parseAssetManifest(config.assets);
    base.entry_html_source = typeof config.entry_html_source === 'string' ? config.entry_html_source : '';
    base.entry_editor_tab = config.entry_editor_tab === 'preview' ? 'preview' : 'source';
    base.endpoint_token = typeof config.endpoint_token === 'string' ? config.endpoint_token : '';
    base.submit_entry_path =
      typeof config.submit_entry_path === 'string' ? config.submit_entry_path : base.submit_entry_path;
    base.visualization_entry_path =
      typeof config.visualization_entry_path === 'string'
        ? config.visualization_entry_path
        : base.visualization_entry_path;
    base.submit_assets = parseAssetManifest(config.submit_assets);
    base.visualization_assets = parseAssetManifest(config.visualization_assets);
    base.submit_html_source = typeof config.submit_html_source === 'string' ? config.submit_html_source : '';
    base.visualization_html_source =
      typeof config.visualization_html_source === 'string' ? config.visualization_html_source : '';
    base.submit_api_path = typeof config.submit_api_path === 'string' ? config.submit_api_path : '';
    base.records_api_path = typeof config.records_api_path === 'string' ? config.records_api_path : '';
    base.data_submit_active_tab = config.data_submit_active_tab === 'visualization' ? 'visualization' : 'submit';
    base.submit_editor_tab = config.submit_editor_tab === 'preview' ? 'preview' : 'source';
    base.visualization_editor_tab = config.visualization_editor_tab === 'preview' ? 'preview' : 'source';

    if (taskType === 'data_submit' && !base.endpoint_token) {
      base.endpoint_token = options.generateTaskEndpointToken();
    }
    return base;
  }

  function createEmptyTask(): PlanFormTask {
    const currentSeed = taskSeed.value++;
    return {
      id: null,
      key: `task-${currentSeed}`,
      title: '',
      task_type: 'rich_text',
      submission_scope: 'individual',
      description: '',
      description_mode: 'visual',
      config: createEmptyTaskConfig(),
      is_required: true,
      linked_template_id: null,
    };
  }

  function duplicateTaskTitle(title: string) {
    const normalized = title.trim() || '任务';
    const nextTitle = `${normalized}（副本）`;
    return nextTitle.slice(0, 120);
  }

  function cloneTaskConfigState(config: TaskConfigState): TaskConfigState {
    return {
      ...config,
      assets: config.assets.map((item) => ({ ...item })),
      submit_assets: config.submit_assets.map((item) => ({ ...item })),
      visualization_assets: config.visualization_assets.map((item) => ({ ...item })),
    };
  }

  function clonePlanFormTask(task: PlanFormTask): PlanFormTask {
    return {
      ...task,
      config: cloneTaskConfigState(task.config),
    };
  }

  function buildCurrentDraftState(): LessonPlanDraftState {
    return {
      lesson_id: planForm.value.lesson_id,
      title: planForm.value.title,
      content: planForm.value.content,
      content_mode: planForm.value.content_mode,
      assigned_date: planForm.value.assigned_date,
      status: planForm.value.status,
      tasks: planForm.value.tasks.map((task) => clonePlanFormTask(task)),
      editor_active_tab: editorActiveTab.value,
      active_task_editor_key: activeTaskEditorKey.value,
    };
  }

  function serializeDraftState(state: LessonPlanDraftState) {
    return JSON.stringify(state);
  }

  function serializeCurrentEditorState() {
    return serializeDraftState(buildCurrentDraftState());
  }

  function lessonPlanDraftStorageKey(planId: number | null) {
    return `learnsite:lesson-plan-draft:${planId ?? 'new'}`;
  }

  function clearLessonPlanDraft(planId: number | null) {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(lessonPlanDraftStorageKey(planId));
  }

  function readLessonPlanDraft(planId: number | null): PersistedLessonPlanDraft | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(lessonPlanDraftStorageKey(planId));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as PersistedLessonPlanDraft;
      if (parsed?.version !== 1 || !parsed.state) {
        clearLessonPlanDraft(planId);
        return null;
      }
      return parsed;
    } catch {
      clearLessonPlanDraft(planId);
      return null;
    }
  }

  function persistCurrentEditorDraft() {
    if (typeof window === 'undefined' || !editorVisible.value) {
      return;
    }
    const draftPlanId = editingPlanId.value;
    if (!hasUnsavedChanges.value) {
      clearLessonPlanDraft(draftPlanId);
      return;
    }
    const payload: PersistedLessonPlanDraft = {
      version: 1,
      saved_at: new Date().toISOString(),
      state: buildCurrentDraftState(),
    };
    window.localStorage.setItem(lessonPlanDraftStorageKey(draftPlanId), JSON.stringify(payload));
  }

  function clearDraftAutoSaveTimer() {
    if (draftAutoSaveTimer !== null) {
      window.clearTimeout(draftAutoSaveTimer);
      draftAutoSaveTimer = null;
    }
  }

  function scheduleDraftAutoSave() {
    clearDraftAutoSaveTimer();
    if (!editorVisible.value || !hasUnsavedChanges.value) {
      return;
    }
    draftAutoSaveTimer = window.setTimeout(() => {
      persistCurrentEditorDraft();
      draftAutoSaveTimer = null;
    }, 900);
  }

  function markEditorCommitted(snapshot?: string) {
    committedEditorSnapshot.value = snapshot ?? currentEditorSnapshot.value;
  }

  function applyDraftState(state: LessonPlanDraftState) {
    const nextTasks =
      state.tasks.length > 0
        ? state.tasks.map((task) => {
            const normalizedTask: PlanFormTask = {
              id: typeof task.id === 'number' ? task.id : null,
              key: task.key || createEmptyTask().key,
              title: task.title || '',
              task_type: task.task_type || 'rich_text',
              submission_scope: options.normalizeTaskSubmissionScope(task.task_type, task.submission_scope),
              description: task.description || '',
              description_mode: task.description_mode === 'source' ? 'source' : 'visual',
              config: normalizeTaskConfigState(task.task_type, task.config),
              is_required: task.is_required !== false,
              linked_template_id: typeof task.linked_template_id === 'number' ? task.linked_template_id : null,
            };
            options.ensureDataSubmitTaskConfig(normalizedTask);
            return normalizedTask;
          })
        : [createEmptyTask()];

    planForm.value = {
      lesson_id: state.lesson_id ?? null,
      title: state.title || '',
      content: state.content || '',
      content_mode: state.content_mode === 'source' ? 'source' : 'visual',
      assigned_date: state.assigned_date || new Date().toISOString().slice(0, 10),
      status: state.status || 'draft',
      tasks: nextTasks,
    };
    editorActiveTab.value = state.editor_active_tab === 'tasks' ? 'tasks' : 'content';
    activeTaskEditorKey.value = state.active_task_editor_key || nextTasks[0]?.key || '';
  }

  function restoreLessonPlanDraft(planId: number | null) {
    const draft = readLessonPlanDraft(planId);
    if (!draft?.state) {
      return false;
    }
    try {
      applyDraftState(draft.state);
    } catch {
      clearLessonPlanDraft(planId);
      return false;
    }
    return true;
  }

  function fillFormWithPlan(plan: PlanDetail) {
    const tasks =
      plan.tasks.length > 0
        ? plan.tasks.map((task) => {
            const nextTask: PlanFormTask = {
              id: task.id,
              key: `task-${task.id}`,
              title: task.title,
              task_type: task.task_type,
              submission_scope: options.normalizeTaskSubmissionScope(task.task_type, task.submission_scope),
              description: task.description || '',
              description_mode: 'visual',
              config: normalizeTaskConfigState(task.task_type, task.config),
              is_required: task.is_required,
              linked_template_id: null,
            };
            options.ensureDataSubmitTaskConfig(nextTask);
            return nextTask;
          })
        : [createEmptyTask()];

    planForm.value = {
      lesson_id: plan.lesson.id,
      title: plan.title,
      content: plan.content || '',
      content_mode: 'visual',
      assigned_date: plan.assigned_date,
      status: plan.status,
      tasks,
    };
    editorActiveTab.value = 'content';
    activeTaskEditorKey.value = tasks[0]?.key || '';
  }

  function resetPlanForm() {
    const initialTask = createEmptyTask();
    planForm.value = {
      lesson_id: null,
      title: '',
      content: '',
      content_mode: 'visual',
      assigned_date: new Date().toISOString().slice(0, 10),
      status: 'draft',
      tasks: [initialTask],
    };
    editorActiveTab.value = 'content';
    activeTaskEditorKey.value = initialTask.key;
  }

  function activateBlankPlanEditor(options?: { skipDraftRestore?: boolean }) {
    editingPlanId.value = null;
    editorVisible.value = true;
    resetPlanForm();
    if (!options?.skipDraftRestore) {
      restoreLessonPlanDraft(null);
    }
    markEditorCommitted();
  }

  function activatePlanEditor(plan: PlanDetail, options?: { skipDraftRestore?: boolean }) {
    editingPlanId.value = plan.id;
    editorVisible.value = true;
    fillFormWithPlan(plan);
    if (!options?.skipDraftRestore) {
      restoreLessonPlanDraft(plan.id);
    }
    markEditorCommitted();
  }

  function cancelPlanEditing(selectedPlanDetail: PlanDetail | null) {
    clearLessonPlanDraft(editingPlanId.value);
    if (selectedPlanDetail) {
      activatePlanEditor(selectedPlanDetail, { skipDraftRestore: true });
      return;
    }
    editingPlanId.value = null;
    editorVisible.value = false;
    resetPlanForm();
    markEditorCommitted();
  }

  return {
    editorVisible,
    editingPlanId,
    editorActiveTab,
    activeTaskEditorKey,
    planForm,
    currentEditorSnapshot,
    hasUnsavedChanges,
    createEmptyTaskConfig,
    parseAssetManifest,
    normalizeTaskConfigState,
    createEmptyTask,
    duplicateTaskTitle,
    cloneTaskConfigState,
    clonePlanFormTask,
    clearLessonPlanDraft,
    persistCurrentEditorDraft,
    clearDraftAutoSaveTimer,
    scheduleDraftAutoSave,
    markEditorCommitted,
    resetPlanForm,
    activateBlankPlanEditor,
    activatePlanEditor,
    cancelPlanEditing,
  };
}
