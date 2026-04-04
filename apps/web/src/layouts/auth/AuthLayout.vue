<template>
  <div class="auth-layout">
    <div class="auth-backdrop"></div>
    <main class="auth-card">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>
