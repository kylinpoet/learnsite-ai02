<template>
  <div class="sw-course">
    <StudentPageHead :title="planDetail?.title || `课程 ${route.params.courseId}`" :sub="headSub">
      <template #back>
        <RouterLink class="sw-back" to="/student/home">← 返回学习首页</RouterLink>
      </template>
      <template v-if="nextTask" #actions>
        <n-button type="primary" @click="openTask(nextTask)">继续：{{ nextTask.title }}</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="6" animated /></div>
    </div>

    <template v-else-if="planDetail">
      <div v-if="tasks.length" class="sw-course__progress">
        <div class="sw-progress">
          <span class="sw-progress__track">
            <span class="sw-progress__fill" :style="{ width: `${completionPercent}%` }" />
          </span>
          <span class="sw-progress__label">{{ completedCount }}/{{ tasks.length }} 已完成</span>
        </div>
        <p class="sw-course__progress-note">按顺序完成，提交后回到这里进入下一项。</p>
      </div>

      <StudentPanel title="活动清单" :count="`${tasks.length} 项`" flush>
        <template v-if="tasks.length">
          <button
            v-for="task in sortedTasks"
            :key="task.id"
            type="button"
            class="sw-row sw-row--link sw-task"
            @click="openTask(task)"
          >
            <span :class="['sw-task__index', { 'is-done': task.is_completed }]">{{ task.sort_order }}</span>
            <span class="sw-row__main">
              <span class="sw-row__title">
                {{ task.title }}
                <span v-if="task.is_required" class="sw-task__required">必做</span>
              </span>
              <span class="sw-row__meta">
                <span>{{ taskTypeLabel(task.task_type) }}</span>
                <span v-if="taskExcerpt(task)" class="sw-task__excerpt">{{ taskExcerpt(task) }}</span>
              </span>
            </span>
            <span
              :class="['sw-chip', task.is_completed ? 'sw-chip--done' : 'sw-chip--todo']"
            >
              {{ task.is_completed ? '已完成' : '未完成' }}
            </span>
            <span class="sw-task__go">
              {{ task.is_completed ? '查看' : '开始' }}
              <span aria-hidden="true">→</span>
            </span>
          </button>
        </template>
        <StudentEmpty v-else text="这节课还没有发布活动。" />
      </StudentPanel>

      <StudentPanel v-if="hasGuide" title="学案导读">
        <RichTextContent :html="planDetail.content" empty-text="这节课没有补充导读。" />
      </StudentPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { richTextToExcerpt } from '@/utils/richText';

type PlanTask = {
  id: number;
  title: string;
  task_type: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  is_completed: boolean;
};

type PlanDetail = {
  id: number;
  title: string;
  content: string | null;
  lesson_id: number;
  lesson_title: string;
  unit_title?: string | null;
  tasks: PlanTask[];
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const planDetail = ref<PlanDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

const tasks = computed(() => planDetail.value?.tasks || []);
const sortedTasks = computed(() => [...tasks.value].sort((left, right) => left.sort_order - right.sort_order));
const completedCount = computed(() => tasks.value.filter((task) => task.is_completed).length);
const completionPercent = computed(() =>
  tasks.value.length ? Math.round((completedCount.value / tasks.value.length) * 100) : 0,
);
const nextTask = computed(() => sortedTasks.value.find((task) => !task.is_completed) || null);
const hasGuide = computed(() => Boolean(planDetail.value?.content?.trim()));

const headSub = computed(() => {
  if (!planDetail.value) {
    return '';
  }
  if (!tasks.value.length) {
    return `${planDetail.value.lesson_title} · 暂无活动`;
  }
  return `${planDetail.value.unit_title || planDetail.value.lesson_title} · ${tasks.value.length} 项活动，已完成 ${completedCount.value} 项`;
});

function taskTypeLabel(taskType: string) {
  if (taskType === 'rich_text') {
    return '图文活动';
  }
  if (taskType === 'web_page') {
    return '网页活动';
  }
  if (taskType === 'discussion') {
    return '讨论活动';
  }
  if (taskType === 'data_submit') {
    return '数据提交活动';
  }
  if (taskType === 'programming') {
    return '编程活动';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读活动';
  }
  return taskType;
}

function taskExcerpt(task: PlanTask) {
  return richTextToExcerpt(task.description, 48);
}

async function loadPlan() {
  try {
    planDetail.value = await apiGet<PlanDetail>(
      `/lesson-plans/${route.params.courseId}`,
      authStore.token || undefined
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课程详情失败';
  } finally {
    isLoading.value = false;
  }
}

async function openTask(task: PlanTask) {
  if (task.task_type === 'reading') {
    await router.push(`/student/courses/${route.params.courseId}/readings/${task.id}`);
    return;
  }

  if (task.task_type === 'programming') {
    await router.push(`/student/courses/${route.params.courseId}/programs/${task.id}`);
    return;
  }

  await router.push(`/student/courses/${route.params.courseId}/tasks/${task.id}`);
}

onMounted(loadPlan);
</script>

<style scoped>
.sw-course {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-course__progress {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 18px;
  border: 1px solid var(--sw-line);
  border-radius: var(--sw-r-card);
  background: var(--sw-surface);
}

.sw-course__progress .sw-progress {
  flex: 1;
  min-width: 0;
}

.sw-course__progress-note {
  margin: 0;
  flex: none;
  color: var(--sw-muted);
  font-size: 12px;
}

.sw-task {
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
}

.sw-task__index {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--sw-line);
  border-radius: 999px;
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sw-task__index.is-done {
  border-color: transparent;
  background: var(--sw-ink);
  color: var(--sw-surface);
}

.sw-task__required {
  margin-left: 6px;
  color: var(--sw-muted);
  font-size: 11.5px;
  font-weight: 400;
}

.sw-task__go {
  flex: none;
  color: var(--sw-muted);
  font-size: 13px;
}

.sw-task:hover .sw-task__go {
  color: var(--sw-ink);
}

@media (max-width: 720px) {
  .sw-course__progress {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .sw-task__excerpt {
    display: none;
  }

  .sw-task__go {
    display: none;
  }

  .sw-task {
    align-items: flex-start;
  }
}
</style>
