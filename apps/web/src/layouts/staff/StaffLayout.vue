<template>
  <div class="app-layout staff-layout">
    <AppShellHeader title="教职工工作台" kicker="Teacher & Admin Console">
      <template #actions>
        <SessionActionMenu />
      </template>
    </AppShellHeader>
    <div class="layout-shell">
      <aside class="side-nav grouped-nav">
        <section v-for="group in navGroups" :key="group.title" class="nav-group">
          <p class="nav-group-title">{{ group.title }}</p>
          <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-link">
            {{ item.label }}
          </RouterLink>
        </section>
      </aside>
      <main class="page-content">
        <RouterView />
      </main>
    </div>
    <FloatingAiCompanion />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';

import AppShellHeader from '@/components/AppShellHeader.vue';
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const navGroups = computed(() => {
  const groups = [
    {
      title: '工作总览',
      items: [
        { label: '工作台', to: '/staff/dashboard' },
        { label: '课堂会话中心', to: '/staff/classroom' },
      ],
    },
    {
      title: '教学内容',
      items: [
        { label: '学案管理', to: '/staff/lesson-plans' },
        { label: '课程体系', to: '/staff/curriculum' },
        { label: '测验题库', to: '/staff/quizzes' },
        { label: '打字内容', to: '/staff/typing' },
        { label: '资源中心', to: '/staff/resources' },
        { label: '智能体', to: '/staff/assistants' },
      ],
    },
    {
      title: '课堂反馈',
      items: [
        { label: '作品评分', to: '/staff/submissions' },
        { label: '签到', to: '/staff/attendance' },
        { label: '学生', to: '/staff/students' },
      ],
    },
  ];

  if (authStore.isAdmin) {
    groups.push({
      title: '系统配置',
      items: [{ label: '系统设置', to: '/staff/admin/system' }],
    });
  }

  return groups;
});
</script>

<style scoped>
.grouped-nav {
  gap: 16px;
}

.staff-layout {
  padding: 18px 20px 24px;
  background: var(--ls-shell-wash), var(--ls-shell-base);
}

.staff-layout :deep(.shell-header) {
  margin-bottom: 16px;
  padding: 8px 6px 18px;
  border-bottom: 1px solid var(--ls-shell-divider);
}

.staff-layout :deep(.shell-title) {
  font-size: 34px;
}

.staff-layout :deep(.layout-shell) {
  grid-template-columns: 228px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.staff-layout :deep(.page-content) {
  gap: 16px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.staff-layout .side-nav {
  position: sticky;
  top: 18px;
  gap: 14px;
  padding: 18px 14px;
  border-radius: 28px;
  border-color: var(--ls-sidebar-border);
  background: var(--ls-sidebar-bg);
  box-shadow: var(--ls-sidebar-shadow);
}

.staff-layout .nav-link {
  padding: 12px 14px;
  border-radius: 16px;
  font-weight: 600;
  color: var(--ls-nav-text);
}

.staff-layout .nav-link:hover,
.staff-layout .router-link-active {
  background: var(--ls-nav-active-bg);
  color: var(--ls-nav-active-color);
  box-shadow: var(--ls-nav-active-shadow);
}

.nav-group-title {
  margin: 0 0 2px;
  padding: 0 10px;
  color: var(--ls-summary-label);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.staff-layout :deep(.page-stack) {
  gap: 16px;
}

.staff-layout :deep(.hero-panel) {
  padding: 24px 26px;
  border-color: var(--ls-sidebar-border);
  border-radius: 28px;
  background: var(--ls-panel);
  box-shadow: var(--ls-shadow);
}

.staff-layout :deep(.hero-copy) {
  max-width: 640px;
}

.staff-layout :deep(.metric-grid) {
  gap: 14px;
}

.staff-layout :deep(.metric-tile) {
  padding: 16px 18px;
  border-radius: 20px;
  border-color: var(--ls-sidebar-border);
  background: var(--ls-panel-strong);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.staff-layout :deep(.metric-value) {
  margin: 8px 0 4px;
  font-size: 34px;
}

.staff-layout :deep(.soft-card) {
  border-color: var(--ls-sidebar-border);
  border-radius: 24px;
  background: var(--ls-card);
  box-shadow: var(--ls-shadow);
}

@media (max-width: 960px) {
  .staff-layout {
    padding: 16px;
  }

  .staff-layout .side-nav {
    position: static;
  }
}
</style>
