<template>
  <div :class="layoutClass">
    <div class="auth-backdrop"></div>
    <main :class="cardClass">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

const route = useRoute();

const authVariant = computed(() => {
  if (route.path === '/login/student') {
    return 'student';
  }
  if (route.path === '/login/staff') {
    return 'staff';
  }
  return 'public';
});

const layoutClass = computed(() => ['auth-layout', `auth-layout--${authVariant.value}`]);
const cardClass = computed(() => ['auth-card', `auth-card--${authVariant.value}`]);
</script>
