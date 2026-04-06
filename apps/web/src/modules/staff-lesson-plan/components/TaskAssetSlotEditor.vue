<template>
  <div>
    <el-form-item :label="entryLabel">
      <el-input v-model="entryPathValue" :placeholder="entryPlaceholder" />
    </el-form-item>
    <p v-for="(note, index) in notes" :key="index" class="section-note">{{ note }}</p>
    <div class="asset-actions">
      <el-button :disabled="!canUpload" plain @click="openTaskAssetPicker(task, slot, 'files')">
        {{ filesButtonLabel }}
      </el-button>
      <el-button :disabled="!canUpload" plain @click="openTaskAssetPicker(task, slot, 'folder')">
        {{ folderButtonLabel }}
      </el-button>
      <el-button :loading="generationLoading" plain @click="openTaskHtmlPromptDialog(task, slot)">
        {{ generateButtonLabel }}
      </el-button>
      <el-button :disabled="!canUpload" plain @click="uploadTaskHtmlSource(task, slot)">
        {{ saveSourceButtonLabel }}
      </el-button>
      <input
        :id="taskAssetInputId(task, slot, 'files')"
        class="file-input"
        multiple
        type="file"
        @change="handleTaskAssetChange(task, slot, false, $event)"
      />
      <input
        :id="taskAssetInputId(task, slot, 'folder')"
        class="file-input"
        webkitdirectory
        directory
        multiple
        type="file"
        @change="handleTaskAssetChange(task, slot, true, $event)"
      />
    </div>
    <div class="slot-split-layout">
      <section class="slot-split-panel">
        <div class="slot-split-panel__head">
          <strong>{{ sourceTitle }}</strong>
          <span class="section-note">{{ sourceNote }}</span>
        </div>
        <el-input
          v-model="htmlSourceValue"
          :autosize="{ minRows: 10, maxRows: 18 }"
          type="textarea"
          :placeholder="sourcePlaceholder"
        />
        <el-table v-if="showAssetTable && assets.length" :data="assets" size="small" stripe>
          <el-table-column :label="assetTablePathLabel" min-width="280" prop="path" />
          <el-table-column :label="assetTableSizeLabel" min-width="90" prop="size_kb" />
        </el-table>
      </section>
      <section class="slot-split-panel slot-split-panel--preview">
        <div class="slot-split-panel__head">
          <strong>{{ previewTitle }}</strong>
          <span class="section-note">{{ previewNote }}</span>
        </div>
        <TaskPreviewFeedbackPanel
          v-if="taskPreviewFeedback(task, slot) && (hasTaskInlinePreview(task, slot) || taskAssetPreviewUrl(task, slot))"
          :feedback="taskPreviewFeedback(task, slot)"
          :detail="taskPreviewDisplayDetail(task, slot)"
          :detail-toggle-label="taskPreviewDetailToggleLabel(task, slot)"
          @toggle-detail="toggleTaskPreviewDetail(task, slot)"
          @copy-detail="copyTaskPreviewDetail(task, slot)"
          @retry="retryTaskPreview(task, slot)"
        />
        <iframe
          v-if="hasTaskInlinePreview(task, slot)"
          :srcdoc="taskInlinePreviewSrcdoc(task, slot)"
          :key="taskPreviewFrameKey(task, slot)"
          class="asset-preview-frame"
          @load="handleTaskPreviewLoad(task, slot, $event)"
          @error="handleTaskPreviewError(task, slot)"
        ></iframe>
        <iframe
          v-else-if="taskAssetPreviewUrl(task, slot)"
          :key="taskPreviewFrameKey(task, slot)"
          :src="taskAssetPreviewUrl(task, slot)"
          class="asset-preview-frame"
          @load="handleTaskPreviewLoad(task, slot, $event)"
          @error="handleTaskPreviewError(task, slot)"
        ></iframe>
        <el-empty v-else :description="emptyDescription" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import TaskPreviewFeedbackPanel from './TaskPreviewFeedbackPanel.vue';
import type {
  PlanFormTask,
  TaskAssetManifestItem,
  TaskAssetPickerMode,
  TaskAssetSlot,
  TaskPreviewFeedback,
} from '../lessonPlan.types';

const props = withDefaults(
  defineProps<{
    task: PlanFormTask;
    slot: TaskAssetSlot;
    assets: TaskAssetManifestItem[];
    canUpload: boolean;
    generationLoading: boolean;
    entryLabel?: string;
    entryPlaceholder: string;
    notes?: string[];
    filesButtonLabel?: string;
    folderButtonLabel?: string;
    generateButtonLabel: string;
    saveSourceButtonLabel: string;
    sourceTitle?: string;
    sourceNote: string;
    sourcePlaceholder: string;
    previewTitle?: string;
    previewNote: string;
    emptyDescription: string;
    showAssetTable?: boolean;
    assetTablePathLabel?: string;
    assetTableSizeLabel?: string;
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
  }>(),
  {
    entryLabel: '入口文件',
    notes: () => [],
    filesButtonLabel: '上传页面文件',
    folderButtonLabel: '上传文件夹',
    sourceTitle: '源码编辑',
    previewTitle: '预览页',
    showAssetTable: false,
    assetTablePathLabel: '文件路径',
    assetTableSizeLabel: '大小(KB)',
  }
);

const entryPathValue = computed({
  get: () => props.getTaskAssetEntryPath(props.task, props.slot),
  set: (value: string) => props.setTaskAssetEntryPath(props.task, props.slot, value),
});

const htmlSourceValue = computed({
  get: () => props.getTaskHtmlSource(props.task, props.slot),
  set: (value: string) => props.setTaskHtmlSource(props.task, props.slot, value),
});
</script>

<style scoped>
.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.asset-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.slot-split-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.slot-split-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.slot-split-panel__head {
  display: grid;
  gap: 4px;
}

.slot-split-panel--preview {
  align-content: start;
}

.asset-preview-frame {
  width: 100%;
  min-height: 320px;
  border: 1px solid rgba(66, 97, 162, 0.14);
  border-radius: 18px;
  background: #fff;
}

.file-input {
  display: none;
}

@media (max-width: 768px) {
  .slot-split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
