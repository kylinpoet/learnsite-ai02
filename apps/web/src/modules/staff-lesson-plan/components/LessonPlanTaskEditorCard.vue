<template>
  <article class="task-editor-card">
    <div class="task-card-toolbar">
      <el-space wrap>
        <strong>任务 {{ index + 1 }}</strong>
        <el-tag round type="info">{{ taskTypeLabel(task.task_type) }}</el-tag>
        <el-tag round type="success">顺序 {{ index + 1 }} / {{ taskCount }}</el-tag>
      </el-space>
      <el-space wrap>
        <el-button plain size="small" :disabled="index === 0" @click="moveTaskRow(task.key, -1)">前移</el-button>
        <el-button plain size="small" :disabled="index === taskCount - 1" @click="moveTaskRow(task.key, 1)">
          后移
        </el-button>
        <el-button plain size="small" @click="copyTaskRow(task.key)">复制</el-button>
        <el-button plain size="small" @click="openSaveTaskTemplateDialog(task)">
          {{ taskTemplateButtonLabel(task) }}
        </el-button>
        <el-button :disabled="taskCount === 1" link type="danger" @click="removeTaskRow(task.key)">
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
        <el-radio-button value="individual">个人提交</el-radio-button>
        <el-radio-button value="group">小组共同提交</el-radio-button>
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

.task-type-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 20px;
  background: rgba(248, 251, 255, 0.9);
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
}
</style>
