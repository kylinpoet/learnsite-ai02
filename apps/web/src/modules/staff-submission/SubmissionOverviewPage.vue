<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="汇总所有已有学生提交的活动，优先处理未评阅的作品。"
      eyebrow="作品评分"
      title="教师作品总览"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadOverview">刷新列表</n-button>
        <n-button
          v-if="filteredItems.length"
          secondary
          @click="goToTask(filteredItems[0].task_id)"
        >
          前往当前筛选首项
        </n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <div v-else class="page-stack">
      <div class="ls-row ls-row--5">
        <article class="metric-tile">
          <p class="metric-label">活动数</p>
          <p class="metric-value">{{ overview?.summary.task_count || 0 }}</p>
          <p class="metric-note">当前已有学生提交记录的活动总数。</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">作品总数</p>
          <p class="metric-value">{{ overview?.summary.submission_count || 0 }}</p>
          <p class="metric-note">教师可进入活动页查看作品说明和附件。</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">已评阅</p>
          <p class="metric-value">{{ overview?.summary.reviewed_count || 0 }}</p>
          <p class="metric-note">已经录入评分或教师评语的作品数量。</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">待评阅</p>
          <p class="metric-value">{{ overview?.summary.pending_count || 0 }}</p>
          <p class="metric-note">学生已提交但教师尚未完成评阅的作品数量。</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">提交学生数</p>
          <p class="metric-value">{{ overview?.student_summary?.summary.student_count || 0 }}</p>
          <p class="metric-note">按学生聚合统计作品与评分，便于快速查看班级学习表现。</p>
        </article>
      </div>

      <div class="overview-charts">
        <SaPanel>
          <template #header>
            <div class="info-row">
              <span>评阅进度</span>
              <n-tag round :type="reviewedRate >= 80 ? 'success' : reviewedRate >= 40 ? 'warning' : 'error'">
                已评阅 {{ reviewedRate }}%
              </n-tag>
            </div>
          </template>
          <n-empty v-if="!overview?.summary.submission_count" description="当前还没有作品可统计评阅进度。" />
          <AppChart v-else :height="260" :option="reviewProgressOption" />
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="info-row">
              <span>活动提交与平均分</span>
              <span class="table-note">柱为提交数（深色已评阅），折线为平均分</span>
            </div>
          </template>
          <n-empty v-if="!overview?.items.length" description="当前还没有可对比的活动。" />
          <AppChart v-else :height="260" :option="taskSubmissionOption" />
        </SaPanel>
      </div>

      <SaPanel>
        <template #header>
          <div class="toolbar-row">
            <div class="info-row">
              <span>学生成绩汇总</span>
              <n-tag round type="info">
                计分学生 {{ overview?.student_summary?.summary.scored_student_count || 0 }} / {{
                  overview?.student_summary?.summary.student_count || 0
                }}
              </n-tag>
              <n-tag round type="success">
                人均 {{ overview?.student_summary?.summary.average_student_score ?? '--' }}
              </n-tag>
            </div>
            <n-button
              :disabled="!studentSummaryItems.length"
              :loading="isExportingStudentSummary"
              secondary
              @click="downloadStudentSummary"
            >
              导出学生成绩汇总
            </n-button>
          </div>
        </template>

        <n-empty
          v-if="!studentSummaryItems.length"
          description="当前还没有可汇总的学生作品记录。"
        />

        <SaDataTable v-else :data="studentSummaryItems" row-key="student_id" stripe>
          <SaTableColumn label="班级" min-width="140" prop="class_name" />
          <SaTableColumn label="学号" min-width="120" prop="student_no" />
          <SaTableColumn label="学生" min-width="120" prop="student_name" />
          <SaTableColumn label="作品数" min-width="88" prop="submission_count" />
          <SaTableColumn label="已评阅" min-width="88" prop="reviewed_count" />
          <SaTableColumn label="待评阅" min-width="88" prop="pending_count" />
          <SaTableColumn label="平均分" min-width="100">
            <template #default="{ row }">
              {{ row.average_score ?? '--' }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="最近提交" min-width="170">
            <template #default="{ row }">
              {{ formatDateTime(row.latest_submitted_at) }}
            </template>
          </SaTableColumn>
        </SaDataTable>
      </SaPanel>

      <SaPanel>
        <template #header>
          <div class="toolbar-row">
            <div class="info-row">
              <span>活动列表</span>
              <n-tag round type="info">
                平均分 {{ overview?.summary.average_score ?? '--' }}
              </n-tag>
            </div>
            <div class="filter-row">
              <span class="filter-label">仅看未评阅活动</span>
              <n-switch v-model:value="onlyPendingTasks" />
              <n-select
                v-model:value="selectedCourse"
                :options="courseOptions.map((option) => ({ label: option, value: option }))"
                class="filter-select"
                clearable
                placeholder="筛选课程"
              />
              <n-select
                v-model:value="selectedLesson"
                :options="lessonOptions"
                class="filter-select filter-select-wide"
                clearable
                placeholder="筛选课次"
              />
              <n-button
                v-if="selectedCourse || selectedLesson || !onlyPendingTasks"
                text
                @click="resetFilters"
              >
                恢复默认
              </n-button>
              <n-tag round type="success">
                当前显示 {{ filteredItems.length }} / {{ overview?.items.length || 0 }}
              </n-tag>
            </div>
          </div>
        </template>

        <n-empty
          v-if="!overview?.items.length"
          description="当前还没有学生提交的作品活动。"
        />

        <n-empty
          v-else-if="!filteredItems.length"
          description="当前筛选条件下没有待处理活动。"
        />

        <SaDataTable
          v-else
          :data="filteredItems"
          :scroll-x="1294"
          row-key="task_id"
          stripe
          @row-click="handleRowClick"
        >
          <SaTableColumn label="课程" min-width="220" prop="course_title" />
          <SaTableColumn label="活动" min-width="220" prop="task_title" />
          <SaTableColumn label="所属课次" min-width="200">
            <template #default="{ row }">
              <div>
                <strong>{{ row.lesson_title }}</strong>
                <p class="table-note">{{ row.unit_title }}</p>
              </div>
            </template>
          </SaTableColumn>
          <SaTableColumn label="提交数" min-width="88" prop="submission_count" />
          <SaTableColumn label="已评阅" min-width="88" prop="reviewed_count" />
          <SaTableColumn label="待评阅" min-width="88" prop="pending_count" />
          <SaTableColumn label="平均分" min-width="100">
            <template #default="{ row }">
              {{ row.average_score ?? '--' }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="最近提交" min-width="170">
            <template #default="{ row }">
              {{ formatDateTime(row.latest_submitted_at) }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="操作" fixed="right" min-width="120">
            <template #default="{ row }">
              <n-button text type="primary" @click.stop="goToTask(row.task_id)">
                进入评分
              </n-button>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </SaPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSelect, NSkeleton, NSwitch, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet, apiGetBlob } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

defineProps<{
  eyebrow?: string;
  title?: string;
  description?: string;
  highlights?: Array<{ title: string; text: string }>;
}>();

type OverviewItem = {
  task_id: number;
  task_title: string;
  task_type: string;
  course_id: number;
  course_title: string;
  assigned_date: string;
  lesson_title: string;
  unit_title: string;
  submission_count: number;
  reviewed_count: number;
  pending_count: number;
  average_score: number | null;
  latest_submitted_at: string | null;
};

type StudentSummaryItem = {
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  submission_count: number;
  reviewed_count: number;
  pending_count: number;
  scored_count: number;
  average_score: number | null;
  latest_submitted_at: string | null;
};

type StudentSummaryPayload = {
  summary: {
    student_count: number;
    submission_count: number;
    reviewed_count: number;
    pending_count: number;
    scored_student_count: number;
    average_score: number | null;
    average_student_score: number | null;
  };
  items: StudentSummaryItem[];
};

type OverviewPayload = {
  summary: {
    task_count: number;
    submission_count: number;
    reviewed_count: number;
    pending_count: number;
    average_score: number | null;
  };
  items: OverviewItem[];
  student_summary: StudentSummaryPayload;
};

const router = useRouter();
const authStore = useAuthStore();
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();
const overview = ref<OverviewPayload | null>(null);
const onlyPendingTasks = ref(true);
const selectedCourse = ref('');
const selectedLesson = ref('');
const isLoading = ref(true);
const isExportingStudentSummary = ref(false);
const errorMessage = ref('');

const overviewItems = computed(() => overview.value?.items || []);
const studentSummaryItems = computed(() => overview.value?.student_summary?.items || []);

const reviewedRate = computed(() => {
  const summary = overview.value?.summary;
  if (!summary?.submission_count) {
    return 0;
  }
  return Math.round((summary.reviewed_count / summary.submission_count) * 100);
});

const reviewProgressOption = computed(() => {
  const summary = overview.value?.summary;
  const reviewed = summary?.reviewed_count ?? 0;
  const pending = summary?.pending_count ?? 0;

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
          { value: reviewed, name: '已评阅', itemStyle: { color: palette.value[2] } },
          { value: pending, name: '待评阅', itemStyle: { color: tokens.value.warning } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: `${reviewedRate.value}%`, fill: tokens.value.ink, fontSize: 28, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: { text: '评阅完成度', fill: tokens.value.muted, fontSize: 12 },
      },
    ],
  });
});

const taskSubmissionOption = computed(() => {
  const items = overviewItems.value.slice(0, 12);
  const averageScores = items.map((item) => (item.average_score === null ? null : Number(item.average_score.toFixed(1))));

  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(items.map((item) => item.task_title), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 72, overflow: 'truncate', interval: 0 },
    }),
    yAxis: [
      axisY(),
      axisY({ name: '平均分', nameTextStyle: { color: tokens.value.muted }, max: 100, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '已评阅',
        type: 'bar',
        stack: 'submission',
        barMaxWidth: 30,
        itemStyle: { color: palette.value[2] },
        data: items.map((item) => item.reviewed_count),
      },
      {
        name: '待评阅',
        type: 'bar',
        stack: 'submission',
        barMaxWidth: 30,
        itemStyle: { color: tokens.value.warning, borderRadius: [6, 6, 0, 0] },
        data: items.map((item) => item.pending_count),
      },
      {
        name: '平均分',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        connectNulls: true,
        lineStyle: { color: palette.value[1] },
        itemStyle: { color: palette.value[1] },
        data: averageScores,
      },
    ],
  });
});

const courseOptions = computed(() => {
  const options = new Set<string>();
  for (const item of overviewItems.value) {
    options.add(item.course_title);
  }
  return Array.from(options);
});

const lessonOptions = computed(() => {
  const options = new Map<string, string>();
  for (const item of overviewItems.value) {
    if (selectedCourse.value && item.course_title !== selectedCourse.value) {
      continue;
    }

    const value = buildLessonFilterValue(item);
    options.set(value, value);
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
});

const filteredItems = computed(() => {
  return overviewItems.value.filter((item) => {
    if (onlyPendingTasks.value && item.pending_count <= 0) {
      return false;
    }
    if (selectedCourse.value && item.course_title !== selectedCourse.value) {
      return false;
    }
    if (selectedLesson.value && buildLessonFilterValue(item) !== selectedLesson.value) {
      return false;
    }
    return true;
  });
});

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function buildLessonFilterValue(item: Pick<OverviewItem, 'unit_title' | 'lesson_title'>) {
  return `${item.unit_title} / ${item.lesson_title}`;
}

function resetFilters() {
  onlyPendingTasks.value = true;
  selectedCourse.value = '';
  selectedLesson.value = '';
}

function extractFilename(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallback;
}

async function downloadStudentSummary() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!studentSummaryItems.value.length) {
    ElMessage.info('当前没有可导出的学生成绩汇总');
    return;
  }

  isExportingStudentSummary.value = true;
  try {
    const response = await apiGetBlob('/submissions/teacher/students/export', authStore.token);
    const blob = await response.blob();
    const filename = extractFilename(
      response.headers.get('content-disposition'),
      'teacher_student_score_summary.csv'
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    ElMessage.success('学生成绩汇总已导出');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出学生成绩汇总失败');
  } finally {
    isExportingStudentSummary.value = false;
  }
}

async function loadOverview() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    overview.value = await apiGet<OverviewPayload>('/submissions/teacher', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品总览失败';
  } finally {
    isLoading.value = false;
  }
}

async function goToTask(taskId: number) {
  await router.push(`/staff/submissions/${taskId}`);
}

function handleRowClick(row: OverviewItem) {
  void goToTask(row.task_id);
}

watch(courseOptions, (options) => {
  if (selectedCourse.value && !options.includes(selectedCourse.value)) {
    selectedCourse.value = '';
  }
});

watch(lessonOptions, (options) => {
  if (selectedLesson.value && !options.some((option) => option.value === selectedLesson.value)) {
    selectedLesson.value = '';
  }
});

onMounted(loadOverview);
</script>

<style scoped>
.overview-charts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.8fr);
  gap: 16px;
}

.overview-charts :deep(.sa-panel__body) {
  display: grid;
  gap: 12px;
}

.toolbar-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-select {
  width: 170px;
}

.filter-select-wide {
  width: 240px;
}

.filter-label {
  color: var(--ls-muted);
  font-size: 13px;
}

.table-note {
  margin: 4px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
}

@media (max-width: 960px) {
  .overview-charts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .filter-select,
  .filter-select-wide {
    width: 100%;
  }
}
</style>
