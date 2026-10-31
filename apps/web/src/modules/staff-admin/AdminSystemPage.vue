<template>
  <div class="page-stack settings-page">
    <StaffPageHead
      title="系统设置"
      :sub="`${bootstrap?.stats.class_count ?? 0} 个班级 · ${bootstrap?.stats.teacher_count ?? 0} 位教师 · ${bootstrap?.stats.student_count ?? 0} 名学生 · ${bootstrap?.stats.room_count ?? 0} 间机房`"
    >
      <template #actions>
        <n-button secondary :loading="isLoading" @click="loadPage">刷新数据</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <div v-else-if="bootstrap" class="st-shell">
      <nav class="st-nav" aria-label="设置分组">
        <section v-for="group in navGroups" :key="group.label" class="st-nav__group">
          <p class="st-nav__label">{{ group.label }}</p>
          <button
            v-for="item in group.items"
            :key="item.tab"
            :class="['st-nav__item', { 'is-active': activeTab === item.tab }]"
            type="button"
            @click="setTab(item.tab)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.count !== null" class="st-nav__count">{{ item.count }}</span>
          </button>
        </section>
      </nav>

      <div class="st-body">
        <SystemSettingsPane v-if="activeTab === 'system'" />

        <ClassesPane v-if="activeTab === 'classes'" />

        <TeachersPane v-if="activeTab === 'teachers'" />

        <StudentsPane v-if="activeTab === 'students'" />

        <PromotionsPane v-if="activeTab === 'promotions'" />

        <RoomsPane v-if="activeTab === 'rooms'" />

        <CurriculumPane v-if="activeTab === 'curriculum'" />

        <AiProvidersPane v-if="activeTab === 'ai-providers'" />
        <AiSafetyPane v-if="activeTab === 'ai-safety'" />
      </div>
    </div>







  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import AiSafetyPane from './panes/AiSafetyPane.vue';
import AiProvidersPane from './panes/AiProvidersPane.vue';
import CurriculumPane from './panes/CurriculumPane.vue';
import SystemSettingsPane from './panes/SystemSettingsPane.vue';
import RoomsPane from './panes/RoomsPane.vue';
import PromotionsPane from './panes/PromotionsPane.vue';
import ClassesPane from './panes/ClassesPane.vue';
import TeachersPane from './panes/TeachersPane.vue';
import StudentsPane from './panes/StudentsPane.vue';
import { useAuthStore } from '@/stores/auth';

import type { AdminTab, SettingsNavItem } from './adminTypes';
import { useAdminCurriculum } from './composables/useAdminCurriculum';
import { useAdminBootstrap } from './composables/useAdminBootstrap';
import { useAdminRooms } from './composables/useAdminRooms';

const adminQueryTabs: AdminTab[] = ['system', 'classes', 'teachers', 'students', 'promotions', 'rooms', 'curriculum'];
const legacyTabAliases: Record<string, AdminTab> = { accounts: 'classes' };

const authStore = useAuthStore();
const { curriculumBooks, loadCurriculum } = useAdminCurriculum();
const {
  bootstrap,
  aiProviders,
  isLoading,
  errorMessage,
  loadBootstrap: loadBootstrapShared,
  loadAIProviders,
} = useAdminBootstrap();
const { selectedRoomId } = useAdminRooms(bootstrap);
const route = useRoute();
const router = useRouter();
const activeTab = ref<AdminTab>('system');

const navGroups = computed<Array<{ label: string; items: SettingsNavItem[] }>>(() => [
  {
    label: '学校',
    items: [{ tab: 'system', label: '基础参数', count: null }],
  },
  {
    label: '人员与班级',
    items: [
      { tab: 'classes', label: '班级', count: bootstrap.value?.stats.class_count ?? null },
      { tab: 'teachers', label: '教师', count: bootstrap.value?.stats.teacher_count ?? null },
      { tab: 'students', label: '学生', count: bootstrap.value?.stats.student_count ?? null },
      { tab: 'promotions', label: '升班与归档', count: null },
    ],
  },
  {
    label: '课堂资源',
    items: [
      { tab: 'rooms', label: '机房与座位', count: bootstrap.value?.stats.room_count ?? null },
      { tab: 'curriculum', label: '教材目录', count: curriculumBooks.value.length },
    ],
  },
  {
    label: 'AI 应用',
    items: [
      { tab: 'ai-providers', label: 'AI 模型服务', count: aiProviders.value.length },
      { tab: 'ai-safety', label: 'AI 安全', count: null },
    ],
  },
]);

function resolveTabFromRoute(): AdminTab {
  if (route.path.endsWith('/admin/ai-providers')) {
    return 'ai-providers';
  }
  if (route.path.endsWith('/admin/ai-safety')) {
    return 'ai-safety';
  }
  const tab = route.query.tab;
  if (typeof tab === 'string') {
    const alias = legacyTabAliases[tab] ?? tab;
    if (adminQueryTabs.includes(alias as AdminTab)) {
      return alias as AdminTab;
    }
  }
  return 'system';
}

const tabTargets: Record<AdminTab, { path: string; query?: Record<string, string> }> = {
  system: { path: '/staff/admin/system' },
  classes: { path: '/staff/admin/system', query: { tab: 'classes' } },
  teachers: { path: '/staff/admin/system', query: { tab: 'teachers' } },
  students: { path: '/staff/admin/system', query: { tab: 'students' } },
  promotions: { path: '/staff/admin/system', query: { tab: 'promotions' } },
  rooms: { path: '/staff/admin/system', query: { tab: 'rooms' } },
  curriculum: { path: '/staff/admin/system', query: { tab: 'curriculum' } },
  'ai-providers': { path: '/staff/admin/ai-providers' },
  'ai-safety': { path: '/staff/admin/ai-safety' },
};

function setTab(tab: AdminTab) {
  if (tab === activeTab.value && tab === resolveTabFromRoute()) {
    return;
  }
  activeTab.value = tab;
  void router.replace(tabTargets[tab]);
}

async function loadBootstrap() {
  await loadBootstrapShared();
  if (!bootstrap.value) {
    return;
  }
  selectedRoomId.value = selectedRoomId.value && bootstrap.value.rooms.some((room) => room.id === selectedRoomId.value)
    ? selectedRoomId.value
    : bootstrap.value.rooms[0]?.id ?? null;
}

async function loadPage() {
  if (!authStore.token) {
    errorMessage.value = '请先使用管理员账号登录';
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    await Promise.all([loadBootstrap(), loadCurriculum(), loadAIProviders()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载管理员后台失败';
  } finally {
    isLoading.value = false;
  }
}

watch(() => [route.path, route.query.tab], () => {
  const nextTab = resolveTabFromRoute();
  if (activeTab.value !== nextTab) {
    activeTab.value = nextTab;
  }
}, { immediate: true });

onMounted(() => {
  void loadPage();
});
</script>
