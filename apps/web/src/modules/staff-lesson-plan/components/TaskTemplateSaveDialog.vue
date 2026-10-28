<template>
  <n-modal
    v-model:show="dialogVisible"
    preset="card"
    :title="title"
    :mask-closable="false"
    style="width: min(560px, 96vw)"
  >
    <template v-if="sourceTask">
      <n-alert
        :closable="false"
        title="模板会保留任务结构与源码，不会带出运行时资源"
        type="info"
      >
        已上传的网页资源、数据提交接口地址和运行时令牌不会跟随模板保存；当前填写的 HTML 源码会保留，复用后可再次一键保存为任务页面。
      </n-alert>
      <n-form class="task-template-form" label-placement="top">
        <n-form-item label="来源任务">
          <div class="task-template-source">
            <strong>{{ sourceTask.title || '未命名任务' }}</strong>
            <div class="chip-row">
              <n-tag round type="info">{{ taskTypeLabel(sourceTask.task_type) }}</n-tag>
              <n-tag round :type="sourceTask.submission_scope === 'group' ? 'warning' : 'success'">
                {{ sourceTask.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
              </n-tag>
              <n-tag round :type="sourceTask.is_required ? 'success' : 'warning'">
                {{ sourceTask.is_required ? '必做' : '选做' }}
              </n-tag>
            </div>
          </div>
        </n-form-item>
        <n-form-item label="保存方式">
          <n-radio-group v-model:value="modeValue">
            <n-radio-button value="create">另存为新模板</n-radio-button>
            <n-radio-button :disabled="!customTemplates.length" value="overwrite">覆盖已有模板</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item v-if="form.mode === 'overwrite'" label="目标模板">
          <n-select
            v-model:value="templateIdValue"
            class="full-width"
            filterable
            :options="templateOptions"
            placeholder="请选择要覆盖的自定义模板"
            :render-option="renderTemplateOption"
          />
          <p class="section-note">覆盖后会更新模板内容、标题和说明，但不会影响已创建的学案任务。</p>
        </n-form-item>
        <n-form-item label="模板分组">
          <n-select
            v-model:value="groupNameValue"
            class="full-width"
            clearable
            filterable
            tag
            :options="groupNameOptions"
            placeholder="例如：讨论活动、数据任务、网页互动"
          />
        </n-form-item>
        <n-form-item label="模板置顶">
          <n-switch v-model:value="isPinnedValue">
            <template #checked>置顶显示</template>
            <template #unchecked>普通排序</template>
          </n-switch>
        </n-form-item>
        <n-form-item label="模板名称">
          <n-input
            v-model:value="titleValue"
            maxlength="120"
            placeholder="例如：数据采集双页模板、课堂讨论标准模板"
          />
        </n-form-item>
        <n-form-item label="模板说明">
          <RichTextEditor
            v-model="summaryValue"
            class="task-template-summary-editor"
            :min-height="160"
            placeholder="补充这个模板适合的课堂场景、学生产出形式或使用建议。"
          />
        </n-form-item>
      </n-form>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <n-button @click="dialogVisible = false">取消</n-button>
        <n-button :loading="saving" type="primary" @click="$emit('save')">
          {{ saveButtonLabel }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import type { SelectRenderOption } from 'naive-ui';
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSwitch,
  NTag,
} from 'naive-ui';
import { computed, h } from 'vue';

import RichTextEditor from '@/components/RichTextEditor.vue';

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

const groupNameOptions = computed(() => props.groupOptions.map((groupName) => ({
  label: groupName,
  value: groupName,
})));

const templateOptions = computed(() =>
  props.customTemplates.map((templateItem) => ({
    label: templateItem.title,
    value: templateItem.id,
  }))
);

const templateOptionMeta = computed(() => {
  const map = new Map<number, string>();
  for (const templateItem of props.customTemplates) {
    map.set(
      templateItem.id,
      `${props.taskTypeLabel(templateItem.task_type)} · 预设任务名：${templateItem.task_title}`
    );
  }
  return map;
});

/** 下拉项由下拉层渲染，scoped 样式不会命中，排版改用行内样式。 */
const renderTemplateOption: SelectRenderOption = (info) => {
  const option = info.option as { value?: string | number; label?: string };
  const meta = typeof option.value === 'number' ? templateOptionMeta.value.get(option.value) : '';
  return h('div', { style: 'display: grid; gap: 2px; line-height: 1.4; white-space: normal;' }, [
    h('strong', { style: 'display: block; font-size: 13px; color: var(--ls-text);' }, option.label || ''),
    h('span', { style: 'display: block; font-size: 12px; color: var(--ls-muted);' }, meta || ''),
  ]);
};
</script>

<style scoped>
.task-template-form {
  margin-top: 14px;
}

.chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.task-template-source {
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 16px;
  background: var(--ls-panel-soft);
}

.full-width {
  width: 100%;
}

.task-template-summary-editor :deep(.ck-editor__editable) {
  line-height: 1.65;
}
</style>
