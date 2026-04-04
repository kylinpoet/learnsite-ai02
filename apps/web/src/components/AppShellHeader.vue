<template>
  <header class="shell-header">
    <div>
      <p class="shell-kicker">{{ kicker }}</p>
      <h1 class="shell-title">{{ title }}</h1>
    </div>
    <div class="shell-header-actions">
      <slot name="actions" />
      <ThemePicker />
    </div>
  </header>
</template>

<script setup lang="ts">
import ThemePicker from './ThemePicker.vue';

defineProps<{
  title: string;
  kicker: string;
}>();
</script>
