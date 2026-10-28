import { computed, type ComputedRef } from 'vue';

import { useAppStore } from '@/stores/app';
import { readThemeToken } from '@/utils/themeTokens';

/**
 * 图表主题适配层：把 CSS 主题令牌翻译成 ECharts option 片段。
 *
 * 约定：
 * - 所有取色都走 `--ls-*` 令牌，切主题 / 切明暗只需要换令牌，图表跟着变；
 * - `tokens` 显式依赖 `currentTheme` 与 `resolvedScheme`，保证外观切换时页面里的
 *   chart option computed 会重算（AppChart 的 deep watch 随后刷新实例）。
 */
export type ChartTokens = {
  text: string;
  muted: string;
  border: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  ink: string;
  font: string;
  surface: string;
};

export function useChartTheme() {
  const appStore = useAppStore();

  const tokens: ComputedRef<ChartTokens> = computed(() => {
    void appStore.currentTheme;
    void appStore.resolvedScheme;
    return {
      text: readThemeToken('--ls-text', '#2f4239'),
      muted: readThemeToken('--ls-muted', '#6d7f76'),
      border: readThemeToken('--ls-border', 'rgba(30, 60, 45, 0.12)'),
      primary: readThemeToken('--ls-primary', '#1e7a57'),
      accent: readThemeToken('--ls-accent', '#c9a469'),
      success: readThemeToken('--ls-success-text', '#137333'),
      warning: readThemeToken('--ls-warning-text', '#8a5a00'),
      error: readThemeToken('--ls-error-text', '#c0392b'),
      ink: readThemeToken('--ls-ink', '#1d2f28'),
      font: readThemeToken('--ls-font', 'sans-serif'),
      surface: readThemeToken('--ls-elevated', '#ffffff'),
    };
  });

  /** 统一业务色序：主讲色 → 强调色 → 成功 → 警示 → 错误 */
  const palette: ComputedRef<string[]> = computed(() => [
    tokens.value.primary,
    tokens.value.accent,
    tokens.value.success,
    tokens.value.warning,
    tokens.value.error,
  ]);

  /** 类目横轴（柱状 / 折线共用） */
  function axisX(data: Array<string | number>, extra: Record<string, unknown> = {}) {
    return {
      type: 'category' as const,
      data,
      axisLine: { lineStyle: { color: tokens.value.border } },
      axisTick: { show: false },
      axisLabel: { color: tokens.value.muted, fontSize: 11, hideOverlap: true },
      ...extra,
    };
  }

  /** 数值纵轴 */
  function axisY(extra: Record<string, unknown> = {}) {
    return {
      type: 'value' as const,
      minInterval: 1,
      splitLine: { lineStyle: { color: tokens.value.border, type: 'dashed' as const } },
      axisLabel: { color: tokens.value.muted, fontSize: 11 },
      ...extra,
    };
  }

  function tooltip(trigger: 'axis' | 'item' = 'axis', extra: Record<string, unknown> = {}) {
    return { trigger, ...extra };
  }

  function legend(extra: Record<string, unknown> = {}) {
    return { top: 0, textStyle: { color: tokens.value.muted, fontSize: 11 }, ...extra };
  }

  function grid(extra: Record<string, unknown> = {}) {
    return { left: 8, right: 14, top: 38, bottom: 4, containLabel: true, ...extra };
  }

  /** 每个 option 的外壳：注入调色板与全局文字色 */
  function base(extra: Record<string, unknown> = {}) {
    return {
      color: palette.value,
      textStyle: { color: tokens.value.text, fontFamily: tokens.value.font },
      ...extra,
    };
  }

  return { tokens, palette, axisX, axisY, tooltip, legend, grid, base };
}
