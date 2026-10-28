<template>
  <div class="page-stack">
    <SaPageHeader compact :description="headerDescription" title="教学总览" />

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <!-- 上课中：8+4 双栏，主栏只讲这一节课 -->
    <div v-if="isLivePhase && dashboard" class="ls-page">
      <div class="ls-main">
        <LiveSessionCard
          :book-name="currentLesson.book_name"
          :checkin="checkin"
          :class-code="selectedClassCode"
          :class-name="sessionClassName"
          :is-refreshing="polling.isRefreshing.value"
          :lesson-title="currentLesson.lesson_title"
          :phase="phase"
          :plan-title="currentLesson.plan_title"
          :room-label="roomInfo?.name ?? null"
          :session-id="activeSession?.session_id ?? null"
          :started-at="activeSession?.started_at ?? null"
          :submission="submissionInfo"
          :unit-title="currentLesson.unit_title"
          :updated-text="updatedText"
          @close-session="closeSession"
          @copy-code="copyClassCode"
          @open-classroom="openClassroom"
          @refresh="refreshNow"
          @regenerate-code="regenerateClassCode"
        />

        <CompactSeatMap
          :cells="seatCells"
          :class-label="sessionClassName"
          :cols="seatCols"
          :room-label="roomInfo?.name ?? null"
          :updated-text="seatFootText"
        />

        <p class="page-summary">{{ summaryLine }}</p>
      </div>

      <div class="ls-rail">
        <TodoPanel :overview="railOverview" @navigate="navigate" />
        <RecentSessionsCard :sessions="recentSessions" @navigate="navigate" />
      </div>
    </div>

    <!-- 未开课 / 上一节已结束：单列三段，页面只讲开课 -->
    <div v-else-if="dashboard" class="page-stack">
      <LaunchpadPanel
        :class-id="launchForm.class_id"
        :classes="dashboard.launchpad.classes"
        :launching="isLaunching"
        :phase="phase"
        :plan-id="launchForm.plan_id"
        :plans="dashboard.launchpad.ready_plans"
        @copy-code="copyClassCode"
        @launch="startClassroom"
        @regenerate-code="regenerateClassCode"
        @update:class-id="(value: number) => (launchForm.class_id = value)"
        @update:plan-id="(value: number) => (launchForm.plan_id = value)"
      />

      <TodoPanel :columns="3" :overview="railOverview" @navigate="navigate" />

      <RecentSessionsCard :sessions="recentSessions" @navigate="navigate" />

      <p class="page-summary">{{ summaryLine }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { NAlert, NSkeleton } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useVisibilityPolling } from '@/composables/useVisibilityPolling';
import { useAuthStore } from '@/stores/auth';
import CompactSeatMap from './components/CompactSeatMap.vue';
import LaunchpadPanel from './components/LaunchpadPanel.vue';
import LiveSessionCard from './components/LiveSessionCard.vue';
import RecentSessionsCard from './components/RecentSessionsCard.vue';
import TodoPanel from './components/TodoPanel.vue';
import type {
  ClassLivePayload,
  LaunchpadClass,
  LaunchpadPlan,
  LiveSession,
  LiveStudent,
  RoomBrief,
  SeatCell,
  SubmissionStage,
} from './components/dashboardTypes';

type Student = {
  user_id: number;
  student_no: string;
  display_name: string;
  signed_in_today: boolean;
  checked_in_at: string | null;
  focus_plan_submission_stage: SubmissionStage;
  focus_plan_task_count?: number;
};

type Seat = {
  seat_key: string;
  seat_id: number | null;
  seat_label: string;
  row_no: number;
  col_no: number;
  ip_address: string;
  hostname: string | null;
  is_enabled: boolean;
  is_virtual: boolean;
  signed_in_today: boolean;
  checked_in_at: string | null;
  student: Student | null;
};

type Roster = {
  class_id: number;
  class_name: string;
  grade_no: number;
  class_no: number;
  student_count: number;
  checked_in_count: number;
  pending_signin_count: number;
  room: RoomBrief;
  focus_plan: { id: number; title: string } | null;
  students: Student[];
  seats: Seat[];
  unassigned_students: Student[];
};

type SessionSummary = {
  session_id: number;
  status: string;
  started_at: string;
  class: { id: number; name: string; student_count: number };
  plan: { id: number; title: string; lesson_title: string; unit_title: string; book_name: string };
  task_count: number;
  submission_count: number;
  pending_review_count: number;
  reviewed_count: number;
  recommended_count: number;
  checked_in_count: number;
  pending_signin_count: number;
};

type RecentSession = {
  session_id: number;
  status: string;
  started_at: string;
  class: { name: string };
  plan: { title: string; lesson_title: string };
  submission_count: number;
  pending_review_count: number;
};

type DashboardPayload = {
  current_user: { display_name: string; title: string | null; roles: string[] };
  overview_metrics: {
    grade_count: number;
    class_count: number;
    student_count: number;
    plan_total: number;
    plan_taught_count: number;
    plan_untaught_count: number;
    active_student_today: number;
    checked_in_today: number;
    pending_signin_count: number;
  };
  stats: { class_count: number };
  today_overview: {
    checked_in_today: number;
    pending_signin_count: number;
    active_session_count: number;
    active_class_count: number;
    pending_review_count: number;
    recommended_count: number;
  };
  launchpad: {
    default_class_id: number | null;
    default_plan_id: number | null;
    classes: LaunchpadClass[];
    ready_plans: LaunchpadPlan[];
  };
  focus_class_id: number | null;
  class_rosters: Roster[];
  current_session: SessionSummary | null;
  recent_sessions: RecentSession[];
};

const router = useRouter();
const authStore = useAuthStore();

const dashboard = ref<DashboardPayload | null>(null);
const live = ref<ClassLivePayload | null>(null);
const errorMessage = ref('');
const isLoading = ref(true);
const isLaunching = ref(false);
const launchForm = ref<{ class_id: number | null; plan_id: number | null }>({
  class_id: null,
  plan_id: null,
});
const nowTick = ref(Date.now());
let clockTimer: number | undefined;

const selectedClassCode = computed(() => selectedClass.value?.class_code || '');

async function copyClassCode() {
  if (!selectedClassCode.value) return;
  try {
    await navigator.clipboard.writeText(selectedClassCode.value);
    ElMessage.success('班级码已复制');
  } catch {
    ElMessage.warning(`班级码：${selectedClassCode.value}`);
  }
}

async function regenerateClassCode() {
  const classId = focusClassId.value;
  if (!authStore.token || !classId) return;
  try {
    await ElMessageBox.confirm('换码后旧班级码立即失效，已投屏的码需要重新公布。', '更换班级码', {
      type: 'warning',
      confirmButtonText: '换一个',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    const payload = await apiPost<{ class_code: string }>(
      `/staff/classes/${classId}/class-code/regenerate`,
      {},
      authStore.token,
    );
    const target = dashboard.value?.launchpad.classes.find((item) => item.id === classId);
    if (target) target.class_code = payload.class_code;
    ElMessage.success(`新班级码：${payload.class_code}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更换班级码失败';
  }
}

const focusClassId = computed(
  () => launchForm.value.class_id ?? dashboard.value?.focus_class_id ?? dashboard.value?.launchpad.default_class_id ?? null,
);

const focusRoster = computed<Roster | null>(() => {
  const classId = focusClassId.value;
  if (!classId) return null;
  return dashboard.value?.class_rosters.find((item) => item.class_id === classId) ?? null;
});

const activeSession = computed<LiveSession | null>(() => {
  if (live.value?.session) return live.value.session;
  // 实时数据已拿到但 session 为空 ⇒ 这个班当前没有课堂，不能再回落到「别的班」的会话
  if (live.value) return null;
  const current = dashboard.value?.current_session;
  if (!current) return null;
  if (focusClassId.value && current.class.id !== focusClassId.value) return null;
  return {
    session_id: current.session_id,
    status: current.status,
    started_at: current.started_at,
    class_id: current.class.id,
    class_name: current.class.name,
    plan_id: current.plan.id,
    plan_title: current.plan.title,
    task_count: current.task_count,
    unit_title: current.plan.unit_title,
    lesson_title: current.plan.lesson_title,
    book_name: current.plan.book_name,
  };
});

const phase = computed<'live' | 'last' | 'idle'>(() => {
  if (activeSession.value?.status === 'active') return 'live';
  if (activeSession.value) return 'last';
  return 'idle';
});

const isLivePhase = computed(() => phase.value === 'live');

const recentSessions = computed(() => dashboard.value?.recent_sessions.slice(0, 4) ?? []);

const selectedPlan = computed<LaunchpadPlan | null>(() => {
  const planId = launchForm.value.plan_id;
  if (!planId) return null;
  return dashboard.value?.launchpad.ready_plans.find((item) => item.id === planId) ?? null;
});

const selectedClass = computed<LaunchpadClass | null>(() => {
  const classId = focusClassId.value;
  if (!classId) return null;
  return dashboard.value?.launchpad.classes.find((item) => item.id === classId) ?? null;
});

/** 首屏「哪个班」：上课中跟随真实会话，否则跟随上方选择 */
const currentClass = computed(() => {
  if (phase.value === 'live' && activeSession.value) {
    return { class_name: activeSession.value.class_name };
  }
  return { class_name: focusRoster.value?.class_name || selectedClass.value?.class_name || '' };
});

/** 首屏「上哪节课」：上课中跟随真实会话，否则跟随学案选择 */
const currentLesson = computed(() => {
  if (phase.value === 'live' && activeSession.value) {
    return {
      lesson_title: activeSession.value.lesson_title || activeSession.value.plan_title || '',
      unit_title: activeSession.value.unit_title || '',
      book_name: activeSession.value.book_name || '',
      plan_title: activeSession.value.plan_title || '',
    };
  }
  const plan = selectedPlan.value;
  return {
    lesson_title: plan?.lesson_title || activeSession.value?.lesson_title || activeSession.value?.plan_title || '',
    unit_title: plan?.unit_title || '',
    book_name: plan?.book_name || '',
    plan_title: plan?.title || activeSession.value?.plan_title || '',
  };
});

const sessionClassName = computed(() => currentClass.value.class_name);

const liveStudentByUserId = computed(() => {
  const map = new Map<number, LiveStudent>();
  for (const student of live.value?.students || []) {
    map.set(student.user_id, student);
  }
  return map;
});

function stageOf(student: Student | null): SubmissionStage {
  if (!student) return 'none';
  const stage = student.focus_plan_submission_stage;
  return stage === 'completed' || stage === 'partial' ? stage : 'none';
}

function toLiveStudent(student: Student): LiveStudent {
  return {
    user_id: student.user_id,
    display_name: student.display_name,
    student_no: student.student_no,
    seat_label: null,
    signed_in_at: student.checked_in_at,
    submission_stage: stageOf(student),
  };
}

const checkin = computed(() => {
  if (live.value) {
    return {
      total: live.value.attendance.student_count,
      checkedIn: live.value.attendance.checked_in_count,
      pending: live.value.attendance.pending_students,
    };
  }
  const roster = focusRoster.value;
  if (!roster) return { total: 0, checkedIn: 0, pending: [] as LiveStudent[] };
  return {
    total: roster.student_count,
    checkedIn: roster.checked_in_count,
    pending: roster.unassigned_students.map(toLiveStudent),
  };
});

const submissionInfo = computed(() => {
  if (live.value) {
    const summary = live.value.submission;
    return {
      taskCount: summary.task_count,
      completed: summary.completed_student_count,
      partial: summary.partial_student_count,
      none: summary.none_student_count,
      pendingReview: summary.pending_review_count,
    };
  }
  const roster = focusRoster.value;
  const counts = { completed: 0, partial: 0, none: 0 };
  for (const student of roster?.students || []) {
    counts[stageOf(student)] += 1;
  }
  const session = dashboard.value?.current_session;
  // 只认「当前选中班级」的会话，避免把别的班的任务数算进来
  const scopedSession =
    session && (!focusClassId.value || session.class.id === focusClassId.value) ? session : null;
  return {
    taskCount: selectedPlan.value?.task_count ?? scopedSession?.task_count ?? 0,
    completed: counts.completed,
    partial: counts.partial,
    none: counts.none,
    pendingReview: scopedSession?.pending_review_count ?? 0,
  };
});

const seatsSource = computed<Seat[]>(() => {
  const liveSeats = live.value?.seats;
  if (liveSeats && liveSeats.length) return liveSeats as unknown as Seat[];
  return focusRoster.value?.seats || [];
});

const roomInfo = computed<RoomBrief>(() => live.value?.room ?? focusRoster.value?.room ?? null);

/** 页头一行说清「哪个班、上哪节课、在哪个机房」 */
const headerDescription = computed(() => {
  const identity = [sessionClassName.value, currentLesson.value.lesson_title, roomInfo.value?.name]
    .filter(Boolean)
    .join(' · ');
  if (phase.value === 'live') return `正在上：${identity}`;
  if (phase.value === 'last') return `上一节已结束：${identity}`;
  if (!identity) return '还没有任课班级或已发布的学案';
  return `准备上课：${identity}`;
});

/** 页面页脚一行：任课范围与今日规模，不重复主卡里已经给出的数字 */
const summaryLine = computed(() => {
  const metrics = dashboard.value?.overview_metrics;
  if (!metrics) return '';
  const parts = [
    `${metrics.class_count} 个班`,
    `${metrics.student_count} 名学生`,
    `学案 ${metrics.plan_total} 份（已学 ${metrics.plan_taught_count} 份）`,
  ];
  if (phase.value !== 'live') {
    parts.push(`今日活跃 ${metrics.active_student_today} 人`, `今日已到 ${metrics.checked_in_today} 人`);
  }
  return parts.join(' · ');
});

const seatCols = computed(() => roomInfo.value?.col_count || 1);

const seatCells = computed<SeatCell[]>(() =>
  seatsSource.value.map((seat) => {
    const realtime = seat.student ? liveStudentByUserId.value.get(seat.student.user_id) : undefined;
    return {
      key: seat.seat_key,
      label: seat.seat_label,
      row: seat.row_no,
      col: seat.col_no,
      virtual: seat.is_virtual,
      signedIn: realtime ? Boolean(realtime.signed_in_at) : seat.signed_in_today,
      stage: realtime ? realtime.submission_stage : stageOf(seat.student),
      displayName: seat.student?.display_name ?? null,
      studentNo: seat.student?.student_no ?? null,
      ip: seat.ip_address ?? null,
    };
  }),
);

const railOverview = computed(() => {
  const overview = dashboard.value?.today_overview;
  return {
    checkedInToday: overview?.checked_in_today ?? 0,
    pendingSignin: overview?.pending_signin_count ?? 0,
    pendingReview: overview?.pending_review_count ?? 0,
    recommended: overview?.recommended_count ?? 0,
  };
});

const pollingEnabled = computed(() => phase.value === 'live' && Boolean(focusClassId.value));

const polling = useVisibilityPolling({
  enabled: pollingEnabled,
  intervalMs: 10_000,
  immediate: false,
  fetcher: async (signal) => {
    await fetchLive(signal);
  },
});

const updatedText = computed(() => {
  if (polling.isPaused.value) return phase.value === 'live' ? '已暂停刷新' : '手动刷新';
  const at = polling.lastUpdatedAt.value;
  if (!at) return '尚未更新';
  const seconds = Math.max(0, Math.round((nowTick.value - at) / 1000));
  return seconds <= 2 ? '刚刚更新' : `更新于 ${seconds} 秒前`;
});

/** 座位图脚下只留刷新时间，机房与行列已经写在摘要行里 */
const seatFootText = computed(() => updatedText.value);

async function fetchLive(signal?: AbortSignal) {
  const classId = focusClassId.value;
  if (!authStore.token || !classId) return;
  try {
    const payload = await apiGet<ClassLivePayload>(
      `/staff/classroom/live?class_id=${classId}`,
      authStore.token,
      signal,
    );
    if (payload.class.id !== focusClassId.value) return;
    live.value = payload;
  } catch (error) {
    if (signal?.aborted) return;
    // 轮询失败不清空已有数据，只在首次加载时提示
    if (!live.value) {
      errorMessage.value = error instanceof Error ? error.message : '刷新课堂状态失败';
    }
  }
}

function applyDefaults(payload: DashboardPayload) {
  launchForm.value.class_id =
    launchForm.value.class_id ??
    payload.focus_class_id ??
    payload.launchpad.default_class_id ??
    payload.launchpad.classes[0]?.id ??
    null;
  launchForm.value.plan_id =
    launchForm.value.plan_id ??
    payload.launchpad.default_plan_id ??
    payload.launchpad.ready_plans[0]?.id ??
    null;
}

async function loadDashboard() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiGet<DashboardPayload>('/staff/dashboard', authStore.token);
    dashboard.value = payload;
    applyDefaults(payload);
    await fetchLive();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载教师工作台失败';
  } finally {
    isLoading.value = false;
  }
}

async function refreshNow() {
  await fetchLive();
  await polling.refreshNow();
}

async function startClassroom() {
  if (!authStore.token || !launchForm.value.class_id || !launchForm.value.plan_id) return;
  isLaunching.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPost<{ session: { session_id: number }; progress_created_count: number }>(
      '/classroom/sessions',
      { class_id: launchForm.value.class_id, plan_id: launchForm.value.plan_id },
      authStore.token,
    );
    ElMessage.success(`课堂已开启，已同步到 ${payload.progress_created_count} 位学生`);
    await router.push(`/staff/classroom/${payload.session.session_id}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '开始上课失败';
  } finally {
    isLaunching.value = false;
  }
}

async function closeSession(sessionId: number) {
  if (!authStore.token) return;
  try {
    await ElMessageBox.confirm('结束本次课堂后，学生端会回到学习中心，签到记录保留。', '结束课堂', {
      type: 'warning',
      confirmButtonText: '结束课堂',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await apiPost(`/classroom/sessions/${sessionId}/close`, {}, authStore.token);
    ElMessage.success('课堂已结束');
    await loadDashboard();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '结束课堂失败';
  }
}

function openClassroom(sessionId: number) {
  void router.push(`/staff/classroom/${sessionId}`);
}

function navigate(path: string) {
  void router.push(path);
}

watch(
  () => phase.value,
  (value) => {
    if (value === 'live') void polling.refreshNow();
  },
);

watch(
  () => focusClassId.value,
  () => {
    live.value = null;
    void fetchLive();
  },
);

onMounted(() => {
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 5000);
  void loadDashboard();
});

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer);
});
</script>

<style scoped>
.page-summary {
  margin: 0;
  padding: 2px 2px 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 760px) {
  .page-summary {
    padding: 0 2px 4px;
  }
}
</style>
