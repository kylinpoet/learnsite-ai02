<template>
  <n-config-provider
    :date-locale="dateZhCN"
    :locale="zhCN"
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
  >
    <RouterView />
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, darkTheme, dateZhCN, zhCN } from 'naive-ui';
import { computed } from 'vue';
import { RouterView } from 'vue-router';

import { useAppStore } from '@/stores/app';
import { useNaiveThemeOverrides } from '@/ui/naive-theme';

const appStore = useAppStore();
const themeOverrides = useNaiveThemeOverrides();
const naiveTheme = computed(() => (appStore.resolvedScheme === 'dark' ? darkTheme : null));
</script>
