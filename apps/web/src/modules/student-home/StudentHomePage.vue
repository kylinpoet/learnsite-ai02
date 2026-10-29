<template>
  <div class="sw-home">
    <StudentPageHead
      title="今天"
      :sub="headerSub"
    />

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="6" animated />
      </div>
    </div>

    <template v-else-if="homeData">
      <section v-if="firstPendingCourse" class="sw-now">
        <div>
          <p class="sw-now__label"><span class="sw-now__dot" />下一步</p>
          <h2 class="sw-now__title">{{ firstPendingCourse.title }}</h2>
          <p class="sw-now__meta">
            <span>学案发布于 {{ formatDate(firstPendingCourse.date) }}</span>
            <span v-if="pendingCount > 1">还有 {{ pendingCount - 1 }} 份排在后面</span>
          </p>
          <ol class="sw-path sw-now__path">
            <li class="sw-path__step is-now"><span class="sw-path__mark">1</span>学案</li>
            <li class="sw-path__step"><span class="sw-path__mark">2</span>活动</li>
            <li class="sw-path__step"><span class="sw-path__mark">3</span>提交</li>
            <li class="sw-path__step"><span class="sw-path__mark">4</span>评阅</li>
          </ol>
        </div>
        <div class="sw-now__actions">
          <n-button type="primary" size="large" @click="goToFirstPendingCourse">开始学习</n-button>
          <p class="sw-now__hint">打开后按活动顺序完成</p>
        </div>
      </section>

      <section v-else class="sw-panel">
        <div class="sw-panel__body sw-home__clear">
          <div>
            <h2 class="sw-home__clear-title">今天没有待完成的学案</h2>
            <p class="sw-home__clear-copy">老师推送新的学案后会出现在这里。现在可以回顾已完成的内容，或去资源库找材料。</p>
          </div>
          <n-button type="primary" @click="router.push('/student/resources')">浏览课程资源</n-button>
        </div>
      </section>

      <StudentStatStrip :items="statItems" />

      <div class="sw-grid-2">
        <StudentPanel title="待完成学案" :count="`${pendingCount} 份`" flush>
          <template v-if="pendingCourses.length">
            <RouterLink
              v-for="item in pendingCourses"
              :key="item.id"
              :to="`/student/courses/${item.id}`"
              class="sw-row sw-row--link"
            >
              <span class="sw-row__main">
                <span class="sw-row__title">{{ item.title }}</span>
                <span class="sw-row__meta">发布于 {{ formatDate(item.date) }}</span>
              </span>
              <span class="sw-chip sw-chip--now">待开始</span>
            </RouterLink>
          </template>
          <StudentEmpty v-else text="待完成学案已全部清空。" />
        </StudentPanel>

        <StudentPanel title="最近评阅" :count="scoredPlanCount ? `${scoredPlanCount} 份` : undefined" flush>
          <template v-if="recentScoredPlans.length">
            <article v-for="item in recentScoredPlans" :key="item.plan_id" class="sw-row">
              <span class="sw-row__main">
                <RouterLink class="sw-row__title sw-link" :to="`/student/courses/${item.plan_id}`">
                  {{ item.title }}
                </RouterLink>
                <span class="sw-row__meta">
                  <span>{{ formatDate(item.scored_at) }} 评阅</span>
                  <span v-if="item.is_recommended" class="sw-row__flag">教师推荐</span>
                </span>
              </span>
              <span class="sw-row__value">{{ formatScore(item.score) }}</span>
            </article>
          </template>
          <StudentEmpty v-else text="老师评阅过的学案会显示在这里。" />
        </StudentPanel>
      </div>

      <StudentPanel v-if="completedCourses.length" title="已完成学案" :count="`${completedCount} 份`" flush>
        <RouterLink
          v-for="item in completedCourses"
          :key="item.id"
          :to="`/student/courses/${item.id}`"
          class="sw-row sw-row--link"
        >
          <span class="sw-row__main">
            <span class="sw-row__title">{{ item.title }}</span>
            <span class="sw-row__meta">发布于 {{ formatDate(item.date) }}</span>
          </span>
          <span class="sw-chip sw-chip--done">已完成</span>
        </RouterLink>
      </StudentPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';

type HomeCourseItem = {
  id: number;
  title: string;
  date: string;
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
    seats: Array<Record<string, unknown>>;
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

const router = useRouter();
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

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '--';
  }
  return Number.isInteger(value) ? `${value} 分` : `${value.toFixed(1)} 分`;
}

const todayLabel = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date());

const pendingCourses = computed(() => homeData.value?.pending_courses || []);
const completedCourses = computed(() => homeData.value?.completed_courses || []);
const firstPendingCourse = computed(() => pendingCourses.value[0] || null);
const pendingCount = computed(() => pendingCourses.value.length);
const completedCount = computed(() => completedCourses.value.length);
const scoredPlanCount = computed(() => homeData.value?.score_summary.scored_plan_count || 0);
const recentScoredPlans = computed(() => homeData.value?.scored_plans.slice(0, 4) || []);

const headerSub = computed(() => {
  const parts = [todayLabel];
  const profile = homeData.value?.profile;
  if (profile) {
    parts.push(profile.class_name);
    parts.push(profile.room_name ? `${profile.room_name} · ${profile.seat_label || '未排座位'}` : '未定位机房');
  }
  return parts.join(' · ');
});

const statItems = computed<StudentStatItem[]>(() => {
  const summary = homeData.value?.score_summary;
  const average = summary?.average_score;
  return [
    { label: '待完成学案', value: pendingCount.value, unit: '份' },
    { label: '已完成学案', value: completedCount.value, unit: '份' },
    { label: '已评分学案', value: scoredPlanCount.value, unit: '份' },
    {
      label: '平均得分',
      value: average === null || average === undefined ? '--' : formatScore(average).replace(' 分', ''),
      unit: average === null || average === undefined ? undefined : '分',
      note: summary?.latest_scored_at ? `最近评阅 ${formatDate(summary.latest_scored_at)}` : '等待老师评阅',
    },
  ];
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
  if (!firstPendingCourse.value) {
    return;
  }
  await router.push(`/student/courses/${firstPendingCourse.value.id}`);
}

onMounted(loadHome);
</script>

<style scoped>
.sw-home {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-now__path {
  margin-top: 16px;
}

.sw-home__clear {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
}

.sw-home__clear-title {
  margin: 0;
  color: var(--sw-ink);
  font-size: 18px;
  font-weight: 600;
}

.sw-home__clear-copy {
  max-width: 56ch;
  margin: 6px 0 0;
  color: var(--sw-muted);
  font-size: 13px;
  line-height: 1.6;
}

.sw-row__flag {
  color: var(--sw-accent);
  font-weight: 500;
}

@media (max-width: 640px) {
  .sw-home__clear {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
