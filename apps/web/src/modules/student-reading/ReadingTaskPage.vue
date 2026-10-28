<template>
  <div class="page-stack">
    <SaPageHeader
      eyebrow="阅读任务"
      :title="taskDetail?.title || `阅读任务 ${route.params.taskId}`"
    >
      <p class="hero-copy">
        {{ taskDetail?.course.title || '正在加载课次信息' }}
        <span v-if="taskDetail">
          · {{ taskDetail.course.book_title }} · {{ taskDetail.course.unit_title }} · {{ taskDetail.course.lesson_title }}
        </span>
      </p>
      <template #actions>
        <div class="action-group">
          <n-button secondary @click="goToCourse">返回课程</n-button>
          <n-button
            v-if="taskDetail?.task_navigation.previous_task"
            secondary
            @click="openNavigationTask(taskDetail.task_navigation.previous_task)"
          >
            上一个任务
          </n-button>
          <n-button
            v-if="taskDetail?.task_navigation.next_task"
            secondary
            type="primary"
            @click="openNavigationTask(taskDetail.task_navigation.next_task)"
          >
            下一个任务
          </n-button>
        </div>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="taskDetail" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">阅读状态</p>
        <p class="metric-value metric-value--small">{{ readStatusLabel }}</p>
        <p class="metric-note">{{ readStatusNote }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">任务要求</p>
        <p class="metric-value metric-value--small">{{ taskDetail.is_required ? '必读' : '选读' }}</p>
        <p class="metric-note">建议先完成阅读，再进入后续实践任务。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">教材位置</p>
        <p class="metric-value metric-value--small">{{ taskDetail.course.lesson_title }}</p>
        <p class="metric-note">{{ taskDetail.course.unit_title }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">已读时间</p>
        <p class="metric-value metric-value--small">{{ readAtText }}</p>
        <p class="metric-note">
          {{ taskDetail.task_navigation.next_task ? `下一任务：${taskDetail.task_navigation.next_task.title}` : '这是本课的最后一个任务。' }}
        </p>
      </article>
    </div>

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="10" animated />
    </SaPanel>

    <div v-else-if="taskDetail" class="detail-grid">
      <div class="detail-main">
        <SaPanel title="阅读内容">
          <template #actions>
            <n-tag round type="success">课程阅读</n-tag>
          </template>
          <RichTextContent :html="taskDetail.description" empty-text="当前阅读任务还没有补充内容。" />
        </SaPanel>

        <SaPanel title="学案导读">
          <RichTextContent :html="taskDetail.course.content" empty-text="当前学案还没有补充导读内容。" />
        </SaPanel>

        <SaPanel v-if="taskDetail.resources.length" title="附件与拓展资源">
          <template #actions>
            <n-tag round type="info">{{ taskDetail.resources.length }} 项</n-tag>
          </template>

          <div class="resource-grid">
            <article v-for="resource in taskDetail.resources" :key="resource.id" class="resource-card">
              <div class="resource-card__head">
                <div class="chip-row">
                  <n-tag round :type="resource.external_url ? 'warning' : 'success'">
                    {{ resourceTypeLabel(resource) }}
                  </n-tag>
                  <n-tag v-if="resource.category" round type="info">
                    {{ resource.category.name }}
                  </n-tag>
                </div>
                <n-button text type="primary" @click="openResource(resource)">
                  {{ resource.external_url ? '打开外链' : '查看资料' }}
                </n-button>
              </div>

              <h3>{{ resource.title }}</h3>
              <p class="resource-card__summary">{{ resourceSummaryText(resource) }}</p>
              <p class="resource-card__meta">
                {{ resource.owner_name }}
                <span v-if="resource.external_url"> · 外部链接</span>
              </p>
            </article>
          </div>
        </SaPanel>
      </div>

      <SaPanel title="阅读操作">
        <n-descriptions :column="1" bordered>
          <n-descriptions-item label="课程">{{ taskDetail.course.title }}</n-descriptions-item>
          <n-descriptions-item label="课次">{{ taskDetail.course.lesson_title }}</n-descriptions-item>
          <n-descriptions-item label="阅读状态">{{ readStatusLabel }}</n-descriptions-item>
          <n-descriptions-item label="已读时间">{{ readAtText }}</n-descriptions-item>
        </n-descriptions>

        <div class="tip-panel">
          <p class="tip-title">阅读提示</p>
          <p>1. 本页用于阅读任务正文与学案导读内容。</p>
          <p>2. 阅读确认会记录“已读时间”，不会生成作品提交记录。</p>
          <p>3. 阅读完成后，可以直接进入下一任务继续学习。</p>
        </div>

        <div class="page-stack page-stack--compact">
          <n-button
            :disabled="Boolean(taskDetail.reading_progress?.is_read)"
            :loading="isMarkingRead"
            block
            type="primary"
            @click="markAsRead"
          >
            {{ taskDetail.reading_progress?.is_read ? '已完成已读确认' : '标记为已读' }}
          </n-button>
          <n-button
            v-if="taskDetail.task_navigation.next_task"
            block
            secondary
            @click="openNavigationTask(taskDetail.task_navigation.next_task)"
          >
            进入下一任务
          </n-button>
        </div>
      </SaPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NSkeleton,
  NTag,
} from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

type NavigationTask = {
  id: number;
  title: string;
  task_type: string;
};

type ReadingResource = {
  id: number;
  task_id: number;
  resource_id: number;
  relation_type: string;
  sort_order: number;
  title: string;
  resource_type: string;
  summary: string | null;
  content: string | null;
  external_url: string | null;
  owner_name: string;
  category: {
    id: number;
    name: string;
  } | null;
};

type ReadingTaskPayload = {
  id: number;
  title: string;
  task_type: string;
  description: string | null;
  is_required: boolean;
  course: {
    id: number;
    title: string;
    assigned_date: string;
    lesson_title: string;
    unit_title: string;
    book_title: string;
    content: string | null;
  };
  task_navigation: {
    previous_task: NavigationTask | null;
    next_task: NavigationTask | null;
  };
  resources: ReadingResource[];
  reading_progress: {
    is_read: boolean;
    read_at: string | null;
    can_mark_read: boolean;
  } | null;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const taskDetail = ref<ReadingTaskPayload | null>(null);
const isLoading = ref(true);
const isMarkingRead = ref(false);
const errorMessage = ref('');

const readStatusLabel = computed(() => (taskDetail.value?.reading_progress?.is_read ? '已读' : '未读'));
const readStatusNote = computed(() => {
  if (taskDetail.value?.reading_progress?.is_read) {
    return '你已经完成这条阅读任务的已读确认。';
  }
  return '请先完整阅读本页内容，再点击已读确认。';
});
const readAtText = computed(() => formatDateTime(taskDetail.value?.reading_progress?.read_at || null));

function buildTaskRoute(task: NavigationTask) {
  const courseId = taskDetail.value?.course.id || route.params.courseId;
  if (task.task_type === 'reading') {
    return `/student/courses/${courseId}/readings/${task.id}`;
  }
  if (task.task_type === 'programming') {
    return `/student/courses/${courseId}/programs/${task.id}`;
  }
  return `/student/courses/${courseId}/tasks/${task.id}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '待确认';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function resourceTypeLabel(resource: ReadingResource) {
  if (resource.external_url) {
    return '外链';
  }
  if (resource.relation_type === 'attachment') {
    return '资料';
  }
  if (resource.resource_type === 'article') {
    return '文章';
  }
  return '资源';
}

function resourceSummaryText(resource: ReadingResource) {
  if (resource.summary?.trim()) {
    return resource.summary.trim();
  }
  if (resource.external_url) {
    return '教师为本任务推荐了外部参考链接，可直接跳转查看。';
  }
  return '可在资源中心查看这份资料的完整内容。';
}

function openResource(resource: ReadingResource) {
  if (resource.external_url) {
    window.open(resource.external_url, '_blank', 'noopener,noreferrer');
    return;
  }
  void router.push({
    path: '/student/resources',
    query: {
      resourceId: String(resource.resource_id),
    },
  });
}

async function loadReadingTask() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiGet<ReadingTaskPayload>(`/tasks/${route.params.taskId}`, authStore.token);
    if (payload.task_type !== 'reading') {
      await router.replace(buildTaskRoute({ id: payload.id, title: payload.title, task_type: payload.task_type }));
      return;
    }
    taskDetail.value = payload;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载阅读任务失败';
  } finally {
    isLoading.value = false;
  }
}

async function markAsRead() {
  if (!taskDetail.value || !authStore.token || taskDetail.value.reading_progress?.is_read) {
    return;
  }

  isMarkingRead.value = true;
  try {
    taskDetail.value = await apiPost<ReadingTaskPayload>(
      `/tasks/${taskDetail.value.id}/mark-read`,
      {},
      authStore.token
    );
    ElMessage.success('已记录阅读完成时间');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '标记已读失败');
  } finally {
    isMarkingRead.value = false;
  }
}

async function openNavigationTask(task: NavigationTask) {
  await router.push(buildTaskRoute(task));
}

async function goToCourse() {
  const courseId = taskDetail.value?.course.id || route.params.courseId;
  await router.push(`/student/courses/${courseId}`);
}

watch(() => route.params.taskId, () => {
  void loadReadingTask();
}, { immediate: true });
</script>

<style scoped>
.action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 16fr) minmax(0, 8fr);
  gap: 16px;
  align-items: start;
}

.detail-main {
  display: grid;
  gap: 16px;
}

@media (max-width: 1200px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.tip-panel {
  margin-top: 20px;
  padding: 16px;
  border-radius: 18px;
  background: var(--ls-primary-soft);
}

.tip-panel p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.8;
}

.tip-title {
  margin-bottom: 8px;
  color: var(--ls-ink) !important;
  font-weight: 700;
}

.page-stack--compact {
  margin-top: 16px;
  gap: 10px;
}

.metric-value--small {
  font-size: 22px;
}

.resource-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.resource-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--ls-border);
  background: var(--ls-panel);
}

.resource-card h3,
.resource-card p {
  margin: 0;
}

.resource-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.resource-card__summary,
.resource-card__meta {
  color: var(--ls-muted);
  line-height: 1.7;
}
</style>
