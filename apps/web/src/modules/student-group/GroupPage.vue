<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">小组协作</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          在这里查看小组成员、今日到课状态和共享网盘，便于分工协作、资料共享与共同完成任务。
        </p>
      </div>
      <div class="action-group">
        <el-button :loading="isLoading" type="primary" @click="loadGroup">刷新小组</el-button>
        <el-button :disabled="!groupData?.shared_drive.enabled" plain @click="goToGroupDrive">
          打开小组网盘
        </el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <el-alert
      v-if="discussionBlockedMessage"
      :closable="false"
      :title="discussionBlockedMessage"
      type="warning"
    />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="10" />
        </el-card>
      </template>

      <template #default>
        <el-empty
          v-if="groupData && !groupData.group"
          description="当前还没有加入小组，暂时无法使用小组协作页。"
        />

        <div v-else-if="groupData?.group" class="page-stack">
          <div class="metric-grid">
            <article class="mini-panel">
              <p class="metric-label">当前小组</p>
              <p class="metric-value metric-value--small">{{ groupData.group.name }}</p>
              <p class="metric-note">{{ groupData.group.class_name }} · 第 {{ groupData.group.group_no }} 组</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">成员人数</p>
              <p class="metric-value">{{ groupData.today_summary.member_count }}</p>
              <p class="metric-note">组长和组员都在这里统一查看。</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">今日已到课</p>
              <p class="metric-value">{{ groupData.today_summary.checked_in_count }}</p>
              <p class="metric-note">按登录 IP 自动签到后的实时结果。</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">共享文件</p>
              <p class="metric-value">{{ groupData.shared_drive.file_count ?? 0 }}</p>
              <p class="metric-note">可直接进入小组网盘继续上传与整理。</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="15" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="info-row">
                    <span>成员面板</span>
                    <el-tag round type="success">
                      组长 {{ groupData.group.leader_name || '待设置' }}
                    </el-tag>
                  </div>
                </template>

                <div class="group-summary">
                  <p class="group-summary-title">{{ groupData.group.name }}</p>
                  <p class="group-summary-note">
                    {{ groupData.group.description || '当前小组负责课堂协作、资料共享与作品共创。' }}
                  </p>
                  <p class="group-summary-note">
                    我的身份：{{ roleLabel(groupData.group.me_role) }}
                  </p>
                </div>

                <el-table :data="groupData.members" stripe>
                  <el-table-column label="成员" min-width="220">
                    <template #default="{ row }">
                      <div>
                        <p class="member-name">{{ row.name }}</p>
                        <p class="table-note">{{ row.student_no }}</p>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="身份" min-width="120">
                    <template #default="{ row }">
                      <el-tag round :type="row.role === 'leader' ? 'success' : 'info'">
                        {{ roleLabel(row.role) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="座位" min-width="150">
                    <template #default="{ row }">
                      <span>{{ row.seat_label || '未绑定' }}</span>
                      <p class="table-note">{{ row.room_name || '暂无机房信息' }}</p>
                    </template>
                  </el-table-column>
                  <el-table-column label="到课状态" min-width="180">
                    <template #default="{ row }">
                      <el-tag round :type="row.checked_in_today ? 'success' : 'warning'">
                        {{ row.checked_in_today ? '已签到' : '未签到' }}
                      </el-tag>
                      <p class="table-note">
                        {{ row.checked_in_at ? formatDateTime(row.checked_in_at) : '等待登录签到' }}
                      </p>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>

            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="info-row">
                    <span>共享网盘概览</span>
                    <el-tag round type="warning">{{ groupData.shared_drive.display_name || '小组共享网盘' }}</el-tag>
                  </div>
                </template>

                <el-progress
                  :percentage="Math.min(groupData.shared_drive.usage_percent ?? 0, 100)"
                  :stroke-width="18"
                  status="success"
                />
                <p class="section-note">
                  已用 {{ formatBytes(groupData.shared_drive.used_bytes ?? 0) }} / 总容量
                  {{ groupData.shared_drive.quota_mb ?? 0 }} MB
                </p>
                <p class="section-note">
                  剩余 {{ formatBytes(groupData.shared_drive.remaining_bytes ?? 0) }}，当前共
                  {{ groupData.shared_drive.file_count ?? 0 }} 个文件。
                </p>

                <div class="recent-file-block">
                  <div class="info-row">
                    <span>最近文件</span>
                    <el-button link type="primary" @click="goToGroupDrive">去整理</el-button>
                  </div>

                  <div v-if="groupData.shared_drive.recent_files.length" class="recent-file-list">
                    <article
                      v-for="file in groupData.shared_drive.recent_files"
                      :key="file.id"
                      class="recent-file-item"
                    >
                      <div>
                        <p class="member-name">{{ file.name }}</p>
                        <p class="table-note">
                          {{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB ·
                          {{ formatDateTime(file.updated_at) }}
                        </p>
                      </div>
                    </article>
                  </div>
                  <el-empty v-else description="小组网盘还没有文件，先上传一份协作资料吧。" />
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-card class="soft-card">
            <template #header>
              <div class="info-row">
                <span>课堂动态</span>
                <el-tag round type="info">{{ groupData.activity_feed.length }} 条最新记录</el-tag>
              </div>
            </template>

            <div v-if="groupData.activity_feed.length" class="activity-feed">
              <article
                v-for="event in groupData.activity_feed"
                :key="event.id"
                class="activity-item"
              >
                <div class="info-row">
                  <div>
                    <p class="member-name">{{ event.title }}</p>
                    <p class="table-note">{{ event.description }}</p>
                  </div>
                  <el-tag round :type="activityTagType(event.event_type)">{{ event.event_label }}</el-tag>
                </div>
                <p class="table-note">
                  {{ formatDateTime(event.occurred_at) }}
                  <span v-if="event.actor_name"> · {{ event.actor_name }}</span>
                  <span v-if="event.actor_student_no"> · {{ event.actor_student_no }}</span>
                </p>
              </article>
            </div>
            <el-empty v-else description="当前还没有可展示的小组课堂动态。" />
          </el-card>

          <el-card class="soft-card">
            <template #header>
              <div class="info-row">
                <span>操作日志</span>
                <el-tag round type="warning">{{ groupData.operation_logs.length }} 条可追溯记录</el-tag>
              </div>
            </template>

            <div v-if="groupData.operation_logs.length" class="activity-feed">
              <article
                v-for="log in groupData.operation_logs"
                :key="`log-${log.id}`"
                class="activity-item"
              >
                <div class="info-row">
                  <div>
                    <p class="member-name">{{ log.title }}</p>
                    <p class="table-note">{{ log.description }}</p>
                  </div>
                  <el-tag round :type="operationTagType(log.event_type)">{{ log.event_label }}</el-tag>
                </div>
                <p class="table-note">
                  {{ formatDateTime(log.occurred_at) }}
                  <span v-if="log.actor_name"> 路 {{ log.actor_name }}</span>
                  <span v-if="log.actor_role"> 路 {{ roleLabel(log.actor_role) }}</span>
                </p>
              </article>
            </div>
            <el-empty v-else description="当前还没有小组协作操作日志。" />
          </el-card>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

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

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${bytes} B`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
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

function activityTagType(eventType: string) {
  if (eventType === 'attendance') {
    return 'success';
  }
  if (eventType === 'drive_upload') {
    return 'warning';
  }
  if (eventType === 'submission_reviewed') {
    return 'danger';
  }
  return 'info';
}

function operationTagType(eventType: string) {
  if (eventType.includes('deleted')) {
    return 'danger';
  }
  if (eventType.includes('reviewed')) {
    return 'warning';
  }
  if (eventType.includes('submitted')) {
    return 'success';
  }
  if (eventType.includes('draft')) {
    return 'info';
  }
  return 'primary';
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
.action-group,
.group-summary,
.recent-file-list,
.activity-feed {
  display: grid;
  gap: 10px;
}

.group-summary {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.group-summary-title,
.group-summary-note,
.member-name,
.table-note,
.section-note {
  margin: 0;
}

.group-summary-title,
.member-name {
  font-weight: 700;
}

.group-summary-note,
.table-note,
.section-note {
  color: var(--ls-muted);
  line-height: 1.7;
}

.table-note {
  margin-top: 4px;
  font-size: 12px;
}

.recent-file-block {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.recent-file-item {
  padding: 14px 0;
  border-bottom: 1px dashed var(--ls-border);
}

.recent-file-item:last-child {
  border-bottom: none;
}

.activity-item {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(67, 109, 185, 0.08);
}

.metric-value--small {
  font-size: 22px;
}
</style>
