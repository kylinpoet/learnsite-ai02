<template>
  <n-drawer :show="show" :width="328" placement="right" @update:show="handleShowChange">
    <n-drawer-content :native-scrollbar="false" closable title="界面设置">
      <section class="drawer-block">
        <p class="drawer-block__label">主题配色</p>
        <div class="theme-grid">
          <button
            v-for="theme in appStore.themeOptions"
            :key="theme.code"
            :class="['theme-card', { 'is-active': appStore.currentTheme === theme.code }]"
            :disabled="appStore.themeLockedBySystem"
            type="button"
            @click="selectTheme(theme.code)"
          >
            <span class="theme-card__swatch" :style="{ background: swatchMap[theme.code] || theme.code }" />
            <span class="theme-card__name">{{ theme.name }}</span>
          </button>
        </div>
        <p v-if="appStore.themeLockedBySystem" class="drawer-note">主题已由系统设置统一锁定。</p>
        <p v-else class="drawer-note">共 {{ appStore.themeOptions.length }} 套配色，每套都含浅色与深色两种形态。选择保存在本机浏览器；后台“系统主题”只作为首次访问的默认值。</p>
      </section>

      <n-divider />

      <section class="drawer-block">
        <p class="drawer-block__label">布局</p>
        <div class="drawer-row">
          <span>折叠侧边菜单</span>
          <n-switch
            :value="tabsStore.menuCollapsed"
            @update:value="(value: boolean) => tabsStore.setMenuCollapsed(value)"
          />
        </div>
        <div class="drawer-row">
          <span>显示多标签栏</span>
          <n-switch
            :value="tabsStore.tabBarVisible"
            @update:value="(value: boolean) => tabsStore.setTabBarVisible(value)"
          />
        </div>
      </section>

      <n-divider />

      <section class="drawer-block">
        <p class="drawer-block__label">界面外观</p>
        <n-radio-group
          :value="appStore.schemeMode"
          size="small"
          @update:value="handleSchemeChange"
        >
          <n-radio-button value="light">浅色</n-radio-button>
          <n-radio-button value="dark">深色</n-radio-button>
          <n-radio-button value="auto">跟随系统</n-radio-button>
        </n-radio-group>
        <p class="drawer-note">
          深色模式与主题配色相互独立：卡片、表格、图表与登录页均已适配，选择结果保存在本机浏览器。
        </p>
      </section>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { NDivider, NDrawer, NDrawerContent, NRadioButton, NRadioGroup, NSwitch } from 'naive-ui';

import { useAppStore, type ColorSchemeMode } from '@/stores/app';
import { useNavTabsStore } from '@/stores/navTabs';
import type { ThemeCode } from '@/utils/themes';

defineProps<{ show: boolean }>();

const emit = defineEmits<{ 'update:show': [value: boolean] }>();

const appStore = useAppStore();
const tabsStore = useNavTabsStore();

const swatchMap: Record<string, string> = {
  emblem: 'linear-gradient(135deg, #3f9678, #1e7a57 58%, #c9a469)',
  growth: 'linear-gradient(135deg, #2db1a4, #0d9488 58%, #f59e0b)',
  clay: 'linear-gradient(135deg, #fb923c, #f97316 58%, #2563eb)',
};

function handleShowChange(value: boolean) {
  emit('update:show', value);
}

function selectTheme(code: string) {
  if (appStore.themeLockedBySystem) {
    return;
  }
  appStore.setTheme(code as ThemeCode);
}

function handleSchemeChange(value: string | number | boolean) {
  appStore.setSchemeMode(String(value) as ColorSchemeMode);
}
</script>

<style scoped>
.drawer-block {
  display: grid;
  gap: 12px;
}

.drawer-block__label {
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-sm, 10px);
  background: var(--ls-chip-bg);
  color: var(--ls-text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.theme-card:hover:not(:disabled) {
  border-color: var(--ls-primary);
}

.theme-card.is-active {
  border-color: var(--ls-primary);
  box-shadow: inset 0 0 0 1px var(--ls-primary), 0 6px 16px rgba(44, 64, 106, 0.08);
}

.theme-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.theme-card__swatch {
  width: 34px;
  height: 22px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.drawer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 600;
}

.drawer-note {
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.6;
}
</style>
