export type PlanSummary = {
  id: number;
  title: string;
  status: string;
  assigned_date: string;
  task_count: number;
  lesson: {
    id: number;
    title: string;
    lesson_no: number;
    unit_title: string;
    book_name: string;
  };
  progress: {
    pending_count: number;
    completed_count: number;
  };
};

export type PlanDetail = PlanSummary & {
  content: string | null;
  tasks: Array<{
    id: number;
    title: string;
    task_type: string;
    submission_scope: string;
    description: string | null;
    config: Record<string, unknown> | null;
    sort_order: number;
    is_required: boolean;
  }>;
};

export type TaskAssetSlot = 'web' | 'data_submit_form' | 'data_submit_visualization';
export type TaskAssetPickerMode = 'files' | 'folder';
export type TaskSlotEditorTab = 'source' | 'preview';

export type TaskAssetManifestItem = {
  path: string;
  size_kb: number;
  mime_type?: string | null;
  slot?: string;
};

export type TaskConfigState = {
  topic: string;
  entry_path: string;
  assets: TaskAssetManifestItem[];
  entry_html_source: string;
  entry_editor_tab: TaskSlotEditorTab;
  endpoint_token: string;
  submit_entry_path: string;
  visualization_entry_path: string;
  submit_assets: TaskAssetManifestItem[];
  visualization_assets: TaskAssetManifestItem[];
  submit_html_source: string;
  visualization_html_source: string;
  submit_api_path: string;
  records_api_path: string;
  data_submit_active_tab: 'submit' | 'visualization';
  submit_editor_tab: TaskSlotEditorTab;
  visualization_editor_tab: TaskSlotEditorTab;
};

export type CurriculumBook = {
  id: number;
  name: string;
  edition: string;
  units: Array<{
    id: number;
    title: string;
    lessons: Array<{
      id: number;
      title: string;
      lesson_no: number;
    }>;
  }>;
};

export type LessonOptionGroup = {
  label: string;
  lessons: Array<{
    id: number;
    label: string;
  }>;
};

export type PlanFormTask = {
  id: number | null;
  key: string;
  title: string;
  task_type: string;
  submission_scope: string;
  description: string;
  description_mode: 'visual' | 'source';
  config: TaskConfigState;
  is_required: boolean;
  linked_template_id: number | null;
};

export type PlanEditorTab = 'content' | 'tasks';

export type LessonPlanDraftState = {
  lesson_id: number | null;
  title: string;
  content: string;
  content_mode: 'visual' | 'source';
  assigned_date: string;
  status: string;
  tasks: PlanFormTask[];
  editor_active_tab: PlanEditorTab;
  active_task_editor_key: string;
};

export type PersistedLessonPlanDraft = {
  version: 1;
  saved_at: string;
  state: LessonPlanDraftState;
};

export type TaskTemplatePresetId =
  | 'reading'
  | 'rich_text'
  | 'upload_image'
  | 'programming'
  | 'discussion'
  | 'web_page'
  | 'data_submit';

export type TaskTemplatePresetOption = {
  id: TaskTemplatePresetId;
  label: string;
  description: string;
};

export type TaskHtmlPromptTemplateOption = {
  id: string;
  slot: TaskAssetSlot;
  label: string;
  description: string;
  prompt: string;
};

export type TaskHtmlPromptBuildOptions = {
  template_prompt?: string;
  custom_prompt?: string;
};

export type TaskHtmlPromptDialogState = {
  task_key: string;
  slot: TaskAssetSlot;
  template_id: string;
  custom_prompt: string;
};

export type TaskHtmlPromptGenerationStatus = {
  state: 'idle' | 'loading' | 'error';
  provider_name: string;
  provider_mode: string;
  warning: string;
  error_message: string;
  attempt: number;
  total_attempts: number;
};

export type TaskTemplateFormState = {
  mode: 'create' | 'overwrite';
  templateId: number | null;
  group_name: string;
  title: string;
  summary: string;
  is_pinned: boolean;
};

export type TaskTemplateLibraryFilter = {
  keyword: string;
  group_name: string;
};

export type CustomTaskTemplate = {
  id: number;
  title: string;
  group_name: string;
  summary: string | null;
  task_title: string;
  task_type: string;
  submission_scope: string;
  task_description: string | null;
  config: Record<string, unknown> | null;
  is_required: boolean;
  sort_order: number;
  is_pinned: boolean;
  last_used_at: string | null;
  use_count: number;
  updated_at: string | null;
};

export type TaskTemplateGroupSection = {
  key: string;
  label: string;
  items: CustomTaskTemplate[];
};

export type TaskTemplateDropdownCommand =
  | { kind: 'preset'; id: TaskTemplatePresetId }
  | { kind: 'custom'; id: number };

export type TaskPreviewFeedbackLevel = 'warning' | 'error';

export type TaskPreviewFeedback = {
  level: TaskPreviewFeedbackLevel;
  title: string;
  message: string;
  detail: string;
  detailPreview: string;
  hasExpandableDetail: boolean;
};

export type TaskAssetEditorBindings = {
  getTaskAssetEntryPath: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  setTaskAssetEntryPath: (task: PlanFormTask, slot: TaskAssetSlot, value: string) => void;
  getTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  setTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot, value: string) => void;
  taskAssetInputId: (task: PlanFormTask, slot: TaskAssetSlot, mode: TaskAssetPickerMode) => string;
  openTaskAssetPicker: (task: PlanFormTask, slot: TaskAssetSlot, mode: TaskAssetPickerMode) => void;
  handleTaskAssetChange: (task: PlanFormTask, slot: TaskAssetSlot, isFolder: boolean, event: Event) => void;
  openTaskHtmlPromptDialog: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  uploadTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot) => void | Promise<void>;
  taskPreviewFeedback: (task: PlanFormTask, slot: TaskAssetSlot) => TaskPreviewFeedback | null;
  taskPreviewDisplayDetail: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  taskPreviewDetailToggleLabel: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  hasTaskInlinePreview: (task: PlanFormTask, slot: TaskAssetSlot) => boolean;
  taskInlinePreviewSrcdoc: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  taskAssetPreviewUrl: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  taskPreviewFrameKey: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  toggleTaskPreviewDetail: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  copyTaskPreviewDetail: (task: PlanFormTask, slot: TaskAssetSlot) => void | Promise<void>;
  retryTaskPreview: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  handleTaskPreviewLoad: (task: PlanFormTask, slot: TaskAssetSlot, event: Event) => void;
  handleTaskPreviewError: (task: PlanFormTask, slot: TaskAssetSlot) => void;
};

export type TaskDataSubmitEndpointBindings = {
  copyTaskDataSubmitEndpoint: (task: PlanFormTask, type: 'submit' | 'records') => void | Promise<void>;
  taskDataSubmitPromptApiPath: (task: PlanFormTask) => string;
  taskDataSubmitPromptRecordsPath: (task: PlanFormTask) => string;
  taskDataSubmitEndpointTagType: (task: PlanFormTask) => string;
  taskDataSubmitEndpointStatusLabel: (task: PlanFormTask) => string;
  taskDataSubmitAlertTitle: (task: PlanFormTask) => string;
  taskDataSubmitAlertDescription: (task: PlanFormTask) => string;
};
