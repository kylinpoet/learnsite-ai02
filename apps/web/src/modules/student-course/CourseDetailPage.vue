<template>
  <div class="page-stack">
    <SaPageHeader
      description="这一页展示本课次的任务清单。图文任务、讨论任务、网页任务和数据提交任务都可以直接从这里进入。"
      eyebrow="学案详情"
      :title="planDetail?.title || `课程 ${route.params.courseId}`"
    >
      <template #actions>
        <n-tag round>课程体系已接入</n-tag>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel panel-class="detail-tab-card">
      <n-tabs v-model:value="activeTab" class="detail-tabs">
        <n-tab-pane name="guide" tab="学案导读">
          <n-skeleton v-if="isLoading" :rows="4" animated />
          <RichTextContent
            v-else
            :html="planDetail?.content"
            empty-text="当前课程还没有补充学案导读。"
          />
        </n-tab-pane>

        <template v-if="planDetail?.tasks.length">
          <n-tab-pane
            v-for="(task, index) in planDetail.tasks"
            :key="task.id"
            :name="taskTabName(task.id)"
          >
            <template #tab>
              <span class="task-tab-label">
                <span class="task-tab-label__title">任务{{ index + 1 }}</span>
                <span
                  :class="[
                    'task-tab-label__status',
                    task.is_completed ? 'task-tab-label__status--done' : 'task-tab-label__status--todo',
                  ]"
                >
                  {{ task.is_completed ? '已完成' : '未完成' }}
                </span>
              </span>
            </template>

            <n-skeleton v-if="isLoading" :rows="5" animated />
            <article v-else class="task-card task-card--single">
              <div class="task-main">
                <div class="task-head">
                  <p class="task-order">任务 {{ task.sort_order }}</p>
                  <n-tag round :type="task.is_required ? 'success' : 'warning'">
                    {{ task.is_required ? '必做' : '选做' }}
                  </n-tag>
                  <n-tag round :type="task.is_completed ? 'success' : 'info'">
                    {{ task.is_completed ? '已完成' : '未完成' }}
                  </n-tag>
                </div>
                <h3>{{ task.title }}</h3>
                <p class="task-type">{{ taskTypeLabel(task.task_type) }}</p>
                <p v-if="richTextToExcerpt(task.description, 120)" class="task-desc">
                  {{ richTextToExcerpt(task.description, 120) }}
                </p>
              </div>
              <n-button type="primary" @click="openTask(task)">进入任务</n-button>
            </article>
          </n-tab-pane>
        </template>

        <n-tab-pane v-else name="tasks-empty" tab="任务清单（0）">
          <n-skeleton v-if="isLoading" :rows="4" animated />
          <n-empty v-else description="当前课次还没有任务" />
        </n-tab-pane>
      </n-tabs>
    </SaPanel>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSkeleton, NTabPane, NTabs, NTag } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { richTextToExcerpt } from '@/utils/richText';

type PlanDetail = {
  id: number;
  title: string;
  content: string | null;
  lesson_id: number;
  lesson_title: string;
  tasks: Array<{
    id: number;
    title: string;
    task_type: string;
    description: string | null;
    sort_order: number;
    is_required: boolean;
    is_completed: boolean;
  }>;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const planDetail = ref<PlanDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const activeTab = ref('guide');

function taskTypeLabel(taskType: string) {
  if (taskType === 'rich_text') {
    return '图文任务';
  }
  if (taskType === 'web_page') {
    return '网页任务';
  }
  if (taskType === 'discussion') {
    return '讨论任务';
  }
  if (taskType === 'data_submit') {
    return '数据提交任务';
  }
  if (taskType === 'programming') {
    return '编程任务';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读任务';
  }
  return taskType;
}

function taskTabName(taskId: number) {
  return `task:${taskId}`;
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

async function openTask(task: PlanDetail['tasks'][number]) {
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
.detail-tab-card :deep(.sa-panel__body) {
  padding-top: 14px;
}

.detail-tabs :deep(.n-tabs-nav) {
  margin-bottom: 14px;
}

.detail-tabs :deep(.n-tabs-tab) {
  height: auto;
  line-height: 1.2;
  padding: 10px 12px;
  border-radius: 12px;
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}

.detail-tabs :deep(.n-tabs-tab:hover) {
  background: var(--ls-chip-bg);
}

.detail-tabs :deep(.n-tabs-tab.n-tabs-tab--active) {
  background: var(--ls-primary-soft);
  box-shadow: inset 0 0 0 1px var(--ls-border);
}

.task-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.task-tab-label__title {
  color: var(--ls-ink);
  font-weight: 700;
}

.task-tab-label__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid;
  padding: 3px 11px;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 700;
  box-shadow: 0 4px 10px rgba(36, 55, 90, 0.16);
}

.task-tab-label__status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  flex: 0 0 auto;
}

.task-tab-label__status--done {
  color: #ffffff;
  background: linear-gradient(135deg, #35be77, #1f9758);
  border-color: rgba(16, 96, 55, 0.58);
}

.task-tab-label__status--todo {
  color: #ffffff;
  background: linear-gradient(135deg, #8ea6d8, #6f87bf);
  border-color: rgba(67, 86, 130, 0.58);
}

.detail-tabs :deep(.n-tabs-tab--active .task-tab-label__title) {
  color: var(--ls-primary);
  text-shadow: 0 0 0 rgba(0, 0, 0, 0);
}

.detail-tabs :deep(.n-tabs-tab--active .task-tab-label__status--done) {
  background: linear-gradient(135deg, #2dbd72, #187f48);
  box-shadow: 0 6px 14px rgba(24, 127, 72, 0.32);
  transform: translateY(-1px);
}

.detail-tabs :deep(.n-tabs-tab--active .task-tab-label__status--todo) {
  background: linear-gradient(135deg, #89a2d9, #5f79b8);
  box-shadow: 0 6px 14px rgba(79, 101, 151, 0.3);
  transform: translateY(-1px);
}

.task-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: var(--ls-card);
}

.task-card--single {
  margin-top: 2px;
}

.task-main h3,
.task-order,
.task-type {
  margin: 0;
}

.task-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.task-main h3 {
  margin-top: 6px;
  font-size: 18px;
}

.task-order,
.task-type {
  color: var(--ls-muted);
}

.task-type {
  margin-top: 6px;
}

.task-desc {
  margin: 8px 0 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

@media (max-width: 768px) {
  .task-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
