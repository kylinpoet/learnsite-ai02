<template>
  <div class="page-stack">
    <SaPageHeader
      description="支持班级、年级、全校三个范围，默认按今日最佳速度排序，速度相同则比较准确率和完成时间。"
      eyebrow="打字排行榜"
      title="打字速度与准确率榜单"
    >
      <template #actions>
        <n-select
          v-model:value="scope"
          :options="scopeOptions"
          class="scope-select"
          @update:value="loadRankings"
        />
        <n-button :loading="isLoading" type="primary" @click="loadRankings">刷新榜单</n-button>
        <n-button secondary @click="router.push('/student/typing')">返回打字首页</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <template v-else-if="ranking">
      <div class="metric-grid">
        <article class="metric-tile">
          <p class="metric-label">榜单范围</p>
          <p class="metric-value ranking-metric-text">{{ ranking.label }}</p>
          <p class="metric-note">生成时间 {{ formatDateTime(ranking.generated_at) }}</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">上榜人数</p>
          <p class="metric-value">{{ ranking.items.length }}</p>
          <p class="metric-note">取当日最佳成绩进入榜单</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">待参与</p>
          <p class="metric-value">{{ ranking.pending_students.length }}</p>
          <p class="metric-note">仅班级榜显示未参与名单</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">最高速度</p>
          <p class="metric-value">{{ ranking.items[0]?.speed_cpm ?? '--' }}</p>
          <p class="metric-note">单位 CPM</p>
        </article>
      </div>

      <SaPanel>
        <template #header>
          <div class="chart-head">
            <div>
              <strong>成绩分布（前 {{ topTypingItems.length }} 名）</strong>
              <p class="section-note">柱为速度（CPM），折线为准确率，便于对比速度与稳定性的平衡。</p>
            </div>
          </div>
        </template>
        <n-empty v-if="!ranking.items.length" description="当前范围内还没有打字成绩。" />
        <AppChart v-else :height="300" :option="typingRankOption" />
      </SaPanel>

      <div class="split-grid">
        <SaPanel description="速度优先，准确率次之。" title="完整排行榜">
          <SaDataTable
            :data="ranking.items"
            empty-text="当前范围内还没有打字成绩"
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
            <SaTableColumn label="班级" min-width="100" prop="class_name" />
            <SaTableColumn label="速度" min-width="100" prop="speed_cpm" />
            <SaTableColumn label="准确率" min-width="100">
              <template #default="{ row }">
                {{ row.accuracy_percent }}%
              </template>
            </SaTableColumn>
            <SaTableColumn label="练习内容" min-width="200" prop="typing_set_title" />
            <SaTableColumn label="时间" min-width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.played_at) }}
              </template>
            </SaTableColumn>
          </SaDataTable>
        </SaPanel>

        <SaPanel description="仅在班级榜中显示。" title="未参与学生">
          <n-empty
            v-if="!ranking.pending_students.length"
            description="当前范围内没有待参与名单"
          />

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
import { NAlert, NButton, NEmpty, NSelect, NSkeleton, NTag } from 'naive-ui';
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
        barMaxWidth: 30,
        itemStyle: { borderRadius: [6, 6, 0, 0], color: palette.value[0] },
        data: items.map((item) => item.speed_cpm),
      },
      {
        name: '准确率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        lineStyle: { color: palette.value[1] },
        itemStyle: { color: palette.value[1] },
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
.scope-select {
  width: 150px;
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
}
</style>
