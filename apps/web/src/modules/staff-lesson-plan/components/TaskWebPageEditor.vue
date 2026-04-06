<template>
  <TaskAssetSlotEditor
    :task="task"
    slot="web"
    :assets="task.config.assets"
    :can-upload="canUpload"
    :generation-loading="generationLoading"
    :entry-placeholder="'例如：index.html'"
    :notes="notes"
    :generate-button-label="'AI 生成入口页'"
    :save-source-button-label="'保存源码为入口页'"
    :source-note="'左侧修改 HTML，右侧即时查看页面效果。'"
    :source-placeholder="'<html><body><h1>网页任务入口</h1></body></html>'"
    :preview-note="'生成、粘贴或上传后，这里直接显示入口页。'"
    :empty-description="'生成或粘贴网页任务 HTML 后，这里会直接显示预览。'"
    :show-asset-table="true"
    :get-task-asset-entry-path="getTaskAssetEntryPath"
    :set-task-asset-entry-path="setTaskAssetEntryPath"
    :get-task-html-source="getTaskHtmlSource"
    :set-task-html-source="setTaskHtmlSource"
    :task-asset-input-id="taskAssetInputId"
    :open-task-asset-picker="openTaskAssetPicker"
    :handle-task-asset-change="handleTaskAssetChange"
    :open-task-html-prompt-dialog="openTaskHtmlPromptDialog"
    :upload-task-html-source="uploadTaskHtmlSource"
    :task-preview-feedback="taskPreviewFeedback"
    :task-preview-display-detail="taskPreviewDisplayDetail"
    :task-preview-detail-toggle-label="taskPreviewDetailToggleLabel"
    :has-task-inline-preview="hasTaskInlinePreview"
    :task-inline-preview-srcdoc="taskInlinePreviewSrcdoc"
    :task-asset-preview-url="taskAssetPreviewUrl"
    :task-preview-frame-key="taskPreviewFrameKey"
    :toggle-task-preview-detail="toggleTaskPreviewDetail"
    :copy-task-preview-detail="copyTaskPreviewDetail"
    :retry-task-preview="retryTaskPreview"
    :handle-task-preview-load="handleTaskPreviewLoad"
    :handle-task-preview-error="handleTaskPreviewError"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import TaskAssetSlotEditor from './TaskAssetSlotEditor.vue';
import type {
  PlanFormTask,
  TaskAssetPickerMode,
  TaskAssetSlot,
  TaskPreviewFeedback,
} from '../lessonPlan.types';

const props = defineProps<{
  task: PlanFormTask;
  canUpload: boolean;
  generationLoading: boolean;
  getTaskAssetEntryPath: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  setTaskAssetEntryPath: (task: PlanFormTask, slot: TaskAssetSlot, value: string) => void;
  getTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  setTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot, value: string) => void;
  taskAssetInputId: (task: PlanFormTask, slot: TaskAssetSlot, mode: TaskAssetPickerMode) => string;
  openTaskAssetPicker: (task: PlanFormTask, slot: TaskAssetSlot, mode: TaskAssetPickerMode) => void;
  handleTaskAssetChange: (
    task: PlanFormTask,
    slot: TaskAssetSlot,
    isFolder: boolean,
    event: Event
  ) => void;
  openTaskHtmlPromptDialog: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  uploadTaskHtmlSource: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  taskPreviewFeedback: (task: PlanFormTask, slot: TaskAssetSlot) => TaskPreviewFeedback | null;
  taskPreviewDisplayDetail: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  taskPreviewDetailToggleLabel: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  hasTaskInlinePreview: (task: PlanFormTask, slot: TaskAssetSlot) => boolean;
  taskInlinePreviewSrcdoc: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  taskAssetPreviewUrl: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  taskPreviewFrameKey: (task: PlanFormTask, slot: TaskAssetSlot) => string;
  toggleTaskPreviewDetail: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  copyTaskPreviewDetail: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  retryTaskPreview: (task: PlanFormTask, slot: TaskAssetSlot) => void;
  handleTaskPreviewLoad: (task: PlanFormTask, slot: TaskAssetSlot, event: Event) => void;
  handleTaskPreviewError: (task: PlanFormTask, slot: TaskAssetSlot) => void;
}>();

const notes = computed(() => [
  '支持上传 ZIP、多文件或文件夹，默认使用 `index.html` 作为入口文件。',
  '页面运行时会自动注入 `window.__LEARNSITE_TASK_CONTEXT__` 和 `window.__LEARNSITE_TASK_HELPERS__`，同源资源请求会自动携带任务访问 cookie。',
]);
</script>
