<script setup lang="ts">
import {
  BookOpenText,
  BrainCircuit,
  Code2,
  FileText,
  FolderOpen,
  House,
  Images,
  Keyboard,
  MessageSquareText,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-vue-next';
import type { LucideIcon } from 'lucide-vue-next';
import { computed, markRaw } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import AppIcon from '@/components/AppIcon.vue';
import AppShellHeader from '@/components/AppShellHeader.vue';
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';
import '@/styles/page-icon-chrome.css';

type StudentPageItem = {
  label: string;
  icon: LucideIcon;
  matches: Array<(path: string) => boolean>;
};

const route = useRoute();

const navItems = [
  { label: '学习首页', to: '/student/home', icon: markRaw(House) },
  { label: '作品工坊', to: '/student/work', icon: markRaw(Images) },
  { label: '随堂测验', to: '/student/quiz', icon: markRaw(BrainCircuit) },
  { label: '打字训练', to: '/student/typing', icon: markRaw(Keyboard) },
  { label: '课程资源', to: '/student/resources', icon: markRaw(BookOpenText) },
  { label: '共享网盘', to: '/student/drive', icon: markRaw(FolderOpen) },
  { label: '我的档案', to: '/student/profile', icon: markRaw(UserRound) },
];

const studentPageItems: StudentPageItem[] = [
  { label: '学习首页', icon: markRaw(House), matches: [(path) => path === '/student/home'] },
  {
    label: '课程学习',
    icon: markRaw(BookOpenText),
    matches: [(path) => /^\/student\/courses\/[^/]+$/.test(path)],
  },
  {
    label: '阅读任务',
    icon: markRaw(BookOpenText),
    matches: [(path) => /^\/student\/courses\/[^/]+\/readings\/[^/]+$/.test(path)],
  },
  {
    label: '学习任务',
    icon: markRaw(FileText),
    matches: [(path) => /^\/student\/courses\/[^/]+\/tasks\/[^/]+$/.test(path)],
  },
  {
    label: '编程任务',
    icon: markRaw(Code2),
    matches: [(path) => /^\/student\/courses\/[^/]+\/programs\/[^/]+$/.test(path)],
  },
  {
    label: '作品互评',
    icon: markRaw(MessageSquareText),
    matches: [(path) => /^\/student\/reviews\/[^/]+$/.test(path)],
  },
  {
    label: '作品工坊',
    icon: markRaw(Images),
    matches: [(path) => path.startsWith('/student/work')],
  },
  {
    label: '测验排行',
    icon: markRaw(Trophy),
    matches: [(path) => path === '/student/quiz/rankings'],
  },
  {
    label: '随堂测验',
    icon: markRaw(BrainCircuit),
    matches: [(path) => path === '/student/quiz'],
  },
  {
    label: '打字排行榜',
    icon: markRaw(Trophy),
    matches: [(path) => path === '/student/typing/rankings'],
  },
  {
    label: '打字训练',
    icon: markRaw(Keyboard),
    matches: [(path) => path === '/student/typing'],
  },
  {
    label: '课程资源',
    icon: markRaw(BookOpenText),
    matches: [(path) => path.startsWith('/student/resources')],
  },
  {
    label: '共享网盘',
    icon: markRaw(FolderOpen),
    matches: [(path) => path.startsWith('/student/drive')],
  },
  {
    label: '小组协作',
    icon: markRaw(UsersRound),
    matches: [(path) => path.startsWith('/student/groups')],
  },
  {
    label: '我的档案',
    icon: markRaw(UserRound),
    matches: [(path) => path.startsWith('/student/profile')],
  },
];

const currentPage = computed(() => {
  const matched = studentPageItems.find((item) => item.matches.some((matcher) => matcher(route.path)));
  return matched || { label: '学习空间', icon: markRaw(House) };
});
</script>

<template>
  <div class="app-layout student-layout">
    <AppShellHeader
      title="学生学习中心"
      kicker="成长与任务总览"
      :current-page-icon="currentPage.icon"
      :current-page-label="currentPage.label"
    >
      <template #actions>
        <SessionActionMenu />
      </template>
    </AppShellHeader>
    <div class="layout-shell">
      <aside class="side-nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">
          <span class="nav-link__content">
            <AppIcon :icon="item.icon" class="nav-link__icon" />
            <span>{{ item.label }}</span>
          </span>
        </RouterLink>
      </aside>
      <main class="page-content">
        <RouterView />
      </main>
    </div>
    <FloatingAiCompanion />
  </div>
</template>

<style scoped>
.nav-link__content {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.nav-link__icon {
  opacity: 0.86;
}
</style>
