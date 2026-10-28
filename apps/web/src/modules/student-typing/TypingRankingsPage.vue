<template>
  <div class="sw-rankings">
    <StudentPageHead title="打字排行" :sub="headSub">
      <template #actions>
        <n-select
          v-model:value="scope"
          :options="scopeOptions"
          class="scope-select"
          @update:value="loadRankings"
        />
        <n-button secondary @click="router.push('/student/typing')">返回训练</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="ranking">
      <StudentPanel title="速度与准确率" :count="chartCount">
        <StudentEmpty v-if="!ranking.items.length" text="当前范围内还没有打字成绩，完成练习后会出现在这里。" />
        <div v-else class="sw-rank-chart">
          <AppChart :height="240" :option="typingRankOption" />
        </div>
      </StudentPanel>

      <div class="sw-split">
        <StudentPanel title="完整排行榜" :count="`${ranking.items.length} 人`" flush>
          <template v-if="ranking.items.length">
            <article
              v-for="item in ranking.items"
              :key="item.student_no"
              class="sw-row sw-rank-row"
            >
              <span
                :class="['sw-rank-row__rank', { 'is-top': item.rank <= 3 }]"
              >
                {{ item.rank }}
              </span>
              <span class="sw-row__main">
                <span class="sw-row__title">{{ item.student_name }}</span>
                <span class="sw-row__meta">
                  <span>{{ item.student_no }}</span>
                  <span v-if="scope !== 'class'">{{ item.class_name }}</span>
                  <span class="sw-rank-row__set">{{ item.typing_set_title }}</span>
                  <span>准确率 {{ item.accuracy_percent }}%</span>
                  <span>{{ formatDateTime(item.played_at) }}</span>
                </span>
              </span>
              <span class="sw-row__value">
                {{ item.speed_cpm }}<small class="sw-row__unit"> CPM</small>
              </span>
            </article>
          </template>
          <StudentEmpty v-else text="当前范围内还没有打字成绩，完成练习后会出现在这里。" />
        </StudentPanel>

        <div class="sw-split__aside">
          <StudentPanel
            title="未参与"
            :count="`${ranking.pending_students.length} 人`"
            flush
          >
            <template v-if="ranking.pending_students.length">
              <article
                v-for="item in ranking.pending_students"
                :key="item.student_no"
                class="sw-row"
              >
                <span class="sw-row__main">
                  <span class="sw-row__title">{{ item.student_name }}</span>
                  <span class="sw-row__meta">{{ item.student_no }}</span>
                </span>
              </article>
            </template>
            <StudentEmpty v-else text="本班学生今天都已参与练习。" />
          </StudentPanel>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSelect, NSkeleton } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

type RankingPayload = {
  scope: string;
  label: string;
  items: Array<{
    rank: number;
    student_name: string;
    student_no: string;
    class_name: string;
    speed_cpm: number;
    accuracy_percent: number;
    typing_set_title: string;
    played_at: string;
  }>;
  pending_students: Array<{
    student_name: string;
    student_no: string;
  }>;
  generated_at: string;
};

const router = useRouter();
const authStore = useAuthStore();
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();

const scope = ref<'class' | 'grade' | 'school'>('class');
const isLoading = ref(true);
const errorMessage = ref('');
const ranking = ref<RankingPayload | null>(null);

const topTypingItems = computed(() => (ranking.value?.items || []).slice(0, 12));

const headSub = computed(() => {
  if (!ranking.value) {
    return '';
  }
  return `${ranking.value.label} · 生成于 ${formatDateTime(ranking.value.generated_at)}`;
});

const chartCount = computed(() => {
  const items = ranking.value?.items || [];
  const best = items[0]?.speed_cpm ?? '--';
  return `前 ${topTypingItems.value.length} 名 · ${items.length} 人 · 最高 ${best} CPM`;
});

const typingRankOption = computed(() => {
  const items = topTypingItems.value;
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(items.map((item) => item.student_name), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 60, overflow: 'truncate', interval: 0 },
    }),
    yAxis: [
      axisY({ name: 'CPM', nameTextStyle: { color: tokens.value.muted } }),
      axisY({ name: '准确率%', nameTextStyle: { color: tokens.value.muted }, max: 100, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '速度',
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: palette.value[0] },
        data: items.map((item) => item.speed_cpm),
      },
      {
        name: '准确率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 6,
        lineStyle: { color: tokens.value.ink },
        itemStyle: { color: tokens.value.ink },
        data: items.map((item) => item.accuracy_percent),
      },
    ],
  });
});

const scopeOptions = [
  { label: '班级榜', value: 'class' },
  { label: '年级榜', value: 'grade' },
  { label: '全校榜', value: 'school' },
];

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  return value.replace('T', ' ').slice(0, 16);
}

async function loadRankings() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    ranking.value = await apiGet<RankingPayload>(`/typing/rankings?scope=${scope.value}`, authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载排行榜失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadRankings);
</script>

<style scoped>
.sw-rankings {
  display: grid;
  gap: var(--sw-section-gap);
}

.scope-select {
  width: 120px;
}

/* AppChart 自带 220px 最小高度，这里按契约固定为 240px */
.sw-rank-chart :deep(.app-chart) {
  min-height: 240px;
}

.sw-rank-row__rank {
  flex: none;
  width: 30px;
  color: var(--sw-muted);
  font-size: 13px;
  line-height: 1.45;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sw-rank-row__rank.is-top {
  color: var(--sw-ink);
  font-weight: 600;
}

.sw-rank-row .sw-row__value {
  min-width: 72px;
  font-size: 15px;
}

.sw-rank-row .sw-row__value small {
  color: var(--sw-muted);
  font-size: 11.5px;
  font-weight: 400;
}

@media (max-width: 640px) {
  .sw-rank-row__set {
    display: none;
  }
}
</style>
