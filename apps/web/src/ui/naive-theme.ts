/**
 * naive-ui 主题覆盖：由现有 `--ls-*` CSS 变量派生，供外壳与离散 API 共用。
 */
import type { GlobalThemeOverrides } from 'naive-ui';
import { computed, nextTick, ref, watch } from 'vue';

import { useAppStore } from '@/stores/app';

export function readThemeOverrides(): GlobalThemeOverrides {
  if (typeof window === 'undefined') {
    return {};
  }
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const primary = read('--ls-primary', '#f28a4c');
  const primarySoft = read('--ls-primary-soft', 'rgba(242, 138, 76, 0.14)');
  const hoverBg = read('--ls-nav-hover-bg', primarySoft);
  const ink = read('--ls-ink', '#222d48');
  const text = read('--ls-text', '#36415e');
  const muted = read('--ls-muted', '#6d7b97');
  const border = read('--ls-border', 'rgba(44, 64, 106, 0.11)');
  const elevated = read('--ls-elevated', '#ffffff');
  // 侧栏可能不是浅色底（如青禾成长的深青侧栏），导航文字不能复用正文的深色系，
  // 否则会出现深底压深字。这里统一取按主题适配的 --ls-nav-* 系列。
  const navText = read('--ls-nav-text', text);
  const navMuted = read('--ls-nav-muted', muted);
  const navIcon = read('--ls-nav-icon', navMuted);
  const navActiveFill = read('--ls-nav-active-fill', primarySoft);
  const navHoverColor = read('--ls-nav-hover-color', primary);
  const navActiveColor = read('--ls-nav-active-color', primary);

  return {
    common: {
      primaryColor: primary,
      primaryColorHover: navHoverColor,
      primaryColorPressed: navActiveColor,
      primaryColorSuppl: primary,
      borderRadius: '10px',
      borderRadiusSmall: '8px',
      fontFamily: read('--ls-font', 'inherit'),
      textColor1: ink,
      textColor2: text,
      textColor3: muted,
      borderColor: border,
      // 浮层与卡片底色：浅色下为白，深色下由 --ls-elevated 给出深色值
      cardColor: elevated,
      modalColor: elevated,
      popoverColor: elevated,
    },
    Menu: {
      itemHeight: '40px',
      borderRadius: '10px',
      // 侧栏底色可能是深浅两套（青禾为深青），因此文字/图标/箭头全部显式绑定
      // 到按主题适配的 --ls-nav-* 系列；collapsed/horizontal 变体也要给，
      // 否则 Naive UI 会退回默认深色值，在深底侧栏上变成不可见的深色图标。
      itemTextColor: navText,
      itemTextColorHover: navHoverColor,
      itemTextColorActive: navActiveColor,
      itemTextColorActiveHover: navActiveColor,
      itemTextColorChildActive: navActiveColor,
      itemTextColorChildActiveHover: navActiveColor,
      itemTextColorHorizontal: navText,
      itemTextColorHoverHorizontal: navHoverColor,
      itemTextColorActiveHorizontal: navActiveColor,
      itemTextColorActiveHoverHorizontal: navActiveColor,
      itemTextColorChildActiveHorizontal: navActiveColor,
      itemTextColorChildActiveHoverHorizontal: navActiveColor,
      itemIconColor: navIcon,
      itemIconColorHover: navHoverColor,
      itemIconColorActive: navActiveColor,
      itemIconColorActiveHover: navActiveColor,
      itemIconColorChildActive: navActiveColor,
      itemIconColorChildActiveHover: navActiveColor,
      itemIconColorCollapsed: navIcon,
      itemIconColorHorizontal: navIcon,
      itemIconColorHoverHorizontal: navHoverColor,
      itemIconColorActiveHorizontal: navActiveColor,
      itemIconColorActiveHoverHorizontal: navActiveColor,
      itemIconColorChildActiveHorizontal: navActiveColor,
      itemIconColorChildActiveHoverHorizontal: navActiveColor,
      arrowColor: navMuted,
      arrowColorHover: navHoverColor,
      arrowColorActive: navActiveColor,
      arrowColorActiveHover: navActiveColor,
      arrowColorChildActive: navActiveColor,
      arrowColorChildActiveHover: navActiveColor,
      itemColorHover: hoverBg,
      itemColorActive: navActiveFill,
      itemColorActiveHover: navActiveFill,
      itemColorActiveCollapsed: navActiveFill,
      groupTextColor: navMuted,
    },
  };
}

/** 主题变量随 appStore.currentTheme / resolvedScheme 变化而重新计算。 */
export function useNaiveThemeOverrides() {
  const appStore = useAppStore();
  const themeTick = ref(0);

  watch(
    () => [appStore.currentTheme, appStore.resolvedScheme] as const,
    () => {
      void nextTick(() => {
        themeTick.value += 1;
      });
    },
  );

  return computed<GlobalThemeOverrides>(() => {
    void themeTick.value;
    return readThemeOverrides();
  });
}
