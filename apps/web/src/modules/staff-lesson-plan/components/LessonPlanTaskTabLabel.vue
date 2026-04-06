<template>
  <div
    class="task-tab-label"
    :class="{
      'task-tab-label-dragging': draggingTaskKey === task.key,
      'task-tab-label-target': dragOverTaskKey === task.key && draggingTaskKey !== task.key,
    }"
    draggable="true"
    @dragstart="handleTaskTabDragStart(task.key, $event)"
    @dragover="handleTaskTabDragOver(task.key, $event)"
    @drop="handleTaskTabDrop(task.key, $event)"
    @dragend="handleTaskTabDragEnd"
  >
    <div class="task-tab-label__meta">
      <strong>{{ taskEditorTabTitle(task, index) }}</strong>
      <span>{{ taskTypeLabel(task.task_type) }}</span>
    </div>
    <span
      v-if="taskCount > 1"
      class="task-tab-close"
      draggable="false"
      role="button"
      tabindex="0"
      aria-label="关闭任务标签"
      @click.stop="removeTaskRow(task.key)"
      @keydown.enter.prevent.stop="removeTaskRow(task.key)"
      @keydown.space.prevent.stop="removeTaskRow(task.key)"
    >
      ×
    </span>
  </div>
</template>

<script setup lang="ts">
import type { PlanFormTask } from '../lessonPlan.types';

defineProps<{
  task: PlanFormTask;
  index: number;
  taskCount: number;
  draggingTaskKey: string;
  dragOverTaskKey: string;
  taskEditorTabTitle: (task: Pick<PlanFormTask, 'title'>, index: number) => string;
  taskTypeLabel: (taskType: string) => string;
  handleTaskTabDragStart: (taskKey: string, event: DragEvent) => void;
  handleTaskTabDragOver: (taskKey: string, event: DragEvent) => void;
  handleTaskTabDrop: (taskKey: string, event: DragEvent) => void;
  handleTaskTabDragEnd: () => void;
  removeTaskRow: (taskKey: string) => void;
}>();
</script>

<style scoped>
.task-tab-label {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  line-height: 1.25;
  user-select: none;
  cursor: grab;
  border-radius: 10px;
  padding: 2px 0;
  transition: background-color 0.18s ease, opacity 0.18s ease, transform 0.18s ease;
}

.task-tab-label:active {
  cursor: grabbing;
}

.task-tab-label__meta {
  display: grid;
  gap: 2px;
}

.task-tab-label strong {
  font-size: 13px;
  font-weight: 700;
}

.task-tab-label__meta span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-tab-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  color: var(--ls-muted);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.task-tab-close:hover,
.task-tab-close:focus-visible {
  background: rgba(215, 74, 74, 0.12);
  color: #c0392b;
  outline: none;
}

.task-tab-label-dragging {
  opacity: 0.55;
}

.task-tab-label-target {
  background: rgba(66, 97, 162, 0.12);
  transform: translateY(-1px);
}
</style>
