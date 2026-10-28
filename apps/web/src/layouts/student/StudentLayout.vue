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
import { useRoute } from 'vue-router';

import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';
import SoybeanShell from '@/layouts/shared/SoybeanShell.vue';
import { useAppStore } from '@/stores/app';

type StudentPageItem = {
  label: string;
  icon: LucideIcon;
  matches: Array<(path: string) => boolean>;
};

const route = useRoute();
const appStore = useAppStore();

const navItems = [
  { label: '学习首页', to: '/student/home', icon: markRaw(House) },
  { label: '作品工坊', to: '/student/work', icon: markRaw(Images) },
  { label: '随堂测验', to: '/student/quiz', icon: markRaw(BrainCircuit) },
  { label: '打字训练', to: '/student/typing', icon: markRaw(Keyboard) },
  { label: '课程资源', to: '/student/resources', icon: markRaw(BookOpenText) },
  { label: '共享网盘', to: '/student/drive', icon: markRaw(FolderOpen) },
  { label: '小组协作', to: '/student/groups', icon: markRaw(UsersRound) },
  { label: '我的档案', to: '/student/profile', icon: markRaw(UserRound) },
];

const navGroups = computed(() => [
  { title: '学习', items: navItems.slice(0, 4) },
  { title: '资源', items: navItems.slice(4, 6) },
  { title: '我的', items: navItems.slice(6) },
]);

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
  { label: '随堂测验', icon: markRaw(BrainCircuit), matches: [(path) => path === '/student/quiz'] },
  {
    label: '打字排行榜',
    icon: markRaw(Trophy),
    matches: [(path) => path === '/student/typing/rankings'],
  },
  { label: '打字训练', icon: markRaw(Keyboard), matches: [(path) => path === '/student/typing'] },
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
  <SoybeanShell
    :brand="appStore.title"
    :current-page-icon="currentPage.icon"
    :current-page-label="currentPage.label"
    :nav-groups="navGroups"
    kicker="学习空间"
    variant="student"
  >
    <template #actions>
      <SessionActionMenu />
    </template>
  </SoybeanShell>
  <FloatingAiCompanion />
</template>
