<template>
  <component :is="icon" :size="size" :stroke-width="strokeWidth" class="app-icon" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { LucideIcon } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    icon: LucideIcon;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 18,
    strokeWidth: 2.1,
  }
);
</script>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
}
</style>
