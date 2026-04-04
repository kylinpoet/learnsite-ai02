<template>
  <div class="app-layout">
    <AppShellHeader title="学生学习中心" kicker="Student Workspace">
      <template #actions>
        <SessionActionMenu />
      </template>
    </AppShellHeader>
    <div class="layout-shell">
      <aside class="side-nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">
          {{ item.label }}
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
import { RouterLink, RouterView } from 'vue-router';

import AppShellHeader from '@/components/AppShellHeader.vue';
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';

const navItems = [
  { label: '学习中心', to: '/student/home' },
  { label: '我的作品', to: '/student/work' },
  { label: '常识测验', to: '/student/quiz' },
  { label: '打字训练', to: '/student/typing' },
  { label: '在线资源', to: '/student/resources' },
  { label: '我的网盘', to: '/student/drive' },
  { label: '个人资料', to: '/student/profile' },
];
</script>
