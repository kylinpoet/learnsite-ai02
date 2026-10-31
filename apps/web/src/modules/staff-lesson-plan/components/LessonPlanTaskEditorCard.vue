<template>
  <article
    :class="[
      'task-editor-card',
      { 'task-editor-card--bare': !showToolbar, 'task-editor-card--inactive': !task.is_active },
    ]"
  >
    <div v-if="showToolbar" class="task-card-toolbar">
      <div class="chip-row">
        <strong>活动 {{ index + 1 }}</strong>
        <n-tag round type="info">{{ taskTypeLabel(task.task_type) }}</n-tag>
        <n-tag round type="success">顺序 {{ index + 1 }} / {{ taskCount }}</n-tag>
        <n-tag v-if="!task.is_active" round type="warning">已停用</n-tag>
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
      <n-form-item label="活动标题">
        <n-input v-model:value="task.title" maxlength="120" placeholder="例如：活动一、信息检索与表达" />
      </n-form-item>
      <n-form-item label="活动类型">
        <n-select
          v-model:value="task.task_type"
          class="full-width"
          :options="taskTypeOptions"
          @update:value="handleTaskTypeChange(task)"
        />
      </n-form-item>
    </div>

    <div class="task-switch-row">
      <n-form-item label="活动要求">
        <n-switch v-model:value="task.is_required">
          <template #checked>必做</template>
          <template #unchecked>选做</template>
        </n-switch>
      </n-form-item>
      <n-form-item label="活动状态">
        <n-switch v-model:value="task.is_active">
          <template #checked>已启用</template>
          <template #unchecked>已停用</template>
        </n-switch>
      </n-form-item>
      <n-form-item class="task-switch-row__scope" label="提交方式">
        <n-radio-group v-model:value="task.submission_scope" :disabled="isTaskScopeFixed(task.task_type)">
          <n-radio-button value="individual">个人提交</n-radio-button>
          <n-radio-button value="group">小组共同提交</n-radio-button>
        </n-radio-group>
      </n-form-item>
    </div>

    <p v-if="isTaskScopeFixed(task.task_type)" class="section-note task-scope-note">
      该活动类型固定为个人提交，以保证课堂流程与数据结构稳定。
    </p>

    <p v-if="!task.is_active" class="section-note task-inactive-note">
      停用后学生端不再显示这个活动，也无法通过链接直达；教师端仍可编辑，重新启用即可恢复。
    </p>

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

withDefaults(
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
    /** 页面级工具条已经承担了活动身份与操作时，卡片只留表单 */
    showToolbar?: boolean;
  }>(),
  { showToolbar: true }
);

const taskTypeOptions = [
  { label: '阅读活动', value: 'reading' },
  { label: '图文活动', value: 'rich_text' },
  { label: '上传作品', value: 'upload_image' },
  { label: '编程活动', value: 'programming' },
  { label: '网页活动', value: 'web_page' },
  { label: '讨论活动', value: 'discussion' },
  { label: '数据提交活动', value: 'data_submit' },
];
</script>

<style scoped>
/* 卡片自带边框：单独出现在弹窗或面板里时是一张完整的卡 */
.task-editor-card {
  padding: 16px;
  border: 1px solid var(--sf-line, var(--ls-border));
  border-radius: var(--sf-r-card, 10px);
  background: var(--sf-surface, var(--ls-card));
}

/* 嵌在编辑页画布里：画布已经提供了白底与描边，卡片只留内容 */
.task-editor-card--bare {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
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
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 0 16px;
  align-items: start;
}

/* 三个同级开关排成一行：要求 / 状态 / 提交方式 */
.task-switch-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0 28px;
}

.task-switch-row :deep(.n-form-item) {
  flex: none;
}

.task-switch-row__scope {
  min-width: 0;
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
  padding: 14px;
  border: 1px solid var(--sf-line-soft, rgba(66, 97, 162, 0.12));
  border-radius: var(--sf-r-card, 10px);
  background: var(--sf-surface-2, var(--ls-panel-soft));
}

.section-note {
  margin: 0;
  color: var(--sf-muted, var(--ls-muted));
  font-size: 12px;
  line-height: 1.6;
}

.full-width {
  width: 100%;
}

/* 停用只在独立卡片上压暗；画布里的活动仍要能正常读改写，靠说明文字提示 */
.task-editor-card--inactive:not(.task-editor-card--bare) {
  opacity: 0.72;
}

.task-scope-note,
.task-inactive-note {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--sf-surface-2, var(--ls-primary-soft));
  font-size: 12px;
}

@media (max-width: 768px) {
  .task-card-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-form-grid {
    grid-template-columns: 1fr;
  }

  .task-switch-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
