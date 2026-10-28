<template>
  <div class="student-layout guest-layout">
    <header class="guest-topbar">
      <RouterLink class="guest-brand" :to="`/class/${classCode}`">
        <span class="guest-brand__name">{{ appStore.title }}</span>
        <span class="guest-brand__kicker">旁听</span>
      </RouterLink>

      <span class="guest-context">
        <span class="guest-context__code">{{ classCode }}</span>
        <span class="guest-context__divider" aria-hidden="true">/</span>
        <span>只读</span>
      </span>

      <span class="guest-topbar__spacer" />

      <RouterLink class="guest-login" to="/login/student">学生登录</RouterLink>
    </header>

    <main class="guest-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import { useAppStore } from '@/stores/app';

const route = useRoute();
const appStore = useAppStore();

const classCode = computed(() => String(route.params.code || '').toUpperCase());
</script>

<style scoped>
.guest-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.guest-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 48px;
  flex: none;
  padding: 0 28px;
  border-bottom: 1px solid var(--sw-line-soft);
  background: var(--sw-surface);
}

.guest-brand {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  color: var(--sw-ink);
  text-decoration: none;
}

.guest-brand__name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.guest-brand__kicker {
  color: var(--sw-muted);
  font-size: 11px;
  font-weight: 500;
}

.guest-context {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-left: 14px;
  border-left: 1px solid var(--sw-line-soft);
  color: var(--sw-muted);
  font-size: 12px;
}

.guest-context__code {
  color: var(--sw-ink);
  font-weight: 600;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.guest-context__divider {
  color: var(--sw-line);
}

.guest-topbar__spacer {
  flex: 1;
}

.guest-login {
  flex: none;
  padding: 6px 14px;
  border: 1px solid var(--sw-line);
  border-radius: var(--sw-r-ctl);
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.15s ease;
}

.guest-login:hover {
  background: var(--sw-surface-2);
}

.guest-content {
  flex: 1;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 28px 48px;
}

@media (max-width: 720px) {
  .guest-topbar {
    padding: 0 16px;
  }

  .guest-context {
    padding-left: 0;
    border-left: 0;
  }

  .guest-content {
    padding: 16px 16px 40px;
  }
}
</style>
