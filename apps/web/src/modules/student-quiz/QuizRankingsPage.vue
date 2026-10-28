<template>
  <div class="page-stack">
    <SaPageHeader
      description="这里只展示当前学生所在班级的当日最佳成绩，同时保留未参与学生名单，方便课堂即时反馈。"
      eyebrow="测验排行榜"
      title="今日班级测验榜"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadRanking">刷新榜单</n-button>
        <n-button secondary @click="router.push('/student/quiz')">返回测验首页</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <template v-else-if="ranking">
      <div class="metric-grid">
        <article class="metric-tile">
          <p class="metric-label">班级</p>
          <p class="metric-value ranking-metric-text">{{ ranking.class_name || '当前班级' }}</p>
          <p class="metric-note">已按成绩和提交时间排序</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">今日参与</p>
          <p class="metric-value">{{ ranking.items.length }}</p>
          <p class="metric-note">已有提交成绩的学生人数</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">待参与</p>
          <p class="metric-value">{{ ranking.pending_students.length }}</p>
          <p class="metric-note">还没有提交测验的学生人数</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">最高分</p>
          <p class="metric-value">{{ ranking.items[0]?.score ?? '--' }}</p>
          <p class="metric-note">生成时间 {{ formatDateTime(ranking.generated_at) }}</p>
        </article>
      </div>

      <div class="chart-grid">
        <SaPanel>
          <template #header>
            <div class="chart-head">
              <div>
                <strong>成绩分布</strong>
                <p class="section-note">按分数段统计参与学生，快速看出班级整体掌握情况。</p>
              </div>
            </div>
          </template>
          <n-empty v-if="!ranking.items.length" description="今天还没有学生提交测验。" />
          <AppChart v-else :height="260" :option="scoreBandOption" />
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="chart-head">
              <div>
                <strong>参与情况</strong>
                <p class="section-note">已参与与待参与学生的比例。</p>
              </div>
            </div>
          </template>
          <n-empty v-if="!ranking.items.length && !ranking.pending_students.length" description="暂无可统计的参与数据。" />
          <AppChart v-else :height="260" :option="participationOption" />
        </SaPanel>
      </div>

      <div class="split-grid">
        <SaPanel description="每位学生取今日最佳一条成绩进入榜单。" title="完整排行榜">
          <SaDataTable
            :data="ranking.items"
            empty-text="今天还没有学生提交测验"
            row-key="student_no"
            stripe
          >
            <SaTableColumn label="排名" min-width="80">
              <template #default="{ row }">
                <n-tag :type="rankTagType(row.rank)" round>#{{ row.rank }}</n-tag>
              </template>
            </SaTableColumn>
            <SaTableColumn label="学生" min-width="140" prop="student_name" />
            <SaTableColumn label="学号" min-width="120" prop="student_no" />
            <SaTableColumn label="成绩" min-width="100" prop="score" />
            <SaTableColumn label="测验名称" min-width="220" prop="quiz_title" />
            <SaTableColumn label="提交时间" min-width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.submitted_at) }}
              </template>
            </SaTableColumn>
          </SaDataTable>
        </SaPanel>

        <SaPanel description="便于教师或学生快速确认还未参加的同学。" title="未参与学生">
          <n-empty v-if="!ranking.pending_students.length" description="今天本班学生都已完成测验" />

          <div v-else class="pending-list">
            <article
              v-for="item in ranking.pending_students"
              :key="item.student_no"
              class="pending-item"
            >
              <strong>{{ item.student_name }}</strong>
              <span>{{ item.student_no }}</span>
            </article>
          </div>
        </SaPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSkeleton, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
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
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();

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

const scoreBandOption = computed(() => {
  const items = ranking.value?.items || [];
  const counts = SCORE_BANDS.map(
    (band) => items.filter((item) => item.score >= band.min && item.score <= band.max).length,
  );

  return base({
    tooltip: tooltip('axis'),
    grid: grid({ top: 20 }),
    xAxis: axisX(SCORE_BANDS.map((band) => band.label), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, interval: 0 },
      name: '分数段',
      nameTextStyle: { color: tokens.value.muted },
      nameLocation: 'middle',
      nameGap: 26,
    }),
    yAxis: axisY(),
    series: [
      {
        name: '人数',
        type: 'bar',
        barMaxWidth: 40,
        itemStyle: { color: palette.value[0], borderRadius: [8, 8, 0, 0] },
        label: { show: true, position: 'top', color: tokens.value.text, fontSize: 12, fontWeight: 600 },
        data: counts,
      },
    ],
  });
});

const participationOption = computed(() => {
  const participated = ranking.value?.items.length ?? 0;
  const pending = ranking.value?.pending_students.length ?? 0;
  const total = participated + pending;

  return base({
    tooltip: tooltip('item'),
    legend: legend({ bottom: 0, top: 'auto' }),
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 12, borderColor: tokens.value.surface, borderWidth: 3 },
        label: { show: false },
        data: [
          { value: participated, name: '已参与', itemStyle: { color: palette.value[0] } },
          { value: pending, name: '待参与', itemStyle: { color: tokens.value.warning } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: `${total}`, fill: tokens.value.ink, fontSize: 26, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: { text: '应参与人数', fill: tokens.value.muted, fontSize: 12 },
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

function rankTagType(rank: number) {
  if (rank === 1) {
    return 'warning';
  }
  if (rank === 2) {
    return 'success';
  }
  if (rank === 3) {
    return 'primary';
  }
  return 'info';
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
.chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}

.chart-grid :deep(.sa-panel__body) {
  display: grid;
  gap: 12px;
}

.chart-head strong {
  color: var(--ls-ink);
  font-size: 15px;
}

.section-note {
  margin: 4px 0 0;
  color: var(--ls-muted);
  font-size: 13px;
}

.ranking-metric-text {
  font-size: clamp(24px, 2vw, 34px);
}

.split-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.pending-list {
  display: grid;
  gap: 10px;
}

.pending-item {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--ls-border);
  background: rgba(255, 179, 71, 0.12);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.pending-item span {
  color: var(--ls-muted);
  font-size: 13px;
}

@media (max-width: 1200px) {
  .split-grid {
    grid-template-columns: 1fr;
  }

  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
