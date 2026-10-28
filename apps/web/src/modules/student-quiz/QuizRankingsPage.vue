<template>
  <div class="sw-rankings">
    <StudentPageHead title="今日测验榜" :sub="headSub">
      <template #actions>
        <n-button secondary @click="router.push('/student/quiz')">返回测验</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="ranking">
      <StudentStatStrip :items="statItems" />

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
                  <span>{{ item.quiz_title }}</span>
                  <span>{{ formatDateTime(item.submitted_at) }}</span>
                </span>
              </span>
              <span class="sw-row__value">{{ item.score }}</span>
            </article>
          </template>
          <StudentEmpty v-else text="今天还没有同学提交测验，提交后会出现在这里。" />
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
            <StudentEmpty v-else text="本班学生今天都已参加测验。" />
          </StudentPanel>

          <StudentPanel v-if="ranking.items.length" title="分数段" count="人数">
            <div class="sw-band-chart">
              <AppChart :height="140" :option="scoreBandOption" />
            </div>
          </StudentPanel>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

type RankingPayload = {
  class_id: number;
  class_name: string;
  items: Array<{
    rank: number;
    student_name: string;
    student_no: string;
    score: number;
    quiz_title: string;
    submitted_at: string | null;
  }>;
  pending_students: Array<{
    student_name: string;
    student_no: string;
  }>;
  generated_at: string;
};

const router = useRouter();
const authStore = useAuthStore();
const { axisX, axisY, base, grid, palette, tokens, tooltip } = useChartTheme();

const isLoading = ref(true);
const errorMessage = ref('');
const ranking = ref<RankingPayload | null>(null);

const SCORE_BANDS = [
  { label: '0-59', min: 0, max: 59 },
  { label: '60-69', min: 60, max: 69 },
  { label: '70-79', min: 70, max: 79 },
  { label: '80-89', min: 80, max: 89 },
  { label: '90-100', min: 90, max: 100 },
];

const headSub = computed(() => {
  if (!ranking.value) {
    return '';
  }
  return `${ranking.value.class_name || '当前班级'} · 生成于 ${formatDateTime(ranking.value.generated_at)}`;
});

const statItems = computed<StudentStatItem[]>(() => {
  const items = ranking.value?.items || [];
  const pending = ranking.value?.pending_students.length || 0;
  const total = items.reduce((sum, item) => sum + item.score, 0);
  const average = items.length ? Math.round((total / items.length) * 10) / 10 : null;
  return [
    { label: '参与', value: items.length, unit: '人' },
    { label: '待参与', value: pending, unit: '人' },
    { label: '最高分', value: items[0]?.score ?? '--' },
    { label: '平均分', value: average ?? '--' },
  ];
});

const scoreBandOption = computed(() => {
  const items = ranking.value?.items || [];
  const counts = SCORE_BANDS.map(
    (band) => items.filter((item) => item.score >= band.min && item.score <= band.max).length,
  );

  return base({
    tooltip: tooltip('axis'),
    grid: grid({ top: 18, bottom: 2, left: 4, right: 4 }),
    xAxis: axisX(SCORE_BANDS.map((band) => band.label), {
      axisLabel: { color: tokens.value.muted, fontSize: 10, interval: 0 },
    }),
    yAxis: axisY({ show: false, max: (value: { max: number }) => Math.max(1, Math.ceil(value.max * 1.35)) }),
    series: [
      {
        name: '人数',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: palette.value[0], borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: tokens.value.text, fontSize: 11 },
        data: counts,
      },
    ],
  });
});

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  return value.replace('T', ' ').slice(0, 16);
}

async function loadRanking() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    ranking.value = await apiGet<RankingPayload>('/quizzes/rankings/daily', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载排行榜失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadRanking);
</script>

<style scoped>
.sw-rankings {
  display: grid;
  gap: var(--sw-section-gap);
}

/* AppChart 自带 220px 最小高度，这里按侧栏小图放宽到 140px */
.sw-band-chart :deep(.app-chart) {
  min-height: 140px;
}

.sw-rank-row__rank {
  flex: none;
  width: 30px;
  color: var(--sw-ink);
  font-size: 13px;
  line-height: 1.45;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sw-rank-row__rank.is-top {
  font-weight: 600;
}

.sw-rank-row .sw-row__value {
  min-width: 44px;
  font-size: 15px;
}

@media (max-width: 640px) {
  .sw-rank-row .sw-row__meta span:nth-child(2) {
    display: none;
  }
}
</style>
