<template>
  <div class="page-stack student-home-page">
    <section class="hero-panel student-home-hero">
      <div>
        <p class="eyebrow">学生首页</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这里把学习概览、学案进度、图表趋势、座位表和评阅得分整合到一个入口里，方便你一登录就看到最该先处理的任务。
        </p>
      </div>
      <el-button :disabled="!firstPendingCourseId" type="primary" @click="goToFirstPendingCourse">
        <span class="student-home-hero__button">
          <AppIcon :icon="BookOpenText" :size="18" />
          打开推荐学案
        </span>
      </el-button>
    </section>

    <el-alert
      v-if="errorMessage"
      :closable="false"
      :title="errorMessage"
      type="error"
    />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="10" />
        </el-card>
      </template>

      <template #default>
        <template v-if="homeData">
          <section class="student-home-metrics">
            <article v-for="item in overviewCards" :key="item.label" class="metric-tile student-metric-card">
              <div class="student-metric-card__top">
                <span class="student-card-icon" :class="`student-card-icon--${item.tone}`">
                  <AppIcon :icon="item.icon" :size="20" />
                </span>
                <p class="metric-label">{{ item.label }}</p>
              </div>
              <p class="metric-value">{{ item.value }}</p>
            </article>
          </section>

          <section class="student-home-grid">
            <el-card class="soft-card student-list-card">
              <template #header>
                <div class="student-card-head">
                  <div class="student-card-head__main">
                    <span class="student-card-icon student-card-icon--primary">
                      <AppIcon :icon="ListTodo" :size="20" />
                    </span>
                    <div>
                      <strong>待完成学案</strong>
                      <p class="section-note">优先从这里继续当前还没完成的学习任务。</p>
                    </div>
                  </div>
                  <el-tag round>{{ pendingCount }} 份</el-tag>
                </div>
              </template>

              <el-empty v-if="!homeData.pending_courses.length" description="当前没有待完成的学案。" />
              <el-timeline v-else>
                <el-timeline-item
                  v-for="item in homeData.pending_courses"
                  :key="item.id"
                  :timestamp="formatDate(item.date)"
                >
                  <RouterLink :to="`/student/courses/${item.id}`">{{ item.title }}</RouterLink>
                </el-timeline-item>
              </el-timeline>
            </el-card>

            <el-card class="soft-card student-list-card">
              <template #header>
                <div class="student-card-head">
                  <div class="student-card-head__main">
                    <span class="student-card-icon student-card-icon--success">
                      <AppIcon :icon="Clock3" :size="20" />
                    </span>
                    <div>
                      <strong>已完成学案</strong>
                      <p class="section-note">回顾复盘时，可以从这里重新打开已完成内容。</p>
                    </div>
                  </div>
                  <el-tag round type="success">{{ completedCount }} 份</el-tag>
                </div>
              </template>

              <el-empty v-if="!homeData.completed_courses.length" description="暂时还没有已完成的学案。" />
              <el-timeline v-else>
                <el-timeline-item
                  v-for="item in homeData.completed_courses"
                  :key="item.id"
                  :timestamp="formatDate(item.date)"
                >
                  <RouterLink :to="`/student/courses/${item.id}`">{{ item.title }}</RouterLink>
                </el-timeline-item>
              </el-timeline>
            </el-card>
          </section>

          <section class="student-home-grid">
            <el-card class="soft-card student-chart-card">
              <template #header>
                <div class="student-card-head">
                  <div class="student-card-head__main">
                    <span class="student-card-icon student-card-icon--success">
                      <AppIcon :icon="TrendingUp" :size="20" />
                    </span>
                    <div>
                      <strong>近期学习节奏</strong>
                      <p class="section-note">按日期观察待完成与已完成学案的变化趋势。</p>
                    </div>
                  </div>
                </div>
              </template>

              <el-empty
                v-if="!courseTimelineData.length"
                description="暂时没有带日期的学习记录，无法生成趋势图。"
              />
              <AppChart v-else :height="280" :option="courseTimelineChartOption" />
            </el-card>

            <el-card class="soft-card student-chart-card">
              <template #header>
                <div class="student-card-head">
                  <div class="student-card-head__main">
                    <span class="student-card-icon student-card-icon--accent">
                      <AppIcon :icon="GraduationCap" :size="20" />
                    </span>
                    <div>
                      <strong>学案完成概览</strong>
                      <p class="section-note">用图表快速查看待完成与已完成学案的比例。</p>
                    </div>
                  </div>
                  <el-tag round type="success">{{ completionRate }}%</el-tag>
                </div>
              </template>

              <el-empty v-if="!totalCourseCount" description="暂时还没有可展示的学案进度数据。" />
              <AppChart v-else :height="280" :option="courseStatusChartOption" />
            </el-card>
          </section>

          <section class="student-home-grid">
            <el-card class="soft-card student-profile-card">
              <template #header>
                <div class="student-card-head">
                  <div class="student-card-head__main">
                    <span class="student-card-icon student-card-icon--primary">
                      <AppIcon :icon="UserCircle2" :size="20" />
                    </span>
                    <div>
                      <strong>学生档案</strong>
                      <p class="section-note">当前登录学生的基础信息、座位定位和学案评阅摘要。</p>
                    </div>
                  </div>
                  <el-tag round>{{ homeData.profile.class_name }}</el-tag>
                </div>
              </template>

              <div class="student-profile-grid">
                <article class="student-profile-item">
                  <span class="student-profile-item__label">姓名</span>
                  <strong>{{ homeData.profile.name }}</strong>
                </article>
                <article class="student-profile-item">
                  <span class="student-profile-item__label">学号</span>
                  <strong>{{ homeData.profile.student_no }}</strong>
                </article>
                <article class="student-profile-item">
                  <span class="student-profile-item__label">班级</span>
                  <strong>{{ homeData.profile.class_name }}</strong>
                </article>
                <article class="student-profile-item">
                  <span class="student-profile-item__label">年级</span>
                  <strong>{{ homeData.profile.grade_no }} 年级</strong>
                </article>
                <article class="student-profile-item">
                  <span class="student-profile-item__label">当前机房</span>
                  <strong>{{ currentRoomLabel }}</strong>
                </article>
                <article class="student-profile-item">
                  <span class="student-profile-item__label">当前座位</span>
                  <strong>{{ currentSeatLabel }}</strong>
                </article>
              </div>

              <div class="student-profile-panels">
                <section class="student-profile-section">
                  <div class="student-profile-section__head">
                    <div>
                      <strong>学案得分信息</strong>
                      <p class="section-note">老师评阅后，这里会同步汇总最近的得分和评语。</p>
                    </div>
                    <el-tag round type="success">{{ scoredPlanCount }} 份</el-tag>
                  </div>

                  <div class="student-score-summary">
                    <article v-for="item in scoreCards" :key="item.label" class="student-score-stat">
                      <span class="student-score-stat__label">{{ item.label }}</span>
                      <strong>{{ item.value }}</strong>
                      <p>{{ item.note }}</p>
                    </article>
                  </div>

                  <div v-if="recentScoredPlans.length" class="student-score-list">
                    <article v-for="item in recentScoredPlans" :key="item.plan_id" class="student-score-item">
                      <div class="student-score-item__main">
                        <RouterLink class="student-score-item__link" :to="`/student/courses/${item.plan_id}`">
                          {{ item.title }}
                        </RouterLink>
                        <p class="student-score-item__meta">
                          <span>{{ formatDateTime(item.scored_at) }}</span>
                          <span>已评 {{ item.reviewed_task_count }} 项</span>
                          <span v-if="item.teacher_comment">{{ item.teacher_comment }}</span>
                        </p>
                      </div>
                      <el-tag round :type="item.is_recommended ? 'warning' : 'success'">
                        {{ formatScore(item.score) }}
                      </el-tag>
                    </article>
                  </div>

                  <el-empty v-else description="老师评阅后，这里会显示学案得分。" />
                </section>
              </div>
            </el-card>

            <el-card class="soft-card student-list-card">
              <template #header>
                <div class="student-card-head">
                  <div class="student-card-head__main">
                    <span class="student-card-icon student-card-icon--warning">
                      <AppIcon :icon="BadgeCheck" :size="20" />
                    </span>
                    <div>
                      <strong>今日签到动态</strong>
                      <p class="section-note">同步展示今天班级内的签到更新。</p>
                    </div>
                  </div>
                  <el-tag round>{{ attendanceCount }} 条</el-tag>
                </div>
              </template>

              <el-empty v-if="!homeData.attendance_today.length" description="今天还没有新的签到记录。" />
              <div v-else class="student-attendance-list">
                <article
                  v-for="item in homeData.attendance_today"
                  :key="`${item.name}-${item.checked_in_at}`"
                  class="student-attendance-item"
                >
                  <div class="student-attendance-item__name">
                    <AppIcon :icon="Sparkles" :size="16" />
                    <span>{{ item.name }}</span>
                  </div>
                  <span class="student-attendance-item__time">{{ item.checked_in_at }}</span>
                </article>
              </div>
            </el-card>
          </section>
        </template>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import {
  BadgeCheck,
  BookOpenText,
  Clock3,
  GraduationCap,
  ListTodo,
  Sparkles,
  TrendingUp,
  UserCircle2,
} from 'lucide-vue-next';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { readThemeToken } from '@/utils/themeTokens';

type HomeCourseItem = {
  id: number;
  title: string;
  date: string;
};

type SeatOverviewCell = {
  seat_key: string;
  seat_id: number | null;
  seat_label: string;
  row_no: number;
  col_no: number;
  is_virtual: boolean;
  is_enabled: boolean;
  is_current: boolean;
};

type HomePayload = {
  pending_courses: HomeCourseItem[];
  completed_courses: HomeCourseItem[];
  attendance_today: Array<{ name: string; checked_in_at: string }>;
  profile: {
    student_no: string;
    name: string;
    class_name: string;
    grade_no: number;
    seat_label: string | null;
    room_name: string | null;
  };
  seat_overview: {
    room: {
      id: number;
      name: string;
      row_count: number;
      col_count: number;
    } | null;
    current_seat_id: number | null;
    seats: SeatOverviewCell[];
  };
  score_summary: {
    scored_plan_count: number;
    reviewed_task_count: number;
    average_score: number | null;
    best_score: number | null;
    latest_scored_at: string | null;
  };
  scored_plans: Array<{
    plan_id: number;
    title: string;
    score: number;
    reviewed_task_count: number;
    scored_at: string | null;
    teacher_comment: string | null;
    is_recommended: boolean;
  }>;
};

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const homeData = ref<HomePayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  return value.split('T')[0].split('-').join('.');
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '--';
  }
  return Number.isInteger(value) ? `${value} 分` : `${value.toFixed(1)} 分`;
}

const pageTitle = computed(() =>
  homeData.value ? `${homeData.value.profile.name} 的学习中心` : '学生学习中心'
);
const firstPendingCourseId = computed(() => homeData.value?.pending_courses[0]?.id || null);
const pendingCount = computed(() => homeData.value?.pending_courses.length || 0);
const completedCount = computed(() => homeData.value?.completed_courses.length || 0);
const attendanceCount = computed(() => homeData.value?.attendance_today.length || 0);
const scoredPlanCount = computed(() => homeData.value?.score_summary.scored_plan_count || 0);
const reviewedTaskCount = computed(() => homeData.value?.score_summary.reviewed_task_count || 0);
const totalCourseCount = computed(() => pendingCount.value + completedCount.value);
const completionRate = computed(() =>
  totalCourseCount.value ? Math.round((completedCount.value / totalCourseCount.value) * 100) : 0
);
const currentSeatLabel = computed(() => homeData.value?.profile.seat_label || '未识别座位');
const currentRoomLabel = computed(() => homeData.value?.profile.room_name || '当前还没有机房定位记录');
const latestScoredAtLabel = computed(() => formatDate(homeData.value?.score_summary.latest_scored_at));
const recentScoredPlans = computed(() => homeData.value?.scored_plans.slice(0, 4) || []);

const overviewCards = computed(() => [
  {
    label: '待完成学案',
    value: pendingCount.value,
    icon: ListTodo,
    tone: 'primary',
  },
  {
    label: '已完成学案',
    value: completedCount.value,
    icon: Clock3,
    tone: 'accent',
  },
  {
    label: '已评分学案',
    value: scoredPlanCount.value,
    icon: BadgeCheck,
    tone: 'success',
  },
  {
    label: '完成率',
    value: `${completionRate.value}%`,
    icon: TrendingUp,
    tone: 'warning',
  },
]);

const scoreCards = computed(() => [
  {
    label: '已评分学案',
    value: `${scoredPlanCount.value} 份`,
    note: scoredPlanCount.value ? '最近有老师评阅结果同步回来' : '老师评阅后会在这里累计',
  },
  {
    label: '已评分任务',
    value: `${reviewedTaskCount.value} 项`,
    note: reviewedTaskCount.value ? '按每个任务的最新评阅结果统计' : '当前还没有已评分任务',
  },
  {
    label: '平均得分',
    value: formatScore(homeData.value?.score_summary.average_score),
    note: homeData.value?.score_summary.average_score !== null ? '跨学案平均分' : '暂时还没有平均分数据',
  },
  {
    label: '最高得分',
    value: formatScore(homeData.value?.score_summary.best_score),
    note: homeData.value?.score_summary.latest_scored_at ? `最近评阅 ${latestScoredAtLabel.value}` : '等待老师评阅',
  },
]);

const courseTimelineData = computed(() => {
  const bucket = new Map<string, { pending: number; completed: number }>();

  for (const item of homeData.value?.pending_courses || []) {
    const record = bucket.get(item.date) || { pending: 0, completed: 0 };
    record.pending += 1;
    bucket.set(item.date, record);
  }

  for (const item of homeData.value?.completed_courses || []) {
    const record = bucket.get(item.date) || { pending: 0, completed: 0 };
    record.completed += 1;
    bucket.set(item.date, record);
  }

  return Array.from(bucket.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-7)
    .map(([date, value]) => ({ date, ...value }));
});

const courseStatusChartOption = computed(() => {
  appStore.currentTheme;
  const textColor = readThemeToken('--ls-text', '#243a4d');
  const mutedColor = readThemeToken('--ls-muted', '#61758b');
  const primaryColor = readThemeToken('--ls-primary', '#ff8a1f');
  const accentColor = readThemeToken('--ls-accent', '#11c7b1');

  return {
    tooltip: {
      trigger: 'item',
    },
    legend: {
      bottom: 0,
      textStyle: {
        color: mutedColor,
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '44%'],
        itemStyle: {
          borderRadius: 14,
          borderColor: '#ffffff',
          borderWidth: 3,
        },
        label: {
          color: textColor,
          formatter: '{b}\n{c}',
          fontSize: 12,
        },
        data: [
          { value: pendingCount.value, name: '待完成', itemStyle: { color: primaryColor } },
          { value: completedCount.value, name: '已完成', itemStyle: { color: accentColor } },
        ],
      },
    ],
    graphic: totalCourseCount.value
      ? [
          {
            type: 'text',
            left: 'center',
            top: '36%',
            style: {
              text: `${completionRate.value}%`,
              fill: textColor,
              fontSize: 28,
              fontWeight: 700,
            },
          },
          {
            type: 'text',
            left: 'center',
            top: '49%',
            style: {
              text: '完成率',
              fill: mutedColor,
              fontSize: 12,
            },
          },
        ]
      : [],
    textStyle: {
      color: textColor,
      fontFamily: 'var(--ls-font)',
    },
  };
});

const courseTimelineChartOption = computed(() => {
  appStore.currentTheme;
  const textColor = readThemeToken('--ls-text', '#243a4d');
  const mutedColor = readThemeToken('--ls-muted', '#61758b');
  const borderColor = readThemeToken('--ls-border', 'rgba(36, 70, 87, 0.14)');
  const primaryColor = readThemeToken('--ls-primary', '#ff8a1f');
  const accentColor = readThemeToken('--ls-accent', '#11c7b1');

  return {
    color: [primaryColor, accentColor],
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: 0,
      textStyle: {
        color: mutedColor,
      },
    },
    grid: {
      left: 12,
      right: 12,
      top: 36,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: courseTimelineData.value.map((item) => formatDate(item.date)),
      axisLine: {
        lineStyle: {
          color: borderColor,
        },
      },
      axisLabel: {
        color: mutedColor,
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: borderColor,
        },
      },
      axisLabel: {
        color: mutedColor,
      },
    },
    series: [
      {
        name: '待完成',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        areaStyle: {
          opacity: 0.12,
        },
        data: courseTimelineData.value.map((item) => item.pending),
      },
      {
        name: '已完成',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        areaStyle: {
          opacity: 0.1,
        },
        data: courseTimelineData.value.map((item) => item.completed),
      },
    ],
    textStyle: {
      color: textColor,
      fontFamily: 'var(--ls-font)',
    },
  };
});

async function loadHome() {
  if (!authStore.token) {
    errorMessage.value = '请先使用学生账号登录后再查看学习首页。';
    isLoading.value = false;
    return;
  }

  try {
    homeData.value = await apiGet<HomePayload>('/lesson-plans/student/home', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '学生学习首页加载失败。';
  } finally {
    isLoading.value = false;
  }
}

async function goToFirstPendingCourse() {
  if (!firstPendingCourseId.value) {
    return;
  }
  await router.push(`/student/courses/${firstPendingCourseId.value}`);
}

onMounted(loadHome);
</script>

<style scoped>
.student-home-page {
  gap: 16px;
}

.student-home-hero {
  align-items: center;
  gap: 16px;
}

.student-home-hero__button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.student-home-metrics,
.student-home-grid,
.student-profile-grid,
.student-profile-panels,
.student-score-summary,
.student-score-list,
.student-attendance-list {
  display: grid;
  gap: 16px;
}

.student-home-metrics {
  grid-template-columns: repeat(auto-fit, minmax(152px, 1fr));
}

.student-home-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.student-profile-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.student-score-summary {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.student-metric-card {
  display: grid;
  gap: 8px;
  min-height: 96px;
  align-content: center;
}

.student-metric-card__top,
.student-card-head,
.student-card-head__main,
.student-attendance-item,
.student-attendance-item__name,
.student-profile-section__head,
.student-score-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.student-card-head,
.student-profile-section__head,
.student-score-item {
  justify-content: space-between;
}

.student-card-head,
.student-card-head__main,
.student-profile-section__head {
  align-items: flex-start;
}

.student-card-head strong,
.student-profile-item strong,
.student-score-stat strong,
.student-score-item__link {
  color: var(--ls-ink);
}

.student-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
}

.student-card-icon--accent {
  background: color-mix(in srgb, var(--ls-accent) 16%, white);
  color: var(--ls-accent);
}

.student-card-icon--success {
  background: rgba(40, 185, 126, 0.16);
  color: #1a9a68;
}

.student-card-icon--warning {
  background: rgba(255, 179, 71, 0.18);
  color: #c97805;
}

.student-profile-card,
.student-chart-card,
.student-list-card {
  min-height: 100%;
}

.student-profile-item,
.student-profile-section,
.student-score-stat,
.student-attendance-item,
.student-score-item {
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: var(--ls-panel-soft);
}

.student-profile-item {
  display: grid;
  gap: 6px;
  padding: 16px;
}

.student-profile-item__label,
.student-score-stat__label,
.student-attendance-item__time {
  color: var(--ls-muted);
  font-size: 13px;
}

.student-profile-section {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.student-score-stat {
  display: grid;
  gap: 6px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.78);
}

.student-score-stat p,
.student-score-item__meta {
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.6;
}

.student-score-item {
  gap: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.84);
}

.student-score-item__main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.student-score-item__link {
  font-weight: 700;
  text-decoration: none;
}

.student-score-item__link:hover {
  color: var(--ls-primary);
}

.student-score-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.student-attendance-item {
  justify-content: space-between;
  padding: 12px 14px;
}

.student-attendance-item__name {
  color: var(--ls-ink);
  font-weight: 700;
}

.section-note {
  margin: 4px 0 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

@media (max-width: 1200px) {
  .student-home-grid,
  .student-profile-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .student-home-grid,
  .student-profile-grid,
  .student-score-summary {
    grid-template-columns: 1fr;
  }

  .student-score-item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
