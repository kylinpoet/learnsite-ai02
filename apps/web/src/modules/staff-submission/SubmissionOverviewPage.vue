<template>
  <div class="page-stack">
    <StaffPageHead title="提交批改" :sub="pageSummary">
      <template #actions>
        <n-button :loading="isLoading" text @click="loadOverview">刷新</n-button>
        <n-button
          v-if="topQueueItem"
          type="primary"
          :title="topQueueItem.task_title"
          @click="goToTask(topQueueItem.task_id)"
        >
          开始批改
        </n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="9" animated /></div>
    </div>

    <template v-else-if="overview">
      <StaffStatStrip :items="statItems" />

      <div class="queue-layout">
        <section class="sf-panel">
          <div class="sf-tabs">
            <button
              type="button"
              :class="['sf-tabs__item', { 'is-active': activeTab === 'pending' }]"
              @click="activeTab = 'pending'"
            >
              待评阅
              <span class="sf-tabs__count">{{ pendingItems.length }}</span>
            </button>
            <button
              type="button"
              :class="['sf-tabs__item', { 'is-active': activeTab === 'all' }]"
              @click="activeTab = 'all'"
            >
              全部活动
              <span class="sf-tabs__count">{{ overviewItems.length }}</span>
            </button>
          </div>

          <div class="sf-toolbar">
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
              class="filter-select filter-select--wide"
              clearable
              placeholder="筛选课次"
            />
            <div class="sf-toolbar__right">
              <n-button v-if="hasFilters" text @click="resetFilters">清除筛选</n-button>
              <span>{{ filteredItems.length }} / {{ overviewItems.length }} 个活动</span>
            </div>
          </div>

          <p v-if="!overviewItems.length" class="sf-empty">
            还没有学生提交过作品。学生提交后，活动会出现在这里等待批改。
          </p>

          <p v-else-if="!filteredItems.length" class="sf-empty">
            当前筛选条件下没有活动。
          </p>

          <template v-else>
            <div class="sf-rows__head queue-cols">
              <span>活动</span>
              <span>待评阅</span>
              <span>最近提交</span>
              <span>操作</span>
            </div>
            <div class="sf-rows">
              <article
                v-for="item in filteredItems"
                :key="item.task_id"
                class="sf-row sf-row--cols sf-row--link queue-cols"
                @click="goToTask(item.task_id)"
              >
                <div class="sf-row__main">
                  <p class="sf-row__title">
                    <span class="sf-row__title-text">{{ item.task_title }}</span>
                    <span v-if="item.pending_count > 0" class="sf-pill sf-pill--warn">
                      待评 {{ item.pending_count }}
                    </span>
                    <span v-else class="sf-pill sf-pill--pos">
                      <span class="sf-pill__dot" />已批完
                    </span>
                  </p>
                  <p class="sf-row__meta">
                    <span>{{ item.course_title }}</span>
                    <span>{{ item.unit_title }} / {{ item.lesson_title }}</span>
                    <span v-if="item.average_score !== null">平均 {{ item.average_score }}</span>
                  </p>
                </div>

                <span class="queue-count">
                  {{ item.pending_count }}
                  <small>/ {{ item.submission_count }}</small>
                </span>
                <span class="queue-time">{{ formatRelative(item.latest_submitted_at) }}</span>

                <div class="sf-row__action" @click.stop>
                  <n-button text @click="goToTask(item.task_id)">
                    {{ item.pending_count > 0 ? '批改' : '查看' }}
                  </n-button>
                </div>
              </article>
            </div>
          </template>
        </section>

        <aside class="queue-rail">
          <section class="sf-panel">
            <header class="sf-panel__head">
              <h2 class="sf-panel__title">
                谁在等批改
                <span class="sf-panel__count">{{ studentSummaryItems.length }} 名学生</span>
              </h2>
            </header>

            <p v-if="!studentSummaryItems.length" class="sf-empty">
              还没有学生作品记录。
            </p>

            <div v-else class="sf-rows">
              <article
                v-for="item in studentSummaryItems"
                :key="item.student_id"
                class="sf-row student-row"
              >
                <div class="sf-row__main">
                  <p class="sf-row__title">
                    <span class="sf-row__title-text">{{ item.student_name }}</span>
                  </p>
                  <p class="sf-row__meta">
                    <span>{{ item.class_name }}</span>
                    <span>{{ item.student_no }}</span>
                    <span>作品 {{ item.submission_count }}</span>
                    <span v-if="item.average_score !== null">平均 {{ item.average_score }}</span>
                  </p>
                </div>
                <span class="sf-row__value">
                  {{ item.pending_count }}
                  <small>待评</small>
                </span>
              </article>
            </div>

            <footer v-if="studentSummaryItems.length" class="sf-panel__foot student-foot">
              <span class="student-foot__note">
                计分学生 {{ scoredStudentCount }} / {{ studentSummaryItems.length }}，人均
                {{ summaryAverage ?? '--' }}
              </span>
              <n-button
                :loading="isExportingStudentSummary"
                secondary
                size="small"
                @click="downloadStudentSummary"
              >
                导出汇总
              </n-button>
            </footer>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSelect, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet, apiGetBlob } from '@/api/http';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

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
const overview = ref<OverviewPayload | null>(null);
const activeTab = ref<'pending' | 'all'>('pending');
const selectedCourse = ref('');
const selectedLesson = ref('');
const isLoading = ref(true);
const isExportingStudentSummary = ref(false);
const errorMessage = ref('');

const overviewItems = computed(() => overview.value?.items || []);
const studentSummaryItems = computed(() =>
  [...(overview.value?.student_summary?.items || [])].sort((a, b) => {
    if (b.pending_count !== a.pending_count) {
      return b.pending_count - a.pending_count;
    }
    return b.submission_count - a.submission_count;
  }),
);

const pendingItems = computed(() => overviewItems.value.filter((item) => item.pending_count > 0));

const scoredStudentCount = computed(
  () => overview.value?.student_summary?.summary.scored_student_count ?? 0,
);
const summaryAverage = computed(() => overview.value?.student_summary?.summary.average_student_score ?? null);

/** 队列按“还剩多少份没批”排，其次是最近提交；最上面的一条就是页面主操作的去处 */
const queueItems = computed(() =>
  [...overviewItems.value].sort((a, b) => {
    if (b.pending_count !== a.pending_count) {
      return b.pending_count - a.pending_count;
    }
    return String(b.latest_submitted_at || '').localeCompare(String(a.latest_submitted_at || ''));
  }),
);

const topQueueItem = computed(() => pendingItems.value.length ? queueItems.value[0] : null);

const latestSubmitted = computed(() => {
  const values = overviewItems.value
    .map((item) => item.latest_submitted_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return values.length ? values[values.length - 1] : null;
});

const pageSummary = computed(() => {
  const summary = overview.value?.summary;
  if (!summary) {
    return '汇总所有已有学生提交的活动，优先处理未评阅的作品。';
  }
  if (!summary.submission_count) {
    return '还没有学生提交作品，提交后会进入待批队列。';
  }
  const pending = summary.pending_count;
  if (!pending) {
    return `${summary.submission_count} 份作品已全部批改完成，最近提交 ${formatRelative(latestSubmitted.value)}`;
  }
  return `${pending} 份作品待评阅，分布在 ${pendingItems.value.length} 个活动 · 最近提交 ${formatRelative(latestSubmitted.value)}`;
});

const statItems = computed<StaffStatItem[]>(() => {
  const summary = overview.value?.summary;
  return [
    {
      label: '待评阅',
      value: summary?.pending_count ?? 0,
      unit: '份',
      note: `分布在 ${pendingItems.value.length} 个活动`,
    },
    {
      label: '已评阅',
      value: summary?.reviewed_count ?? 0,
      unit: ` / ${summary?.submission_count ?? 0}`,
      note: '已录入分数或评语的作品',
    },
    {
      label: '学生',
      value: overview.value?.student_summary?.summary.student_count ?? 0,
      unit: '人',
      note: '有作品记录的学生',
    },
    {
      label: '平均分',
      value: summary?.average_score ?? '--',
      note: '仅统计已打分作品',
    },
  ];
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

const hasFilters = computed(() => Boolean(selectedCourse.value || selectedLesson.value));

const filteredItems = computed(() => {
  return queueItems.value.filter((item) => {
    if (activeTab.value === 'pending' && item.pending_count <= 0) {
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

/** 时间用“几天前/几小时前”说，比 2026-10-28 20:25 更快看出积压多久 */
function formatRelative(value: string | null) {
  if (!value) {
    return '暂无提交';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value.replace('T', ' ').slice(0, 16);
  }
  const diffMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} 天前`;
  }
  return value.replace('T', ' ').slice(0, 10);
}

function buildLessonFilterValue(item: Pick<OverviewItem, 'unit_title' | 'lesson_title'>) {
  return `${item.unit_title} / ${item.lesson_title}`;
}

function resetFilters() {
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
.filter-select {
  width: 200px;
}

.filter-select--wide {
  width: 260px;
}

.queue-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--sf-section-gap);
  align-items: start;
}

.queue-rail {
  display: grid;
  gap: var(--sf-section-gap);
  align-content: start;
  min-width: 0;
}

.queue-cols {
  grid-template-columns: minmax(0, 1fr) 92px 108px 64px;
}

.queue-cols > span:nth-child(2),
.queue-cols > span:nth-child(3) {
  text-align: right;
}

.queue-count {
  color: var(--sf-ink);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.queue-count small {
  color: var(--sf-muted);
  font-size: 12px;
}

.queue-time {
  color: var(--sf-muted);
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
}

.student-row {
  align-items: flex-start;
}

.student-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.student-foot__note {
  color: var(--sf-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1180px) {
  .queue-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 860px) {
  .queue-cols {
    grid-template-columns: minmax(0, 1fr);
  }

  .sf-row.queue-cols .sf-row__main {
    flex: 1 1 100%;
  }

  .queue-count {
    text-align: left;
    font-size: 13px;
  }

  .queue-time {
    text-align: left;
  }

  .filter-select,
  .filter-select--wide {
    width: 100%;
  }
}
</style>
