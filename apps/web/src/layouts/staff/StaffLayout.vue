<script setup lang="ts">
import {
  BookCopy,
  Bot,
  CalendarCheck2,
  ClipboardCheck,
  FileQuestion,
  FolderKanban,
  Keyboard,
  LayoutDashboard,
  MonitorPlay,
  NotebookPen,
  Settings2,
  Users2,
} from 'lucide-vue-next';
import type { LucideIcon } from 'lucide-vue-next';
import { computed, markRaw } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import AppIcon from '@/components/AppIcon.vue';
import AppShellHeader from '@/components/AppShellHeader.vue';
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';
import '@/styles/page-icon-chrome.css';
import { useAuthStore } from '@/stores/auth';

type StaffPageItem = {
  label: string;
  icon: LucideIcon;
  matches: Array<(path: string) => boolean>;
};

const authStore = useAuthStore();
const route = useRoute();

const navGroups = computed(() => {
  const groups = [
    {
      title: '总览',
      items: [
        { label: '仪表盘', to: '/staff/dashboard', icon: markRaw(LayoutDashboard) },
        { label: '课堂控制', to: '/staff/classroom', icon: markRaw(MonitorPlay) },
      ],
    },
    {
      title: '教学',
      items: [
        { label: '学案管理', to: '/staff/lesson-plans', icon: markRaw(NotebookPen) },
        { label: '课程内容', to: '/staff/curriculum', icon: markRaw(BookCopy) },
        { label: '测验题库', to: '/staff/quizzes', icon: markRaw(FileQuestion) },
        { label: '打字训练', to: '/staff/typing', icon: markRaw(Keyboard) },
        { label: '资源中心', to: '/staff/resources', icon: markRaw(FolderKanban) },
        { label: 'AI 助手', to: '/staff/assistants', icon: markRaw(Bot) },
      ],
    },
    {
      title: '反馈',
      items: [
        { label: '提交批改', to: '/staff/submissions', icon: markRaw(ClipboardCheck) },
        { label: '签到考勤', to: '/staff/attendance', icon: markRaw(CalendarCheck2) },
        { label: '学生名单', to: '/staff/students', icon: markRaw(Users2) },
      ],
    },
  ];

  if (authStore.isAdmin) {
    groups.push({
      title: '系统',
      items: [{ label: '系统设置', to: '/staff/admin/system', icon: markRaw(Settings2) }],
    });
  }

  return groups;
});

const staffPageItems: StaffPageItem[] = [
  { label: '仪表盘', icon: markRaw(LayoutDashboard), matches: [(path) => path === '/staff/dashboard'] },
  { label: '课堂控制', icon: markRaw(MonitorPlay), matches: [(path) => path.startsWith('/staff/classroom')] },
  { label: '学案管理', icon: markRaw(NotebookPen), matches: [(path) => path.startsWith('/staff/lesson-plans')] },
  { label: '课程内容', icon: markRaw(BookCopy), matches: [(path) => path.startsWith('/staff/curriculum')] },
  { label: '测验题库', icon: markRaw(FileQuestion), matches: [(path) => path.startsWith('/staff/quizzes')] },
  { label: '打字训练', icon: markRaw(Keyboard), matches: [(path) => path.startsWith('/staff/typing')] },
  { label: '资源中心', icon: markRaw(FolderKanban), matches: [(path) => path.startsWith('/staff/resources')] },
  { label: 'AI 助手', icon: markRaw(Bot), matches: [(path) => path.startsWith('/staff/assistants')] },
  { label: '提交批改', icon: markRaw(ClipboardCheck), matches: [(path) => path.startsWith('/staff/submissions')] },
  { label: '签到考勤', icon: markRaw(CalendarCheck2), matches: [(path) => path.startsWith('/staff/attendance')] },
  { label: '学生名单', icon: markRaw(Users2), matches: [(path) => path.startsWith('/staff/students')] },
  { label: '系统设置', icon: markRaw(Settings2), matches: [(path) => path.startsWith('/staff/admin')] },
];

const currentPage = computed(() => {
  const matched = staffPageItems.find((item) => item.matches.some((matcher) => matcher(route.path)));
  return matched || { label: '教师工作台', icon: markRaw(LayoutDashboard) };
});
</script>

<template>
  <div class="app-layout staff-layout">
    <AppShellHeader
      title="教师工作台"
      kicker="教学与管理总览"
      :current-page-icon="currentPage.icon"
      :current-page-label="currentPage.label"
    >
      <template #actions>
        <SessionActionMenu />
      </template>
    </AppShellHeader>
    <div class="layout-shell">
      <aside class="side-nav grouped-nav">
        <section v-for="group in navGroups" :key="group.title" class="nav-group">
          <p class="nav-group-title">{{ group.title }}</p>
          <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-link">
            <span class="nav-link__content">
              <AppIcon :icon="item.icon" class="nav-link__icon" />
              <span>{{ item.label }}</span>
            </span>
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

.nav-link__content {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.nav-link__icon {
  opacity: 0.88;
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
