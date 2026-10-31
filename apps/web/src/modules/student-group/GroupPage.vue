<template>
  <div class="sw-group">
    <StudentPageHead :title="pageTitle" :sub="headerSub">
      <template #actions>
        <n-button
          type="primary"
          :disabled="!groupData?.shared_drive.enabled"
          @click="goToGroupDrive"
        >
          打开小组网盘
        </n-button>
        <n-button :loading="isLoading" @click="loadGroup">刷新</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <n-alert
      v-if="discussionBlockedMessage"
      :closable="false"
      :title="discussionBlockedMessage"
      type="warning"
    />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="6" animated />
      </div>
    </div>

    <StudentPanel v-else-if="groupData && !groupData.group" title="小组">
      <StudentEmpty text="还没有加入小组。分配小组后，这里会显示成员、今日到课和组网盘。" />
    </StudentPanel>

    <template v-else-if="groupData?.group">
      <StudentStatStrip :items="statItems" />

      <div class="sw-grid-2">
        <StudentPanel title="成员" :count="`${groupData.members.length} 人`" flush>
          <template v-if="groupData.members.length">
            <article v-for="member in groupData.members" :key="member.user_id" class="sw-row">
              <span class="sw-row__main">
                <span class="sw-row__title">
                  {{ member.name }}
                  <span class="sw-group__role">{{ roleLabel(member.role) }}</span>
                </span>
                <span class="sw-row__meta">
                  <span>{{ member.student_no }}</span>
                  <span>{{ member.seat_label || '未绑定座位' }}</span>
                  <span v-if="member.checked_in_at">{{ formatDateTime(member.checked_in_at) }} 签到</span>
                </span>
              </span>
              <span
                :class="['sw-chip', member.checked_in_today ? 'sw-chip--done' : 'sw-chip--todo']"
              >
                {{ member.checked_in_today ? '已到课' : '未签到' }}
              </span>
            </article>
          </template>
          <StudentEmpty v-else box text="小组还没有成员，请联系教师分配。" />
        </StudentPanel>

        <StudentPanel
          title="共享网盘"
          :count="groupData.shared_drive.enabled ? `${groupData.shared_drive.file_count ?? 0} 个文件` : undefined"
          flush
        >
          <template v-if="groupData.shared_drive.enabled && recentFiles.length">
            <div v-for="file in recentFiles" :key="file.id" class="sw-row">
              <span class="sw-row__main">
                <span class="sw-row__title">{{ file.name }}</span>
                <span class="sw-row__meta">
                  <span>{{ file.ext.toUpperCase() }}</span>
                  <span>{{ formatDateTime(file.updated_at) }}</span>
                </span>
              </span>
              <span class="sw-row__value">{{ file.size_kb }} KB</span>
            </div>
          </template>
          <StudentEmpty
            v-else-if="groupData.shared_drive.enabled"
            box
            text="网盘还没有文件，打开小组网盘上传第一份协作资料。"
          />
          <StudentEmpty
            v-else
            box
            :text="groupData.shared_drive.message || '小组网盘暂未开放，请联系教师。'"
          />
        </StudentPanel>
      </div>

      <StudentPanel title="最近动态" :count="`${timeline.length} 条`" flush>
        <template v-if="timeline.length">
          <article v-for="item in timeline" :key="item.key" class="sw-row">
            <span class="sw-row__main">
              <span class="sw-row__title">{{ item.title }}</span>
              <span class="sw-row__meta">
                <span>{{ formatDateTime(item.occurredAt) }}</span>
                <span v-if="item.description">{{ item.description }}</span>
                <span v-if="item.actor">{{ item.actor }}</span>
              </span>
            </span>
            <span :class="['sw-chip', item.chip]">{{ item.label }}</span>
          </article>
        </template>
        <StudentEmpty v-else box text="今天还没有小组动态，签到、上传文件或提交作品后会出现在这里。" />
      </StudentPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';

type GroupMember = {
  user_id: number;
  student_no: string;
  name: string;
  role: 'leader' | 'member' | string;
  seat_label: string | null;
  room_name: string | null;
  checked_in_today: boolean;
  checked_in_at: string | null;
};

type GroupActivityItem = {
  id: string;
  event_type: 'attendance' | 'drive_upload' | 'group_submission' | 'submission_reviewed' | string;
  event_label: string;
  occurred_at: string | null;
  group_id: number;
  group_name: string;
  group_no: number;
  actor_name: string | null;
  actor_student_no: string | null;
  title: string;
  description: string;
  file_id: number | null;
  submission_id: number | null;
  task_id: number | null;
};

type GroupOperationLogItem = {
  id: number;
  event_type: string;
  event_label: string;
  occurred_at: string | null;
  group_id: number | null;
  group_name: string;
  group_no: number | null;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_student_no: string | null;
  title: string;
  description: string;
  task_id: number | null;
  task_title: string | null;
  file_id: number | null;
  file_name: string | null;
  submission_id: number | null;
  version_no: number | null;
};

type GroupPayload = {
  group: {
    id: number;
    name: string;
    group_no: number;
    description: string | null;
    class_id: number;
    class_name: string;
    member_count: number;
    me_role: string;
    leader_name: string | null;
    leader_student_no: string | null;
  } | null;
  today_summary: {
    member_count: number;
    checked_in_count: number;
    pending_count: number;
  };
  members: GroupMember[];
  shared_drive: {
    enabled: boolean;
    message: string;
    display_name?: string;
    quota_mb?: number;
    used_bytes?: number;
    remaining_bytes?: number;
    usage_percent?: number;
    file_count?: number;
    recent_files: Array<{
      id: number;
      name: string;
      original_name: string;
      ext: string;
      size_kb: number;
      updated_at: string | null;
    }>;
  };
  activity_feed: GroupActivityItem[];
  operation_logs: GroupOperationLogItem[];
  classroom_capabilities?: {
    session_active: boolean;
    session_id: number | null;
    class_id: number | null;
    switches: Record<string, boolean>;
    ip_lock: {
      enabled: boolean;
      allowed: boolean;
      client_ip: string | null;
      message: string;
    };
    group_discussion?: {
      enabled: boolean;
      message: string;
    };
    group_drive?: {
      enabled: boolean;
      message: string;
    };
  };
};

type TimelineEntry = {
  key: string;
  title: string;
  description: string;
  label: string;
  occurredAt: string | null;
  actor: string;
  chip: string;
};

const router = useRouter();
const authStore = useAuthStore();

const groupData = ref<GroupPayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

const pageTitle = computed(() => groupData.value?.group?.name || '我的小组');
const discussionBlockedMessage = computed(() => {
  const discussionCapability = groupData.value?.classroom_capabilities?.group_discussion;
  if (!discussionCapability) {
    return '';
  }
  return discussionCapability.enabled ? '' : discussionCapability.message || '课堂暂时关闭了小组讨论。';
});

const headerSub = computed(() => {
  const group = groupData.value?.group;
  if (!group) {
    return '';
  }
  const summary = groupData.value?.today_summary;
  return [
    `我是${roleLabel(group.me_role)}`,
    group.leader_name ? `组长 ${group.leader_name}` : '组长待设置',
    `今日到课 ${summary?.checked_in_count ?? 0}/${summary?.member_count ?? 0}`,
  ].join(' · ');
});

const recentFiles = computed(() => groupData.value?.shared_drive.recent_files || []);

const statItems = computed<StudentStatItem[]>(() => {
  const summary = groupData.value?.today_summary;
  const drive = groupData.value?.shared_drive;
  return [
    {
      label: '成员',
      value: summary?.member_count ?? 0,
      unit: '人',
      note: groupData.value?.group?.leader_name
        ? `组长 ${groupData.value.group.leader_name}`
        : '组长待设置',
    },
    {
      label: '今日到课',
      value: summary?.checked_in_count ?? 0,
      unit: `/ ${summary?.member_count ?? 0} 人`,
      note: summary?.pending_count ? `${summary.pending_count} 人未签到` : '全员已签到',
    },
    {
      label: '共享文件',
      value: drive?.file_count ?? 0,
      unit: '个',
      note: drive?.display_name || '小组共享网盘',
    },
    {
      label: '组网盘已用',
      value: formatBytes(drive?.used_bytes ?? 0),
      note: `剩余 ${formatBytes(drive?.remaining_bytes ?? 0)} · 共 ${drive?.quota_mb ?? 0} MB`,
    },
  ];
});

const timeline = computed<TimelineEntry[]>(() => {
  const activities: TimelineEntry[] = (groupData.value?.activity_feed || []).map((event) => ({
    key: `activity-${event.id}`,
    title: event.title,
    description: event.description,
    label: event.event_label,
    occurredAt: event.occurred_at,
    actor: [event.actor_name, event.actor_student_no].filter(Boolean).join(' · '),
    chip: activityChip(event.event_type),
  }));
  const logs: TimelineEntry[] = (groupData.value?.operation_logs || []).map((log) => ({
    key: `log-${log.id}`,
    title: log.title,
    description: log.description,
    label: log.event_label,
    occurredAt: log.occurred_at,
    actor: [log.actor_name, log.actor_role ? roleLabel(log.actor_role) : null]
      .filter(Boolean)
      .join(' · '),
    chip: operationChip(log.event_type),
  }));
  return [...activities, ...logs].sort((left, right) => {
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : 0;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : 0;
    return rightTime - leftTime;
  });
});

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${bytes} B`;
}



function roleLabel(role: string | null | undefined) {
  if (role === 'leader') {
    return '组长';
  }
  if (role === 'member') {
    return '组员';
  }
  if (role === 'teacher') {
    return '教师';
  }
  if (role === 'admin') {
    return '管理员';
  }
  if (role === 'student') {
    return '学生';
  }
  return role || '未分配';
}

function activityChip(eventType: string) {
  if (eventType === 'attendance') {
    return 'sw-chip--done';
  }
  if (eventType === 'submission_reviewed') {
    return 'sw-chip--warn';
  }
  return 'sw-chip--todo';
}

function operationChip(eventType: string) {
  if (eventType.includes('deleted')) {
    return 'sw-chip--danger';
  }
  if (eventType.includes('reviewed')) {
    return 'sw-chip--warn';
  }
  if (eventType.includes('submitted')) {
    return 'sw-chip--done';
  }
  return 'sw-chip--todo';
}

async function loadGroup() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  try {
    groupData.value = await apiGet<GroupPayload>('/groups/me', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载小组信息失败';
  } finally {
    isLoading.value = false;
  }
}

async function goToGroupDrive() {
  if (!groupData.value?.shared_drive.enabled) {
    if (groupData.value?.shared_drive.message) {
      errorMessage.value = groupData.value.shared_drive.message;
    }
    return;
  }
  await router.push({ path: '/student/drive', query: { tab: 'group' } });
}

onMounted(() => {
  void loadGroup();
});
</script>

<style scoped>
.sw-group {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-group__role {
  margin-left: 6px;
  color: var(--sw-muted);
  font-size: 11.5px;
  font-weight: 400;
}

@media (max-width: 560px) {
  .sw-group__role {
    display: block;
    margin-left: 0;
  }
}
</style>
