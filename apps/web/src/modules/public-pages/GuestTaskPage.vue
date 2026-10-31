<template>
  <div class="sw-reading">
    <StudentPageHead :title="taskDetail?.title || `活动 ${route.params.taskId}`" :sub="headSub">
      <template #back>
        <RouterLink class="sw-back" :to="`/class/${classCode}`">← 返回本课学案</RouterLink>
      </template>
      <template #actions>
        <n-button
          v-if="previousTask"
          secondary
          @click="openTask(previousTask)"
        >
          上一个活动
        </n-button>
        <n-button
          v-if="nextTask"
          secondary
          type="primary"
          @click="openTask(nextTask)"
        >
          下一个活动
        </n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <div v-else-if="taskDetail" class="sw-split">
      <div class="sw-reading__main">
        <StudentPanel :title="descriptionTitle">
          <div class="sw-reading__prose">
            <RichTextContent :html="taskDetail.description" :empty-text="descriptionEmptyText" />
          </div>
        </StudentPanel>

        <StudentPanel v-if="isWebTask" title="活动页面">
          <iframe
            v-if="webTaskUrl"
            :src="webTaskUrl"
            :sandbox="sandboxFor(webTaskUrl)"
            class="guest-task__embed"
            title="网页活动"
          ></iframe>
          <p v-else class="sw-reading__note">
            这个网页活动还没有上传页面文件，登录后可以在学生端查看最新内容。
          </p>
        </StudentPanel>

        <StudentPanel v-else-if="isInteractiveOnly" title="活动形式">
          <p class="sw-reading__note">{{ interactiveNotice }}</p>
        </StudentPanel>

        <StudentPanel v-if="isDiscussionTask && taskDetail.topic" title="讨论主题">
          <p class="sw-reading__next-title">{{ taskDetail.topic }}</p>
        </StudentPanel>

        <StudentPanel v-if="taskDetail.plan_content" title="学案导读">
          <div class="sw-reading__prose">
            <RichTextContent :html="taskDetail.plan_content" empty-text="这节课没有补充导读。" />
          </div>
        </StudentPanel>

        <StudentPanel
          v-if="taskDetail.resources.length"
          title="附件与拓展"
          :count="`${taskDetail.resources.length} 项`"
          flush
        >
          <a
            v-for="resource in taskDetail.resources"
            :key="resource.id"
            class="sw-row sw-row--link sw-reading__resource"
            :href="resource.external_url || undefined"
            :target="resource.external_url ? '_blank' : undefined"
            :rel="resource.external_url ? 'noreferrer noopener' : undefined"
          >
            <span class="sw-row__main">
              <span class="sw-row__title">{{ resource.title }}</span>
              <span class="sw-row__meta">
                <span>{{ resourceTypeLabel(resource) }}</span>
                <span v-if="resource.summary">{{ resource.summary }}</span>
              </span>
            </span>
            <span class="sw-row__action">{{ resource.external_url ? '打开外链 →' : '仅可阅读 →' }}</span>
          </a>
        </StudentPanel>
      </div>

      <aside class="sw-split__aside">
        <StudentPanel title="活动信息">
          <div class="guest-task__meta">
            <span class="sw-chip sw-chip--warn">旁听只读</span>
            <span class="guest-task__type">{{ taskTypeLabel(taskDetail.task_type) }}</span>
          </div>
          <p class="sw-reading__note">
            旁听可以完整阅读活动说明与资源。提交作品、参与讨论和作品互评需要登录自己的账号。
          </p>
          <RouterLink class="guest-task__login" to="/login/student">去登录交作业</RouterLink>
        </StudentPanel>

        <StudentPanel v-if="nextTask" title="下一项">
          <p class="sw-reading__next-title">{{ nextTask.title }}</p>
          <n-button block secondary @click="openTask(nextTask)">进入下一活动</n-button>
        </StudentPanel>

        <StudentPanel v-else title="下一项">
          <p class="sw-reading__next-title">这是本课的最后一个活动。</p>
          <RouterLink class="guest-task__back" :to="`/class/${classCode}`">回到本课学案</RouterLink>
        </StudentPanel>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import { taskTypeLabel } from '@/modules/staff-lesson-plan/lessonPlanTask.utils';
import { ensureGuestToken } from '@/modules/public-pages/guestSession';
import { resolveIframeSandbox } from '@/utils/iframeTrust';
import type { NavigationTask } from '@/types/domain';
import type { GuestResource } from './guestTypes';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

type GuestTaskDetail = {
  id: number;
  title: string;
  task_type: string;
  submission_scope: string;
  sort_order: number;
  is_required: boolean;
  description: string;
  topic: string;
  web_entry_path: string;
  has_web_assets: boolean;
  plan_title: string;
  plan_content: string;
  lesson_title: string | null;
  unit_title: string | null;
  book_title: string | null;
  task_navigation: {
    previous_task: NavigationTask | null;
    next_task: NavigationTask | null;
  };
  resources: GuestResource[];
};

const route = useRoute();
const router = useRouter();

const taskDetail = ref<GuestTaskDetail | null>(null);
const guestToken = ref('');
const isLoading = ref(true);
const errorMessage = ref('');

const classCode = computed(() => String(route.params.code || '').toUpperCase());
const previousTask = computed(() => taskDetail.value?.task_navigation.previous_task || null);
const nextTask = computed(() => taskDetail.value?.task_navigation.next_task || null);
const isDiscussionTask = computed(() => taskDetail.value?.task_type === 'discussion');
const isReadingTask = computed(() => taskDetail.value?.task_type === 'reading');
const isWebTask = computed(() => taskDetail.value?.task_type === 'web_page');
// 这两类活动的正文就是操作界面本身（在线编程环境、数据提交表单），旁听无法只读使用。
const isInteractiveOnly = computed(
  () => taskDetail.value?.task_type === 'programming' || taskDetail.value?.task_type === 'data_submit'
);

const interactiveNotice = computed(() =>
  taskDetail.value?.task_type === 'programming'
    ? '这是一项在线编程活动，代码编辑与运行需要在学生端登录后使用；旁听只能阅读活动说明与资源。'
    : '这是一项数据提交活动，填写与提交表单需要在学生端登录后使用；旁听只能阅读活动说明与资源。'
);

function encodeAssetPath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

const webTaskUrl = computed(() => {
  const detail = taskDetail.value;
  if (!detail || detail.task_type !== 'web_page' || !detail.web_entry_path || !guestToken.value) {
    return '';
  }
  const raw = `${apiBaseUrl}/guest/tasks/${detail.id}/assets/web/${encodeAssetPath(detail.web_entry_path)}`;
  try {
    const parsed = new URL(raw, window.location.origin);
    parsed.searchParams.set('access_token', guestToken.value);
    return parsed.toString();
  } catch {
    return raw;
  }
});

function sandboxFor(src: string) {
  return resolveIframeSandbox(src);
}

const descriptionTitle = computed(() => (isReadingTask.value ? '阅读内容' : '活动说明'));
const descriptionEmptyText = computed(() =>
  isReadingTask.value ? '这条阅读活动还没有正文。' : '这个活动还没有补充说明正文。'
);

const headSub = computed(() => {
  const detail = taskDetail.value;
  if (!detail) return '';
  const parts = [detail.plan_title, detail.unit_title, detail.lesson_title].filter(Boolean);
  parts.push(taskTypeLabel(detail.task_type));
  parts.push(detail.is_required ? '必做' : '选做');
  return parts.join(' · ');
});

function resourceTypeLabel(resource: GuestResource) {
  if (resource.external_url) return '外链';
  if (resource.resource_type === 'article') return '文章';
  if (resource.resource_type === 'file') return '资料';
  return '资源';
}

function openTask(task: NavigationTask | null) {
  if (!task) return;
  void router.push(`/class/${classCode.value}/tasks/${task.id}`);
}

async function loadTask() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const guest = await ensureGuestToken(classCode.value);
    guestToken.value = guest.access_token;
    taskDetail.value = await apiGet<GuestTaskDetail>(
      `/guest/tasks/${route.params.taskId}`,
      guest.access_token
    );
  } catch (error) {
    taskDetail.value = null;
    errorMessage.value = error instanceof Error ? error.message : '加载活动失败，请重试';
  } finally {
    isLoading.value = false;
  }
}

watch(() => route.params.taskId, () => void loadTask(), { immediate: true });
</script>

<style scoped>
.sw-reading {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-reading__main {
  display: grid;
  gap: var(--sw-section-gap);
  min-width: 0;
}

.sw-reading__prose {
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.75;
}

.sw-reading__note {
  margin: 0;
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

a.sw-row {
  text-decoration: none;
}

.guest-task__embed {
  display: block;
  width: 100%;
  height: min(62vh, 560px);
  border: 1px solid var(--sw-line);
  border-radius: var(--sw-r-card);
  background: #fff;
}

.guest-task__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.guest-task__type {
  color: var(--sw-muted);
  font-size: 12px;
}

.guest-task__login,
.guest-task__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 12px;
  padding: 8px 14px;
  border: 1px solid var(--sw-line);
  border-radius: var(--sw-r-ctl);
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.15s ease;
}

.guest-task__login:hover,
.guest-task__back:hover {
  background: var(--sw-surface-2);
}
</style>
