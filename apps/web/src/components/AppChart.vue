<template>
  <div ref="chartRef" class="app-chart" :style="chartStyle"></div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { EChartsType } from 'echarts/core';

import { useAppStore } from '@/stores/app';
import { readThemeToken } from '@/utils/themeTokens';

const props = withDefaults(
  defineProps<{
    option: Record<string, unknown>;
    height?: number | string;
    autoresize?: boolean;
  }>(),
  {
    height: 280,
    autoresize: true,
  }
);

const chartRef = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<EChartsType | null>(null);
const appStore = useAppStore();

let resizeObserver: ResizeObserver | null = null;
let removeWindowResizeListener: (() => void) | null = null;

const chartStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}));

/**
 * 深色下补齐 ECharts 默认配色（坐标轴文字、tooltip 底色）。
 * 页面自己的 option 优先，这里只填空缺项，避免覆盖各页面的业务配色。
 */
function withSchemeDefaults(option: Record<string, unknown>): Record<string, unknown> {
  if (appStore.resolvedScheme !== 'dark') {
    return option;
  }
  const textColor = readThemeToken('--ls-text', '#c8d2e4');
  const borderColor = readThemeToken('--ls-border', 'rgba(150, 170, 205, 0.16)');
  const elevated = readThemeToken('--ls-elevated', '#1a2130');
  const tooltip = { ...((option.tooltip as Record<string, unknown> | undefined) ?? {}) };
  tooltip.backgroundColor = tooltip.backgroundColor ?? elevated;
  tooltip.borderColor = tooltip.borderColor ?? borderColor;
  tooltip.textStyle = { color: textColor, ...((tooltip.textStyle as Record<string, unknown> | undefined) ?? {}) };

  return {
    ...option,
    textStyle: { color: textColor, ...((option.textStyle as Record<string, unknown> | undefined) ?? {}) },
    tooltip,
  };
}

async function createChart() {
  if (!chartRef.value || chartInstance.value) {
    return;
  }

  const [{ init, use }, charts, components, renderers] = await Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers'),
  ]);

  use([
    charts.BarChart,
    charts.LineChart,
    charts.PieChart,
    components.GridComponent,
    components.TooltipComponent,
    components.LegendComponent,
    components.DatasetComponent,
    components.TitleComponent,
    components.GraphicComponent,
    renderers.CanvasRenderer,
  ]);

  chartInstance.value = init(chartRef.value);
  chartInstance.value.setOption(withSchemeDefaults(props.option), true);

  if (props.autoresize && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      chartInstance.value?.resize();
    });
    resizeObserver.observe(chartRef.value);
  } else {
    const handleWindowResize = () => chartInstance.value?.resize();
    window.addEventListener('resize', handleWindowResize);
    removeWindowResizeListener = () => window.removeEventListener('resize', handleWindowResize);
  }
}

watch(
  () => props.option,
  (option) => {
    if (!chartInstance.value) {
      return;
    }
    chartInstance.value.setOption(withSchemeDefaults(option), true);
    chartInstance.value.resize();
  },
  { deep: true }
);

watch(
  () => appStore.resolvedScheme,
  () => {
    if (!chartInstance.value) {
      return;
    }
    chartInstance.value.setOption(withSchemeDefaults(props.option), true);
    chartInstance.value.resize();
  }
);

onMounted(async () => {
  await nextTick();
  await createChart();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  removeWindowResizeListener?.();
  removeWindowResizeListener = null;
  chartInstance.value?.dispose();
  chartInstance.value = null;
});
</script>

<style scoped>
.app-chart {
  width: 100%;
  min-height: 220px;
}
</style>
