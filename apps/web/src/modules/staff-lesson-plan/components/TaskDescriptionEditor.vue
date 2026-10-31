<template>
  <n-form-item>
    <!-- 字段动作跟着标签走，正文区只放编辑器，避免在内容上方再压一行说明 -->
    <template #label>
      <span class="description-label">
        {{ props.label }}
        <n-button
          text
          size="tiny"
          type="primary"
          :loading="props.generating"
          @click="props.generateTaskDescriptionDraft(props.task)"
        >
          {{ props.generateLabel }}
        </n-button>
      </span>
    </template>
    <div class="description-body">
      <RichTextEditor
        v-model="props.task.description"
        :min-height="props.minHeight"
        :placeholder="props.placeholder"
      />
    </div>
  </n-form-item>
</template>

<script setup lang="ts">
import { NButton, NFormItem } from 'naive-ui';

import RichTextEditor from '@/components/RichTextEditor.vue';

import type { PlanFormTask } from '../lessonPlan.types';

const props = withDefaults(
  defineProps<{
    task: PlanFormTask;
    generating: boolean;
    generateTaskDescriptionDraft: (task: PlanFormTask) => void;
    label?: string;
    generateLabel?: string;
    minHeight?: number;
    placeholder?: string;
  }>(),
  {
    label: '活动说明',
    generateLabel: 'AI 生成说明',
    minHeight: 220,
    placeholder: '填写活动目标、步骤与提交要求。',
  }
);
</script>

<style scoped>
.description-body {
  width: 100%;
  min-width: 0;
}

.description-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
