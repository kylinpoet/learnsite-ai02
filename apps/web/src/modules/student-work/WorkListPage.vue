<template>
  <div class="page-stack">
    <SaPageHeader
      description="这里会汇总你已经提交的作品、教师评价状态以及最近一次更新时间。教师评价前，你仍然可以回到任务页继续覆盖提交。"
      eyebrow="我的作品"
      :title="pageTitle"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadWorkList">刷新作品列表</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="workData" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">作品总数</p>
        <p class="metric-value">{{ workData.summary.total_count }}</p>
        <p class="metric-note">已经正式保存的作品记录总数。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">已评价</p>
        <p class="metric-value">{{ workData.summary.reviewed_count }}</p>
        <p class="metric-note">教师已经完成评分或反馈的作品。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">待教师评价</p>
        <p class="metric-value">{{ workData.summary.submitted_count }}</p>
        <p class="metric-note">已提交，等待教师查看。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">可再次提交</p>
        <p class="metric-value">{{ workData.summary.resubmittable_count }}</p>
        <p class="metric-note">教师评价前，还可以继续覆盖提交。</p>
      </article>
    </div>

    <div v-if="workData" class="work-charts">
      <SaPanel>
        <template #header>
          <div class="work-chart-head">
            <strong>作品状态分布</strong>
            <span class="work-chart-note">已评价与待评价作品的比例</span>
          </div>
        </template>
        <n-empty v-if="!workData.summary.total_count" description="还没有作品可统计。" />
        <AppChart v-else :height="260" :option="statusDonutOption" />
      </SaPanel>

      <SaPanel>
        <template #header>
          <div class="work-chart-head">
            <strong>各课程作品与得分</strong>
            <span class="work-chart-note">柱为作品数，折线为平均得分</span>
          </div>
        </template>
        <n-empty v-if="!courseStats.length" description="暂无可对比的课程。" />
        <AppChart v-else :height="260" :option="courseScoreOption" />
      </SaPanel>
    </div>

    <SaPanel title="作品记录">
      <template #actions>
        <n-tag round type="info">{{ latestUpdateText }}</n-tag>
      </template>

      <n-skeleton v-if="isLoading" :rows="6" animated />

      <SaDataTable
        v-else
        :data="workData?.items ?? []"
        :scroll-x="1580"
        empty-text="还没有作品记录"
        row-key="submission_id"
        stripe
      >
        <SaTableColumn label="课程" min-width="220" prop="course_title" />
        <SaTableColumn label="任务" min-width="180" prop="task_title" />
        <SaTableColumn label="提交方式" min-width="220">
          <template #default="{ row }">
            <n-tag :type="submissionScopeTagType(row)" round>{{ submissionScopeLabel(row) }}</n-tag>
            <p v-if="row.submission_scope === 'group'" class="submission-meta">
              {{ groupDisplayLabel(row) }}
              <span v-if="row.submitted_by_name"> · 最近提交 {{ row.submitted_by_name }}</span>
            </p>
          </template>
        </SaTableColumn>
        <SaTableColumn label="状态" min-width="120">
          <template #default="{ row }">
            <n-tag :type="statusTagType(row.status)" round>{{ statusLabel(row.status) }}</n-tag>
          </template>
        </SaTableColumn>
        <SaTableColumn label="得分" min-width="90">
          <template #default="{ row }">{{ row.score ?? '--' }}</template>
        </SaTableColumn>
        <SaTableColumn label="教师评语" min-width="220">
          <template #default="{ row }">{{ teacherCommentPreview(row.teacher_comment) }}</template>
        </SaTableColumn>
        <SaTableColumn label="附件" min-width="180">
          <template #default="{ row }">
            <span>{{ row.primary_file_name || '暂无附件' }}</span>
            <span v-if="row.file_count > 1" class="file-count">+{{ row.file_count - 1 }}</span>
          </template>
        </SaTableColumn>
        <SaTableColumn label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </SaTableColumn>
        <SaTableColumn fixed="right" label="操作" min-width="180">
          <template #default="{ row }">
            <n-space :size="8" :wrap="true">
              <n-button text type="primary" @click="goToDetail(row.submission_id)">查看详情</n-button>
              <n-button
                v-if="row.can_resubmit"
                text
                type="primary"
                @click="goToTask(row.course_id, row.task_id, row.task_type)"
              >
                再次提交
              </n-button>
              <n-button
                v-if="row.status === 'reviewed'"
                :loading="revokingSubmissionId === row.submission_id"
                text
                type="warning"
                @click="revokeReviewedSubmission(row)"
              >
                撤销评阅
              </n-button>
            </n-space>
          </template>
        </SaTableColumn>
      </SaDataTable>
    </SaPanel>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSkeleton, NSpace, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

type SubmissionItem = {
  submission_id: number;
  course_id: number;
  course_title: string;
  task_id: number;
  task_title: string;
  task_type: string;
  submission_scope: 'individual' | 'group';
  status: 'submitted' | 'reviewed';
  score: number | null;
  teacher_comment: string | null;
  peer_review_score: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  group_id: number | null;
  group_name: string | null;
  group_no: number | null;
  submitted_by_name: string | null;
  file_count: number;
  primary_file_name: string | null;
  can_resubmit: boolean;
};

type WorkPayload = {
  summary: {
    total_count: number;
    reviewed_count: number;
    submitted_count: number;
    resubmittable_count: number;
  };
  items: SubmissionItem[];
};

const router = useRouter();
const authStore = useAuthStore();
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();
const workData = ref<WorkPayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const revokingSubmissionId = ref<number | null>(null);

const pageTitle = computed(() => {
  const displayName = authStore.user?.display_name || '同学';
  return `${displayName} 的作品中心`;
});

const latestUpdateText = computed(() => {
  const latestItem = workData.value?.items[0];
  if (!latestItem?.updated_at) {
    return '暂无更新记录';
  }
  return `最近更新：${formatDateTime(latestItem.updated_at)}`;
});

const statusDonutOption = computed(() => {
  const summary = workData.value?.summary;
  const reviewed = summary?.reviewed_count ?? 0;
  const pending = summary?.submitted_count ?? 0;

  return base({
    tooltip: tooltip('item'),
    legend: legend({ bottom: 0, top: 'auto' }),
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 12, borderColor: tokens.value.surface, borderWidth: 3 },
        label: { show: false },
        data: [
          { value: reviewed, name: '已评价', itemStyle: { color: palette.value[2] } },
          { value: pending, name: '待评价', itemStyle: { color: tokens.value.warning } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: `${summary?.total_count ?? 0}`, fill: tokens.value.ink, fontSize: 26, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: { text: '作品总数', fill: tokens.value.muted, fontSize: 12 },
      },
    ],
  });
});

const courseStats = computed(() => {
  const bucket = new Map<string, { count: number; scoreSum: number; scoreCount: number }>();
  for (const item of workData.value?.items || []) {
    const record = bucket.get(item.course_title) || { count: 0, scoreSum: 0, scoreCount: 0 };
    record.count += 1;
    if (item.score !== null) {
      record.scoreSum += item.score;
      record.scoreCount += 1;
    }
    bucket.set(item.course_title, record);
  }
  return Array.from(bucket.entries())
    .map(([title, value]) => ({
      title,
      count: value.count,
      averageScore: value.scoreCount ? Number((value.scoreSum / value.scoreCount).toFixed(1)) : null,
    }))
    .slice(0, 10);
});

const courseScoreOption = computed(() => {
  const items = courseStats.value;
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(items.map((item) => item.title), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 72, overflow: 'truncate', interval: 0 },
    }),
    yAxis: [
      axisY({ name: '作品数', nameTextStyle: { color: tokens.value.muted } }),
      axisY({ name: '平均分', nameTextStyle: { color: tokens.value.muted }, max: 100, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '作品数',
        type: 'bar',
        barMaxWidth: 30,
        itemStyle: { color: palette.value[0], borderRadius: [6, 6, 0, 0] },
        data: items.map((item) => item.count),
      },
      {
        name: '平均得分',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        connectNulls: true,
        lineStyle: { color: palette.value[1] },
        itemStyle: { color: palette.value[1] },
        data: items.map((item) => item.averageScore),
      },
    ],
  });
});

function statusLabel(status: SubmissionItem['status']) {
  return status === 'reviewed' ? '已评价' : '待教师评价';
}

function statusTagType(status: SubmissionItem['status']) {
  return status === 'reviewed' ? 'success' : 'warning';
}

function submissionScopeLabel(item: SubmissionItem) {
  return item.submission_scope === 'group' ? '小组共同提交' : '个人提交';
}

function submissionScopeTagType(item: SubmissionItem) {
  return item.submission_scope === 'group' ? 'warning' : 'success';
}

function groupDisplayLabel(item: SubmissionItem) {
  if (item.group_name) {
    return item.group_name;
  }
  if (item.group_no !== null) {
    return `第 ${item.group_no} 组`;
  }
  return '当前小组';
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function teacherCommentPreview(comment: string | null) {
  const normalized = (comment || '').trim();
  if (!normalized) {
    return '--';
  }
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

async function loadWorkList() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    workData.value = await apiGet<WorkPayload>('/submissions/mine', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品中心失败';
  } finally {
    isLoading.value = false;
  }
}

async function goToDetail(submissionId: number) {
  await router.push(`/student/work/${submissionId}`);
}

async function goToTask(courseId: number, taskId: number, taskType: string) {
  const taskSegment = taskType === 'programming' ? 'programs' : taskType === 'reading' ? 'readings' : 'tasks';
  await router.push(`/student/courses/${courseId}/${taskSegment}/${taskId}`);
}

async function revokeReviewedSubmission(item: SubmissionItem) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }
  if (item.status !== 'reviewed') {
    ElMessage.info('当前作品未处于已评阅状态');
    return;
  }

  revokingSubmissionId.value = item.submission_id;
  try {
    await apiPost(`/submissions/${item.submission_id}/revoke`, {}, authStore.token);
    ElMessage.success('已撤销评阅，可继续提交修改');
    await loadWorkList();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '撤销评阅失败');
  } finally {
    revokingSubmissionId.value = null;
  }
}

onMounted(loadWorkList);
</script>

<style scoped>
.work-charts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
  gap: 16px;
}

.work-charts :deep(.sa-panel__body) {
  display: grid;
  gap: 12px;
}

.work-chart-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.work-chart-head strong {
  color: var(--ls-ink);
  font-size: 15px;
}

.work-chart-note {
  color: var(--ls-muted);
  font-size: 12px;
}

.file-count {
  margin-left: 6px;
  color: var(--ls-muted);
  font-size: 12px;
}

.submission-meta {
  margin: 8px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
}

@media (max-width: 960px) {
  .work-charts {
    grid-template-columns: 1fr;
  }
}
</style>
