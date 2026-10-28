<template>
  <div class="page-stack realtime-page">
    <SaPageHeader
      compact
      :description="headerDescription"
      eyebrow="实时课堂"
    >
      <template #title>{{ pageTitle }}</template>
      <template #actions>
        <span v-if="classCode" class="header-code" title="学生登录时输入这个班级码">
          <span class="header-code__label">班级码</span>
          <span class="header-code__value">{{ classCode }}</span>
        </span>
        <n-tag v-if="session" round :type="session.status === 'active' ? 'success' : 'warning'">
          {{ session.status === 'active' ? '进行中' : '已结束' }}
        </n-tag>
        <n-button v-if="session" secondary size="small" @click="openPlanEditor">编辑学案</n-button>
        <n-button secondary size="small" @click="go('/staff/submissions')">提交批改</n-button>
        <n-button v-if="session" secondary size="small" @click="openAttendance">签到考勤</n-button>
        <n-button
          v-if="session && session.status === 'active'"
          :loading="isClosing"
          size="small"
          type="error"
          secondary
          @click="closeSession"
        >
          结束课堂
        </n-button>
        <n-button :loading="polling.isRefreshing.value" size="small" type="primary" @click="refreshNow">
          刷新
        </n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <SaPanel v-else-if="!sessionIdValid">
      <n-empty :description="emptyDescription">
        <template #extra>
          <n-button type="primary" @click="go('/staff')">
            {{ noLiveSession || errorMessage ? '去教学总览开课' : '回到教学总览' }}
          </n-button>
        </template>
      </n-empty>
    </SaPanel>

    <template v-else-if="session">
      <!-- 一眼看全：到了几个人、交到哪一步 -->
      <div class="realtime-band">
        <article class="realtime-card">
          <p class="realtime-card__label">今日签到</p>
          <div class="realtime-ring" :style="ringStyle">
            <div class="realtime-ring__inner">
              <span class="realtime-ring__num">{{ checkedInCount }}</span>
              <span class="realtime-ring__total">/ {{ studentCount }}</span>
            </div>
          </div>
          <p class="realtime-card__note">
            未到 {{ pendingStudents.length }} 人 · {{ updatedText }}
          </p>
          <div class="pending-chips">
            <span
              v-for="student in pendingStudents.slice(0, 10)"
              :key="student.user_id"
              class="pending-chip"
              :title="`${student.student_no}${student.seat_label ? ` · 座位 ${student.seat_label}` : ''}`"
            >
              {{ student.display_name }}
            </span>
            <span v-if="pendingStudents.length > 10" class="pending-chip pending-chip--more">
              +{{ pendingStudents.length - 10 }}
            </span>
            <span v-if="!pendingStudents.length" class="pending-empty">全部到齐</span>
          </div>
        </article>

        <article class="realtime-card">
          <p class="realtime-card__label">任务完成度</p>
          <p class="realtime-card__big">
            {{ completedCount }}<span class="realtime-card__suffix">/ {{ studentCount }} 人全部完成</span>
          </p>
          <div class="submission-bar">
            <span class="seg seg--completed" :style="{ flexGrow: Math.max(stageCounts.completed, 0.001) }" />
            <span class="seg seg--partial" :style="{ flexGrow: Math.max(stageCounts.partial, 0.001) }" />
            <span class="seg seg--none" :style="{ flexGrow: Math.max(stageCounts.none, 0.001) }" />
          </div>
          <p class="realtime-card__note">
            完成 {{ stageCounts.completed }} · 部分 {{ stageCounts.partial }} · 未开始 {{ stageCounts.none }}
          </p>
          <p class="realtime-card__note">待评阅 {{ pendingReviewCount }} 份</p>
        </article>

        <article class="realtime-card">
          <p class="realtime-card__label">这节课</p>
          <p class="realtime-card__lesson">{{ session.plan.lesson_title }}</p>
          <p class="realtime-card__note">
            {{ session.plan.unit_title }} · 开课 {{ formatDateTime(session.started_at) }}
          </p>
          <p class="realtime-card__note">共 {{ session.task_count }} 个任务</p>
          <div class="realtime-links">
            <button class="link-button" type="button" @click="openPlanEditor">学案详情</button>
            <button class="link-button" type="button" @click="openAttendance">本班考勤</button>
          </div>
        </article>
      </div>

      <CompactSeatMap
        :cells="seatCells"
        :class-label="session.class.name"
        :cols="seatCols"
        :room-label="roomInfo?.name ?? null"
        :updated-text="seatFootText"
      />

      <SaPanel title="任务进度">
        <template #actions>
          <span class="section-note">阅读任务看已读确认，提交任务看已交/已评</span>
        </template>
        <n-empty v-if="!session.tasks.length" description="当前学案还没有任务" />
        <div v-else class="task-list">
          <article v-for="task in session.tasks" :key="task.id" class="task-item">
            <div class="task-item__head">
              <p class="task-item__title">{{ task.sort_order }}. {{ task.title }}</p>
              <div class="task-item__tags">
                <n-tag round size="small">{{ taskTypeLabel(task.task_type) }}</n-tag>
                <n-tag round size="small" type="info">
                  {{ task.submission_scope === 'group' ? '小组' : '个人' }} · {{ taskSlotLabel(task.progress) }}
                </n-tag>
              </div>
            </div>

            <div v-if="task.progress.mode === 'reading'" class="task-bars">
              <div class="task-bar">
                <span class="task-bar__label">已读 {{ task.progress.completed_count }}/{{ task.progress.slot_total }}</span>
                <n-progress
                  :height="8"
                  :percentage="progressPercent(task.progress.completed_count, task.progress.slot_total)"
                  :show-indicator="false"
                  status="success"
                />
              </div>
              <div class="task-bar">
                <span class="task-bar__label">未读 {{ task.progress.pending_count }}/{{ task.progress.slot_total }}</span>
                <n-progress
                  :height="8"
                  :percentage="progressPercent(task.progress.pending_count, task.progress.slot_total)"
                  :show-indicator="false"
                  status="error"
                />
              </div>
            </div>

            <div v-else class="task-bars">
              <div class="task-bar">
                <span class="task-bar__label">已交 {{ task.progress.completed_count }}/{{ task.progress.slot_total }}</span>
                <n-progress
                  :height="8"
                  :percentage="progressPercent(task.progress.completed_count, task.progress.slot_total)"
                  :show-indicator="false"
                  status="success"
                />
              </div>
              <div class="task-bar">
                <span class="task-bar__label">待评 {{ task.progress.submitted_count }}/{{ task.progress.slot_total }}</span>
                <n-progress
                  :height="8"
                  :percentage="progressPercent(task.progress.submitted_count, task.progress.slot_total)"
                  :show-indicator="false"
                  status="warning"
                />
              </div>
              <div class="task-bar">
                <span class="task-bar__label">未交 {{ task.progress.pending_count }}/{{ task.progress.slot_total }}</span>
                <n-progress
                  :height="8"
                  :percentage="progressPercent(task.progress.pending_count, task.progress.slot_total)"
                  :show-indicator="false"
                  status="error"
                />
              </div>
            </div>

            <div v-if="task.progress.mode !== 'reading'" class="task-item__actions">
              <n-button size="tiny" secondary type="warning" @click="openTaskReview(task.id, 'pending_submit')">
                看未交
              </n-button>
              <n-button size="tiny" secondary type="success" @click="openTaskReview(task.id, 'pending_review')">
                看待评
              </n-button>
              <n-button size="tiny" secondary type="primary" @click="openTaskReview(task.id)">
                查看提交
              </n-button>
            </div>
          </article>
        </div>
      </SaPanel>

      <!-- 课堂操作默认收起：投影时页面保持只读观感，需要时再展开 -->
      <SaPanel>
        <template #header>
          <button class="section-toggle" type="button" @click="showOperations = !showOperations">
            {{ showOperations ? '收起课堂操作' : '展开课堂操作（开关 / 点名 / 下线）' }}
          </button>
        </template>
        <div v-if="showOperations" class="operations-grid">
          <article class="operation-card">
            <p class="operation-card__title">课堂开关</p>
            <p class="section-note">按课堂实时切换协作能力，调整后立即生效。</p>
            <label v-for="item in session.switch_config" :key="item.key" class="switch-item">
              <div class="switch-item__meta">
                <span class="switch-item__name">{{ item.label }}</span>
                <p class="section-note">{{ item.description }}</p>
              </div>
              <n-switch
                :disabled="session.status !== 'active'"
                :loading="switchUpdatingKey === item.key"
                :value="session.switches[item.key] ?? item.default_enabled"
                @update:value="(value: string | number | boolean) => onSwitchChange(item.key, Boolean(value))"
              />
            </label>
          </article>

          <article class="operation-card">
            <p class="operation-card__title">随机点名</p>
            <div class="operation-row">
              <n-switch v-model:value="rollCallPendingOnly" :disabled="session.status !== 'active'">
                <template #checked>优先未签到</template>
                <template #unchecked>全班随机</template>
              </n-switch>
              <n-button
                :disabled="session.status !== 'active'"
                :loading="isRollingCall"
                size="small"
                type="primary"
                @click="runRollCall"
              >
                点名
              </n-button>
            </div>
            <p v-if="lastRollCall" class="roll-call-result">
              {{ lastRollCall.student.display_name }}（{{ lastRollCall.student.student_no }}）
              <span class="section-note">
                · {{ lastRollCall.student.checked_in_today ? '今日已签到' : '今日未签到' }}
                {{ lastRollCall.dedupe_applied ? ' · 已去重' : '' }}
              </span>
            </p>

            <p class="operation-card__title operation-card__title--spaced">全班下线</p>
            <div class="operation-row">
              <n-input
                v-model:value="forceOfflineNote"
                :disabled="session.status !== 'active'"
                maxlength="200"
                placeholder="可选：记录下线原因"
                size="small"
              />
              <n-button
                :disabled="session.status !== 'active'"
                :loading="isForcingOffline"
                size="small"
                secondary
                type="error"
                @click="forceOfflineClass"
              >
                下线
              </n-button>
            </div>
          </article>
        </div>
      </SaPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { NAlert, NButton, NEmpty, NInput, NProgress, NSkeleton, NSwitch, NTag } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiPost, apiPut } from '@/api/http';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useVisibilityPolling } from '@/composables/useVisibilityPolling';
import { useAuthStore } from '@/stores/auth';
import CompactSeatMap from '@/modules/staff-dashboard/components/CompactSeatMap.vue';
import type {
  ClassLivePayload,
  LiveStudent,
  RoomBrief,
  SeatCell,
  SubmissionStage,
} from '@/modules/staff-dashboard/components/dashboardTypes';

type SessionSwitchMap = Record<string, boolean>;

type SessionSwitchConfigItem = {
  key: string;
  label: string;
  description: string;
  default_enabled: boolean;
};

type SessionTaskProgress = {
  mode: 'submission' | 'reading';
  slot_type: 'student' | 'group';
  slot_total: number;
  pending_count: number;
  completed_count: number;
  submitted_count: number;
  reviewed_count: number;
};

type SessionTask = {
  id: number;
  title: string;
  task_type: string;
  sort_order: number;
  is_required: boolean;
  submission_scope: string;
  progress: SessionTaskProgress;
};

type SessionDetail = {
  session_id: number;
  status: string;
  started_at: string;
  class: { id: number; name: string };
  plan: { id: number; title: string; lesson_title: string; unit_title: string };
  switches: SessionSwitchMap;
  attendance_ready: boolean;
  task_count: number;
  tasks: SessionTask[];
  switch_config: SessionSwitchConfigItem[];
  roll_call: { dedupe_window_minutes: number; recent_history: unknown[] };
};

type RollCallResult = {
  dedupe_applied: boolean;
  student: { display_name: string; student_no: string; checked_in_today: boolean };
};

type ForceOfflineResult = { target_student_count: number; checked_in_count: number };

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const session = ref<SessionDetail | null>(null);
const live = ref<ClassLivePayload | null>(null);
const isLoading = ref(true);
const isClosing = ref(false);
const isRollingCall = ref(false);
const isForcingOffline = ref(false);
const switchUpdatingKey = ref<string | null>(null);
const errorMessage = ref('');
const showOperations = ref(false);
const rollCallPendingOnly = ref(true);
const forceOfflineNote = ref('');
const lastRollCall = ref<RollCallResult | null>(null);
const lastLoadedAt = ref<number | null>(null);

const noLiveSession = ref(false);

const hasSessionParam = computed(() => {
  const raw = route.params.sessionId;
  return typeof raw === 'string' && raw.length > 0;
});

const sessionIdValid = computed(() => {
  if (!hasSessionParam.value) return false;
  const id = Number(route.params.sessionId);
  return Number.isFinite(id) && id > 0;
});

/** 从左侧栏进入 /staff/classroom 时没有会话号：自动落到当前（或最近一次）课堂 */
const emptyDescription = computed(() => {
  if (!hasSessionParam.value) {
    if (errorMessage.value) return '没能定位到当前课堂，请回教学总览重新进入。';
    return noLiveSession.value ? '当前没有进行中的课堂，先去教学总览选班开课。' : '正在查找当前课堂…';
  }
  return '这个地址没有对应的课堂会话。';
});

const pageTitle = computed(() => {
  if (!session.value) return '实时课堂';
  return `${session.value.class.name} · ${session.value.plan.lesson_title || session.value.plan.title}`;
});

const headerDescription = computed(() => {
  if (!session.value) return '这里显示当前课堂的签到、任务进度与座位状态。';
  const status = session.value.status === 'active' ? '正在上课' : '课堂已结束';
  return `${status} · ${session.value.plan.unit_title} · 开课 ${formatDateTime(session.value.started_at)}`;
});

const classCode = computed(() => live.value?.class.class_code || '');

const studentCount = computed(
  () => live.value?.attendance.student_count ?? session.value?.tasks[0]?.progress.slot_total ?? 0,
);

const checkedInCount = computed(() => live.value?.attendance.checked_in_count ?? 0);

const pendingStudents = computed<LiveStudent[]>(() => live.value?.attendance.pending_students || []);

const stageCounts = computed(() => {
  const students = live.value?.students || [];
  const counts: Record<SubmissionStage, number> = { none: 0, partial: 0, completed: 0 };
  for (const student of students) {
    counts[student.submission_stage] += 1;
  }
  return counts;
});

const completedCount = computed(() => stageCounts.value.completed);
const pendingReviewCount = computed(() => live.value?.submission.pending_review_count ?? 0);

const roomInfo = computed<RoomBrief>(() => live.value?.room ?? null);
const seatCols = computed(() => roomInfo.value?.col_count || 1);

const seatCells = computed<SeatCell[]>(() =>
  (live.value?.seats || []).map((seat) => ({
    key: seat.seat_key,
    label: seat.seat_label,
    row: seat.row_no,
    col: seat.col_no,
    virtual: seat.is_virtual,
    signedIn: seat.signed_in_today,
    stage: seat.student?.focus_plan_submission_stage ?? 'none',
    displayName: seat.student?.display_name ?? null,
    studentNo: seat.student?.student_no ?? null,
    ip: seat.ip_address ?? null,
  })),
);

const ringPercent = computed(() => {
  if (!studentCount.value) return 0;
  return Math.round((checkedInCount.value / studentCount.value) * 100);
});

const ringStyle = computed(() => ({
  background: `conic-gradient(var(--ls-primary) ${ringPercent.value}%, var(--ls-border) ${ringPercent.value}% 100%)`,
}));

const polling = useVisibilityPolling({
  enabled: computed(() => Boolean(authStore.token) && Boolean(session.value)),
  intervalMs: 10_000,
  immediate: false,
  fetcher: async (signal) => {
    await Promise.all([loadLive(signal), loadSessionDetail(signal)]);
  },
});

const updatedText = computed(() => {
  if (polling.isPaused.value) return '自动刷新已暂停';
  const at = polling.lastUpdatedAt.value ?? lastLoadedAt.value;
  if (!at) return '正在加载';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  return seconds <= 2 ? '刚刚更新' : `更新于 ${seconds} 秒前`;
});

const seatFootText = computed(() => {
  const room = roomInfo.value;
  if (!room) return updatedText.value;
  return `${room.name} · ${room.row_count} 行 × ${room.col_count} 列 · ${updatedText.value}`;
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return '暂无记录';
  return value.replace('T', ' ').slice(0, 16);
}

function taskTypeLabel(type: string) {
  const labels: Record<string, string> = {
    reading: '阅读',
    upload_file: '文件上传',
    upload_image: '图片上传',
    code_python: 'Python',
    programming: '编程',
    quiz: '测验',
    typing: '打字',
    peer_review: '互评',
    rich_text: '图文',
    web_page: '网页',
    discussion: '讨论',
    data_submit: '数据提交',
  };
  return labels[type] || type;
}

function taskSlotLabel(progress: SessionTaskProgress) {
  return progress.slot_type === 'group' ? `${progress.slot_total} 组` : `${progress.slot_total} 人`;
}

function progressPercent(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((count / total) * 100));
}

function go(path: string) {
  void router.push(path);
}

function openPlanEditor() {
  if (!session.value) return;
  void router.push(`/staff/lesson-plans/${session.value.plan.id}`);
}

function openAttendance() {
  if (!session.value) return;
  const today = new Date();
  const dateText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  void router.push({
    path: '/staff/attendance',
    query: { class_id: String(session.value.class.id), attendance_date: dateText },
  });
}

async function openTaskReview(taskId: number, focus: 'all' | 'pending_submit' | 'pending_review' = 'all') {
  await router.push({
    path: `/staff/submissions/${taskId}`,
    query: focus === 'all' ? {} : { focus },
  });
}

async function loadSessionDetail(signal?: AbortSignal) {
  const sessionId = Number(route.params.sessionId);
  if (!authStore.token || !Number.isFinite(sessionId) || sessionId <= 0) return;
  const payload = await apiGet<SessionDetail>(`/classroom/sessions/${sessionId}`, authStore.token, signal);
  if (payload.session_id !== Number(route.params.sessionId)) return;
  session.value = payload;
}

async function loadLive(signal?: AbortSignal) {
  const current = session.value;
  if (!authStore.token || !current) return;
  const payload = await apiGet<ClassLivePayload>(
    `/staff/classroom/live?class_id=${current.class.id}&session_id=${current.session_id}`,
    authStore.token,
    signal,
  );
  if (payload.class.id !== current.class.id) return;
  live.value = payload;
  lastLoadedAt.value = Date.now();
}

async function resolveCurrentSessionId(): Promise<number | null> {
  if (!authStore.token) return null;
  // 带 classId 进来（如 AI 助手的「进入课堂」）时，优先落到该班进行中的课堂
  const wantedClassId = Number(route.query.classId);
  if (Number.isFinite(wantedClassId) && wantedClassId > 0) {
    const launchpad = await apiGet<{
      active_sessions: Array<{ session_id: number; class: { id: number } }>;
    }>('/classroom/launchpad', authStore.token);
    const hit = launchpad.active_sessions.find((item) => item.class.id === wantedClassId);
    if (hit) return hit.session_id;
  }
  const payload = await apiGet<{ current_session: { session_id: number } | null }>(
    '/staff/dashboard',
    authStore.token,
  );
  return payload.current_session?.session_id ?? null;
}

async function loadPage() {
  isLoading.value = true;
  errorMessage.value = '';
  noLiveSession.value = false;
  session.value = null;
  live.value = null;
  try {
    if (!hasSessionParam.value) {
      const targetId = await resolveCurrentSessionId();
      if (targetId) {
        await router.replace(`/staff/classroom/${targetId}`);
        return;
      }
      noLiveSession.value = true;
      return;
    }
    if (!sessionIdValid.value) return;
    await loadSessionDetail();
    await loadLive();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课堂状态失败';
  } finally {
    isLoading.value = false;
  }
}

async function refreshNow() {
  errorMessage.value = '';
  try {
    await Promise.all([loadSessionDetail(), loadLive()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '刷新失败';
  }
}

async function closeSession() {
  if (!authStore.token || !session.value) return;
  try {
    await ElMessageBox.confirm('结束本次课堂后，学生端会回到学习中心，签到记录保留。', '结束课堂', {
      type: 'warning',
      confirmButtonText: '结束课堂',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  isClosing.value = true;
  try {
    await apiPost(`/classroom/sessions/${session.value.session_id}/close`, {}, authStore.token);
    ElMessage.success('课堂已结束');
    await loadSessionDetail();
    await loadLive();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '结束课堂失败';
  } finally {
    isClosing.value = false;
  }
}

async function onSwitchChange(key: string, value: boolean) {
  const current = session.value;
  if (!authStore.token || !current) return;
  if (current.status !== 'active') {
    ElMessage.warning('课堂已结束，不能再调整课堂开关');
    return;
  }
  switchUpdatingKey.value = key;
  try {
    session.value = await apiPut<SessionDetail>(
      `/classroom/sessions/${current.session_id}/switches`,
      { [key]: value },
      authStore.token,
    );
    ElMessage.success('课堂开关已更新');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新课堂开关失败';
  } finally {
    switchUpdatingKey.value = null;
  }
}

async function runRollCall() {
  const current = session.value;
  if (!authStore.token || !current) return;
  if (current.status !== 'active') {
    ElMessage.warning('课堂已结束，不能继续点名');
    return;
  }
  isRollingCall.value = true;
  try {
    const payload = await apiPost<RollCallResult>(
      `/classroom/sessions/${current.session_id}/roll-call`,
      { only_pending_signin: rollCallPendingOnly.value },
      authStore.token,
    );
    lastRollCall.value = payload;
    ElMessage.success(`点名结果：${payload.student.display_name}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '随机点名失败';
  } finally {
    isRollingCall.value = false;
  }
}

async function forceOfflineClass() {
  const current = session.value;
  if (!authStore.token || !current) return;
  if (current.status !== 'active') {
    ElMessage.warning('课堂已结束，无需全班下线');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将向 ${current.class.name} 下发“全班下线”指令，是否继续？`,
      '全班下线确认',
      { type: 'warning', confirmButtonText: '继续执行', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  isForcingOffline.value = true;
  try {
    const payload = await apiPost<ForceOfflineResult>(
      `/classroom/sessions/${current.session_id}/force-offline`,
      { note: forceOfflineNote.value.trim() || null },
      authStore.token,
    );
    ElMessage.success(
      `下线指令已发送：目标 ${payload.target_student_count} 人，今日签到 ${payload.checked_in_count} 人`,
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '全班下线失败';
  } finally {
    isForcingOffline.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    void loadPage();
  },
);

onMounted(() => {
  void loadPage();
});
</script>

<style scoped>
.header-code {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  border: 1px dashed var(--ls-primary);
  border-radius: 999px;
  background: var(--ls-primary-soft);
  padding: 2px 10px;
}

.header-code__label {
  color: var(--ls-muted);
  font-size: 10.5px;
  font-weight: 700;
}

.header-code__value {
  color: var(--ls-primary);
  font-family: var(--ls-display-font);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.realtime-band {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ls-gap-md, 12px);
}

.realtime-card {
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: var(--ls-card, var(--ls-surface));
  box-shadow: var(--ls-soft-shadow);
  padding: 16px;
  display: grid;
  gap: 8px;
  align-content: start;
}

.realtime-card__label {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.realtime-card__big {
  margin: 0;
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.realtime-card__suffix {
  margin-left: 6px;
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
}

.realtime-card__lesson {
  margin: 0;
  color: var(--ls-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.realtime-card__note {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
}

.realtime-ring {
  width: 108px;
  height: 108px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  transition: background 0.4s ease;
}

.realtime-ring__inner {
  width: 86px;
  height: 86px;
  border-radius: 999px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
  background: var(--ls-card, var(--ls-surface));
}

.realtime-ring__num {
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 28px;
  font-weight: 800;
}

.realtime-ring__total {
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 600;
}

.pending-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pending-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
  font-size: 11px;
  font-weight: 600;
}

.pending-chip--more {
  background: var(--ls-chip-bg);
  color: var(--ls-muted);
}

.pending-empty {
  color: var(--ls-accent, var(--ls-primary));
  font-size: 11.5px;
  font-weight: 600;
}

.submission-bar {
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--ls-border);
}

.seg {
  display: block;
  transition: flex-grow 0.4s ease;
}

.seg--completed {
  background: var(--ls-primary);
}

.seg--partial {
  background: var(--ls-accent, #d48a1f);
}

.seg--none {
  background: var(--ls-border);
}

.realtime-links {
  display: flex;
  gap: 12px;
}

.link-button {
  border: none;
  background: none;
  padding: 0;
  color: var(--ls-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.link-button:hover {
  text-decoration: underline;
}

.task-list {
  display: grid;
  gap: 10px;
}

.task-item {
  border: 1px solid var(--ls-border);
  border-radius: 14px;
  background: var(--ls-input-bg);
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}

.task-item__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.task-item__title {
  margin: 0;
  color: var(--ls-text);
  font-size: 14px;
  font-weight: 700;
}

.task-item__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.task-bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 16px;
}

.task-bar {
  display: grid;
  gap: 4px;
}

.task-bar__label {
  color: var(--ls-muted);
  font-size: 11px;
  font-weight: 600;
}

.task-item__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.section-toggle {
  border: none;
  background: none;
  padding: 0;
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.section-toggle:hover {
  color: var(--ls-primary);
}

.operations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--ls-gap-md, 12px);
}

.operation-card {
  display: grid;
  gap: 8px;
  align-content: start;
}

.operation-card__title {
  margin: 0;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 700;
}

.operation-card__title--spaced {
  margin-top: 8px;
}

.operation-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--ls-border);
  border-radius: 12px;
  padding: 8px 12px;
}

.switch-item__meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.switch-item__name {
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 700;
}

.roll-call-result {
  margin: 0;
  color: var(--ls-ink);
  font-size: 13px;
  font-weight: 700;
}

.section-note {
  color: var(--ls-muted);
  font-size: 11.5px;
  margin: 0;
}
</style>
