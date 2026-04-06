<template>
  <div>
    <div class="dialog-task-head">
      <div>
        <h3>任务配置</h3>
        <p class="section-note">
          支持网页任务、讨论任务、图文任务、数据提交任务等多类型编排。每个任务会作为独立 Tab 页面编辑。
        </p>
      </div>
      <el-space wrap>
        <el-button plain @click="addTaskRow">新增空白任务</el-button>
        <el-dropdown trigger="click" @command="handleTaskTemplateCommand">
          <el-button type="primary">从模板新增</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="preset in taskTemplatePresetOptions"
                :key="preset.id"
                :command="{ kind: 'preset', id: preset.id }"
              >
                <div class="task-template-option">
                  <strong>{{ preset.label }}</strong>
                  <span>{{ preset.description }}</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item v-if="customTaskTemplatesLoading" divided disabled>
                <div class="task-template-option">
                  <strong>自定义模板</strong>
                  <span>正在加载教师自定义模板...</span>
                </div>
              </el-dropdown-item>
              <template v-else-if="customTaskTemplates.length">
                <el-dropdown-item disabled divided>
                  <div class="task-template-option">
                    <strong>自定义模板</strong>
                    <span>保存过的任务模板会出现在这里，可直接复用。</span>
                  </div>
                </el-dropdown-item>
                <template v-if="dropdownPinnedCustomTaskTemplates.length">
                  <el-dropdown-item disabled>
                    <div class="task-template-option task-template-option--group">
                      <strong>已置顶</strong>
                      <span>{{ dropdownPinnedCustomTaskTemplates.length }} 个模板</span>
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="templateItem in dropdownPinnedCustomTaskTemplates"
                    :key="`pinned-${templateItem.id}`"
                    :command="{ kind: 'custom', id: templateItem.id }"
                  >
                    <div class="task-template-option">
                      <strong>{{ templateItem.title }}</strong>
                      <span>置顶 · {{ taskTypeLabel(templateItem.task_type) }} · {{ templateItem.task_title }}</span>
                    </div>
                  </el-dropdown-item>
                </template>
                <template v-if="dropdownRecentCustomTaskTemplates.length">
                  <el-dropdown-item disabled>
                    <div class="task-template-option task-template-option--group">
                      <strong>最近使用</strong>
                      <span>优先显示最近 6 个常用模板</span>
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="templateItem in dropdownRecentCustomTaskTemplates"
                    :key="`recent-${templateItem.id}`"
                    :command="{ kind: 'custom', id: templateItem.id }"
                  >
                    <div class="task-template-option">
                      <strong>{{ templateItem.title }}</strong>
                      <span>最近使用 · {{ taskTypeLabel(templateItem.task_type) }} · {{ templateItem.task_title }}</span>
                    </div>
                  </el-dropdown-item>
                </template>
                <template v-for="group in customTaskTemplateDropdownGroups" :key="group.key || 'ungrouped'">
                  <el-dropdown-item disabled>
                    <div class="task-template-option task-template-option--group">
                      <strong>{{ group.label }}</strong>
                      <span>{{ group.items.length }} 个模板</span>
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="templateItem in group.items"
                    :key="templateItem.id"
                    :command="{ kind: 'custom', id: templateItem.id }"
                  >
                    <div class="task-template-option">
                      <strong>{{ templateItem.title }}</strong>
                      <span>{{ taskTypeLabel(templateItem.task_type) }} · 预设任务名：{{ templateItem.task_title }}</span>
                    </div>
                  </el-dropdown-item>
                </template>
              </template>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button plain @click="openTaskTemplateLibrary">模板库</el-button>
      </el-space>
    </div>

    <el-tabs v-model="activeTaskEditorKey" class="task-editor-tabs" type="card">
      <el-tab-pane v-for="(task, index) in tasks" :key="task.key" :name="task.key" lazy>
        <template #label>
          <div
            class="task-tab-label"
            :class="{
              'task-tab-label-dragging': draggingTaskKey === task.key,
              'task-tab-label-target': dragOverTaskKey === task.key && draggingTaskKey !== task.key,
            }"
            draggable="true"
            @dragstart="handleTaskTabDragStart(task.key, $event)"
            @dragover="handleTaskTabDragOver(task.key, $event)"
            @drop="handleTaskTabDrop(task.key, $event)"
            @dragend="handleTaskTabDragEnd"
          >
            <div class="task-tab-label__meta">
              <strong>{{ taskEditorTabTitle(task, index) }}</strong>
              <span>{{ taskTypeLabel(task.task_type) }}</span>
            </div>
            <span
              v-if="tasks.length > 1"
              class="task-tab-close"
              draggable="false"
              role="button"
              tabindex="0"
              aria-label="关闭任务标签"
              @click.stop="removeTaskRow(task.key)"
              @keydown.enter.prevent.stop="removeTaskRow(task.key)"
              @keydown.space.prevent.stop="removeTaskRow(task.key)"
            >
              ×
            </span>
          </div>
        </template>

        <article class="task-editor-card">
          <div class="task-card-toolbar">
            <el-space wrap>
              <strong>任务 {{ index + 1 }}</strong>
              <el-tag round type="info">{{ taskTypeLabel(task.task_type) }}</el-tag>
              <el-tag round type="success">顺序 {{ index + 1 }} / {{ tasks.length }}</el-tag>
            </el-space>
            <el-space wrap>
              <el-button plain size="small" :disabled="index === 0" @click="moveTaskRow(task.key, -1)">前移</el-button>
              <el-button
                plain
                size="small"
                :disabled="index === tasks.length - 1"
                @click="moveTaskRow(task.key, 1)"
              >
                后移
              </el-button>
              <el-button plain size="small" @click="copyTaskRow(task.key)">复制</el-button>
              <el-button plain size="small" @click="openSaveTaskTemplateDialog(task)">
                {{ taskTemplateButtonLabel(task) }}
              </el-button>
              <el-button :disabled="tasks.length === 1" link type="danger" @click="removeTaskRow(task.key)">
                删除
              </el-button>
            </el-space>
          </div>

          <el-row :gutter="16">
            <el-col :md="10" :sm="24">
              <el-form-item label="任务标题">
                <el-input v-model="task.title" maxlength="120" placeholder="例如：活动一、信息检索与表达" />
              </el-form-item>
            </el-col>
            <el-col :md="8" :sm="12">
              <el-form-item label="任务类型">
                <el-select v-model="task.task_type" class="full-width" @change="handleTaskTypeChange(task)">
                  <el-option label="阅读任务" value="reading" />
                  <el-option label="图文任务" value="rich_text" />
                  <el-option label="上传作品" value="upload_image" />
                  <el-option label="编程任务" value="programming" />
                  <el-option label="网页任务" value="web_page" />
                  <el-option label="讨论任务" value="discussion" />
                  <el-option label="数据提交任务" value="data_submit" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :md="6" :sm="12">
              <el-form-item label="任务要求">
                <el-switch v-model="task.is_required" active-text="必做" inactive-text="选做" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="提交方式">
            <el-radio-group v-model="task.submission_scope" :disabled="isTaskScopeFixed(task.task_type)">
              <el-radio-button label="individual">个人提交</el-radio-button>
              <el-radio-button label="group">小组共同提交</el-radio-button>
            </el-radio-group>
            <p class="section-note">
              {{
                isTaskScopeFixed(task.task_type)
                  ? '当前任务类型固定为个人提交，用于保证课堂流程和数据结构稳定。'
                  : '可按需要切换为个人提交或小组共同提交。'
              }}
            </p>
          </el-form-item>

          <section v-if="task.task_type === 'discussion'" class="task-type-panel">
            <el-form-item label="讨论主题">
              <el-input
                v-model="task.config.topic"
                maxlength="200"
                placeholder="例如：你认为 AI 在课堂学习中的最大帮助是什么？"
              />
            </el-form-item>
          </section>

          <section v-if="task.task_type === 'web_page'" class="task-type-panel">
            <TaskWebPageEditor
              :task="task"
              :can-upload="canUploadTaskAssets(task)"
              :generation-loading="generatingTaskHtmlKey === taskAssetGenerationKey(task, 'web')"
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
          </section>

          <section v-if="task.task_type === 'data_submit'" class="task-type-panel">
            <TaskDataSubmitEditor
              :task="task"
              :can-upload="canUploadTaskAssets(task)"
              :description-generating="generatingTaskHtmlKey === taskDescriptionGenerationKey(task)"
              :submit-generation-loading="generatingTaskHtmlKey === taskAssetGenerationKey(task, 'data_submit_form')"
              :visualization-generation-loading="
                generatingTaskHtmlKey === taskAssetGenerationKey(task, 'data_submit_visualization')
              "
              :copy-task-data-submit-endpoint="copyTaskDataSubmitEndpoint"
              :task-data-submit-prompt-api-path="taskDataSubmitPromptApiPath"
              :task-data-submit-prompt-records-path="taskDataSubmitPromptRecordsPath"
              :task-data-submit-endpoint-tag-type="taskDataSubmitEndpointTagType"
              :task-data-submit-endpoint-status-label="taskDataSubmitEndpointStatusLabel"
              :task-data-submit-alert-title="taskDataSubmitAlertTitle"
              :task-data-submit-alert-description="taskDataSubmitAlertDescription"
              :generate-task-description-draft="generateTaskDescriptionDraft"
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
          </section>

          <TaskDescriptionEditor
            v-if="task.task_type !== 'data_submit'"
            :task="task"
            :generating="generatingTaskHtmlKey === taskDescriptionGenerationKey(task)"
            :generate-task-description-draft="generateTaskDescriptionDraft"
          />
        </article>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import TaskDataSubmitEditor from './TaskDataSubmitEditor.vue';
import TaskDescriptionEditor from './TaskDescriptionEditor.vue';
import TaskWebPageEditor from './TaskWebPageEditor.vue';
import { taskTemplatePresetOptions } from '../lessonPlan.constants';
import type {
  CustomTaskTemplate,
  PlanFormTask,
  TaskAssetPickerMode,
  TaskAssetSlot,
  TaskPreviewFeedback,
  TaskTemplateDropdownCommand,
  TaskTemplateGroupSection,
} from '../lessonPlan.types';

const activeTaskEditorKey = defineModel<string>('activeTaskEditorKey', { required: true });

defineProps<{
  tasks: PlanFormTask[];
  customTaskTemplatesLoading: boolean;
  customTaskTemplates: CustomTaskTemplate[];
  dropdownPinnedCustomTaskTemplates: CustomTaskTemplate[];
  dropdownRecentCustomTaskTemplates: CustomTaskTemplate[];
  customTaskTemplateDropdownGroups: TaskTemplateGroupSection[];
  draggingTaskKey: string;
  dragOverTaskKey: string;
  generatingTaskHtmlKey: string | null;
  taskTypeLabel: (taskType: string) => string;
  taskEditorTabTitle: (task: Pick<PlanFormTask, 'title'>, index: number) => string;
  taskTemplateButtonLabel: (task: PlanFormTask) => string;
  isTaskScopeFixed: (taskType: string) => boolean;
  canUploadTaskAssets: (task: Pick<PlanFormTask, 'id'>) => boolean;
  taskAssetGenerationKey: (task: Pick<PlanFormTask, 'key'>, slot: TaskAssetSlot) => string;
  taskDescriptionGenerationKey: (task: Pick<PlanFormTask, 'key'>) => string;
  addTaskRow: () => void;
  handleTaskTemplateCommand: (command: TaskTemplateDropdownCommand) => void;
  openTaskTemplateLibrary: () => void;
  handleTaskTabDragStart: (taskKey: string, event: DragEvent) => void;
  handleTaskTabDragOver: (taskKey: string, event: DragEvent) => void;
  handleTaskTabDrop: (taskKey: string, event: DragEvent) => void;
  handleTaskTabDragEnd: () => void;
  moveTaskRow: (taskKey: string, direction: -1 | 1) => void;
  copyTaskRow: (taskKey: string) => void;
  removeTaskRow: (taskKey: string) => void;
  openSaveTaskTemplateDialog: (task: PlanFormTask) => void;
  handleTaskTypeChange: (task: PlanFormTask) => void | Promise<void>;
  copyTaskDataSubmitEndpoint: (task: PlanFormTask, type: 'submit' | 'records') => void | Promise<void>;
  taskDataSubmitPromptApiPath: (task: PlanFormTask) => string;
  taskDataSubmitPromptRecordsPath: (task: PlanFormTask) => string;
  taskDataSubmitEndpointTagType: (task: PlanFormTask) => string;
  taskDataSubmitEndpointStatusLabel: (task: PlanFormTask) => string;
  taskDataSubmitAlertTitle: (task: PlanFormTask) => string;
  taskDataSubmitAlertDescription: (task: PlanFormTask) => string;
  generateTaskDescriptionDraft: (task: PlanFormTask) => void | Promise<void>;
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
}>();
</script>

<style scoped>
.task-editor-card {
  padding: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
}

.task-card-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.task-editor-tabs {
  margin-top: 8px;
}

.task-editor-tabs :deep(.el-tabs__header) {
  margin-bottom: 18px;
}

.task-editor-tabs :deep(.el-tabs__item) {
  height: auto;
  padding-top: 10px;
  padding-bottom: 10px;
}

.task-tab-label {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  line-height: 1.25;
  user-select: none;
  cursor: grab;
  border-radius: 10px;
  padding: 2px 0;
  transition: background-color 0.18s ease, opacity 0.18s ease, transform 0.18s ease;
}

.task-tab-label:active {
  cursor: grabbing;
}

.task-tab-label__meta {
  display: grid;
  gap: 2px;
}

.task-tab-label strong {
  font-size: 13px;
  font-weight: 700;
}

.task-tab-label__meta span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-tab-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  color: var(--ls-muted);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.task-tab-close:hover,
.task-tab-close:focus-visible {
  background: rgba(215, 74, 74, 0.12);
  color: #c0392b;
  outline: none;
}

.task-tab-label-dragging {
  opacity: 0.55;
}

.task-tab-label-target {
  background: rgba(66, 97, 162, 0.12);
  transform: translateY(-1px);
}

.task-type-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 20px;
  background: rgba(248, 251, 255, 0.9);
}

.dialog-task-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin: 8px 0 12px;
}

.dialog-task-head h3,
.section-note {
  margin: 0;
}

.section-note {
  color: var(--ls-muted);
  line-height: 1.7;
}

.task-template-option {
  display: grid;
  gap: 2px;
  min-width: 260px;
}

.task-template-option strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--ls-text);
}

.task-template-option span {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ls-muted);
}

.task-template-option--group {
  opacity: 0.82;
}

.full-width {
  width: 100%;
}

@media (max-width: 768px) {
  .dialog-task-head,
  .task-card-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-editor-tabs :deep(.el-tabs__nav) {
    flex-wrap: wrap;
  }
}
</style>
