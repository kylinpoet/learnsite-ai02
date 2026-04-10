<template>
  <el-form-item :label="props.label">
    <div class="description-toolbar">
      <p class="section-note">使用 CKEditor 富文本编辑；如需改源码，可在编辑器工具栏里切换源码视图。</p>
      <el-button :loading="props.generating" plain @click="props.generateTaskDescriptionDraft(props.task)">
        AI 生成说明
      </el-button>
    </div>
    <RichTextEditor
      v-model="props.task.description"
      :min-height="props.minHeight"
      :placeholder="props.placeholder"
    />
  </el-form-item>
</template>

<script setup lang="ts">
import RichTextEditor from '@/components/RichTextEditor.vue';

import type { PlanFormTask } from '../lessonPlan.types';

const props = withDefaults(
  defineProps<{
    task: PlanFormTask;
    generating: boolean;
    generateTaskDescriptionDraft: (task: PlanFormTask) => void;
    label?: string;
    minHeight?: number;
    placeholder?: string;
  }>(),
  {
    label: '任务说明',
    minHeight: 220,
    placeholder: '填写任务目标、步骤与提交要求。',
  }
);
</script>

<style scoped>
.description-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

@media (max-width: 768px) {
  .description-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
