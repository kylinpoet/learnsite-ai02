<template>
  <el-select
    :model-value="appStore.currentTheme"
    class="theme-picker"
    :disabled="appStore.themeLockedBySystem"
    @change="onChange"
  >
    <el-option
      v-for="theme in appStore.themeOptions"
      :key="theme.code"
      :label="theme.name"
      :value="theme.code"
    />
  </el-select>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import type { ThemeCode } from '@/utils/themes';

const appStore = useAppStore();

function onChange(value: string) {
  appStore.setTheme(value as ThemeCode);
}
</script>
