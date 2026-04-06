<template>
  <div>
    <el-alert
      :closable="false"
      :title="dataSubmitBindings.taskDataSubmitAlertTitle(task)"
      :description="dataSubmitBindings.taskDataSubmitAlertDescription(task)"
      type="info"
    />

    <div class="data-submit-endpoint-grid">
      <article class="data-submit-endpoint-card">
        <div class="data-submit-endpoint-card__head">
          <strong>学生提交接口</strong>
          <el-tag round :type="dataSubmitBindings.taskDataSubmitEndpointTagType(task)">
            {{ dataSubmitBindings.taskDataSubmitEndpointStatusLabel(task) }}
          </el-tag>
        </div>
        <code>{{ dataSubmitBindings.taskDataSubmitPromptApiPath(task) }}</code>
        <p class="section-note">
          AI 生成网页时可以直接使用这条地址；预生成的任务 ID 会在保存学案后原样落地，不需要再替换接口。
        </p>
        <el-space wrap>
          <el-button plain size="small" @click="dataSubmitBindings.copyTaskDataSubmitEndpoint(task, 'submit')">
            复制提交接口
          </el-button>
        </el-space>
      </article>

      <article class="data-submit-endpoint-card">
        <div class="data-submit-endpoint-card__head">
          <strong>数据读取接口</strong>
          <el-tag round :type="dataSubmitBindings.taskDataSubmitEndpointTagType(task)">
            {{ dataSubmitBindings.taskDataSubmitEndpointStatusLabel(task) }}
          </el-tag>
        </div>
        <code>{{ dataSubmitBindings.taskDataSubmitPromptRecordsPath(task) }}</code>
        <p class="section-note">
          数据可视化页可以直接读取这条地址，预览阶段与正式保存后的接口保持一致。
        </p>
        <el-space wrap>
          <el-button plain size="small" @click="dataSubmitBindings.copyTaskDataSubmitEndpoint(task, 'records')">
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
  TaskAssetEditorBindings,
  TaskDataSubmitEndpointBindings,
} from '../lessonPlan.types';

defineProps<{
  task: PlanFormTask;
  canUpload: boolean;
  descriptionGenerating: boolean;
  submitGenerationLoading: boolean;
  visualizationGenerationLoading: boolean;
  dataSubmitBindings: TaskDataSubmitEndpointBindings;
  generateTaskDescriptionDraft: (task: PlanFormTask) => void;
  assetBindings: TaskAssetEditorBindings;
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
