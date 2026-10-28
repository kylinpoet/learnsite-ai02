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
  Sparkles,
  Users2,
} from 'lucide-vue-next';
import type { LucideIcon } from 'lucide-vue-next';
import { computed, markRaw } from 'vue';
import { useRoute } from 'vue-router';

import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';
import SoybeanShell from '@/layouts/shared/SoybeanShell.vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

type StaffPageItem = {
  label: string;
  icon: LucideIcon;
  matches: Array<(path: string) => boolean>;
};

const authStore = useAuthStore();
const appStore = useAppStore();
const route = useRoute();

const navGroups = computed(() => {
  const groups = [
    {
      title: '总览',
      items: [
        { label: '课堂控制', to: '/staff/classroom', icon: markRaw(MonitorPlay) },
        { label: '仪表盘', to: '/staff/dashboard', icon: markRaw(LayoutDashboard) },
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
        { label: '学情报告', to: '/staff/learning-reports', icon: markRaw(Sparkles) },
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
  { label: '学情报告', icon: markRaw(Sparkles), matches: [(path) => path.startsWith('/staff/learning-reports')] },
  { label: '学生名单', icon: markRaw(Users2), matches: [(path) => path.startsWith('/staff/students')] },
  { label: '系统设置', icon: markRaw(Settings2), matches: [(path) => path.startsWith('/staff/admin')] },
];

const currentPage = computed(() => {
  const matched = staffPageItems.find((item) => item.matches.some((matcher) => matcher(route.path)));
  return matched || { label: '教师工作台', icon: markRaw(LayoutDashboard) };
});
</script>

<template>
  <SoybeanShell
    :brand="appStore.title"
    :current-page-icon="currentPage.icon"
    :current-page-label="currentPage.label"
    :nav-groups="navGroups"
    kicker="教学与管理总览"
    variant="staff"
  >
    <template #actions>
      <SessionActionMenu />
    </template>
  </SoybeanShell>
  <FloatingAiCompanion />
</template>
