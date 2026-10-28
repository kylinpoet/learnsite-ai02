<template>
  <div class="ls-stack ls-stack--md">
    <div class="collab-head">
      <div class="collab-head__copy">
        <p class="ls-card__title">小组与共享文件</p>
        <p class="ls-card__sub">
          本班 {{ overview?.class.student_count || 0 }} 名学生 · {{ overview?.class.group_count || 0 }} 个小组 · 共享文件
          {{ overview?.class.shared_file_count || 0 }} 个
        </p>
      </div>
      <div class="ls-chip-row">
        <n-tag round size="small">已签到 {{ overview?.class.checked_in_count || 0 }}</n-tag>
        <n-button :loading="loading" secondary size="small" @click="loadOverview">刷新</n-button>
        <n-button :disabled="!classId" size="small" type="primary" @click="openManager">分组维护</n-button>
      </div>
    </div>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="loading" class="collab-grid">
      <div v-for="index in 2" :key="index" class="ls-card">
        <n-skeleton :rows="6" animated />
      </div>
    </div>

    <n-empty
      v-else-if="overview && !overview.groups.length"
      description="当前班级还没有建立小组，点「分组维护」可以一键按人数分组"
    />

    <div v-else-if="overview" class="collab-grid">
      <article v-for="group in overview.groups" :key="group.id" class="ls-card collab-card">
        <header class="collab-card__head">
          <div class="collab-card__title">
            <p class="ls-card__title">{{ group.name }}</p>
            <p class="ls-card__sub">
              第 {{ group.group_no }} 组
              <span v-if="group.leader_name"> · 组长 {{ group.leader_name }}</span>
            </p>
          </div>
          <div class="ls-chip-row">
            <n-tag round size="small">{{ group.member_count }} 人</n-tag>
            <n-tag round size="small" type="success">到课 {{ group.checked_in_count }}</n-tag>
            <n-tag v-if="group.pending_count" round size="small" type="warning">未到 {{ group.pending_count }}</n-tag>
          </div>
        </header>

        <div class="member-strip">
          <span
            v-for="member in group.members"
            :key="member.user_id"
            :class="['member-chip', { 'is-signed': member.checked_in_today }]"
            :title="`${member.student_no} · ${member.seat_label || '未绑定座位'} · ${
              member.checked_in_today ? `签到 ${formatDateTime(member.checked_in_at)}` : '未签到'
            }`"
          >
            <span class="member-chip__dot" />
            {{ member.display_name }}
          </span>
        </div>

        <section class="drive-block">
          <div class="block-head">
            <div>
              <p class="block-title">{{ group.shared_drive.display_name }}</p>
              <p class="ls-card__sub">
                已用 {{ formatBytes(group.shared_drive.used_bytes) }} / {{ group.shared_drive.quota_mb }} MB ·
                {{ group.shared_drive.file_count }} 个文件
              </p>
            </div>
            <input
              :id="uploadInputId(group.id)"
              hidden
              multiple
              type="file"
              @change="handleUploadChange(group, $event)"
            />
            <n-button
              :disabled="uploadingGroupId !== null && uploadingGroupId !== group.id"
              :loading="uploadingGroupId === group.id"
              secondary
              size="tiny"
              @click="openUploadPicker(group.id)"
            >
              上传
            </n-button>
          </div>

          <n-progress
            :percentage="Math.min(group.shared_drive.usage_percent, 100)"
            :show-indicator="false"
            :stroke-width="6"
            status="success"
          />

          <div v-if="group.shared_drive.files.length" class="file-list">
            <div v-for="file in group.shared_drive.files.slice(0, 4)" :key="file.id" class="file-row">
              <span class="file-row__name" :title="file.name">{{ file.name }}</span>
              <span class="file-row__meta">{{ file.size_kb }} KB · {{ formatDateTime(file.updated_at) }}</span>
              <n-button
                :loading="downloadingFileId === file.id"
                size="tiny"
                text
                type="primary"
                @click="downloadFile(file)"
              >
                下载
              </n-button>
            </div>
          </div>
          <p v-else class="ls-empty">这个小组还没有共享文件</p>
          <p class="limit-note">{{ groupDriveLimitText(group.shared_drive.limits) }}</p>
        </section>

        <section class="feed-block">
          <div class="block-head">
            <p class="block-title">课堂动态</p>
            <n-tag round size="small" type="info">{{ group.activity_feed.length }} 条</n-tag>
          </div>
          <ul v-if="group.activity_feed.length" class="feed-list">
            <li v-for="event in group.activity_feed.slice(0, 3)" :key="event.id" class="feed-row">
              <n-tag round size="tiny" :type="activityTagType(event.event_type)">{{ event.event_label }}</n-tag>
              <span class="feed-row__title" :title="event.description">{{ event.title }}</span>
              <span class="feed-row__meta">{{ formatDateTime(event.occurred_at) }}</span>
            </li>
          </ul>
          <p v-else class="ls-empty">还没有课堂动态</p>
        </section>
      </article>
    </div>

    <n-drawer v-model:show="managerVisible" display-directive="if" placement="right" width="76%">
      <n-drawer-content :native-scrollbar="false" closable>
        <div class="manager-shell">
          <header class="manager-head">
            <div>
              <p class="ls-label">分组维护</p>
              <p class="ls-card__title">{{ manager?.class.class_name || '当前班级' }}</p>
              <p class="ls-card__sub">
                支持一键按组数重组，也支持手动调整成员与组长。保存后学生端小组页会同步更新。
              </p>
            </div>
            <div class="ls-chip-row">
              <n-tag round size="small">{{ manager?.class.student_count || editableStudents.length }} 名学生</n-tag>
              <n-tag round size="small" type="warning">未分组 {{ unassignedStudents.length }}</n-tag>
            </div>
          </header>

          <n-alert v-if="managerError" :closable="false" :title="managerError" type="error" />

          <n-skeleton v-if="managerLoading" :rows="10" animated />

          <template v-else-if="manager">
            <section class="ls-card">
              <div class="ls-card__head">
                <div>
                  <p class="ls-card__title">一键重组</p>
                  <p class="ls-card__sub">按人数均分全班学生；已有共享文件会保留在原小组空间，不会自动删除。</p>
                </div>
                <div class="ls-chip-row">
                  <span class="ls-label">目标小组数</span>
                  <n-input-number
                    v-model:value="rebuildGroupCount"
                    :max="Math.max(editableStudents.length, 1)"
                    :min="1"
                    size="small"
                    style="width: 96px"
                  />
                  <n-button :loading="rebuilding" size="small" type="warning" @click="rebuildGroups">
                    一键重组
                  </n-button>
                  <n-button :loading="managerCreating" secondary size="small" @click="createGroup">新增小组</n-button>
                  <n-button :loading="managerSaving" size="small" type="primary" @click="saveManagement">保存分组</n-button>
                </div>
              </div>
            </section>

            <section class="ls-card">
              <div class="ls-card__head">
                <div>
                  <p class="ls-card__title">追溯记录</p>
                  <p class="ls-card__sub">按时间汇总本班小组操作，可回看是谁做了哪次调整。</p>
                </div>
                <div class="ls-chip-row">
                  <n-tag round size="small" type="warning">{{ logTotal }} 条</n-tag>
                  <n-button :loading="logExporting" secondary size="small" @click="exportLogs">导出 CSV</n-button>
                </div>
              </div>

              <div class="log-filter-row">
                <n-select
                  v-model:value="logFilters.group_id"
                  :options="logGroupOptions"
                  clearable
                  placeholder="全部小组"
                  size="small"
                />
                <n-select
                  :options="eventOptions"
                  :value="logFilters.event_type || null"
                  clearable
                  placeholder="全部事件"
                  size="small"
                  @update:value="(value: string | null) => (logFilters.event_type = value ?? '')"
                />
                <n-select
                  v-model:value="logFilters.actor_user_id"
                  :options="logActorOptions"
                  clearable
                  filterable
                  placeholder="全部成员"
                  size="small"
                />
                <n-input
                  v-model:value="logFilters.keyword"
                  clearable
                  placeholder="搜索标题、任务、文件"
                  size="small"
                  @keyup.enter="loadLogs"
                />
                <div class="ls-chip-row">
                  <n-button :loading="logLoading" secondary size="small" @click="loadLogs">筛选</n-button>
                  <n-button secondary size="small" @click="resetLogFilters">重置</n-button>
                </div>
              </div>

              <div v-if="logs.length" class="log-list ls-scroll">
                <div v-for="log in logs" :key="log.id" class="log-row">
                  <n-tag round size="tiny" :type="operationTagType(log.event_type)">{{ log.event_label }}</n-tag>
                  <span class="log-row__title" :title="log.description">{{ log.title }}</span>
                  <span class="log-row__meta">
                    {{ formatDateTime(log.occurred_at) }}
                    <template v-if="log.group_name"> · {{ log.group_name }}</template>
                    <template v-if="log.actor_name"> · {{ log.actor_name }}</template>
                  </span>
                </div>
              </div>
              <p v-else class="ls-empty">{{ logLoading ? '正在加载小组操作日志' : '当前筛选条件下还没有记录' }}</p>
            </section>

            <div class="manager-grid">
              <section class="ls-card">
                <div class="ls-card__head">
                  <p class="ls-card__title">小组配置（{{ editableGroups.length }} 组）</p>
                  <p class="ls-card__sub">拖动学生卡片到目标小组即可换组。</p>
                </div>

                <div class="group-edit-grid">
                  <article
                    v-for="group in editableGroups"
                    :key="group.id"
                    :class="['group-edit', { 'is-drop-active': activeDropZoneKey === `group-${group.id}` }]"
                    @dragover="handleDragOver($event, `group-${group.id}`)"
                    @dragleave="handleDragLeave($event, `group-${group.id}`)"
                    @drop="handleDrop($event, group.id)"
                  >
                    <div class="group-edit__head">
                      <div>
                        <p class="group-edit__name">第 {{ group.group_no }} 组</p>
                        <p class="ls-card__sub">
                          {{ membersOf(group.id).length }} 人
                          <span v-if="group.has_shared_files"> · 共享文件 {{ group.file_count }} 个</span>
                        </p>
                      </div>
                      <n-button
                        :disabled="!canDeleteGroup(group)"
                        size="tiny"
                        text
                        type="error"
                        @click="deleteGroup(group)"
                      >
                        删除空组
                      </n-button>
                    </div>

                    <div class="group-edit__form">
                      <n-input v-model:value="group.name" :maxlength="80" placeholder="组名" size="small" />
                      <n-input
                        v-model:value="group.description"
                        :maxlength="500"
                        :rows="2"
                        placeholder="组内说明"
                        size="small"
                        type="textarea"
                      />
                      <n-select
                        :options="leaderOptions(group.id)"
                        :value="group.leader_user_id"
                        clearable
                        placeholder="先给这个组分配成员"
                        size="small"
                        @update:value="(value: number | null) => updateLeader(group.id, value)"
                      />
                    </div>

                    <div class="member-drop-list">
                      <span
                        v-for="member in membersOf(group.id)"
                        :key="member.user_id"
                        :class="[
                          'member-chip',
                          'is-draggable',
                          { 'is-leader': group.leader_user_id === member.user_id },
                        ]"
                        draggable="true"
                        @dragstart="handleDragStart(member, $event)"
                        @dragend="handleDragEnd"
                      >
                        {{ member.display_name }}
                      </span>
                      <span v-if="!membersOf(group.id).length" class="drop-empty">空组，拖一个学生到这里</span>
                    </div>
                  </article>
                </div>
              </section>

              <section class="ls-card">
                <div class="ls-card__head">
                  <p class="ls-card__title">成员分配</p>
                  <n-tag round size="small" :type="draggingStudent ? 'success' : 'default'">
                    {{ draggingStudent ? `拖拽中：${draggingStudent.display_name}` : '拖拽已启用' }}
                  </n-tag>
                </div>

                <div
                  :class="['unassigned-pool', { 'is-drop-active': activeDropZoneKey === 'unassigned' }]"
                  @dragover="handleDragOver($event, 'unassigned')"
                  @dragleave="handleDragLeave($event, 'unassigned')"
                  @drop="handleDrop($event, null)"
                >
                  <div class="ls-card__head">
                    <p class="ls-card__sub">未分组池（{{ unassignedStudents.length }} 人）</p>
                  </div>
                  <div v-if="unassignedStudents.length" class="member-drop-list">
                    <span
                      v-for="student in unassignedStudents"
                      :key="student.user_id"
                      class="member-chip is-draggable"
                      draggable="true"
                      @dragstart="handleDragStart(student, $event)"
                      @dragend="handleDragEnd"
                    >
                      {{ student.display_name }}
                    </span>
                  </div>
                  <p v-else class="ls-empty">所有学生都已分组</p>
                </div>

                <SaDataTable :data="sortedStudents" row-key="user_id" size="small" stripe>
                  <SaTableColumn label="学生" min-width="150">
                    <template #default="{ row }">
                      <p class="table-main">{{ row.display_name }}</p>
                      <p class="table-sub">{{ row.student_no }}</p>
                    </template>
                  </SaTableColumn>
                  <SaTableColumn label="座位 / 签到" min-width="170">
                    <template #default="{ row }">
                      <p class="table-sub">{{ row.seat_label || '未绑定座位' }}</p>
                      <p class="table-sub">{{ row.checked_in_today ? '已签到' : '未签到' }}</p>
                    </template>
                  </SaTableColumn>
                  <SaTableColumn label="调整到小组" min-width="180">
                    <template #default="{ row }">
                      <n-select
                        :options="groupOptions"
                        :value="row.target_group_id"
                        clearable
                        placeholder="暂不分组"
                        size="small"
                        @update:value="(value: number | null) => updateStudentGroup(row, value)"
                      />
                    </template>
                  </SaTableColumn>
                  <SaTableColumn label="身份" min-width="90">
                    <template #default="{ row }">
                      <n-tag
                        round
                        size="tiny"
                        :type="isStudentLeader(row) ? 'success' : row.target_group_id ? 'info' : 'warning'"
                      >
                        {{ isStudentLeader(row) ? '组长' : row.target_group_id ? '成员' : '未分组' }}
                      </n-tag>
                    </template>
                  </SaTableColumn>
                </SaDataTable>
              </section>
            </div>
          </template>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NInput,
  NInputNumber,
  NProgress,
  NSelect,
  NSkeleton,
  NTag,
} from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut, apiUpload } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useAuthStore } from '@/stores/auth';
import {
  activityTagType,
  formatBytes,
  formatDateTime,
  getDownloadFileName,
  groupDriveLimitText,
  operationTagType,
  triggerBrowserDownload,
  type EditableGroup,
  type EditableStudent,
  type GroupFile,
  type GroupManagementPayload,
  type GroupOperationLogItem,
  type GroupOperationLogQueryPayload,
  type GroupOverview,
  type GroupOverviewItem,
} from './groupPanelShared';

const props = defineProps<{ classId: number | null }>();

const authStore = useAuthStore();

const overview = ref<GroupOverview | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const uploadingGroupId = ref<number | null>(null);
const downloadingFileId = ref<number | null>(null);

const managerVisible = ref(false);
const manager = ref<GroupManagementPayload | null>(null);
const managerLoading = ref(false);
const managerError = ref('');
const managerSaving = ref(false);
const managerCreating = ref(false);
const rebuilding = ref(false);
const rebuildGroupCount = ref(1);
const editableGroups = ref<EditableGroup[]>([]);
const editableStudents = ref<EditableStudent[]>([]);

const logs = ref<GroupOperationLogItem[]>([]);
const logTotal = ref(0);
const logLoading = ref(false);
const logExporting = ref(false);
const logFilters = ref({
  group_id: null as number | null,
  event_type: '',
  actor_user_id: null as number | null,
  keyword: '',
});

const draggingStudentUserId = ref<number | null>(null);
const activeDropZoneKey = ref<string | null>(null);

const eventOptions = [
  { label: '全部事件', value: '' },
  { label: '新建小组', value: 'group_created' },
  { label: '保存分组', value: 'group_saved' },
  { label: '一键重组', value: 'group_rebuilt' },
  { label: '删除小组', value: 'group_deleted' },
  { label: '共享草稿同步', value: 'group_draft_synced' },
  { label: '共享草稿清空', value: 'group_draft_cleared' },
  { label: '小组正式提交', value: 'group_submission_submitted' },
  { label: '教师评阅', value: 'group_submission_reviewed' },
  { label: '学生上传文件', value: 'group_file_uploaded' },
  { label: '学生删除文件', value: 'group_file_deleted' },
  { label: '教师上传文件', value: 'teacher_group_file_uploaded' },
];

const unassignedStudents = computed(() => sortedStudents.value.filter((student) => student.target_group_id === null));
const sortedStudents = computed(() =>
  [...editableStudents.value].sort((left, right) => left.student_no.localeCompare(right.student_no, 'zh-CN')),
);
const draggingStudent = computed(
  () => editableStudents.value.find((student) => student.user_id === draggingStudentUserId.value) ?? null,
);
const groupOptions = computed(() =>
  editableGroups.value.map((group) => ({ label: `${group.name} · 第${group.group_no}组`, value: group.id })),
);
const logGroupOptions = computed(() =>
  editableGroups.value.map((group) => ({ label: `第 ${group.group_no} 组 / ${group.name}`, value: group.id })),
);
const logActorOptions = computed(() => {
  const optionMap = new Map<number, { label: string; value: number }>();
  const source = [...(manager.value?.operation_logs || []), ...logs.value];
  for (const item of source) {
    if (!item.actor_user_id || !item.actor_name) continue;
    const suffix = item.actor_student_no ? ` / ${item.actor_student_no}` : '';
    optionMap.set(item.actor_user_id, { label: `${item.actor_name}${suffix}`, value: item.actor_user_id });
  }
  return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
});

async function loadOverview() {
  if (!authStore.token || !props.classId) {
    overview.value = null;
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    overview.value = await apiGet<GroupOverview>(`/staff/classes/${props.classId}/groups`, authStore.token);
  } catch (error) {
    overview.value = null;
    errorMessage.value = error instanceof Error ? error.message : '加载班级小组失败';
  } finally {
    loading.value = false;
  }
}

function uploadInputId(groupId: number) {
  return `staff-group-upload-${groupId}`;
}

function openUploadPicker(groupId: number) {
  if (uploadingGroupId.value !== null) return;
  const input = document.getElementById(uploadInputId(groupId));
  if (input instanceof HTMLInputElement) input.click();
}

async function handleUploadChange(group: GroupOverviewItem, event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length || !authStore.token) return;

  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  uploadingGroupId.value = group.id;
  errorMessage.value = '';
  try {
    overview.value = await apiUpload<GroupOverview>(
      `/staff/groups/${group.id}/drive/files`,
      formData,
      authStore.token,
    );
    ElMessage.success(`已将 ${files.length} 个文件上传到 ${group.name}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '上传共享文件失败';
  } finally {
    uploadingGroupId.value = null;
  }
}

async function downloadFile(file: GroupFile) {
  if (!authStore.token) return;
  downloadingFileId.value = file.id;
  errorMessage.value = '';
  try {
    const response = await apiGetBlob(`/staff/drives/files/${file.id}`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '下载共享文件失败';
  } finally {
    downloadingFileId.value = null;
  }
}

function hydrateManager(payload: GroupManagementPayload) {
  manager.value = payload;
  logs.value = payload.operation_logs;
  logTotal.value = payload.operation_logs.length;
  editableGroups.value = payload.groups.map((group) => ({
    id: group.id,
    group_no: group.group_no,
    name: group.name,
    description: group.description || '',
    leader_user_id: group.leader_user_id,
    file_count: group.file_count,
    used_bytes: group.used_bytes,
    has_shared_files: group.has_shared_files,
  }));
  editableStudents.value = payload.students.map((student) => ({
    ...student,
    target_group_id: student.current_group_id,
  }));
  rebuildGroupCount.value =
    payload.groups.filter((group) => group.member_count > 0).length || payload.groups.length || 1;
  editableGroups.value.forEach((group) => ensureLeader(group.id));
}

async function loadManagement() {
  if (!authStore.token || !props.classId) return;
  managerLoading.value = true;
  managerError.value = '';
  try {
    hydrateManager(await apiGet<GroupManagementPayload>(`/staff/classes/${props.classId}/group-management`, authStore.token));
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '加载分组维护数据失败';
  } finally {
    managerLoading.value = false;
  }
}

function logQuery() {
  const searchParams = new URLSearchParams();
  if (logFilters.value.group_id !== null) searchParams.set('group_id', String(logFilters.value.group_id));
  if (logFilters.value.event_type) searchParams.set('event_type', logFilters.value.event_type);
  if (logFilters.value.actor_user_id !== null) searchParams.set('actor_user_id', String(logFilters.value.actor_user_id));
  if (logFilters.value.keyword.trim()) searchParams.set('keyword', logFilters.value.keyword.trim());
  return searchParams.toString();
}

async function loadLogs() {
  if (!authStore.token || !props.classId) return;
  logLoading.value = true;
  managerError.value = '';
  try {
    const suffix = logQuery();
    const payload = await apiGet<GroupOperationLogQueryPayload>(
      `/staff/classes/${props.classId}/group-operation-logs${suffix ? `?${suffix}` : ''}`,
      authStore.token,
    );
    logs.value = payload.items;
    logTotal.value = payload.total_count;
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '加载小组操作日志失败';
  } finally {
    logLoading.value = false;
  }
}

async function resetLogFilters() {
  logFilters.value = { group_id: null, event_type: '', actor_user_id: null, keyword: '' };
  await loadLogs();
}

async function exportLogs() {
  if (!authStore.token || !props.classId) return;
  logExporting.value = true;
  managerError.value = '';
  try {
    const suffix = logQuery();
    const response = await apiGetBlob(
      `/staff/classes/${props.classId}/group-operation-logs/export${suffix ? `?${suffix}` : ''}`,
      authStore.token,
    );
    const blob = await response.blob();
    triggerBrowserDownload(
      blob,
      getDownloadFileName(response.headers.get('content-disposition'), 'group-operation-logs.csv'),
    );
    ElMessage.success('小组操作日志已导出');
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '导出小组操作日志失败';
  } finally {
    logExporting.value = false;
  }
}

async function openManager() {
  managerVisible.value = true;
  await Promise.all([loadManagement(), loadLogs()]);
}

async function refreshAll() {
  await loadOverview();
  if (managerVisible.value) await Promise.all([loadManagement(), loadLogs()]);
}

function membersOf(groupId: number) {
  return [...editableStudents.value]
    .filter((student) => student.target_group_id === groupId)
    .sort((left, right) => left.student_no.localeCompare(right.student_no, 'zh-CN'));
}

function leaderOptions(groupId: number) {
  return membersOf(groupId).map((member) => ({
    label: `${member.display_name} · ${member.student_no}`,
    value: member.user_id,
  }));
}

function ensureLeader(groupId: number) {
  const group = editableGroups.value.find((item) => item.id === groupId);
  const members = membersOf(groupId);
  if (!group || !members.length) {
    if (group) group.leader_user_id = null;
    return;
  }
  if (!members.some((member) => member.user_id === group.leader_user_id)) {
    group.leader_user_id = members[0].user_id;
  }
}

function updateLeader(groupId: number, value: number | null) {
  const group = editableGroups.value.find((item) => item.id === groupId);
  if (group) group.leader_user_id = value;
}

function updateStudentGroup(student: EditableStudent, value: number | null) {
  const previous = student.target_group_id;
  student.target_group_id = value;
  if (previous) ensureLeader(previous);
  if (value) ensureLeader(value);
}

function isStudentLeader(student: EditableStudent) {
  const group = editableGroups.value.find((item) => item.id === student.target_group_id);
  return group?.leader_user_id === student.user_id;
}

function canDeleteGroup(group: EditableGroup) {
  return membersOf(group.id).length === 0 && !group.has_shared_files && !managerSaving.value;
}

function handleDragStart(student: EditableStudent, event: DragEvent) {
  draggingStudentUserId.value = student.user_id;
  event.dataTransfer?.setData('text/plain', String(student.user_id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
  draggingStudentUserId.value = null;
  activeDropZoneKey.value = null;
}

function handleDragOver(event: DragEvent, zoneKey: string) {
  event.preventDefault();
  activeDropZoneKey.value = zoneKey;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event: DragEvent, zoneKey: string) {
  if (activeDropZoneKey.value === zoneKey) activeDropZoneKey.value = null;
}

function handleDrop(event: DragEvent, groupId: number | null) {
  event.preventDefault();
  const student = draggingStudent.value;
  activeDropZoneKey.value = null;
  draggingStudentUserId.value = null;
  if (!student) return;
  updateStudentGroup(student, groupId);
}

async function createGroup() {
  if (!authStore.token || !props.classId) return;
  managerCreating.value = true;
  managerError.value = '';
  try {
    hydrateManager(await apiPost<GroupManagementPayload>(`/staff/classes/${props.classId}/groups`, {}, authStore.token));
    await loadOverview();
    ElMessage.success('已新增一个空小组');
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '新增小组失败';
  } finally {
    managerCreating.value = false;
  }
}

async function rebuildGroups() {
  if (!authStore.token || !props.classId || !editableStudents.value.length) return;
  const targetGroupCount = Math.max(1, Math.min(rebuildGroupCount.value, editableStudents.value.length));
  try {
    await ElMessageBox.confirm(
      `将按 ${targetGroupCount} 个小组重新分配当前班级所有学生。已有共享文件会保留在原小组空间中，是否继续？`,
      '一键重组',
      { type: 'warning', confirmButtonText: '继续重组', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  rebuilding.value = true;
  managerError.value = '';
  try {
    hydrateManager(
      await apiPost<GroupManagementPayload>(
        `/staff/classes/${props.classId}/groups/rebuild`,
        { group_count: targetGroupCount },
        authStore.token,
      ),
    );
    await Promise.all([loadOverview(), loadLogs()]);
    ElMessage.success('已完成一键重组');
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '一键重组失败';
  } finally {
    rebuilding.value = false;
  }
}

async function deleteGroup(group: EditableGroup) {
  if (!authStore.token || !canDeleteGroup(group)) return;
  try {
    await ElMessageBox.confirm(`确定删除“${group.name}”吗？只有空组且无共享文件的小组才能删除。`, '删除小组', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  managerError.value = '';
  try {
    hydrateManager(
      await apiDelete<GroupManagementPayload>(`/staff/groups/${group.id}`, authStore.token),
    );
    await Promise.all([loadOverview(), loadLogs()]);
    ElMessage.success('小组已删除');
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '删除小组失败';
  }
}

async function saveManagement() {
  if (!authStore.token || !props.classId) return;
  managerSaving.value = true;
  managerError.value = '';
  try {
    const groupsPayload = editableGroups.value.map((group) => {
      const members = membersOf(group.id);
      const leaderUserId =
        members.find((member) => member.user_id === group.leader_user_id)?.user_id ?? members[0]?.user_id ?? null;
      return {
        id: group.id,
        name: group.name.trim(),
        description: group.description.trim() || null,
        leader_user_id: leaderUserId,
        member_user_ids: members.map((member) => member.user_id),
      };
    });
    hydrateManager(
      await apiPut<GroupManagementPayload>(
        `/staff/classes/${props.classId}/group-management`,
        { groups: groupsPayload },
        authStore.token,
      ),
    );
    await Promise.all([loadOverview(), loadLogs()]);
    ElMessage.success('分组调整已保存');
  } catch (error) {
    managerError.value = error instanceof Error ? error.message : '保存分组失败';
  } finally {
    managerSaving.value = false;
  }
}

watch(
  () => props.classId,
  () => {
    void refreshAll();
  },
);

onMounted(() => {
  void loadOverview();
});

defineExpose({ refreshAll });
</script>

<style scoped>
.collab-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-md, 14px);
  background: var(--ls-panel-soft, var(--ls-surface));
}

.collab-head__copy {
  min-width: 0;
}

.collab-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--ls-gap-md, 12px);
}

.collab-card {
  gap: 10px;
}

.collab-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.collab-card__title {
  min-width: 0;
}

.member-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--ls-border);
  border-radius: 999px;
  background: var(--ls-chip-bg);
  color: var(--ls-text);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ls-muted);
  opacity: 0.45;
}

.member-chip.is-signed {
  border-color: var(--ls-primary);
  color: var(--ls-primary);
}

.member-chip.is-signed .member-chip__dot {
  background: var(--ls-primary);
  opacity: 1;
}

.member-chip.is-leader {
  border-color: var(--ls-accent, var(--ls-primary));
  box-shadow: inset 0 0 0 1px var(--ls-accent, var(--ls-primary));
}

.member-chip.is-draggable {
  cursor: grab;
}

.member-chip.is-draggable:active {
  cursor: grabbing;
}

.drive-block,
.feed-block {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--ls-border);
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.block-title {
  margin: 0;
  color: var(--ls-ink);
  font-size: 12.5px;
  font-weight: 700;
}

.file-list,
.feed-list,
.log-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.file-row,
.feed-row,
.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: var(--ls-text);
}

.file-row__name,
.feed-row__title,
.log-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row__meta,
.feed-row__meta,
.log-row__meta {
  flex: 0 0 auto;
  color: var(--ls-muted);
  font-size: 11.5px;
}

.limit-note {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11px;
}

.manager-shell {
  display: grid;
  gap: var(--ls-gap-md, 12px);
}

.manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.log-filter-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 8px;
  align-items: center;
}

.manager-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--ls-gap-md, 12px);
  align-items: start;
}

.group-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}

.group-edit {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px dashed var(--ls-border);
  border-radius: var(--ls-radius-sm, 10px);
  background: var(--ls-panel-soft, transparent);
}

.group-edit.is-drop-active,
.unassigned-pool.is-drop-active {
  border-color: var(--ls-primary);
  background: var(--ls-primary-soft);
}

.group-edit__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.group-edit__name {
  margin: 0;
  color: var(--ls-ink);
  font-size: 12.5px;
  font-weight: 700;
}

.group-edit__form {
  display: grid;
  gap: 6px;
}

.member-drop-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 28px;
}

.drop-empty {
  color: var(--ls-muted);
  font-size: 11.5px;
}

.unassigned-pool {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px dashed var(--ls-accent, var(--ls-border));
  border-radius: var(--ls-radius-sm, 10px);
}

.table-main {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.table-sub {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
}

@media (max-width: 1100px) {
  .collab-grid,
  .manager-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .log-filter-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
