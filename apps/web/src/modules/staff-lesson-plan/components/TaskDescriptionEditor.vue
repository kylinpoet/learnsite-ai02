<template>
  <el-form-item :label="label">
    <div class="mode-toolbar">
      <el-radio-group v-model="task.description_mode" size="small">
        <el-radio-button value="visual">可视化</el-radio-button>
        <el-radio-button value="source">HTML源码</el-radio-button>
      </el-radio-group>
      <el-button :loading="generating" plain @click="generateTaskDescriptionDraft(task)">
        AI 生成说明
      </el-button>
    </div>
    <RichTextEditor
      v-if="task.description_mode === 'visual'"
      v-model="task.description"
      :min-height="minHeight"
      :placeholder="visualPlaceholder"
    />
    <el-input
      v-else
      v-model="task.description"
      :autosize="{ minRows: 10, maxRows: 18 }"
      type="textarea"
      :placeholder="sourcePlaceholder"
    />
  </el-form-item>
</template>

<script setup lang="ts">
import RichTextEditor from '@/components/RichTextEditor.vue';

import type { PlanFormTask } from '../lessonPlan.types';

withDefaults(
  defineProps<{
    task: PlanFormTask;
    generating: boolean;
    generateTaskDescriptionDraft: (task: PlanFormTask) => void;
    label?: string;
    minHeight?: number;
    visualPlaceholder?: string;
    sourcePlaceholder?: string;
  }>(),
  {
    label: '任务说明',
    minHeight: 220,
    visualPlaceholder: '填写任务目标、步骤与提交要求。',
    sourcePlaceholder: '<p>这里可以直接编辑任务说明 HTML。</p>',
  }
);
</script>

<style scoped>
.mode-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .mode-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
