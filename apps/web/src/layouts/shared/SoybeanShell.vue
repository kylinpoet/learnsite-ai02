<template>
  <div :class="['soybean-shell', `${variant}-layout`]" :data-module="moduleKey">
    <n-dialog-provider>
      <n-message-provider>
        <div :class="['sb-layout', { 'is-collapsed': tabsStore.menuCollapsed }]">
          <aside class="sb-aside">
            <div class="sb-brand">
              <span class="sb-brand__logo">
                <AppIcon :icon="GraduationCap" :size="19" />
              </span>
              <div v-show="!tabsStore.menuCollapsed" class="sb-brand__copy">
                <strong class="sb-brand__name">{{ brand }}</strong>
                <small class="sb-brand__kicker">{{ kicker }}</small>
              </div>
            </div>

            <div class="sb-menu">
              <n-menu
                :collapsed="tabsStore.menuCollapsed"
                :collapsed-icon-size="20"
                :collapsed-width="64"
                :indent="18"
                :options="menuOptions"
                :root-indent="16"
                :value="activeKey"
                @update:value="handleMenuSelect"
              />
            </div>
          </aside>

          <div class="sb-body">
            <header class="sb-header">
              <div class="sb-header__left">
                <n-tooltip placement="bottom">
                  <template #trigger>
                    <n-button quaternary circle size="small" @click="toggleCollapse">
                      <template #icon>
                        <AppIcon :icon="tabsStore.menuCollapsed ? PanelLeftOpen : PanelLeftClose" :size="18" />
                      </template>
                    </n-button>
                  </template>
                  {{ tabsStore.menuCollapsed ? '展开菜单' : '折叠菜单' }}
                </n-tooltip>

                <n-breadcrumb class="sb-breadcrumb">
                  <n-breadcrumb-item v-if="currentGroupTitle">{{ currentGroupTitle }}</n-breadcrumb-item>
                  <n-breadcrumb-item>
                    <span class="sb-breadcrumb__current">
                      <AppIcon v-if="currentPageIcon" :icon="currentPageIcon" :size="14" />
                      {{ currentPageLabel }}
                    </span>
                  </n-breadcrumb-item>
                </n-breadcrumb>

                <span class="sb-header__page-title">{{ currentPageLabel }}</span>
              </div>

              <div class="sb-header__right">
                <slot name="actions" />

                <n-tooltip placement="bottom">
                  <template #trigger>
                    <n-button quaternary circle size="small" @click="refreshPage">
                      <template #icon><AppIcon :icon="RefreshCw" :size="17" /></template>
                    </n-button>
                  </template>
                  刷新当前页
                </n-tooltip>

                <n-tooltip placement="bottom">
                  <template #trigger>
                    <n-button quaternary circle size="small" @click="toggleFullscreen">
                      <template #icon>
                        <AppIcon :icon="isFullscreen ? Minimize : Maximize" :size="16" />
                      </template>
                    </n-button>
                  </template>
                  {{ isFullscreen ? '退出全屏' : '全屏' }}
                </n-tooltip>

                <n-tooltip placement="bottom">
                  <template #trigger>
                    <n-button quaternary circle size="small" @click="themeDrawerOpen = true">
                      <template #icon><AppIcon :icon="Settings2" :size="17" /></template>
                    </n-button>
                  </template>
                  界面设置
                </n-tooltip>
              </div>
            </header>

            <nav v-if="tabsStore.tabBarVisible" class="sb-tabs">
              <div class="sb-tabs__list">
                <button
                  v-for="tab in tabsStore.tabs"
                  :key="tab.path"
                  :class="['sb-tab', { 'is-active': tab.path === route.fullPath }]"
                  type="button"
                  @click="activateTab(tab)"
                >
                  <span class="sb-tab__dot" />
                  <span class="sb-tab__label">{{ tab.title }}</span>
                  <span
                    v-if="tabsStore.tabs.length > 1"
                    class="sb-tab__close"
                    @click.stop="closeTab(tab)"
                  >
                    <AppIcon :icon="X" :size="12" />
                  </span>
                </button>
              </div>
              <n-dropdown :options="tabActions" placement="bottom-end" trigger="click" @select="handleTabAction">
                <n-button quaternary circle size="tiny">
                  <template #icon><AppIcon :icon="ChevronDown" :size="15" /></template>
                </n-button>
              </n-dropdown>
            </nav>

            <main class="sb-content page-content">
              <RouterView v-slot="{ Component }">
                <component :is="Component" :key="contentKey" />
              </RouterView>
            </main>
          </div>
        </div>

        <ThemeDrawer v-model:show="themeDrawerOpen" />
      </n-message-provider>
    </n-dialog-provider>
  </div>
</template>

<script setup lang="ts">
import type { DropdownOption, MenuOption } from 'naive-ui';
import {
  NButton,
  NBreadcrumb,
  NBreadcrumbItem,
  NDialogProvider,
  NDropdown,
  NMenu,
  NMessageProvider,
  NTooltip,
} from 'naive-ui';
import {
  ChevronDown,
  GraduationCap,
  Maximize,
  Minimize,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-vue-next';
import type { LucideIcon } from 'lucide-vue-next';
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import AppIcon from '@/components/AppIcon.vue';
import '@/styles/page-icon-chrome.css';
import { useAppStore } from '@/stores/app';
import { useNavTabsStore, type NavTab } from '@/stores/navTabs';
import ThemeDrawer from './ThemeDrawer.vue';

type ShellNavItem = { label: string; to: string; icon: LucideIcon };
type ShellNavGroup = { title: string; items: ShellNavItem[] };

const props = defineProps<{
  brand: string;
  kicker: string;
  variant: 'staff' | 'student';
  navGroups: ShellNavGroup[];
  currentPageLabel: string;
  currentPageIcon?: LucideIcon;
}>();

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const tabsStore = useNavTabsStore();

const themeDrawerOpen = ref(false);
const contentKey = ref(0);
const isFullscreen = ref(false);

const flatItems = computed(() => props.navGroups.flatMap((group) => group.items));

const activeKey = computed(() => {
  const matches = flatItems.value.filter(
    (item) => route.path === item.to || route.path.startsWith(`${item.to}/`)
  );
  matches.sort((left, right) => right.to.length - left.to.length);
  return matches[0]?.to ?? route.path;
});

const currentGroupTitle = computed(() => {
  const group = props.navGroups.find((candidate) =>
    candidate.items.some((item) => item.to === activeKey.value)
  );
  return group?.title ?? '';
});

/**
 * 当前页面所属模块。科目色谱（growth）用它取 --ls-module 功能色，
 * 把「这一页属于哪个模块」落到页头竖标与卡片顶边上。按前缀从长到短匹配。
 */
const MODULE_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['/staff/lesson-plans', 'lesson'],
  ['/staff/curriculum', 'curriculum'],
  ['/staff/classroom', 'classroom'],
  ['/staff/assistants', 'assistant'],
  ['/staff/submissions', 'submission'],
  ['/staff/attendance', 'attendance'],
  ['/staff/learning-reports', 'report'],
  ['/staff/students', 'student'],
  ['/staff/quizzes', 'quiz'],
  ['/staff/typing', 'typing'],
  ['/staff/resources', 'resource'],
  ['/staff/admin', 'admin'],
  ['/staff', 'overview'],
  ['/student/courses', 'lesson'],
  ['/student/reviews', 'review'],
  ['/student/work', 'submission'],
  ['/student/quiz', 'quiz'],
  ['/student/typing', 'typing'],
  ['/student/resources', 'resource'],
  ['/student/drive', 'drive'],
  ['/student/groups', 'student'],
  ['/student/profile', 'student'],
  ['/student/portrait', 'student'],
  ['/student', 'overview'],
];

const MODULE_HUES: Record<string, string> = {
  overview: '#1e7a57',
  lesson: '#1e7a57',
  student: '#1e7a57',
  curriculum: '#0e7c86',
  report: '#0e7c86',
  classroom: '#2563b8',
  quiz: '#c2600f',
  attendance: '#c2600f',
  resource: '#6b4eaa',
  assistant: '#6b4eaa',
  drive: '#6b4eaa',
  submission: '#b23a48',
  typing: '#b23a48',
  review: '#b23a48',
  admin: '#5c6f64',
};

function moduleOf(path: string) {
  const hit = MODULE_PREFIXES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return hit?.[1] ?? 'overview';
}

const moduleKey = computed(() => moduleOf(route.path));

const menuOptions = computed<MenuOption[]>(() => {
  // 图标统一包一层 .sb-nav-icon，并把模块功能色作为 --nav-hue 带下去：
  // 科目色谱据此出浅色块，粘土童趣出橙色胶囊块，墨绿画布不出块。
  const renderIcon = (item: ShellNavItem) => () =>
    h(
      'span',
      {
        class: 'sb-nav-icon',
        style: { '--nav-hue': MODULE_HUES[moduleOf(item.to)] ?? '#5c6f64' },
      },
      [h(AppIcon, { icon: item.icon, size: 17 })]
    );
  const toOption = (item: ShellNavItem): MenuOption => ({
    key: item.to,
    label: item.label,
    icon: renderIcon(item),
  });

  const isFlat = props.navGroups.length === 1 && !props.navGroups[0].title;
  if (isFlat) {
    return props.navGroups[0].items.map(toOption);
  }

  return props.navGroups.map((group) => ({
    type: 'group' as const,
    key: `group:${group.title}`,
    label: group.title,
    children: group.items.map(toOption),
  }));
});

const tabActions: DropdownOption[] = [
  { label: '关闭当前标签页', key: 'close-current' },
  { label: '关闭其他标签页', key: 'close-others' },
  { label: '关闭全部标签页', key: 'close-all' },
];

watch(
  () => props.variant,
  (variant) => {
    const prefix = `/${variant}/`;
    tabsStore.tabs = tabsStore.tabs.filter((tab) => tab.path.startsWith(prefix));
  },
  { immediate: true }
);

watch(
  () => [route.fullPath, props.currentPageLabel] as const,
  () => {
    if (!route.path.startsWith('/staff') && !route.path.startsWith('/student')) {
      return;
    }
    // 中转页（如 /staff/classroom 自动定位到具体会话）不单独占标签页
    if (route.meta.skipTab) {
      return;
    }
    tabsStore.openTab({
      path: route.fullPath,
      title: props.currentPageLabel,
      group: currentGroupTitle.value,
    });
  },
  { immediate: true }
);

function homePath() {
  return props.variant === 'staff' ? '/staff' : '/student/home';
}

function handleMenuSelect(key: string) {
  if (key === route.path) {
    return;
  }
  void router.push(key);
}

function toggleCollapse() {
  tabsStore.setMenuCollapsed(!tabsStore.menuCollapsed);
}

function activateTab(tab: NavTab) {
  if (tab.path === route.fullPath) {
    return;
  }
  void router.push(tab.path);
}

function closeTab(tab: NavTab) {
  const wasActive = tab.path === route.fullPath;
  const neighbor = tabsStore.closeTab(tab.path);
  if (!wasActive) {
    return;
  }
  void router.push(neighbor?.path ?? homePath());
}

function handleTabAction(key: string | number) {
  if (key === 'close-current') {
    const current = tabsStore.tabs.find((tab) => tab.path === route.fullPath);
    if (current) {
      closeTab(current);
    }
    return;
  }
  if (key === 'close-others') {
    tabsStore.closeOthers(route.fullPath);
    return;
  }
  if (key === 'close-all') {
    tabsStore.closeAll();
    tabsStore.openTab({
      path: route.fullPath,
      title: props.currentPageLabel,
      group: currentGroupTitle.value,
    });
  }
}

function refreshPage() {
  contentKey.value += 1;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // 浏览器拒绝全屏时保持静默，不影响其他操作
  }
}

function syncFullscreenState() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function handleViewportResize() {
  if (window.innerWidth < 960) {
    tabsStore.setMenuCollapsed(true);
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreenState);
  window.addEventListener('resize', handleViewportResize);
  handleViewportResize();
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState);
  window.removeEventListener('resize', handleViewportResize);
});
</script>

<style scoped>
.soybean-shell {
  min-height: 100vh;
}

.sb-layout {
  display: flex;
  min-height: 100vh;
}

.sb-aside {
  position: sticky;
  top: 0;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 200px;
  height: 100vh;
  padding: 10px 8px;
  border-right: 1px solid var(--ls-sidebar-border);
  background: var(--ls-sidebar-bg);
  box-shadow: var(--ls-sidebar-shadow);
  transition: width 0.2s ease;
}

.sb-layout.is-collapsed .sb-aside {
  width: 64px;
  padding: 10px 4px;
}

.sb-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 10px;
  border-bottom: 1px dashed var(--ls-sidebar-border);
}

.sb-layout.is-collapsed .sb-brand {
  justify-content: center;
  padding: 4px 0 10px;
}

.sb-brand__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--ls-primary), var(--ls-accent));
  color: #fff;
  box-shadow: 0 6px 14px rgba(44, 64, 106, 0.16);
}

.sb-brand__copy {
  display: grid;
  gap: 0;
  min-width: 0;
}

.sb-brand__name {
  color: var(--ls-nav-text);
  font-family: var(--ls-display-font);
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-brand__kicker {
  color: var(--ls-nav-muted);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-menu {
  flex: 1;
  min-height: 0;
  margin-top: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.sb-menu::-webkit-scrollbar {
  width: 5px;
}

.sb-menu::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--ls-sidebar-border);
}

.sb-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sb-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 52px;
  padding: 0 14px;
  border-bottom: 1px solid var(--ls-topbar-border);
  background: var(--ls-topbar-bg);
  box-shadow: var(--ls-topbar-shadow);
  backdrop-filter: saturate(150%) blur(12px);
  -webkit-backdrop-filter: saturate(150%) blur(12px);
}

.sb-header__left,
.sb-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sb-breadcrumb {
  min-width: 0;
}

.sb-header__page-title {
  display: none;
  overflow: hidden;
  color: var(--ls-ink);
  font-size: 14.5px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sb-breadcrumb__current {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ls-ink);
  font-weight: 600;
}

.sb-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border-bottom: 1px solid var(--ls-border);
  background: var(--ls-topbar-bg);
}

.sb-tabs__list {
  display: flex;
  flex: 1;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.sb-tabs__list::-webkit-scrollbar {
  display: none;
}

.sb-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border: 1px solid var(--ls-border);
  border-radius: 999px;
  background: var(--ls-chip-bg);
  color: var(--ls-text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.sb-tab:hover {
  border-color: var(--ls-primary);
  color: var(--ls-primary);
}

.sb-tab.is-active {
  border-color: var(--ls-primary);
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
}

.sb-tab__dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.6;
}

.sb-tab.is-active .sb-tab__dot {
  opacity: 1;
}

.sb-tab__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  color: inherit;
  opacity: 0.55;
}

.sb-tab__close:hover {
  background: var(--ls-border);
  opacity: 1;
}

.sb-content {
  width: 100%;
  max-width: var(--ls-content-max, 1680px);
  margin: 0 auto;
  flex: 1;
  padding: 12px 16px 24px;
}

@media (max-width: 960px) {
  .sb-aside {
    width: 64px;
    padding: 10px 4px;
  }

  .sb-brand {
    justify-content: center;
    padding: 4px 0 10px;
  }

  .sb-header__left .n-button {
    display: none;
  }

  .sb-header__page-title {
    display: block;
  }

  .sb-content {
    padding: 10px 12px 20px;
  }

  .sb-breadcrumb {
    display: none;
  }
}
</style>
