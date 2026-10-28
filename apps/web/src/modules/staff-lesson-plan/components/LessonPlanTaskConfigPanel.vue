<template>
  <div>
    <div class="dialog-task-head">
      <div>
        <h3>任务配置</h3>
        <p class="section-note">
          支持网页任务、讨论任务、图文任务、数据提交任务等多类型编排。每个任务会作为独立 Tab 页面编辑。
        </p>
      </div>
      <div class="chip-row">
        <n-button secondary @click="addTaskRow">新增空白任务</n-button>
        <TaskTemplatePickerDropdown
          :custom-task-templates-loading="customTaskTemplatesLoading"
          :custom-task-templates="customTaskTemplates"
          :dropdown-pinned-custom-task-templates="dropdownPinnedCustomTaskTemplates"
          :dropdown-recent-custom-task-templates="dropdownRecentCustomTaskTemplates"
          :custom-task-template-dropdown-groups="customTaskTemplateDropdownGroups"
          :task-type-label="taskTypeLabel"
          :handle-task-template-command="handleTaskTemplateCommand"
        />
        <n-button secondary @click="openTaskTemplateLibrary">模板库</n-button>
      </div>
    </div>

    <n-tabs v-model:value="activeTaskEditorKey" class="task-editor-tabs" type="card">
      <n-tab-pane
        v-for="(task, index) in tasks"
        :key="task.key"
        :name="task.key"
        display-directive="show:lazy"
      >
        <template #tab>
          <LessonPlanTaskTabLabel
            :task="task"
            :index="index"
            :task-count="tasks.length"
            :dragging-task-key="draggingTaskKey"
            :drag-over-task-key="dragOverTaskKey"
            :task-editor-tab-title="taskEditorTabTitle"
            :task-type-label="taskTypeLabel"
            :handle-task-tab-drag-start="handleTaskTabDragStart"
            :handle-task-tab-drag-over="handleTaskTabDragOver"
            :handle-task-tab-drop="handleTaskTabDrop"
            :handle-task-tab-drag-end="handleTaskTabDragEnd"
            :remove-task-row="removeTaskRow"
          />
        </template>

        <LessonPlanTaskEditorCard
          :task="task"
          :index="index"
          :task-count="tasks.length"
          :generating-task-html-key="generatingTaskHtmlKey"
          :task-type-label="taskTypeLabel"
          :task-template-button-label="taskTemplateButtonLabel"
          :is-task-scope-fixed="isTaskScopeFixed"
          :can-upload-task-assets="canUploadTaskAssets"
          :task-asset-generation-key="taskAssetGenerationKey"
          :task-description-generation-key="taskDescriptionGenerationKey"
          :asset-bindings="assetBindings"
          :data-submit-bindings="dataSubmitBindings"
          :move-task-row="moveTaskRow"
          :copy-task-row="copyTaskRow"
          :remove-task-row="removeTaskRow"
          :open-save-task-template-dialog="openSaveTaskTemplateDialog"
          :handle-task-type-change="handleTaskTypeChange"
          :generate-task-description-draft="generateTaskDescriptionDraft"
        />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { NButton, NTabs, NTabPane } from 'naive-ui';

import LessonPlanTaskEditorCard from './LessonPlanTaskEditorCard.vue';
import LessonPlanTaskTabLabel from './LessonPlanTaskTabLabel.vue';
import TaskTemplatePickerDropdown from './TaskTemplatePickerDropdown.vue';
import type {
  TaskAssetEditorBindings,
  TaskDataSubmitEndpointBindings,
  CustomTaskTemplate,
  PlanFormTask,
  TaskAssetSlot,
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
  assetBindings: TaskAssetEditorBindings;
  dataSubmitBindings: TaskDataSubmitEndpointBindings;
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
  generateTaskDescriptionDraft: (task: PlanFormTask) => void | Promise<void>;
}>();
</script>

<style scoped>
.task-editor-tabs {
  margin-top: 8px;
}

.task-editor-tabs :deep(.n-tabs-tab) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
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

@media (max-width: 768px) {
  .dialog-task-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
