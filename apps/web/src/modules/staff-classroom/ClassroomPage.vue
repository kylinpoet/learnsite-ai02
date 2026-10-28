<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="先选班级与课程，一键开课；下方实时显示该班学生的登录情况。"
      eyebrow="课堂控制"
    >
      <template #title>{{ pageTitle }}</template>
      <template #actions>
        <n-button secondary @click="router.push('/staff/dashboard')">查看工作台</n-button>
        <n-button secondary @click="router.push('/staff/lesson-plans')">学案管理</n-button>
        <n-button type="primary" @click="loadPage">刷新</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <div v-else-if="launchpadData" class="page-stack">
      <div class="ls-row">
        <article class="metric-tile">
          <p class="metric-label">已登录学生</p>
          <p class="metric-value">{{ loggedInCount }}<span class="metric-suffix">/{{ rosterStudents.length }}</span></p>
          <p class="metric-note">{{ focusClassName }} · 今日已进入课堂</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">未登录学生</p>
          <p class="metric-value">{{ pendingStudents.length }}</p>
          <p class="metric-note">还没登录，注意是否到齐</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">可开课学案</p>
          <p class="metric-value">{{ launchpadData.ready_plans.length }}</p>
          <p class="metric-note">已发布或正在上的学案</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">活跃课堂</p>
          <p class="metric-value">{{ launchpadData.active_sessions.length }}</p>
          <p class="metric-note">已经开启过的课堂会话</p>
        </article>
      </div>

      <div class="classroom-grid">
        <SaPanel panel-class="classroom-main" title="学生登录情况">
          <template #actions>
            <n-tag round type="success">已登录 {{ loggedInCount }}</n-tag>
            <n-tag round type="warning">未登录 {{ pendingStudents.length }}</n-tag>
            <n-button :loading="polling.isRefreshing.value" size="small" secondary @click="refreshNow">
              刷新
            </n-button>
          </template>

          <div v-if="!focusClassId" class="section-note">请先在上方选择班级。</div>

          <div v-else class="roster-wrap">
            <div class="roster-progress">
              <n-progress
                :height="10"
                :percentage="loginPercent"
                :show-indicator="false"
                status="success"
              />
              <p class="section-note">
                {{ focusClassName }} · {{ loggedInCount }}/{{ rosterStudents.length }} 人已登录 ·
                {{ updatedText }}
              </p>
            </div>

            <div v-if="rosterStudents.length" class="roster-grid">
              <article
                v-for="student in rosterStudents"
                :key="student.user_id"
                :class="['roster-cell', { 'is-signed': Boolean(student.signed_in_at) }]"
                :title="studentTooltip(student)"
              >
                <p class="roster-cell__name">{{ student.display_name }}</p>
                <p class="roster-cell__meta">{{ student.student_no }}</p>
                <p class="roster-cell__meta">
                  {{ student.seat_label ? `座位 ${student.seat_label}` : '未绑定座位' }}
                </p>
                <p :class="['roster-cell__status', student.signed_in_at ? 'is-on' : 'is-off']">
                  {{ student.signed_in_at ? formatTime(student.signed_in_at) : '未登录' }}
                </p>
              </article>
            </div>
            <n-empty v-else description="当前班级还没有学生" />
          </div>
        </SaPanel>

        <div class="classroom-rail">
          <SaPanel panel-class="classroom-launchbar" title="上课选择">
            <template #actions>
              <n-tag v-if="liveSession" round type="success">上课中</n-tag>
              <n-tag v-else round type="info">{{ updatedText }}</n-tag>
            </template>

            <div class="launch-toolbar">
              <n-select
                v-model:value="launchForm.class_id"
                :options="classOptions"
                class="full-width"
                filterable
                placeholder="请选择班级"
              />
              <n-select
                v-model:value="launchForm.plan_id"
                :options="planOptions"
                class="full-width"
                filterable
                placeholder="请选择已发布学案"
              />
              <n-button
                :disabled="!launchForm.plan_id || !launchForm.class_id"
                :loading="isLaunching"
                type="primary"
                @click="startClassroom"
              >
                开始上课
              </n-button>
            </div>

            <p class="launch-preview">{{ launchPreviewText }}</p>
          </SaPanel>

          <SaPanel title="本班课堂">
          <div v-if="liveSession" class="stack-list">
            <div class="info-row">
              <strong>{{ liveSession.plan_title || '未命名学案' }}</strong>
              <n-tag round :type="liveSession.status === 'active' ? 'success' : 'warning'">
                {{ liveSession.status === 'active' ? '进行中' : '已结束' }}
              </n-tag>
            </div>
            <p class="section-note">
              {{ liveSession.unit_title }} / {{ liveSession.lesson_title }}
            </p>
            <div class="chip-row">
              <n-tag round>开课时间 {{ formatDateTime(liveSession.started_at) }}</n-tag>
              <n-tag round type="info">任务数 {{ liveSession.task_count }}</n-tag>
            </div>
            <div class="session-actions">
              <n-button type="primary" @click="openSession(liveSession.session_id)">进入课堂控制</n-button>
              <n-button
                v-if="liveSession.status === 'active'"
                :loading="closingSessionId === liveSession.session_id"
                secondary
                type="error"
                @click="closeSession(liveSession.session_id)"
              >
                结束课堂
              </n-button>
            </div>
          </div>

          <div v-else-if="focusSession" class="stack-list">
            <div class="info-row">
              <strong>{{ focusSession.plan.title }}</strong>
              <n-tag round type="success">{{ focusSession.class.name }}</n-tag>
            </div>
            <p class="section-note">
              {{ focusSession.plan.unit_title }} / {{ focusSession.plan.lesson_title }}
            </p>
            <div class="session-actions">
              <n-button secondary @click="router.push(`/staff/lesson-plans/${focusSession.plan.id}`)">
                查看学案
              </n-button>
              <n-button secondary @click="router.push('/staff/submissions')">去评审中心</n-button>
              <n-button secondary @click="openAttendanceForSession(focusSession)">看签到</n-button>
            </div>
          </div>

          <div v-else class="stack-list">
            <p class="section-note">本班当前没有进行中的课堂，选择班级与课程后点“开始上课”。</p>
            <n-button
              v-if="selectedPlan"
              secondary
              type="primary"
              @click="router.push(`/staff/lesson-plans/${selectedPlan.id}`)"
            >
              查看所选学案
            </n-button>
          </div>
        </SaPanel>
        </div>
      </div>

      <SaPanel v-if="currentSession" title="当前查看的课堂">
        <template #header>
          <div class="info-row">
            <div>
              <strong>{{ currentSession.class.name }} · {{ currentSession.plan.title }}</strong>
              <p class="section-note">
                {{ currentSession.plan.unit_title }} / {{ currentSession.plan.lesson_title }}
              </p>
            </div>
            <n-tag round type="warning">{{ currentSession.status }}</n-tag>
          </div>
        </template>

        <div class="stack-list">
          <div class="chip-row">
            <n-tag round>开课时间 {{ formatDateTime(currentSession.started_at) }}</n-tag>
            <n-tag round type="success">任务数 {{ currentSession.task_count }}</n-tag>
            <n-tag round type="info">签到就绪 {{ currentSession.attendance_ready ? '是' : '否' }}</n-tag>
          </div>

          <div class="session-focus-grid">
            <article class="session-focus-card">
              <div class="session-focus-head">
                <div>
                  <h4>课堂开关</h4>
                  <p class="section-note">按课堂实时切换协作能力，调整后立即生效。</p>
                </div>
                <n-tag round type="info">会话级设置</n-tag>
              </div>
              <div class="switch-grid">
                <label v-for="item in sessionSwitchConfig" :key="item.key" class="switch-item">
                  <div class="switch-item__meta">
                    <span class="switch-item__title">{{ item.label }}</span>
                    <p class="switch-item__desc">{{ item.description }}</p>
                  </div>
                  <n-switch
                    :disabled="currentSession.status !== 'active'"
                    :loading="switchUpdatingKey === item.key"
                    :value="sessionSwitches[item.key] ?? item.default_enabled"
                    @update:value="onSessionSwitchChange(item.key, $event)"
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
                <n-tag v-if="currentSession.status !== 'active'" round type="warning">课堂已结束</n-tag>
              </div>
              <div class="session-operation-row">
                <n-switch v-model:value="rollCallPendingOnly" :disabled="currentSession.status !== 'active'">
                  <template #checked>优先未签到</template>
                  <template #unchecked>全班随机</template>
                </n-switch>
                <n-button
                  :disabled="currentSession.status !== 'active'"
                  :loading="isRollingCall"
                  type="primary"
                  @click="runRollCall"
                >
                  随机点名
                </n-button>
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
                <n-tag :type="lastRollCall.dedupe_applied ? 'success' : 'info'" round>
                  {{ lastRollCall.dedupe_applied ? '已应用去重' : '本次未触发去重' }}
                </n-tag>
              </div>

              <div class="session-operation-row session-operation-row-block">
                <n-input
                  v-model:value="forceOfflineNote"
                  :disabled="currentSession.status !== 'active'"
                  class="force-note-input"
                  maxlength="200"
                  placeholder="可选：记录本次下线原因"
                />
                <n-button
                  :disabled="currentSession.status !== 'active'"
                  :loading="isForcingOffline"
                  secondary
                  type="error"
                  @click="forceOfflineClass"
                >
                  全班下线
                </n-button>
              </div>
            </article>
          </div>

          <article class="session-focus-card">
            <div class="session-focus-head">
              <div>
                <h4>课堂任务聚焦</h4>
                <p class="section-note">
                  任务卡内直接查看阅读已读或作业提交进度，减少在课堂中频繁跳页。
                </p>
              </div>
            </div>
            <n-empty v-if="!currentSession.tasks.length" description="当前学案还没有任务" />
            <div v-else class="task-focus-list">
              <article v-for="task in currentSession.tasks" :key="task.id" class="task-focus-item">
                <div class="task-focus-item__main">
                  <div class="task-focus-item__title-row">
                    <p class="task-focus-item__title">{{ task.sort_order }}. {{ task.title }}</p>
                    <span class="section-note">{{ taskSlotLabel(task.progress) }}</span>
                  </div>
                  <div class="chip-row">
                    <n-tag round>{{ taskTypeLabel(task.task_type) }}</n-tag>
                    <n-tag round type="info">
                      {{ task.submission_scope === 'group' ? '小组任务' : '个人任务' }}
                    </n-tag>
                    <n-tag v-if="task.is_required" round type="success">必做</n-tag>
                  </div>

                  <div class="task-progress-grid">
                    <template v-if="task.progress.mode === 'reading'">
                      <div class="task-progress-stat task-progress-stat--pending">
                        <span>未读 {{ task.progress.pending_count }}/{{ task.progress.slot_total }}</span>
                        <span>{{ progressPercent(task.progress.pending_count, task.progress.slot_total) }}%</span>
                      </div>
                      <n-progress
                        :height="8"
                        :percentage="progressPercent(task.progress.pending_count, task.progress.slot_total)"
                        :show-indicator="false"
                        status="error"
                      />
                      <div class="task-progress-stat task-progress-stat--reviewed">
                        <span>已读 {{ task.progress.completed_count }}/{{ task.progress.slot_total }}</span>
                        <span>{{ progressPercent(task.progress.completed_count, task.progress.slot_total) }}%</span>
                      </div>
                      <n-progress
                        :height="8"
                        :percentage="progressPercent(task.progress.completed_count, task.progress.slot_total)"
                        :show-indicator="false"
                        status="success"
                      />
                      <p class="task-progress-note">阅读任务只统计学生已读确认，不进入提交批改链路。</p>
                    </template>
                    <template v-else>
                      <div class="task-progress-stat task-progress-stat--pending">
                        <span>未交 {{ task.progress.pending_count }}/{{ task.progress.slot_total }}</span>
                        <span>{{ progressPercent(task.progress.pending_count, task.progress.slot_total) }}%</span>
                      </div>
                      <n-progress
                        :height="8"
                        :percentage="progressPercent(task.progress.pending_count, task.progress.slot_total)"
                        :show-indicator="false"
                        status="error"
                      />
                      <div class="task-progress-stat">
                        <span>已交 {{ task.progress.submitted_count }}/{{ task.progress.slot_total }}</span>
                        <span>{{ progressPercent(task.progress.submitted_count, task.progress.slot_total) }}%</span>
                      </div>
                      <n-progress
                        :height="8"
                        :percentage="progressPercent(task.progress.submitted_count, task.progress.slot_total)"
                        :show-indicator="false"
                      />
                      <div class="task-progress-stat task-progress-stat--reviewed">
                        <span>已评 {{ task.progress.reviewed_count }}/{{ task.progress.slot_total }}</span>
                        <span>{{ progressPercent(task.progress.reviewed_count, task.progress.slot_total) }}%</span>
                      </div>
                      <n-progress
                        :height="8"
                        :percentage="progressPercent(task.progress.reviewed_count, task.progress.slot_total)"
                        :show-indicator="false"
                        status="success"
                      />
                    </template>
                  </div>
                </div>
                <div class="task-focus-actions">
                  <template v-if="task.progress.mode === 'reading'">
                    <p class="task-focus-actions__note">阅读任务会随着学生确认已读实时刷新完成统计。</p>
                  </template>
                  <template v-else>
                    <n-button secondary type="warning" @click="openTaskReview(task.id, 'pending_submit')">
                      看未交
                    </n-button>
                    <n-button secondary type="success" @click="openTaskReview(task.id, 'pending_review')">
                      看待评
                    </n-button>
                    <n-button secondary type="primary" @click="openTaskReview(task.id)">查看提交</n-button>
                  </template>
                </div>
              </article>
            </div>
          </article>
        </div>
      </SaPanel>

      <div class="classroom-tables">
      <SaPanel title="已发布学案">
        <SaDataTable
          :data="launchpadData.ready_plans"
          empty-text="请先到学案管理发布一份学案"
          row-key="id"
          stripe
        >
          <SaTableColumn label="学案标题" min-width="240" prop="title" />
          <SaTableColumn label="状态" min-width="100">
            <template #default="{ row }">
              <n-tag :type="row.status === 'active' ? 'warning' : 'success'" round>
                {{ row.status === 'active' ? '上课中' : '已发布' }}
              </n-tag>
            </template>
          </SaTableColumn>
          <SaTableColumn label="课次" min-width="220">
            <template #default="{ row }">
              {{ row.lesson.unit_title }} / {{ row.lesson.title }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="任务数" min-width="90" prop="task_count" />
          <SaTableColumn label="操作" min-width="120">
            <template #default="{ row }">
              <n-button text type="primary" @click="launchForm.plan_id = row.id">选中</n-button>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </SaPanel>

      <SaPanel title="课堂会话记录">
        <SaDataTable
          :data="launchpadData.active_sessions"
          empty-text="还没有开启过课堂"
          row-key="session_id"
          stripe
        >
          <SaTableColumn label="会话 ID" min-width="100" prop="session_id" />
          <SaTableColumn label="学案" min-width="260" prop="plan.title" />
          <SaTableColumn label="班级" min-width="120" prop="class.name" />
          <SaTableColumn label="开课时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.started_at) }}</template>
          </SaTableColumn>
          <SaTableColumn label="操作" min-width="140">
            <template #default="{ row }">
              <n-button text type="primary" @click="openSession(row.session_id)">查看详情</n-button>
              <n-button
                v-if="row.status === 'active'"
                :loading="closingSessionId === row.session_id"
                text
                type="error"
                @click="closeSession(row.session_id)"
              >
                结束课堂
              </n-button>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </SaPanel>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NEmpty,
  NInput,
  NProgress,
  NSelect,
  NSkeleton,
  NSwitch,
  NTag,
} from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiPost, apiPut } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useVisibilityPolling } from '@/composables/useVisibilityPolling';
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

type LiveStudent = {
  user_id: number;
  display_name: string;
  student_no: string;
  seat_label: string | null;
  signed_in_at: string | null;
  submission_stage: 'none' | 'partial' | 'completed';
};

type LiveSession = {
  session_id: number;
  status: string;
  started_at: string;
  class_id: number;
  class_name: string;
  plan_id: number | null;
  plan_title: string | null;
  task_count: number;
  unit_title?: string | null;
  lesson_title?: string | null;
};

type ClassLivePayload = {
  class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
  };
  session: LiveSession | null;
  attendance: {
    student_count: number;
    checked_in_count: number;
    pending_signin_count: number;
    pending_students: LiveStudent[];
  };
  students: LiveStudent[];
  generated_at: string;
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
const live = ref<ClassLivePayload | null>(null);
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
  const parts = [focusClassName.value, selectedPlan.value?.title].filter(Boolean);
  return parts.length ? `课堂控制 · ${parts.join(' · ')}` : '课堂控制';
});

const focusClassId = computed(() => launchForm.value.class_id);

const focusClassName = computed(() => {
  const classId = focusClassId.value;
  if (!classId) {
    return '';
  }
  const fromLive = live.value?.class.id === classId ? live.value.class.class_name : '';
  const fromLaunchpad = launchpadData.value?.classes.find((item) => item.id === classId)?.class_name || '';
  return fromLive || fromLaunchpad || '';
});

const classOptions = computed(() =>
  (launchpadData.value?.classes || []).map((schoolClass) => ({
    label: `${schoolClass.class_name} · ${schoolClass.student_count} 人`,
    value: schoolClass.id,
  })),
);

const planOptions = computed(() =>
  (launchpadData.value?.ready_plans || []).map((plan) => ({
    label: `${plan.title} · ${plan.lesson.unit_title}`,
    value: plan.id,
  })),
);

const selectedPlan = computed(
  () => launchpadData.value?.ready_plans.find((plan) => plan.id === launchForm.value.plan_id) || null,
);

const launchPreviewText = computed(() => {
  if (!launchpadData.value) {
    return '请选择学案和班级。';
  }
  const plan = selectedPlan.value;
  const schoolClass = launchpadData.value.classes.find((item) => item.id === launchForm.value.class_id);

  if (!plan || !schoolClass) {
    return '请选择学案和班级。';
  }
  return `将“${plan.title}”推送到 ${schoolClass.class_name}，学生将在首页看到这份课程。`;
});

/** 本班正在上的会话（来自实时接口，仅看当前选中班级） */
const liveSession = computed<LiveSession | null>(() => {
  if (!live.value) {
    return null;
  }
  if (live.value.class.id !== focusClassId.value) {
    return null;
  }
  return live.value.session;
});

/** 路由里打开的课堂会话，仅当它属于当前选中班级时才当作“本班课堂” */
const focusSession = computed<SessionDetail | null>(() => {
  const session = currentSession.value;
  if (!session) {
    return null;
  }
  if (focusClassId.value && session.class.id !== focusClassId.value) {
    return null;
  }
  return session;
});

const rosterStudents = computed<LiveStudent[]>(() => {
  if (live.value && live.value.class.id === focusClassId.value) {
    return live.value.students;
  }
  return [];
});

const loggedInCount = computed(() => {
  if (live.value && live.value.class.id === focusClassId.value) {
    return live.value.attendance.checked_in_count;
  }
  return rosterStudents.value.filter((student) => Boolean(student.signed_in_at)).length;
});

const pendingStudents = computed(() => {
  if (live.value && live.value.class.id === focusClassId.value) {
    return live.value.attendance.pending_students;
  }
  return rosterStudents.value.filter((student) => !student.signed_in_at);
});

const loginPercent = computed(() => progressPercent(loggedInCount.value, rosterStudents.value.length));

const sessionSwitchConfig = computed(
  () => currentSession.value?.switch_config || launchpadData.value?.switch_config || []
);

const rollCallDedupeWindow = computed(() => {
  if (lastRollCall.value?.dedupe_window_minutes) {
    return lastRollCall.value.dedupe_window_minutes;
  }
  return currentSession.value?.roll_call.dedupe_window_minutes || 0;
});

const polling = useVisibilityPolling({
  enabled: computed(() => Boolean(authStore.token) && Boolean(focusClassId.value)),
  intervalMs: 10_000,
  fetcher: async (signal) => {
    await fetchLive(signal);
  },
});

const updatedText = computed(() => {
  if (polling.isPaused.value) {
    return '自动刷新已暂停';
  }
  const at = polling.lastUpdatedAt.value;
  if (!at) {
    return '正在加载登录情况…';
  }
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  return seconds <= 2 ? '刚刚更新' : `更新于 ${seconds} 秒前`;
});

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function formatTime(value: string) {
  return value.replace('T', ' ').slice(11, 16);
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

function studentTooltip(student: LiveStudent) {
  const seat = student.seat_label ? `座位 ${student.seat_label}` : '未绑定座位';
  const status = student.signed_in_at ? `已于 ${formatTime(student.signed_in_at)} 登录` : '尚未登录';
  return `${student.display_name}（${student.student_no}）· ${seat} · ${status}`;
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

async function fetchLive(signal?: AbortSignal) {
  const classId = focusClassId.value;
  if (!authStore.token || !classId) {
    return;
  }
  const payload = await apiGet<ClassLivePayload>(
    `/staff/classroom/live?class_id=${classId}`,
    authStore.token,
    signal
  );
  if (payload.class.id !== focusClassId.value) {
    return;
  }
  live.value = payload;
}

async function loadPage() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    await loadLaunchpad();
    await loadSessionDetail();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课堂控制失败';
  } finally {
    isLoading.value = false;
  }

  // 默认班级就绪后再启动实时刷新（首次加载时轮询尚未启用）
  await polling.refreshNow();
}

async function refreshNow() {
  errorMessage.value = '';
  await polling.refreshNow();
  if (polling.lastError.value) {
    errorMessage.value = polling.lastError.value;
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

watch(focusClassId, () => {
  live.value = null;
  void refreshNow();
});

onMounted(() => {
  void loadPage();
});
</script>

<style scoped>
/* 开课表单收进右栏后改为竖排，避免在窄栏里挤成三列 */
.launch-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.launch-preview {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ls-primary-soft);
  color: var(--ls-text);
  font-size: 12px;
  line-height: 1.55;
}

.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.full-width {
  width: 100%;
}

.metric-suffix {
  margin-left: 4px;
  color: var(--ls-muted);
  font-size: 14px;
  font-weight: 600;
}

/* 学生登录情况 = 8 列主区；上课选择 + 本班课堂 = 4 列右栏 */
.classroom-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.classroom-grid > .classroom-main {
  grid-column: span 8;
  order: 1;
}

.classroom-grid > .classroom-rail {
  grid-column: span 4;
  order: 2;
  display: grid;
  gap: 12px;
  align-content: start;
  min-width: 0;
}

/* 已发布学案 / 课堂会话记录 并排，避免两张全宽表把页面拉长 */
.classroom-tables {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.roster-wrap {
  display: grid;
  gap: 14px;
}

.roster-progress {
  display: grid;
  gap: 6px;
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  padding-right: 2px;
}

.roster-cell {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--ls-border);
  border-radius: 14px;
  background: var(--ls-panel-soft, var(--ls-card));
  transition: border-color 0.16s ease, transform 0.16s ease;
}

.roster-cell:hover {
  transform: translateY(-1px);
  border-color: var(--ls-primary);
}

.roster-cell.is-signed {
  border-color: var(--ls-primary);
  box-shadow: inset 0 0 0 1px var(--ls-primary-soft);
}

.roster-cell__name {
  margin: 0;
  color: var(--ls-ink);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roster-cell__meta {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
}

.roster-cell__status {
  margin: 2px 0 0;
  font-size: 12px;
  font-weight: 700;
}

.roster-cell__status.is-on {
  color: var(--ls-success-text);
}

.roster-cell__status.is-off {
  color: var(--ls-error-text);
}

.info-row {
  width: 100%;
}

@media (max-width: 1439px) {
  .classroom-grid > .classroom-main,
  .classroom-grid > .classroom-rail {
    grid-column: 1 / -1;
  }

  .classroom-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .classroom-tables {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .classroom-rail {
    grid-template-columns: minmax(0, 1fr);
  }
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
  background: var(--ls-card);
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
  background: var(--ls-panel-soft);
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

.session-operation-row-block .force-note-input {
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

.task-focus-list {
  display: grid;
  gap: 10px;
}

.task-focus-item {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--ls-border);
  background: var(--ls-card);
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

.task-focus-actions__note,
.task-progress-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
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
  color: var(--ls-error-text);
}

.task-progress-stat--reviewed {
  color: var(--ls-success-text);
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
