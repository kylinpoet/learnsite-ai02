<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h2>{{ title }}</h2>
        <p class="hero-copy">{{ description }}</p>
      </div>
      <el-tag type="success" round>骨架已就位</el-tag>
    </section>

    <el-row :gutter="16">
      <el-col v-for="item in highlights" :key="item.title" :lg="8" :md="12" :sm="24">
        <el-card class="soft-card">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  eyebrow: string;
  highlights: Array<{ title: string; text: string }>;
}>();
</script>
