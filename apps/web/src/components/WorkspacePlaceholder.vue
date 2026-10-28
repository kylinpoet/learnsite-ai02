<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h2>{{ title }}</h2>
        <p class="hero-copy">{{ description }}</p>
      </div>
      <n-tag round type="success">骨架已就位</n-tag>
    </section>

    <div class="highlight-grid">
      <SaPanel v-for="item in highlights" :key="item.title">
        <h3>{{ item.title }}</h3>
        <p>{{ item.text }}</p>
      </SaPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NTag } from 'naive-ui';

import SaPanel from '@/components/sa/SaPanel.vue';

defineProps<{
  title: string;
  description: string;
  eyebrow: string;
  highlights: Array<{ title: string; text: string }>;
}>();
</script>

<style scoped>
.highlight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
</style>
