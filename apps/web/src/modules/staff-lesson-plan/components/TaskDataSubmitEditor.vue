<template>
  <div>
    <el-alert
      :closable="false"
      :title="taskDataSubmitAlertTitle(task)"
      :description="taskDataSubmitAlertDescription(task)"
      type="info"
    />

    <div class="data-submit-endpoint-grid">
      <article class="data-submit-endpoint-card">
        <div class="data-submit-endpoint-card__head">
          <strong>学生提交接口</strong>
          <el-tag round :type="taskDataSubmitEndpointTagType(task)">
            {{ taskDataSubmitEndpointStatusLabel(task) }}
          </el-tag>
        </div>
        <code>{{ taskDataSubmitPromptApiPath(task) }}</code>
        <p class="section-note">
          AI 生成网页时可以直接使用这条地址；预生成的任务 ID 会在保存学案后原样落地，不需要再替换接口。
        </p>
        <el-space wrap>
          <el-button plain size="small" @click="copyTaskDataSubmitEndpoint(task, 'submit')">
            复制提交接口
          </el-button>
        </el-space>
      </article>

      <article class="data-submit-endpoint-card">
        <div class="data-submit-endpoint-card__head">
          <strong>数据读取接口</strong>
          <el-tag round :type="taskDataSubmitEndpointTagType(task)">
            {{ taskDataSubmitEndpointStatusLabel(task) }}
          </el-tag>
        </div>
        <code>{{ taskDataSubmitPromptRecordsPath(task) }}</code>
        <p class="section-note">
          数据可视化页可以直接读取这条地址，预览阶段与正式保存后的接口保持一致。
        </p>
        <el-space wrap>
          <el-button plain size="small" @click="copyTaskDataSubmitEndpoint(task, 'records')">
            复制读取接口
          </el-button>
        </el-space>
      </article>
    </div>

    <TaskDescriptionEditor
      :task="task"
      :generating="descriptionGenerating"
      :generate-task-description-draft="generateTaskDescriptionDraft"
    />

    <el-tabs v-model="task.config.data_submit_active_tab" class="slot-tabs">
      <el-tab-pane label="学生提交页" name="submit">
        <div class="slot-block">
          <TaskAssetSlotEditor
            :task="task"
            slot="data_submit_form"
            :assets="task.config.submit_assets"
            :can-upload="canUpload"
            :generation-loading="submitGenerationLoading"
            :entry-placeholder="'例如：index.html'"
            :generate-button-label="'AI 生成提交页'"
            :save-source-button-label="'保存源码为提交页'"
            :source-note="'左侧编辑提交页 HTML，右侧实时预览学生提交页。'"
            :source-placeholder="'<html><body>学生数据提交页面源码</body></html>'"
            :preview-note="'提交按钮与表单效果会直接在这里显示。'"
            :empty-description="'生成或粘贴提交页 HTML 后，这里会直接显示预览。'"
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
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据可视化页" name="visualization">
        <div class="slot-block">
          <TaskAssetSlotEditor
            :task="task"
            slot="data_submit_visualization"
            :assets="task.config.visualization_assets"
            :can-upload="canUpload"
            :generation-loading="visualizationGenerationLoading"
            :entry-placeholder="'例如：index.html'"
            :generate-button-label="'AI 生成可视化页'"
            :save-source-button-label="'保存源码为可视化页'"
            :source-note="'左侧编辑可视化页 HTML，右侧实时预览展示结果。'"
            :source-placeholder="'<html><body>数据可视化页面源码</body></html>'"
            :preview-note="'图表、统计卡片和表格会直接在这里显示。'"
            :empty-description="'生成或粘贴可视化页 HTML 后，这里会直接显示预览。'"
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
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import TaskAssetSlotEditor from './TaskAssetSlotEditor.vue';
import TaskDescriptionEditor from './TaskDescriptionEditor.vue';
import type {
  PlanFormTask,
  TaskAssetPickerMode,
  TaskAssetSlot,
  TaskPreviewFeedback,
} from '../lessonPlan.types';

defineProps<{
  task: PlanFormTask;
  canUpload: boolean;
  descriptionGenerating: boolean;
  submitGenerationLoading: boolean;
  visualizationGenerationLoading: boolean;
  copyTaskDataSubmitEndpoint: (task: PlanFormTask, type: 'submit' | 'records') => void;
  taskDataSubmitPromptApiPath: (task: PlanFormTask) => string;
  taskDataSubmitPromptRecordsPath: (task: PlanFormTask) => string;
  taskDataSubmitEndpointTagType: (task: PlanFormTask) => string;
  taskDataSubmitEndpointStatusLabel: (task: PlanFormTask) => string;
  taskDataSubmitAlertTitle: (task: PlanFormTask) => string;
  taskDataSubmitAlertDescription: (task: PlanFormTask) => string;
  generateTaskDescriptionDraft: (task: PlanFormTask) => void;
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
</script>

<style scoped>
.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.data-submit-endpoint-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.data-submit-endpoint-card {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid rgba(66, 97, 162, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
}

.data-submit-endpoint-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.data-submit-endpoint-card code {
  display: block;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(24, 39, 75, 0.06);
  color: #1f2a44;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.slot-block {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px dashed rgba(66, 97, 162, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
}

@media (max-width: 768px) {
  .data-submit-endpoint-card__head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
