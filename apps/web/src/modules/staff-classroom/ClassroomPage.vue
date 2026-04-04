<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">课堂会话中心</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这里专注“课堂会话生命周期”：开课、查看当前会话、结束课堂。工作台负责全局态势，学案管理负责内容配置，课堂会话中心只做课堂过程控制。
        </p>
      </div>
      <el-space wrap>
        <el-button plain @click="router.push('/staff/dashboard')">返回工作台</el-button>
        <el-button plain @click="router.push('/staff/lesson-plans')">返回学案管理</el-button>
        <el-button type="primary" @click="loadPage">刷新</el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="8" />
        </el-card>
      </template>

      <template #default>
        <div v-if="launchpadData" class="page-stack">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">可开课学案</p>
              <p class="metric-value">{{ launchpadData.ready_plans.length }}</p>
              <p class="metric-note">已发布或正在上的学案</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">班级数</p>
              <p class="metric-value">{{ launchpadData.classes.length }}</p>
              <p class="metric-note">当前可选择的班级</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">活跃课堂</p>
              <p class="metric-value">{{ launchpadData.active_sessions.length }}</p>
              <p class="metric-note">已经开启过的课堂会话</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">学生总数</p>
              <p class="metric-value">{{ totalStudentCount }}</p>
              <p class="metric-note">来自当前可选班级汇总</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="10" :sm="24">
              <el-card class="soft-card">
                <template #header>开课设置</template>
                <div class="launch-toolbar">
                  <el-select
                    v-model="launchForm.class_id"
                    class="full-width"
                    filterable
                    placeholder="请选择班级"
                  >
                    <el-option
                      v-for="schoolClass in launchpadData.classes"
                      :key="schoolClass.id"
                      :label="`${schoolClass.class_name} · ${schoolClass.student_count} 人`"
                      :value="schoolClass.id"
                    />
                  </el-select>

                  <el-select
                    v-model="launchForm.plan_id"
                    class="full-width"
                    filterable
                    placeholder="请选择已发布学案"
                  >
                    <el-option
                      v-for="plan in launchpadData.ready_plans"
                      :key="plan.id"
                      :label="`${plan.title} · ${plan.lesson.unit_title}`"
                      :value="plan.id"
                    />
                  </el-select>

                  <el-button
                    :disabled="!launchForm.plan_id || !launchForm.class_id"
                    :loading="isLaunching"
                    type="primary"
                    @click="startClassroom"
                  >
                    开始上课
                  </el-button>
                </div>

                <div class="launch-preview">
                  <p>当前将执行：</p>
                  <p>{{ launchPreviewText }}</p>
                </div>
              </el-card>
            </el-col>

            <el-col :lg="14" :sm="24">
              <el-card v-if="currentSession" class="soft-card">
                <template #header>
                  <div class="info-row">
                    <span>当前查看的课堂</span>
                    <el-tag round type="warning">{{ currentSession.status }}</el-tag>
                  </div>
                </template>

                <div class="stack-list">
                  <div class="info-row">
                    <strong>{{ currentSession.plan.title }}</strong>
                    <el-tag round type="success">{{ currentSession.class.name }}</el-tag>
                  </div>
                  <p class="section-note">
                    {{ currentSession.plan.unit_title }} / {{ currentSession.plan.lesson_title }}
                  </p>
                  <el-space wrap>
                    <el-tag round>开课时间 {{ formatDateTime(currentSession.started_at) }}</el-tag>
                    <el-tag round type="success">任务数 {{ currentSession.task_count }}</el-tag>
                    <el-tag round type="info">签到就绪 {{ currentSession.attendance_ready ? '是' : '否' }}</el-tag>
                  </el-space>
                  <div class="session-actions">
                    <el-button type="primary" @click="router.push(`/staff/lesson-plans/${currentSession.plan.id}`)">
                      查看学案
                    </el-button>
                    <el-button plain @click="router.push('/staff/submissions')">去评审中心</el-button>
                    <el-button plain @click="openAttendanceForSession(currentSession)">看签到</el-button>
                    <el-button
                      v-if="currentSession.status === 'active'"
                      plain
                      type="danger"
                      :loading="closingSessionId === currentSession.session_id"
                      @click="closeSession(currentSession.session_id)"
                    >
                      结束课堂
                    </el-button>
                  </div>

                  <div class="session-focus-grid">
                    <article class="session-focus-card">
                      <div class="session-focus-head">
                        <div>
                          <h4>课堂开关</h4>
                          <p class="section-note">按课堂实时切换协作能力，调整后立即生效。</p>
                        </div>
                        <el-tag round type="info">会话级设置</el-tag>
                      </div>
                      <div class="switch-grid">
                        <label
                          v-for="item in sessionSwitchConfig"
                          :key="item.key"
                          class="switch-item"
                        >
                          <div class="switch-item__meta">
                            <span class="switch-item__title">{{ item.label }}</span>
                            <p class="switch-item__desc">{{ item.description }}</p>
                          </div>
                          <el-switch
                            :model-value="sessionSwitches[item.key] ?? item.default_enabled"
                            :disabled="currentSession.status !== 'active'"
                            :loading="switchUpdatingKey === item.key"
                            @change="onSessionSwitchChange(item.key, $event)"
                          />
                        </label>
                      </div>
                    </article>

                    <article class="session-focus-card">
                      <div class="session-focus-head">
                        <div>
                          <h4>教学操作</h4>
                          <p class="section-note">支持随机点名、去重防连点与全班下线，保持课堂节奏。</p>
                        </div>
                        <el-tag round type="warning" v-if="currentSession.status !== 'active'">课堂已结束</el-tag>
                      </div>
                      <div class="session-operation-row">
                        <el-switch
                          v-model="rollCallPendingOnly"
                          :disabled="currentSession.status !== 'active'"
                          active-text="优先未签到"
                          inactive-text="全班随机"
                        />
                        <el-button
                          :disabled="currentSession.status !== 'active'"
                          :loading="isRollingCall"
                          type="primary"
                          @click="runRollCall"
                        >
                          随机点名
                        </el-button>
                      </div>

                      <p v-if="rollCallDedupeWindow > 0" class="section-note">
                        去重策略：近 {{ rollCallDedupeWindow }} 分钟尽量不重复点到同一学生。
                      </p>

                      <div v-if="lastRollCall" class="roll-call-result">
                        <p class="roll-call-result__name">
                          {{ lastRollCall.student.display_name }}（{{ lastRollCall.student.student_no }}）
                        </p>
                        <p class="section-note">
                          {{
                            lastRollCall.student.checked_in_today
                              ? '今日已签到，可直接进入任务讲评。'
                              : '今日未签到，可优先关注课堂参与状态。'
                          }}
                        </p>
                        <el-tag :type="lastRollCall.dedupe_applied ? 'success' : 'info'" round>
                          {{ lastRollCall.dedupe_applied ? '已应用去重' : '本次未触发去重' }}
                        </el-tag>
                      </div>

                      <div class="roll-call-history" v-if="rollCallRecentHistory.length">
                        <p class="roll-call-history__title">最近点名记录</p>
                        <div class="roll-call-history__list">
                          <div
                            v-for="item in rollCallRecentHistory"
                            :key="`${item.student_user_id}-${item.occurred_at}`"
                            class="roll-call-history__item"
                          >
                            <span>{{ item.student_name || item.student_no }}（{{ item.student_no }}）</span>
                            <span class="section-note">{{ formatDateTime(item.occurred_at) }}</span>
                          </div>
                        </div>
                      </div>

                      <div class="session-operation-row session-operation-row-block">
                        <el-input
                          v-model="forceOfflineNote"
                          :disabled="currentSession.status !== 'active'"
                          maxlength="200"
                          placeholder="可选：记录本次下线原因"
                        />
                        <el-button
                          :disabled="currentSession.status !== 'active'"
                          :loading="isForcingOffline"
                          plain
                          type="danger"
                          @click="forceOfflineClass"
                        >
                          全班下线
                        </el-button>
                      </div>
                    </article>
                  </div>

                  <article class="session-focus-card">
                    <div class="session-focus-head">
                      <div>
                        <h4>课堂任务聚焦</h4>
                        <p class="section-note">任务卡内直接查看“未交/已交/已评”进度，减少跳页。</p>
                      </div>
                    </div>
                    <el-empty v-if="!currentSession.tasks.length" description="当前学案还没有任务" />
                    <div v-else class="task-focus-list">
                      <article v-for="task in currentSession.tasks" :key="task.id" class="task-focus-item">
                        <div class="task-focus-item__main">
                          <div class="task-focus-item__title-row">
                            <p class="task-focus-item__title">
                              {{ task.sort_order }}. {{ task.title }}
                            </p>
                            <span class="section-note">{{ taskSlotLabel(task.progress) }}</span>
                          </div>
                          <div class="chip-row">
                            <el-tag round>{{ taskTypeLabel(task.task_type) }}</el-tag>
                            <el-tag round type="info">
                              {{ task.submission_scope === 'group' ? '小组任务' : '个人任务' }}
                            </el-tag>
                            <el-tag v-if="task.is_required" round type="success">必做</el-tag>
                          </div>

                          <div class="task-progress-grid">
                            <div class="task-progress-stat task-progress-stat--pending">
                              <span>未交 {{ task.progress.pending_count }}/{{ task.progress.slot_total }}</span>
                              <span>{{ progressPercent(task.progress.pending_count, task.progress.slot_total) }}%</span>
                            </div>
                            <el-progress
                              :percentage="progressPercent(task.progress.pending_count, task.progress.slot_total)"
                              :stroke-width="8"
                              status="exception"
                              :show-text="false"
                            />
                            <div class="task-progress-stat">
                              <span>已交 {{ task.progress.submitted_count }}/{{ task.progress.slot_total }}</span>
                              <span>{{ progressPercent(task.progress.submitted_count, task.progress.slot_total) }}%</span>
                            </div>
                            <el-progress
                              :percentage="progressPercent(task.progress.submitted_count, task.progress.slot_total)"
                              :stroke-width="8"
                              :show-text="false"
                            />
                            <div class="task-progress-stat task-progress-stat--reviewed">
                              <span>已评 {{ task.progress.reviewed_count }}/{{ task.progress.slot_total }}</span>
                              <span>{{ progressPercent(task.progress.reviewed_count, task.progress.slot_total) }}%</span>
                            </div>
                            <el-progress
                              :percentage="progressPercent(task.progress.reviewed_count, task.progress.slot_total)"
                              :stroke-width="8"
                              status="success"
                              :show-text="false"
                            />
                          </div>
                        </div>
                        <div class="task-focus-actions">
                          <el-button plain type="warning" @click="openTaskReview(task.id, 'pending_submit')">
                            看未交
                          </el-button>
                          <el-button plain type="success" @click="openTaskReview(task.id, 'pending_review')">
                            看待评
                          </el-button>
                          <el-button plain type="primary" @click="openTaskReview(task.id)">查看提交</el-button>
                        </div>
                      </article>
                    </div>
                  </article>
                </div>
              </el-card>

              <el-card class="soft-card">
                <template #header>已发布学案</template>
                <el-empty v-if="!launchpadData.ready_plans.length" description="请先到学案管理发布一份学案" />
                <el-table v-else :data="launchpadData.ready_plans" stripe>
                  <el-table-column label="学案标题" min-width="240" prop="title" />
                  <el-table-column label="状态" min-width="100">
                    <template #default="{ row }">
                      <el-tag round :type="row.status === 'active' ? 'warning' : 'success'">
                        {{ row.status === 'active' ? '上课中' : '已发布' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="课次" min-width="220">
                    <template #default="{ row }">
                      {{ row.lesson.unit_title }} / {{ row.lesson.title }}
                    </template>
                  </el-table-column>
                  <el-table-column label="任务数" min-width="90" prop="task_count" />
                  <el-table-column label="操作" min-width="120">
                    <template #default="{ row }">
                      <el-button link type="primary" @click="launchForm.plan_id = row.id">选中</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>

          <el-card class="soft-card">
            <template #header>课堂会话记录</template>
            <el-empty v-if="!launchpadData.active_sessions.length" description="还没有开启过课堂" />
            <el-table v-else :data="launchpadData.active_sessions" stripe>
              <el-table-column label="会话 ID" min-width="100" prop="session_id" />
              <el-table-column label="学案" min-width="260">
                <template #default="{ row }">
                  {{ row.plan.title }}
                </template>
              </el-table-column>
              <el-table-column label="班级" min-width="120">
                <template #default="{ row }">
                  {{ row.class.name }}
                </template>
              </el-table-column>
              <el-table-column label="开课时间" min-width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.started_at) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="140">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openSession(row.session_id)">查看详情</el-button>
                  <el-button
                    v-if="row.status === 'active'"
                    link
                    type="danger"
                    :loading="closingSessionId === row.session_id"
                    @click="closeSession(row.session_id)"
                  >
                    结束课堂
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiPost, apiPut } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type SessionSwitchMap = Record<string, boolean>;

type SessionSwitchConfigItem = {
  key: string;
  label: string;
  description: string;
  default_enabled: boolean;
};

type RollCallHistoryItem = {
  student_user_id: number;
  student_no: string;
  student_name: string;
  checked_in_today: boolean;
  used_pending_pool: boolean;
  occurred_at: string;
};

type SessionTaskProgress = {
  slot_type: 'student' | 'group';
  slot_total: number;
  pending_count: number;
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

type SessionSummary = {
  session_id: number;
  status: string;
  started_at: string;
  class: {
    id: number;
    name: string;
  };
  plan: {
    id: number;
    title: string;
    lesson_title: string;
    unit_title: string;
  };
  switches: SessionSwitchMap;
};

type SessionDetail = SessionSummary & {
  attendance_ready: boolean;
  task_count: number;
  tasks: SessionTask[];
  switch_config: SessionSwitchConfigItem[];
  roll_call: {
    dedupe_window_minutes: number;
    recent_history: RollCallHistoryItem[];
  };
};

type LaunchpadData = {
  classes: Array<{
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
  }>;
  ready_plans: Array<{
    id: number;
    title: string;
    status: string;
    assigned_date: string;
    task_count: number;
    pending_count: number;
    lesson: {
      id: number;
      title: string;
      unit_title: string;
      book_name: string;
    };
  }>;
  active_sessions: SessionSummary[];
  switch_config: SessionSwitchConfigItem[];
};

type RollCallResult = {
  session_id: number;
  class_id: number;
  attendance_date: string;
  used_pending_pool: boolean;
  dedupe_applied: boolean;
  dedupe_window_minutes: number;
  recent_history: RollCallHistoryItem[];
  student: {
    user_id: number;
    student_no: string;
    display_name: string;
    username: string;
    checked_in_today: boolean;
  };
};

type ForceOfflineResult = {
  session_id: number;
  class_id: number;
  class_name: string;
  target_student_count: number;
  checked_in_count: number;
  note: string | null;
  issued_at: string;
};

type CreateSessionResponse = {
  session: {
    session_id: number;
  };
  progress_created_count: number;
  task_count: number;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const launchpadData = ref<LaunchpadData | null>(null);
const currentSession = ref<SessionDetail | null>(null);
const isLoading = ref(true);
const isLaunching = ref(false);
const closingSessionId = ref<number | null>(null);
const switchUpdatingKey = ref<string | null>(null);
const isRollingCall = ref(false);
const isForcingOffline = ref(false);
const errorMessage = ref('');
const rollCallPendingOnly = ref(true);
const forceOfflineNote = ref('');
const lastRollCall = ref<RollCallResult | null>(null);
const launchForm = ref({
  class_id: null as number | null,
  plan_id: null as number | null,
});
const sessionSwitches = ref<SessionSwitchMap>({});

const pageTitle = computed(() => {
  if (currentSession.value) {
    return `${currentSession.value.class.name} · ${currentSession.value.plan.title}`;
  }
  return '课堂会话中心';
});

const totalStudentCount = computed(() =>
  (launchpadData.value?.classes || []).reduce((sum, schoolClass) => sum + schoolClass.student_count, 0)
);

const launchPreviewText = computed(() => {
  if (!launchpadData.value) {
    return '请选择学案和班级。';
  }

  const selectedPlan = launchpadData.value.ready_plans.find((plan) => plan.id === launchForm.value.plan_id);
  const selectedClass = launchpadData.value.classes.find(
    (schoolClass) => schoolClass.id === launchForm.value.class_id
  );

  if (!selectedPlan || !selectedClass) {
    return '请选择学案和班级。';
  }

  return `将“${selectedPlan.title}”推送到 ${selectedClass.class_name}，学生将在首页看到这份课程。`;
});

const sessionSwitchConfig = computed(
  () => currentSession.value?.switch_config || launchpadData.value?.switch_config || []
);

const rollCallRecentHistory = computed(() => {
  if (
    currentSession.value &&
    lastRollCall.value &&
    lastRollCall.value.session_id === currentSession.value.session_id &&
    lastRollCall.value.recent_history.length
  ) {
    return lastRollCall.value.recent_history;
  }
  return currentSession.value?.roll_call.recent_history || [];
});

const rollCallDedupeWindow = computed(() => {
  if (lastRollCall.value?.dedupe_window_minutes) {
    return lastRollCall.value.dedupe_window_minutes;
  }
  return currentSession.value?.roll_call.dedupe_window_minutes || 0;
});

function formatDateTime(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}

function formatDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function taskTypeLabel(type: string) {
  if (type === 'reading') {
    return '阅读';
  }
  if (type === 'upload_file') {
    return '文件上传';
  }
  if (type === 'upload_image') {
    return '图片上传';
  }
  if (type === 'code_python') {
    return 'Python';
  }
  if (type === 'quiz') {
    return '测验';
  }
  if (type === 'typing') {
    return '打字';
  }
  if (type === 'peer_review') {
    return '互评';
  }
  return type;
}

function progressPercent(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((count / total) * 100));
}

function taskSlotLabel(progress: SessionTaskProgress) {
  if (progress.slot_type === 'group') {
    return `${progress.slot_total} 组`;
  }
  return `${progress.slot_total} 人`;
}

function applySessionDetail(payload: SessionDetail) {
  const previousSessionId = currentSession.value?.session_id;
  currentSession.value = payload;
  sessionSwitches.value = { ...payload.switches };

  if (previousSessionId !== payload.session_id) {
    lastRollCall.value = null;
  }

  if (launchpadData.value) {
    const target = launchpadData.value.active_sessions.find((item) => item.session_id === payload.session_id);
    if (target) {
      target.status = payload.status;
      target.switches = { ...payload.switches };
    }
  }
}

function applyQueryPlan() {
  const planId = Number(route.query.planId);
  if (Number.isFinite(planId) && planId > 0) {
    launchForm.value.plan_id = planId;
  }
}

function applyDefaultSelections() {
  if (!launchpadData.value) {
    return;
  }
  if (!launchForm.value.class_id) {
    launchForm.value.class_id = launchpadData.value.classes[0]?.id || null;
  }
  if (!launchForm.value.plan_id) {
    launchForm.value.plan_id = launchpadData.value.ready_plans[0]?.id || null;
  }
  applyQueryPlan();
}

async function loadLaunchpad() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    return;
  }

  const payload = await apiGet<LaunchpadData>('/classroom/launchpad', authStore.token);
  launchpadData.value = payload;
  applyDefaultSelections();
}

async function loadSessionDetail() {
  if (!authStore.token) {
    currentSession.value = null;
    return;
  }

  const sessionId = Number(route.params.sessionId);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    currentSession.value = null;
    lastRollCall.value = null;
    sessionSwitches.value = {};
    return;
  }

  const payload = await apiGet<SessionDetail>(`/classroom/sessions/${sessionId}`, authStore.token);
  applySessionDetail(payload);
}

async function loadPage() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    await loadLaunchpad();
    await loadSessionDetail();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课堂会话失败';
  } finally {
    isLoading.value = false;
  }
}

async function startClassroom() {
  if (!authStore.token || !launchForm.value.class_id || !launchForm.value.plan_id) {
    return;
  }

  isLaunching.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiPost<CreateSessionResponse>(
      '/classroom/sessions',
      {
        class_id: launchForm.value.class_id,
        plan_id: launchForm.value.plan_id,
      },
      authStore.token
    );

    ElMessage.success(`课堂已开启，已推送给 ${payload.progress_created_count} 位学生`);
    await router.push(`/staff/classroom/${payload.session.session_id}`);
    await loadPage();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '开课失败';
  } finally {
    isLaunching.value = false;
  }
}

async function openSession(sessionId: number) {
  await router.push(`/staff/classroom/${sessionId}`);
}

async function closeSession(sessionId: number) {
  if (!authStore.token) {
    return;
  }
  closingSessionId.value = sessionId;
  errorMessage.value = '';
  try {
    await apiPost(`/classroom/sessions/${sessionId}/close`, {}, authStore.token);
    ElMessage.success('课堂已结束');
    if (Number(route.params.sessionId) === sessionId) {
      currentSession.value = null;
      await router.push('/staff/classroom');
    }
    await loadPage();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '结束课堂失败';
  } finally {
    closingSessionId.value = null;
  }
}

async function handleSwitchChange(key: string, value: boolean) {
  if (!authStore.token || !currentSession.value) {
    return;
  }
  if (currentSession.value.status !== 'active') {
    sessionSwitches.value = { ...currentSession.value.switches };
    ElMessage.warning('课堂已结束，不能再调整课堂开关');
    return;
  }

  const previous = currentSession.value.switches[key] ?? false;
  switchUpdatingKey.value = key;
  errorMessage.value = '';
  try {
    const payload = await apiPut<SessionDetail>(
      `/classroom/sessions/${currentSession.value.session_id}/switches`,
      { [key]: value },
      authStore.token
    );
    applySessionDetail(payload);
    ElMessage.success('课堂开关已更新');
  } catch (error) {
    sessionSwitches.value[key] = previous;
    errorMessage.value = error instanceof Error ? error.message : '更新课堂开关失败';
  } finally {
    switchUpdatingKey.value = null;
  }
}

function onSessionSwitchChange(key: string, value: string | number | boolean) {
  void handleSwitchChange(key, Boolean(value));
}

async function runRollCall() {
  if (!authStore.token || !currentSession.value) {
    return;
  }
  if (currentSession.value.status !== 'active') {
    ElMessage.warning('课堂已结束，不能继续点名');
    return;
  }

  isRollingCall.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPost<RollCallResult>(
      `/classroom/sessions/${currentSession.value.session_id}/roll-call`,
      { only_pending_signin: rollCallPendingOnly.value },
      authStore.token
    );
    lastRollCall.value = payload;
    if (currentSession.value) {
      currentSession.value = {
        ...currentSession.value,
        roll_call: {
          dedupe_window_minutes: payload.dedupe_window_minutes,
          recent_history: payload.recent_history,
        },
      };
    }
    ElMessage.success(
      payload.dedupe_applied
        ? `点名结果：${payload.student.display_name}（已应用去重）`
        : `点名结果：${payload.student.display_name}`
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '随机点名失败';
  } finally {
    isRollingCall.value = false;
  }
}

async function forceOfflineClass() {
  if (!authStore.token || !currentSession.value) {
    return;
  }
  if (currentSession.value.status !== 'active') {
    ElMessage.warning('课堂已结束，无需全班下线');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `将向 ${currentSession.value.class.name} 下发“全班下线”指令，是否继续？`,
      '全班下线确认',
      {
        type: 'warning',
        confirmButtonText: '继续执行',
        cancelButtonText: '取消',
      }
    );
  } catch {
    return;
  }

  isForcingOffline.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPost<ForceOfflineResult>(
      `/classroom/sessions/${currentSession.value.session_id}/force-offline`,
      { note: forceOfflineNote.value.trim() || null },
      authStore.token
    );
    ElMessage.success(`下线指令已发送：目标 ${payload.target_student_count} 人，今日签到 ${payload.checked_in_count} 人`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '全班下线失败';
  } finally {
    isForcingOffline.value = false;
  }
}

type TaskReviewFocus = 'all' | 'pending_submit' | 'pending_review';

async function openTaskReview(taskId: number, focus: TaskReviewFocus = 'all') {
  await router.push({
    path: `/staff/submissions/${taskId}`,
    query: focus === 'all' ? {} : { focus },
  });
}

async function openAttendanceForSession(session: SessionDetail) {
  await router.push({
    path: '/staff/attendance',
    query: {
      class_id: String(session.class.id),
      attendance_date: formatDate(new Date()),
    },
  });
}

watch(
  () => [route.params.sessionId, route.query.planId],
  () => {
    void loadPage();
  }
);

onMounted(() => {
  void loadPage();
});
</script>

<style scoped>
.launch-preview {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.launch-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.4fr) auto;
  gap: 12px;
  align-items: center;
}

.launch-preview p,
.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.launch-preview p + p {
  margin-top: 6px;
  color: var(--ls-ink);
}

.full-width {
  width: 100%;
}

.session-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.session-focus-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.session-focus-card {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  display: grid;
  gap: 12px;
}

.session-focus-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.session-focus-head h4 {
  margin: 0 0 4px;
}

.switch-grid {
  display: grid;
  gap: 10px;
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(67, 109, 185, 0.24);
  background: rgba(247, 250, 255, 0.9);
}

.switch-item__meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.switch-item__title {
  font-weight: 600;
  color: var(--ls-ink);
}

.switch-item__desc {
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.4;
}

.session-operation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.session-operation-row-block {
  align-items: stretch;
}

.session-operation-row-block .el-input {
  flex: 1;
  min-width: 220px;
}

.roll-call-result {
  padding: 12px;
  border-radius: 14px;
  background: rgba(67, 109, 185, 0.08);
  display: grid;
  gap: 6px;
}

.roll-call-result__name {
  margin: 0;
  font-weight: 700;
}

.roll-call-history {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--ls-border);
  background: rgba(255, 255, 255, 0.92);
  display: grid;
  gap: 8px;
}

.roll-call-history__title {
  margin: 0;
  font-weight: 600;
}

.roll-call-history__list {
  display: grid;
  gap: 6px;
}

.roll-call-history__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.task-focus-list {
  display: grid;
  gap: 10px;
}

.task-focus-item {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--ls-border);
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.task-focus-item__main {
  display: grid;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.task-focus-item__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.task-focus-item__title {
  margin: 0;
  font-weight: 700;
}

.task-focus-actions {
  display: grid;
  gap: 8px;
}

.task-progress-grid {
  display: grid;
  gap: 6px;
}

.task-progress-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--ls-ink);
  font-size: 13px;
}

.task-progress-stat--pending {
  color: #d03050;
}

.task-progress-stat--reviewed {
  color: #137333;
}

@media (max-width: 1100px) {
  .launch-toolbar {
    grid-template-columns: 1fr;
  }

  .session-focus-grid {
    grid-template-columns: 1fr;
  }
}
</style>
