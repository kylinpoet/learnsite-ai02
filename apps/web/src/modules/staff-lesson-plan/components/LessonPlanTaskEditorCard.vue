<template>
  <article class="task-editor-card">
    <div class="task-card-toolbar">
      <div class="chip-row">
        <strong>任务 {{ index + 1 }}</strong>
        <n-tag round type="info">{{ taskTypeLabel(task.task_type) }}</n-tag>
        <n-tag round type="success">顺序 {{ index + 1 }} / {{ taskCount }}</n-tag>
      </div>
      <div class="chip-row">
        <n-button :disabled="index === 0" secondary size="small" @click="moveTaskRow(task.key, -1)">
          前移
        </n-button>
        <n-button
          :disabled="index === taskCount - 1"
          secondary
          size="small"
          @click="moveTaskRow(task.key, 1)"
        >
          后移
        </n-button>
        <n-button secondary size="small" @click="copyTaskRow(task.key)">复制</n-button>
        <n-button secondary size="small" @click="openSaveTaskTemplateDialog(task)">
          {{ taskTemplateButtonLabel(task) }}
        </n-button>
        <n-button :disabled="taskCount === 1" text type="error" @click="removeTaskRow(task.key)">
          删除
        </n-button>
      </div>
    </div>

    <div class="task-form-grid">
      <n-form-item label="任务标题">
        <n-input v-model:value="task.title" maxlength="120" placeholder="例如：活动一、信息检索与表达" />
      </n-form-item>
      <n-form-item label="任务类型">
        <n-select
          v-model:value="task.task_type"
          class="full-width"
          :options="taskTypeOptions"
          @update:value="handleTaskTypeChange(task)"
        />
      </n-form-item>
      <n-form-item label="任务要求">
        <n-switch v-model:value="task.is_required">
          <template #checked>必做</template>
          <template #unchecked>选做</template>
        </n-switch>
      </n-form-item>
    </div>

    <n-form-item label="提交方式">
      <n-radio-group v-model:value="task.submission_scope" :disabled="isTaskScopeFixed(task.task_type)">
        <n-radio-button value="individual">个人提交</n-radio-button>
        <n-radio-button value="group">小组共同提交</n-radio-button>
      </n-radio-group>
      <p class="section-note">
        {{
          isTaskScopeFixed(task.task_type)
            ? '当前任务类型固定为个人提交，用于保证课堂流程和数据结构稳定。'
            : '可按需要切换为个人提交或小组共同提交。'
        }}
      </p>
    </n-form-item>

    <section v-if="task.task_type === 'discussion'" class="task-type-panel">
      <n-form-item label="讨论主题">
        <n-input
          v-model:value="task.config.topic"
          maxlength="200"
          placeholder="例如：你认为 AI 在课堂学习中的最大帮助是什么？"
        />
      </n-form-item>
    </section>

    <section v-if="task.task_type === 'web_page'" class="task-type-panel">
      <TaskWebPageEditor
        :task="task"
        :can-upload="canUploadTaskAssets(task)"
        :generation-loading="generatingTaskHtmlKey === taskAssetGenerationKey(task, 'web')"
        :asset-bindings="assetBindings"
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
        :data-submit-bindings="dataSubmitBindings"
        :generate-task-description-draft="generateTaskDescriptionDraft"
        :asset-bindings="assetBindings"
      />
    </section>

    <TaskDescriptionEditor
      v-if="task.task_type !== 'data_submit'"
      :task="task"
      :generating="generatingTaskHtmlKey === taskDescriptionGenerationKey(task)"
      :generate-task-description-draft="generateTaskDescriptionDraft"
    />
  </article>
</template>

<script setup lang="ts">
import { NButton, NFormItem, NInput, NRadioButton, NRadioGroup, NSelect, NSwitch, NTag } from 'naive-ui';

import TaskDataSubmitEditor from './TaskDataSubmitEditor.vue';
import TaskDescriptionEditor from './TaskDescriptionEditor.vue';
import TaskWebPageEditor from './TaskWebPageEditor.vue';
import type {
  PlanFormTask,
  TaskAssetEditorBindings,
  TaskAssetSlot,
  TaskDataSubmitEndpointBindings,
} from '../lessonPlan.types';

defineProps<{
  task: PlanFormTask;
  index: number;
  taskCount: number;
  generatingTaskHtmlKey: string | null;
  taskTypeLabel: (taskType: string) => string;
  taskTemplateButtonLabel: (task: PlanFormTask) => string;
  isTaskScopeFixed: (taskType: string) => boolean;
  canUploadTaskAssets: (task: Pick<PlanFormTask, 'id'>) => boolean;
  taskAssetGenerationKey: (task: Pick<PlanFormTask, 'key'>, slot: TaskAssetSlot) => string;
  taskDescriptionGenerationKey: (task: Pick<PlanFormTask, 'key'>) => string;
  assetBindings: TaskAssetEditorBindings;
  dataSubmitBindings: TaskDataSubmitEndpointBindings;
  moveTaskRow: (taskKey: string, direction: -1 | 1) => void;
  copyTaskRow: (taskKey: string) => void;
  removeTaskRow: (taskKey: string) => void;
  openSaveTaskTemplateDialog: (task: PlanFormTask) => void;
  handleTaskTypeChange: (task: PlanFormTask) => void | Promise<void>;
  generateTaskDescriptionDraft: (task: PlanFormTask) => void | Promise<void>;
}>();

const taskTypeOptions = [
  { label: '阅读任务', value: 'reading' },
  { label: '图文任务', value: 'rich_text' },
  { label: '上传作品', value: 'upload_image' },
  { label: '编程任务', value: 'programming' },
  { label: '网页任务', value: 'web_page' },
  { label: '讨论任务', value: 'discussion' },
  { label: '数据提交任务', value: 'data_submit' },
];
</script>

<style scoped>
.task-editor-card {
  padding: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: var(--ls-card);
}

.task-card-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.task-form-grid {
  display: grid;
  grid-template-columns: 5fr 4fr 3fr;
  gap: 0 16px;
  align-items: start;
}

.chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.task-type-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 20px;
  background: var(--ls-panel-soft);
}

.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.full-width {
  width: 100%;
}

@media (max-width: 768px) {
  .task-card-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
