<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">学生网盘</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">{{ heroCopy }}</p>
      </div>
      <div class="action-group">
        <el-button :loading="isLoading" type="primary" @click="loadDrive">刷新网盘</el-button>
        <el-button :disabled="!canUseCurrentSpace" plain @click="openFilePicker">选择文件</el-button>
        <el-button
          v-if="selectedFiles.length"
          :disabled="!canUseCurrentSpace"
          :loading="isUploading"
          type="success"
          @click="uploadSelectedFiles"
        >
          {{ currentUploadLabel }}
        </el-button>
        <el-button v-if="selectedFiles.length" :disabled="isUploading" plain @click="clearSelectedFiles">
          清空选择
        </el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="我的网盘" name="personal" />
      <el-tab-pane label="小组网盘" name="group" />
    </el-tabs>

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="8" />
        </el-card>
      </template>

      <template #default>
        <div v-if="currentSpace && canUseCurrentSpace" class="page-stack">
          <div class="metric-grid">
            <article class="mini-panel">
              <p class="metric-label">文件总数</p>
              <p class="metric-value">{{ currentSpace.file_count }}</p>
              <p class="metric-note">当前空间中已经保存的文件数量。</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">已用空间</p>
              <p class="metric-value metric-value--small">{{ formatBytes(currentSpace.used_bytes) }}</p>
              <p class="metric-note">剩余 {{ formatBytes(currentSpace.remaining_bytes) }}</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">总容量</p>
              <p class="metric-value metric-value--small">{{ currentSpace.quota_mb }} MB</p>
              <p class="metric-note">当前按系统默认空间额度管理。</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">使用率</p>
              <p class="metric-value metric-value--small">{{ currentSpace.usage_percent }}%</p>
              <p class="metric-note">空间紧张时可删除旧文件释放容量。</p>
            </article>
            <article v-if="isGroupTab && groupSpace?.enabled" class="mini-panel">
              <p class="metric-label">小组成员</p>
              <p class="metric-value">{{ groupSpace.member_count }}</p>
              <p class="metric-note">{{ roleLabel(groupSpace.my_role) }} · {{ groupSpace.class_name || '当前班级' }}</p>
            </article>
            <article v-if="isGroupTab && groupSpace?.enabled" class="mini-panel">
              <p class="metric-label">删除权限</p>
              <p class="metric-value metric-value--small">{{ groupDeleteRoleLabel }}</p>
              <p class="metric-note">{{ groupDeleteRuleText }}</p>
            </article>
          </div>

          <el-card class="soft-card">
            <template #header>
              <div class="info-row">
                <span>空间使用情况</span>
                <el-tag round :type="isGroupTab ? 'warning' : 'success'">
                  {{ currentSpace.display_name }}
                </el-tag>
              </div>
            </template>

            <el-progress
              :percentage="Math.min(currentSpace.usage_percent, 100)"
              :stroke-width="18"
              status="success"
            />
            <p class="section-note">
              已用 {{ formatBytes(currentSpace.used_bytes) }} / 总容量 {{ currentSpace.quota_mb }} MB
            </p>
            <p class="section-note" v-if="isGroupTab && groupSpace?.enabled">
              当前由 {{ groupSpace.member_count }} 位组员共享，适合放置过程稿、参考资料和协作文档。
            </p>
          </el-card>

          <el-card class="soft-card">
            <template #header>
              <div class="toolbar-row">
                <div>
                  <span>文件列表</span>
                  <p class="section-note">{{ currentSpaceNote }}</p>
                </div>
                <div class="action-group compact-actions">
                  <el-button :disabled="!canUseCurrentSpace" plain @click="openFilePicker">选择文件</el-button>
                  <el-button
                    v-if="selectedFiles.length"
                    :disabled="!canUseCurrentSpace"
                    :loading="isUploading"
                    type="primary"
                    @click="uploadSelectedFiles"
                  >
                    {{ currentUploadLabel }}
                  </el-button>
                </div>
              </div>
            </template>

            <input ref="fileInputRef" class="file-input" multiple type="file" @change="handleFileChange" />

            <div v-if="selectedFiles.length" class="selected-files-panel">
              <p class="selected-files-title">待上传文件</p>
              <div class="stack-list">
                <article v-for="file in selectedFiles" :key="selectedFileKey(file)" class="file-item">
                  <div>
                    <p class="file-name">{{ file.name }}</p>
                    <p class="file-meta">{{ formatBytes(file.size) }}</p>
                  </div>
                  <el-button link type="danger" @click="removeSelectedFile(file.name)">移除</el-button>
                </article>
              </div>
            </div>

            <el-empty v-if="!currentSpace.files.length" :description="currentEmptyDescription" />

            <el-table v-else :data="currentSpace.files" stripe>
              <el-table-column label="文件名" min-width="280">
                <template #default="{ row }">
                  <div>
                    <strong>{{ row.name }}</strong>
                    <p class="table-note">
                      {{ row.original_name !== row.name ? `原始文件名：${row.original_name}` : '已按当前名称保存' }}
                    </p>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="上传者" min-width="170">
                <template #default="{ row }">
                  <div>
                    <strong>{{ row.uploaded_by_name || '未知成员' }}</strong>
                    <p class="table-note">
                      {{ row.uploaded_by_student_no || '暂无学号' }}
                      <span v-if="isCurrentUserUploader(row)"> · 我上传的</span>
                    </p>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="类型" min-width="100">
                <template #default="{ row }">{{ row.ext.toUpperCase() }}</template>
              </el-table-column>
              <el-table-column label="大小" min-width="120">
                <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
              </el-table-column>
              <el-table-column label="更新时间" min-width="170">
                <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" min-width="210" fixed="right">
                <template #default="{ row }">
                  <div class="row-actions">
                    <el-space wrap>
                      <el-button
                        :loading="downloadingFileId === row.id"
                        link
                        type="primary"
                        @click="downloadFile(row)"
                      >
                        下载
                      </el-button>
                      <el-button
                        :disabled="!row.can_delete"
                        :loading="deletingFileId === row.id"
                        link
                        type="danger"
                        @click="deleteFile(row)"
                      >
                        删除
                      </el-button>
                    </el-space>
                    <p v-if="isGroupTab && !row.can_delete" class="action-note">仅上传者本人或组长可删除</p>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>

        <el-card v-else class="soft-card">
          <template #header>{{ isGroupTab ? '小组网盘' : '个人网盘' }}</template>
          <div class="group-placeholder">
            <p>
              {{
                currentSpaceDisabledMessage ||
                (isGroupTab ? '当前还没有可用的小组空间。' : '当前个人网盘暂不可用，请稍后重试。')
              }}
            </p>
            <el-button v-if="isGroupTab" plain @click="goToGroups">前往小组页</el-button>
            <el-button v-else plain @click="loadDrive">刷新状态</el-button>
          </div>
        </el-card>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type DriveFile = {
  id: number;
  name: string;
  original_name: string;
  ext: string;
  size_bytes: number;
  size_kb: number;
  updated_at: string | null;
  folder_path: string;
  uploaded_by_user_id: number | null;
  uploaded_by_name: string | null;
  uploaded_by_student_no: string | null;
  can_delete: boolean;
};

type PersonalDriveSpace = {
  id: number;
  owner_type: string;
  display_name: string;
  quota_mb: number;
  used_bytes: number;
  remaining_bytes: number;
  usage_percent: number;
  file_count: number;
  files: DriveFile[];
  enabled: boolean;
  message: string;
};

type GroupDriveSpace = {
  enabled: boolean;
  message: string;
  id: number | null;
  owner_type: string | null;
  display_name: string;
  quota_mb: number;
  used_bytes: number;
  remaining_bytes: number;
  usage_percent: number;
  file_count: number;
  files: DriveFile[];
  group_id: number | null;
  group_name: string | null;
  group_no: number | null;
  class_name: string | null;
  member_count: number;
  my_role: string | null;
};

type DrivePayload = {
  personal_space: PersonalDriveSpace;
  group_space: GroupDriveSpace;
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
    drive?: {
      enabled: boolean;
      message: string;
    };
    group_drive?: {
      enabled: boolean;
      message: string;
    };
    group_discussion?: {
      enabled: boolean;
      message: string;
    };
  };
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const driveData = ref<DrivePayload | null>(null);
const activeTab = ref<'personal' | 'group'>('personal');
const isLoading = ref(true);
const isUploading = ref(false);
const downloadingFileId = ref<number | null>(null);
const deletingFileId = ref<number | null>(null);
const errorMessage = ref('');
const selectedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isGroupTab = computed(() => activeTab.value === 'group');
const personalSpace = computed(() => driveData.value?.personal_space || null);
const groupSpace = computed(() => driveData.value?.group_space || null);
const currentSpace = computed<PersonalDriveSpace | GroupDriveSpace | null>(() => {
  if (isGroupTab.value) {
    return groupSpace.value?.enabled ? groupSpace.value : null;
  }
  return personalSpace.value?.enabled ? personalSpace.value : null;
});
const canUseCurrentSpace = computed(() => {
  if (isGroupTab.value) {
    return Boolean(groupSpace.value?.enabled);
  }
  return Boolean(personalSpace.value?.enabled);
});
const currentSpaceDisabledMessage = computed(() => {
  if (isGroupTab.value) {
    return groupSpace.value?.message || '';
  }
  return personalSpace.value?.message || '';
});

const pageTitle = computed(() => {
  if (currentSpace.value) {
    return currentSpace.value.display_name;
  }
  return isGroupTab.value ? '小组共享网盘' : '我的个人网盘';
});

const groupDeleteRoleLabel = computed(() => (groupSpace.value?.my_role === 'leader' ? '组长管理' : '仅可删除自己上传'));

const groupDeleteRuleText = computed(() => {
  if (!groupSpace.value?.enabled) {
    return '当前还没有可用的小组共享空间。';
  }
  if (groupSpace.value.my_role === 'leader') {
    return '你当前是组长，可以删除本组全部共享文件。';
  }
  return '你可以上传、下载，并删除自己上传的共享文件。';
});

const heroCopy = computed(() => {
  if (isGroupTab.value) {
    if (groupSpace.value?.enabled) {
      return `${groupSpace.value.group_name} · ${groupSpace.value.class_name}，当前组员共享同一份资料空间。${groupDeleteRuleText.value}`;
    }
    return '当前还没有可用的小组共享空间，可先去小组页查看分组信息。';
  }
  return '这里用于保存你的个人学习资料，支持上传、下载和删除自己的网盘文件。';
});

const currentUploadLabel = computed(() =>
  isGroupTab.value
    ? `上传到小组网盘${selectedFiles.value.length ? ` (${selectedFiles.value.length})` : ''}`
    : `上传到个人网盘${selectedFiles.value.length ? ` (${selectedFiles.value.length})` : ''}`
);

const currentSpaceNote = computed(() => {
  if (isGroupTab.value) {
    return `组员共享同一份文件列表。${groupDeleteRuleText.value}`;
  }
  return '支持上传、下载和删除。当前先不做文件夹层级。';
});

const currentEmptyDescription = computed(() =>
  isGroupTab.value ? '小组网盘还是空的，先上传一份协作资料吧。' : '个人网盘还是空的，先上传一个文件吧。'
);

function formatBytes(bytes: number) {
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
  return role || '未分配';
}

function selectedFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isCurrentUserUploader(file: DriveFile) {
  return Number(authStore.user?.id || 0) === file.uploaded_by_user_id;
}

function openFilePicker() {
  if (!canUseCurrentSpace.value) {
    if (currentSpaceDisabledMessage.value) {
      ElMessage.warning(currentSpaceDisabledMessage.value);
    }
    return;
  }
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFiles.value = Array.from(input.files || []);
}

function clearSelectedFiles() {
  selectedFiles.value = [];
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function removeSelectedFile(fileName: string) {
  selectedFiles.value = selectedFiles.value.filter((file) => file.name !== fileName);
  if (!selectedFiles.value.length && fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function getDownloadFileName(contentDisposition: string | null, fallbackName: string) {
  if (!contentDisposition) {
    return fallbackName;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallbackName;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

function syncTabFromRoute() {
  activeTab.value = route.query.tab === 'group' ? 'group' : 'personal';
}

function resolveDriveErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return '加载网盘失败';
  }
  if (error.message.trim() === 'Not Found') {
    return '当前后端尚未加载网盘接口，请重启本地 API 服务后再试。';
  }
  return error.message;
}

async function loadDrive() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  try {
    driveData.value = await apiGet<DrivePayload>('/drives/me', authStore.token);
  } catch (error) {
    errorMessage.value = resolveDriveErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
}

async function uploadSelectedFiles() {
  if (!authStore.token || !selectedFiles.value.length) {
    return;
  }
  if (!canUseCurrentSpace.value) {
    if (currentSpaceDisabledMessage.value) {
      ElMessage.warning(currentSpaceDisabledMessage.value);
    }
    return;
  }

  const formData = new FormData();
  selectedFiles.value.forEach((file) => {
    formData.append('files', file);
  });

  isUploading.value = true;
  errorMessage.value = '';
  try {
    const path = isGroupTab.value ? '/drives/group/files' : '/drives/me/files';
    driveData.value = await apiUpload<DrivePayload>(path, formData, authStore.token);
    clearSelectedFiles();
    ElMessage.success(isGroupTab.value ? '文件已上传到小组网盘' : '文件已上传到个人网盘');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '上传文件失败';
  } finally {
    isUploading.value = false;
  }
}

async function downloadFile(file: DriveFile) {
  if (!authStore.token) {
    return;
  }

  downloadingFileId.value = file.id;
  errorMessage.value = '';
  try {
    const response = await apiGetBlob(`/drives/files/${file.id}`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '下载文件失败';
  } finally {
    downloadingFileId.value = null;
  }
}

async function deleteFile(file: DriveFile) {
  if (!authStore.token || !file.can_delete) {
    return;
  }

  try {
    await ElMessageBox.confirm(`确定要删除“${file.name}”吗？删除后无法恢复。`, '删除网盘文件', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  deletingFileId.value = file.id;
  errorMessage.value = '';
  try {
    driveData.value = await apiDelete<DrivePayload>(`/drives/files/${file.id}`, authStore.token);
    ElMessage.success('文件已删除');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除文件失败';
  } finally {
    deletingFileId.value = null;
  }
}

function handleTabChange() {
  clearSelectedFiles();
  void router.replace({
    path: '/student/drive',
    query: activeTab.value === 'group' ? { tab: 'group' } : {},
  });
}

async function goToGroups() {
  await router.push('/student/groups');
}

watch(
  () => route.query.tab,
  () => {
    syncTabFromRoute();
  },
  { immediate: true }
);

onMounted(() => {
  void loadDrive();
});
</script>

<style scoped>
.action-group,
.toolbar-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-row {
  justify-content: space-between;
  align-items: center;
}

.compact-actions {
  justify-content: flex-end;
}

.section-note,
.table-note,
.group-placeholder p,
.action-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.selected-files-panel {
  margin-bottom: 18px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.selected-files-title,
.file-name,
.file-meta {
  margin: 0;
}

.selected-files-title {
  margin-bottom: 10px;
  font-weight: 700;
}

.file-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px dashed var(--ls-border);
}

.file-item:last-child {
  border-bottom: none;
}

.file-name {
  font-weight: 600;
}

.file-meta,
.table-note,
.action-note {
  margin-top: 4px;
  font-size: 12px;
}

.file-input {
  display: none;
}

.group-placeholder,
.row-actions {
  display: grid;
  gap: 14px;
}

.metric-value--small {
  font-size: 22px;
}

@media (max-width: 900px) {
  .toolbar-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .compact-actions {
    justify-content: flex-start;
  }

  .file-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
