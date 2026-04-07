<template>
  <div class="app-layout">
    <AppShellHeader title="学生学习中心" kicker="成长与任务总览">
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

<script setup lang="ts">
import {
  BookOpenText,
  BrainCircuit,
  FolderOpen,
  House,
  Images,
  Keyboard,
  UserRound,
} from 'lucide-vue-next';
import { markRaw } from 'vue';
import { RouterLink, RouterView } from 'vue-router';

import AppIcon from '@/components/AppIcon.vue';
import AppShellHeader from '@/components/AppShellHeader.vue';
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';

const navItems = [
  { label: '学习首页', to: '/student/home', icon: markRaw(House) },
  { label: '作品工坊', to: '/student/work', icon: markRaw(Images) },
  { label: '随堂测验', to: '/student/quiz', icon: markRaw(BrainCircuit) },
  { label: '打字训练', to: '/student/typing', icon: markRaw(Keyboard) },
  { label: '课程资源', to: '/student/resources', icon: markRaw(BookOpenText) },
  { label: '共享网盘', to: '/student/drive', icon: markRaw(FolderOpen) },
  { label: '我的档案', to: '/student/profile', icon: markRaw(UserRound) },
];
</script>

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
