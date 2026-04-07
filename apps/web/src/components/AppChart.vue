<template>
  <div ref="chartRef" class="app-chart" :style="chartStyle"></div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { EChartsType } from 'echarts/core';

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

let resizeObserver: ResizeObserver | null = null;
let removeWindowResizeListener: (() => void) | null = null;

const chartStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}));

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
    renderers.CanvasRenderer,
  ]);

  chartInstance.value = init(chartRef.value);
  chartInstance.value.setOption(props.option, true);

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
    chartInstance.value.setOption(option, true);
    chartInstance.value.resize();
  },
  { deep: true }
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
