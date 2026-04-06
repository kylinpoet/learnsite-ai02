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
    :get-task-asset-entry-path="assetBindings.getTaskAssetEntryPath"
    :set-task-asset-entry-path="assetBindings.setTaskAssetEntryPath"
    :get-task-html-source="assetBindings.getTaskHtmlSource"
    :set-task-html-source="assetBindings.setTaskHtmlSource"
    :task-asset-input-id="assetBindings.taskAssetInputId"
    :open-task-asset-picker="assetBindings.openTaskAssetPicker"
    :handle-task-asset-change="assetBindings.handleTaskAssetChange"
    :open-task-html-prompt-dialog="assetBindings.openTaskHtmlPromptDialog"
    :upload-task-html-source="assetBindings.uploadTaskHtmlSource"
    :task-preview-feedback="assetBindings.taskPreviewFeedback"
    :task-preview-display-detail="assetBindings.taskPreviewDisplayDetail"
    :task-preview-detail-toggle-label="assetBindings.taskPreviewDetailToggleLabel"
    :has-task-inline-preview="assetBindings.hasTaskInlinePreview"
    :task-inline-preview-srcdoc="assetBindings.taskInlinePreviewSrcdoc"
    :task-asset-preview-url="assetBindings.taskAssetPreviewUrl"
    :task-preview-frame-key="assetBindings.taskPreviewFrameKey"
    :toggle-task-preview-detail="assetBindings.toggleTaskPreviewDetail"
    :copy-task-preview-detail="assetBindings.copyTaskPreviewDetail"
    :retry-task-preview="assetBindings.retryTaskPreview"
    :handle-task-preview-load="assetBindings.handleTaskPreviewLoad"
    :handle-task-preview-error="assetBindings.handleTaskPreviewError"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import TaskAssetSlotEditor from './TaskAssetSlotEditor.vue';
import type { PlanFormTask, TaskAssetEditorBindings } from '../lessonPlan.types';

const props = defineProps<{
  task: PlanFormTask;
  canUpload: boolean;
  generationLoading: boolean;
  assetBindings: TaskAssetEditorBindings;
}>();

const notes = computed(() => [
  '支持上传 ZIP、多文件或文件夹，默认使用 `index.html` 作为入口文件。',
  '页面运行时会自动注入 `window.__LEARNSITE_TASK_CONTEXT__` 和 `window.__LEARNSITE_TASK_HELPERS__`，同源资源请求会自动携带任务访问 cookie。',
]);
</script>
