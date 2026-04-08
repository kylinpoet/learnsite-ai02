<template>
  <header class="shell-header">
    <div class="shell-header-main">
      <div>
        <p class="shell-kicker">{{ kicker }}</p>
        <h1 class="shell-title">{{ title }}</h1>
      </div>
      <div v-if="currentPageLabel && currentPageIcon" class="shell-current-page">
        <span class="shell-current-page__icon">
          <AppIcon :icon="currentPageIcon" :size="18" />
        </span>
        <div class="shell-current-page__copy">
          <small>当前页面</small>
          <strong>{{ currentPageLabel }}</strong>
        </div>
      </div>
    </div>
    <div class="shell-header-actions">
      <slot name="actions" />
      <ThemePicker />
    </div>
  </header>
</template>

<script setup lang="ts">
import type { LucideIcon } from 'lucide-vue-next';

import AppIcon from './AppIcon.vue';
import ThemePicker from './ThemePicker.vue';

defineProps<{
  title: string;
  kicker: string;
  currentPageLabel?: string;
  currentPageIcon?: LucideIcon;
}>();
</script>

<style scoped>
.shell-header-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.shell-current-page {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--ls-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--ls-panel, var(--ls-surface)) 88%, white 12%);
  box-shadow: 0 8px 18px rgba(23, 35, 61, 0.06);
}

.shell-current-page__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
}

.shell-current-page__copy {
  display: grid;
  gap: 1px;
}

.shell-current-page__copy small {
  color: var(--ls-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.shell-current-page__copy strong {
  color: var(--ls-text);
  font-size: 14px;
}
</style>
