<template>
  <section class="page-stack auth-login-page guest-class-page">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <p class="eyebrow">{{ appStore.title }}</p>
        <h1>{{ overview?.class.name ? `${overview.class.name} · 旁听` : '班级旁听' }}</h1>
        <p class="hero-copy">
          你现在是旁听身份：只能查看本班这节课的学案、任务清单和关联资源，不能提交作品、不能签到、也不能参与互评。
          需要交作业请回到登录页，用班级码点自己的名字登录。
        </p>

        <div class="auth-pill-row">
          <span class="auth-pill">只读</span>
          <span class="auth-pill">不签写任何记录</span>
        </div>
      </div>

      <SaPanel panel-class="auth-form-panel guest-panel">
        <div class="auth-form-panel__top">
          <span class="auth-form-panel__tag">旁听模式 · {{ classCode }}</span>
          <p class="auth-form-panel__title">
            {{ overview?.plan ? overview.plan.title : '本节课暂未推送学案' }}
          </p>
        </div>

        <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

        <n-skeleton v-if="isLoading" :rows="6" animated />

        <template v-else-if="overview">
          <p v-if="overview.plan" class="guest-lesson-line">
            {{ overview.plan.book_name }} · {{ overview.plan.unit_title }} / {{ overview.plan.lesson_title }}
          </p>

          <div v-if="overview.tasks.length" class="guest-task-list">
            <article v-for="task in overview.tasks" :key="task.id" class="guest-task-item">
              <div class="guest-task-item__main">
                <p class="guest-task-item__title">{{ task.sort_order }}. {{ task.title }}</p>
                <div class="guest-task-tags">
                  <n-tag round size="small">{{ taskTypeLabel(task.task_type) }}</n-tag>
                  <n-tag round size="small" type="info">
                    {{ task.submission_scope === 'group' ? '小组任务' : '个人任务' }}
                  </n-tag>
                  <n-tag v-if="task.is_required" round size="small" type="success">必做</n-tag>
                </div>
              </div>
              <span class="guest-task-item__lock">需登录</span>
            </article>
          </div>
          <n-empty v-else description="本节课还没有任务" />

          <template v-if="overview.resources.length">
            <p class="guest-section-title">关联资源</p>
            <ul class="guest-resource-list">
              <li v-for="resource in overview.resources" :key="resource.id">
                <a
                  v-if="resource.external_url"
                  :href="resource.external_url"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {{ resource.title }}
                </a>
                <span v-else>{{ resource.title }}</span>
                <span v-if="resource.summary" class="guest-resource-summary">{{ resource.summary }}</span>
              </li>
            </ul>
          </template>

          <div class="action-row guest-actions">
            <n-button type="primary" @click="goToLogin">用班级码登录</n-button>
            <RouterLink to="/login/student">返回登录页</RouterLink>
          </div>
        </template>

        <div v-else class="action-row guest-actions">
          <n-button type="primary" @click="goToLogin">重新输入班级码</n-button>
        </div>
      </SaPanel>
    </div>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSkeleton, NTag } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAppStore } from '@/stores/app';
import { taskTypeLabel } from '@/modules/staff-lesson-plan/lessonPlanTask.utils';

type GuestTokenPayload = {
  access_token: string;
  expires_at: string;
  class_id: number;
  class_name: string;
};

type GuestOverview = {
  class: { id: number; name: string; grade_no: number; class_no: number };
  plan: {
    id: number;
    title: string;
    status: string;
    lesson_title: string | null;
    unit_title: string | null;
    book_name: string | null;
  } | null;
  tasks: Array<{
    id: number;
    title: string;
    task_type: string;
    sort_order: number;
    is_required: boolean;
    submission_scope: string;
  }>;
  resources: Array<{
    id: number;
    title: string;
    resource_type: string;
    summary: string | null;
    external_url: string | null;
  }>;
};

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const isLoading = ref(true);
const errorMessage = ref('');
const overview = ref<GuestOverview | null>(null);

const classCode = computed(() => String(route.params.code || '').toUpperCase());

async function load() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const guest = await apiPost<GuestTokenPayload>('/auth/class/guest', {
      class_code: classCode.value,
    });
    overview.value = await apiGet<GuestOverview>('/guest/class', guest.access_token);
  } catch (error) {
    overview.value = null;
    errorMessage.value = error instanceof Error ? error.message : '班级码无效或旁听已过期';
  } finally {
    isLoading.value = false;
  }
}

function goToLogin() {
  void router.push('/login/student');
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.guest-class-page :deep(.hero-copy) {
  max-width: 60ch;
  font-size: 14px;
  line-height: 1.8;
}

.guest-panel {
  border-radius: 24px;
}

.guest-lesson-line {
  margin: 0 0 12px;
  color: var(--ls-muted);
  font-size: 12px;
}

.guest-task-list {
  display: grid;
  gap: 8px;
}

.guest-task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--ls-border);
  border-radius: 14px;
  background: var(--ls-input-bg);
  padding: 12px 14px;
}

.guest-task-item__title {
  margin: 0 0 6px;
  color: var(--ls-text);
  font-size: 14px;
  font-weight: 700;
}

.guest-task-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.guest-task-item__lock {
  flex-shrink: 0;
  color: var(--ls-muted);
  font-size: 11px;
  border: 1px dashed var(--ls-border);
  border-radius: 999px;
  padding: 3px 9px;
}

.guest-section-title {
  margin: 18px 0 8px;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 700;
}

.guest-resource-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 13px;
}

.guest-resource-summary {
  display: block;
  color: var(--ls-muted);
  font-size: 12px;
}

.guest-actions {
  margin-top: 18px;
  align-items: center;
}
</style>
