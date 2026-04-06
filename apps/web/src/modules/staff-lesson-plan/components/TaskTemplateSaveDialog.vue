<template>
  <el-dialog v-model="dialogVisible" :close-on-click-modal="false" :title="title" width="560px">
    <template v-if="sourceTask">
      <el-alert
        :closable="false"
        description="已上传的网页资源、数据提交接口地址和运行时令牌不会跟随模板保存；当前填写的 HTML 源码会保留，复用后可再次一键保存为任务页面。"
        title="模板会保留任务结构与源码，不会带出运行时资源"
        type="info"
      />
      <el-form label-position="top">
        <el-form-item label="来源任务">
          <div class="task-template-source">
            <strong>{{ sourceTask.title || '未命名任务' }}</strong>
            <el-space wrap>
              <el-tag round type="info">{{ taskTypeLabel(sourceTask.task_type) }}</el-tag>
              <el-tag round :type="sourceTask.submission_scope === 'group' ? 'warning' : 'success'">
                {{ sourceTask.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
              </el-tag>
              <el-tag round :type="sourceTask.is_required ? 'success' : 'warning'">
                {{ sourceTask.is_required ? '必做' : '选做' }}
              </el-tag>
            </el-space>
          </div>
        </el-form-item>
        <el-form-item label="保存方式">
          <el-radio-group v-model="modeValue">
            <el-radio-button label="create">另存为新模板</el-radio-button>
            <el-radio-button :disabled="!customTemplates.length" label="overwrite">覆盖已有模板</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.mode === 'overwrite'" label="目标模板">
          <el-select v-model="templateIdValue" class="full-width" filterable placeholder="请选择要覆盖的自定义模板">
            <el-option
              v-for="templateItem in customTemplates"
              :key="templateItem.id"
              :label="templateItem.title"
              :value="templateItem.id"
            >
              <div class="task-template-select-option">
                <strong>{{ templateItem.title }}</strong>
                <span>{{ taskTypeLabel(templateItem.task_type) }} · 预设任务名：{{ templateItem.task_title }}</span>
              </div>
            </el-option>
          </el-select>
          <p class="section-note">覆盖后会更新模板内容、标题和说明，但不会影响已创建的学案任务。</p>
        </el-form-item>
        <el-form-item label="模板分组">
          <el-select
            v-model="groupNameValue"
            allow-create
            clearable
            default-first-option
            filterable
            class="full-width"
            placeholder="例如：讨论活动、数据任务、网页互动"
          >
            <el-option v-for="groupName in groupOptions" :key="groupName" :label="groupName" :value="groupName" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板置顶">
          <el-switch v-model="isPinnedValue" active-text="置顶显示" inactive-text="普通排序" />
        </el-form-item>
        <el-form-item label="模板名称">
          <el-input
            v-model="titleValue"
            maxlength="120"
            placeholder="例如：数据采集双页模板、课堂讨论标准模板"
          />
        </el-form-item>
        <el-form-item label="模板说明">
          <el-input
            v-model="summaryValue"
            :autosize="{ minRows: 3, maxRows: 6 }"
            maxlength="500"
            show-word-limit
            type="textarea"
            placeholder="补充这个模板适合的课堂场景、学生产出形式或使用建议。"
          />
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-space wrap>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button :loading="saving" type="primary" @click="$emit('save')">
          {{ saveButtonLabel }}
        </el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { CustomTaskTemplate, PlanFormTask, TaskTemplateFormState } from '../lessonPlan.types';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  sourceTask: PlanFormTask | null;
  form: TaskTemplateFormState;
  customTemplates: CustomTaskTemplate[];
  groupOptions: string[];
  saving: boolean;
  saveButtonLabel: string;
  taskTypeLabel: (taskType: string) => string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:form', value: TaskTemplateFormState): void;
  (e: 'mode-change', value: TaskTemplateFormState['mode']): void;
  (e: 'target-change', value: number | null): void;
  (e: 'save'): void;
}>();

function updateForm(patch: Partial<TaskTemplateFormState>) {
  emit('update:form', {
    ...props.form,
    ...patch,
  });
}

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const modeValue = computed({
  get: () => props.form.mode,
  set: (value: TaskTemplateFormState['mode']) => emit('mode-change', value),
});

const templateIdValue = computed({
  get: () => props.form.templateId,
  set: (value: number | null) => emit('target-change', value),
});

const groupNameValue = computed({
  get: () => props.form.group_name,
  set: (value: string) => updateForm({ group_name: value ?? '' }),
});

const isPinnedValue = computed({
  get: () => props.form.is_pinned,
  set: (value: boolean) => updateForm({ is_pinned: value }),
});

const titleValue = computed({
  get: () => props.form.title,
  set: (value: string) => updateForm({ title: value }),
});

const summaryValue = computed({
  get: () => props.form.summary,
  set: (value: string) => updateForm({ summary: value }),
});
</script>

<style scoped>
.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.task-template-select-option {
  display: grid;
  gap: 2px;
  line-height: 1.4;
}

.task-template-select-option strong {
  font-size: 13px;
  color: var(--ls-text);
}

.task-template-select-option span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-template-source {
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.92);
}

.full-width {
  width: 100%;
}
</style>
