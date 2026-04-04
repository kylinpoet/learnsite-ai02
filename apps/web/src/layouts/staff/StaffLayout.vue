<template>
  <div class="app-layout">
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

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-group-title {
  margin: 0 0 2px;
  padding: 0 8px;
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
