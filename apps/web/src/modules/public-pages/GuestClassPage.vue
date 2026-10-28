<template>
  <div class="sw-course">
    <StudentPageHead :title="pageTitle" :sub="headSub">
      <template #back>
        <span class="sw-back guest-back">旁听 · 只读</span>
      </template>
    </StudentPageHead>

    <n-alert
      v-if="errorMessage"
      :closable="false"
      :title="errorMessage"
      type="error"
    />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="6" animated /></div>
    </div>

    <template v-else-if="overview">
      <StudentPanel title="任务清单" :count="`${tasks.length} 项`" flush>
        <template v-if="tasks.length">
          <button
            v-for="task in sortedTasks"
            :key="task.id"
            type="button"
            class="sw-row sw-row--link sw-task"
            @click="openTask(task)"
          >
            <span class="sw-task__index">{{ task.sort_order }}</span>
            <span class="sw-row__main">
              <span class="sw-row__title">
                {{ task.title }}
                <span v-if="task.is_required" class="sw-task__required">必做</span>
              </span>
              <span class="sw-row__meta">
                <span>{{ taskTypeLabel(task.task_type) }}</span>
                <span>{{ task.submission_scope === 'group' ? '小组任务' : '个人任务' }}</span>
              </span>
            </span>
            <span class="sw-task__go">查看 →</span>
          </button>
        </template>
        <StudentEmpty v-else text="这节课还没有发布任务。" />
      </StudentPanel>

      <StudentPanel v-if="planContent" title="学案导读">
        <RichTextContent :html="planContent" empty-text="这节课没有补充导读。" />
      </StudentPanel>

      <StudentPanel v-if="resources.length" title="关联资源" :count="`${resources.length} 项`" flush>
        <a
          v-for="resource in resources"
          :key="resource.id"
          class="sw-row sw-row--link"
          :href="resource.external_url || undefined"
          :target="resource.external_url ? '_blank' : undefined"
          :rel="resource.external_url ? 'noreferrer noopener' : undefined"
        >
          <span class="sw-row__main">
            <span class="sw-row__title">{{ resource.title }}</span>
            <span class="sw-row__meta">
              <span>{{ resourceTypeLabel(resource.resource_type, resource.external_url) }}</span>
              <span v-if="resource.summary">{{ resource.summary }}</span>
            </span>
          </span>
          <span class="sw-row__action">{{ resource.external_url ? '打开外链 →' : '仅可阅读 →' }}</span>
        </a>
      </StudentPanel>
    </template>

    <div v-else class="sw-panel">
      <div class="sw-panel__body">
        <StudentEmpty text="班级码无效或旁听已过期，请回到登录页重新进入。" box />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import { taskTypeLabel } from '@/modules/staff-lesson-plan/lessonPlanTask.utils';
import { ensureGuestToken } from '@/modules/public-pages/guestSession';

type GuestResource = {
  id: number;
  title: string;
  resource_type: string;
  summary: string | null;
  external_url: string | null;
};

type GuestTask = {
  id: number;
  title: string;
  task_type: string;
  sort_order: number;
  is_required: boolean;
  submission_scope: string;
};

type GuestOverview = {
  class: { id: number; name: string; grade_no: number; class_no: number };
  plan: {
    id: number;
    title: string;
    status: string;
    content: string;
    lesson_title: string | null;
    unit_title: string | null;
    book_name: string | null;
  } | null;
  tasks: GuestTask[];
  resources: GuestResource[];
};

const route = useRoute();
const router = useRouter();

const isLoading = ref(true);
const errorMessage = ref('');
const overview = ref<GuestOverview | null>(null);

const classCode = computed(() => String(route.params.code || '').toUpperCase());
const tasks = computed(() => overview.value?.tasks || []);
const sortedTasks = computed(() => [...tasks.value].sort((left, right) => left.sort_order - right.sort_order));
const resources = computed(() => overview.value?.resources || []);
const planContent = computed(() => (overview.value?.plan?.content || '').trim());

const pageTitle = computed(() => {
  if (overview.value?.plan?.title) return overview.value.plan.title;
  return overview.value?.class.name || '班级旁听';
});

const headSub = computed(() => {
  const current = overview.value;
  if (!current) return '';
  const parts: string[] = [current.class.name];
  if (current.plan?.book_name) parts.push(current.plan.book_name);
  if (current.plan?.unit_title) parts.push(current.plan.unit_title);
  if (current.plan?.lesson_title) parts.push(current.plan.lesson_title);
  parts.push(`${tasks.value.length} 项任务`);
  return parts.join(' · ');
});

function resourceTypeLabel(resourceType: string, externalUrl: string | null) {
  if (externalUrl) return '外链';
  if (resourceType === 'article') return '文章';
  if (resourceType === 'file') return '资料';
  return '资源';
}

function openTask(task: GuestTask) {
  void router.push(`/class/${classCode.value}/tasks/${task.id}`);
}

onMounted(async () => {
  try {
    const guest = await ensureGuestToken(classCode.value);
    overview.value = await apiGet<GuestOverview>('/guest/class', guest.access_token);
  } catch (error) {
    overview.value = null;
    errorMessage.value = error instanceof Error ? error.message : '班级码无效或旁听已过期';
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
.sw-course {
  display: grid;
  gap: var(--sw-section-gap);
}

.guest-back {
  cursor: default;
}

.guest-back:hover {
  color: var(--sw-muted);
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

a.sw-row {
  text-decoration: none;
}
</style>
