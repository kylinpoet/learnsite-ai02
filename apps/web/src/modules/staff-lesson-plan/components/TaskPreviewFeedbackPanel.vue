<template>
  <div v-if="feedback" class="task-preview-feedback" :class="`task-preview-feedback--${feedback.level}`">
    <div class="task-preview-feedback__head">
      <strong>{{ feedback.title }}</strong>
      <n-button
        v-if="feedback.hasExpandableDetail"
        size="small"
        text
        type="primary"
        @click="$emit('toggle-detail')"
      >
        {{ detailToggleLabel }}
      </n-button>
      <n-button v-if="feedback.detail" size="small" text type="primary" @click="$emit('copy-detail')">
        复制详情
      </n-button>
      <n-button size="small" text type="primary" @click="$emit('retry')">
        {{ retryLabel }}
      </n-button>
    </div>
    <p>{{ feedback.message }}</p>
    <pre v-if="feedback.detail" class="task-preview-feedback__detail">{{ detail }}</pre>
  </div>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui';

import type { TaskPreviewFeedback } from '../lessonPlan.types';

withDefaults(
  defineProps<{
    feedback: TaskPreviewFeedback | null;
    detail: string;
    detailToggleLabel: string;
    retryLabel?: string;
  }>(),
  {
    retryLabel: '重新加载预览',
  }
);

defineEmits<{
  (e: 'toggle-detail'): void;
  (e: 'copy-detail'): void;
  (e: 'retry'): void;
}>();
</script>

<style scoped>
.task-preview-feedback {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(201, 154, 54, 0.24);
  border-radius: 18px;
  background: rgba(201, 154, 54, 0.14);
  color: var(--ls-warning-text);
  }

  .task-preview-feedback--error {
  border-color: rgba(194, 68, 68, 0.26);
  background: rgba(194, 68, 68, 0.14);
  color: var(--ls-error-text);
  }

.task-preview-feedback__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.task-preview-feedback__head strong {
  font-size: 14px;
  margin-right: auto;
}

.task-preview-feedback p {
  margin: 0;
  line-height: 1.6;
}

.task-preview-feedback__detail {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--ls-chip-bg);
  color: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
}
</style>
