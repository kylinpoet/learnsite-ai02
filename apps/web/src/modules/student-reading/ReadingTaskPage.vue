<template>
  <div class="sw-reading">
    <StudentPageHead
      :title="taskDetail?.title || `阅读活动 ${route.params.taskId}`"
      :sub="headSub"
    >
      <template #back>
        <button class="sw-back" type="button" @click="goToCourse">← 返回课程</button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <div v-else-if="taskDetail" class="sw-split">
      <div class="sw-reading__main">
        <StudentPanel title="阅读内容">
          <div class="sw-reading__prose">
            <RichTextContent :html="taskDetail.description" empty-text="这条阅读活动还没有正文。" />
          </div>
        </StudentPanel>

        <StudentPanel v-if="taskDetail.course.content" title="学案导读">
          <div class="sw-reading__prose">
            <RichTextContent :html="taskDetail.course.content" empty-text="这节课没有补充导读。" />
          </div>
        </StudentPanel>

        <StudentPanel
          v-if="taskDetail.resources.length"
          title="附件与拓展"
          :count="`${taskDetail.resources.length} 项`"
          flush
        >
          <button
            v-for="resource in taskDetail.resources"
            :key="resource.id"
            type="button"
            class="sw-row sw-row--link sw-reading__resource"
            @click="openResource(resource)"
          >
            <span class="sw-row__main">
              <span class="sw-row__title">{{ resource.title }}</span>
              <span class="sw-row__meta">
                <span>{{ resourceTypeLabel(resource) }}</span>
                <span v-if="resource.category">{{ resource.category.name }}</span>
                <span>{{ resource.owner_name }}</span>
              </span>
            </span>
            <span class="sw-row__action">{{ resource.external_url ? '打开外链 →' : '查看资料 →' }}</span>
          </button>
        </StudentPanel>
      </div>

      <aside class="sw-split__aside">
        <StudentPanel title="阅读进度">
          <div class="sw-reading__status">
            <span :class="['sw-chip', isRead ? 'sw-chip--done' : 'sw-chip--now']">
              {{ isRead ? '已读' : '未读' }}
            </span>
            <span class="sw-reading__time">
              {{ isRead ? `已读于 ${readAtText}` : '完成阅读后确认' }}
            </span>
          </div>
          <n-button
            block
            :disabled="isRead"
            :loading="isMarkingRead"
            type="primary"
            @click="markAsRead"
          >
            {{ isRead ? '已确认读完' : '标记为已读' }}
          </n-button>
          <p class="sw-reading__note">
            确认只记录阅读时间，不会生成作品提交；后续活动仍需分别完成。
          </p>
        </StudentPanel>

        <StudentPanel v-if="taskDetail.task_navigation.next_task" title="下一项">
          <p class="sw-reading__next-title">{{ taskDetail.task_navigation.next_task.title }}</p>
          <n-button
            block
            secondary
            @click="openNavigationTask(taskDetail.task_navigation.next_task!)"
          >
            进入下一活动
          </n-button>
        </StudentPanel>

        <StudentPanel v-else title="下一项">
          <p class="sw-reading__next-title">这是本课的最后一个活动。</p>
          <n-button block secondary @click="goToCourse">回到课程</n-button>
        </StudentPanel>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
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

const isRead = computed(() => Boolean(taskDetail.value?.reading_progress?.is_read));
const readAtText = computed(() => formatDateTime(taskDetail.value?.reading_progress?.read_at || null));

const headSub = computed(() => {
  const detail = taskDetail.value;
  if (!detail) {
    return '';
  }
  const parts = [detail.course.title, detail.course.unit_title, detail.course.lesson_title].filter(Boolean);
  parts.push(detail.is_required ? '必读' : '选读');
  return parts.join(' · ');
});

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
    errorMessage.value = error instanceof Error ? error.message : '加载阅读活动失败';
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
.sw-reading {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-reading__main {
  display: grid;
  gap: var(--sw-gap);
}

.sw-reading__prose {
  max-width: 76ch;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.75;
}

.sw-reading__resource {
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
}

.sw-reading__status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.sw-reading__time {
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sw-reading__note {
  margin: 10px 0 0;
  color: var(--sw-muted);
  font-size: 12px;
  line-height: 1.55;
}

.sw-reading__next-title {
  margin: 0 0 12px;
  color: var(--sw-ink);
  font-size: 14px;
  line-height: 1.5;
}
</style>
