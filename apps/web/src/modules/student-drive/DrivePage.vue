<template>
  <div class="sw-drive">
    <StudentPageHead title="网盘" :sub="headSub">
      <template #actions>
        <n-button :disabled="!canUseCurrentSpace || isUploading" type="primary" @click="openFilePicker">
          上传文件
        </n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="currentSpace" class="sw-progress">
      <span class="sw-progress__track">
        <span class="sw-progress__fill" :style="{ width: `${usagePercent}%` }" />
      </span>
      <span class="sw-progress__label">
        {{ currentSpace.usage_percent }}% · 剩余 {{ formatBytes(currentSpace.remaining_bytes) }}
      </span>
    </div>

    <n-tabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
      <n-tab-pane name="personal" tab="我的网盘" />
      <n-tab-pane name="group" tab="小组网盘" />
    </n-tabs>

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="8" animated />
      </div>
    </div>

    <template v-else-if="currentSpace">
      <StudentPanel
        :title="isGroupTab ? '小组文件' : '我的文件'"
        :count="`${currentSpace.file_count} 个`"
        flush
      >
        <input ref="fileInputRef" class="file-input" multiple type="file" @change="handleFileChange" />

        <div v-if="selectedFiles.length" class="sw-upload-bar">
          <div class="sw-upload-bar__main">
            <p class="sw-upload-bar__title">
              待上传 {{ selectedFiles.length }} 个文件 · {{ formatBytes(selectedTotalBytes) }}
            </p>
            <p class="sw-upload-bar__files">
              <button
                v-for="file in selectedFiles"
                :key="selectedFileKey(file)"
                type="button"
                :title="`移除 ${file.name}`"
                class="sw-chip sw-upload-bar__file"
                @click="removeSelectedFile(file.name)"
              >
                {{ file.name }}
              </button>
            </p>
          </div>
          <div class="sw-upload-bar__actions">
            <n-button :disabled="isUploading" size="small" @click="clearSelectedFiles">清空</n-button>
            <n-button :loading="isUploading" size="small" type="primary" @click="uploadSelectedFiles">
              开始上传
            </n-button>
          </div>
        </div>

        <SaDataTable
          :data="currentSpace.files"
          :scroll-x="880"
          row-key="id"
        >
          <template #empty>
            <StudentEmpty class="sw-drive-empty" :text="currentEmptyDescription" />
          </template>
          <SaTableColumn label="文件名" min-width="260">
            <template #default="{ row }">
              <span class="sw-row__title">{{ row.name }}</span>
              <span class="sw-row__meta">
                <span>{{ row.uploaded_by_name || '未知成员' }} 上传</span>
                <span v-if="isCurrentUserUploader(row)">我上传的</span>
                <span v-if="row.original_name !== row.name">原名 {{ row.original_name }}</span>
              </span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="大小" width="110">
            <template #default="{ row }">
              <span class="sw-num">{{ formatBytes(row.size_bytes) }}</span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="更新时间" width="150">
            <template #default="{ row }">
              <span class="sw-num">{{ formatDateTime(row.updated_at) }}</span>
            </template>
          </SaTableColumn>
          <SaTableColumn fixed="right" label="操作" width="140">
            <template #default="{ row }">
              <n-space :size="12" :wrap="false">
                <n-button
                  :loading="downloadingFileId === row.id"
                  :disabled="downloadingFileId !== null && downloadingFileId !== row.id"
                  text
                  @click="downloadFile(row)"
                >
                  下载
                </n-button>
                <n-button
                  :disabled="!row.can_delete"
                  :loading="deletingFileId === row.id"
                  text
                  @click="deleteFile(row)"
                >
                  删除
                </n-button>
              </n-space>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </StudentPanel>
    </template>

    <StudentPanel v-else :title="isGroupTab ? '小组网盘' : '个人网盘'">
      <StudentEmpty
        :text="
          currentSpaceDisabledMessage ||
          (isGroupTab ? '当前还没有可用的小组空间。' : '当前个人网盘暂不可用，请稍后重试。')
        "
      />
      <div class="action-group">
        <n-button v-if="isGroupTab" @click="goToGroups">前往小组页</n-button>
        <n-button v-else @click="loadDrive">刷新状态</n-button>
      </div>
    </StudentPanel>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton, NSpace, NTabPane, NTabs } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiUpload } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';

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

const usagePercent = computed(() => Math.min(currentSpace.value?.usage_percent ?? 0, 100));

const groupPermissionText = computed(() =>
  groupSpace.value?.my_role === 'leader' ? '组长可删除全部文件' : '仅可删除自己上传的文件'
);

const headSub = computed(() => {
  const space = currentSpace.value;
  if (!space) {
    return isGroupTab.value ? '小组空间 · 暂不可用' : '个人空间 · 暂不可用';
  }
  const scope = isGroupTab.value ? groupSpace.value?.group_name || '小组空间' : '个人空间';
  const parts = [scope, `已用 ${formatBytes(space.used_bytes)} / ${space.quota_mb} MB`, `${space.file_count} 个文件`];
  if (isGroupTab.value) {
    parts.push(groupPermissionText.value);
  }
  return parts.join(' · ');
});

const selectedTotalBytes = computed(() =>
  selectedFiles.value.reduce((total, file) => total + file.size, 0)
);

const currentEmptyDescription = computed(() =>
  isGroupTab.value ? '小组网盘还是空的，先上传一份协作资料。' : '个人网盘还是空的，先上传一个文件。'
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

function handleTabChange(value: string) {
  activeTab.value = value === 'group' ? 'group' : 'personal';
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
.sw-drive {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-drive :deep(.n-tabs-nav) {
  margin-bottom: 0;
}

.sw-num {
  font-variant-numeric: tabular-nums;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.file-input {
  display: none;
}

/* 待上传：表上方一行提示条 */
.sw-upload-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 18px;
  border-bottom: 1px solid var(--sw-line-soft);
  background: var(--sw-surface);
}

.sw-upload-bar__main {
  min-width: 0;
}

.sw-upload-bar__title {
  margin: 0;
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.sw-upload-bar__files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 0;
}

.sw-upload-bar__file {
  display: inline-block;
  max-width: 210px;
  height: 20px;
  padding: 0 8px;
  overflow: hidden;
  border: 0;
  color: var(--sw-text);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.sw-upload-bar__file:hover {
  background: var(--sw-surface-3);
  color: var(--sw-ink);
}

.sw-upload-bar__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

@media (max-width: 720px) {
  .sw-upload-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .sw-upload-bar__actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
