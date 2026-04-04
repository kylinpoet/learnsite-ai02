<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">任务提交</p>
        <h2>{{ taskDetail?.title || `任务 ${route.params.taskId}` }}</h2>
        <p class="hero-copy">
          {{ taskDetail?.course.title || '正在加载课次信息' }}
          <span v-if="taskDetail"> · {{ taskDetail.course.unit_title }} · {{ taskDetail.course.lesson_title }}</span>
        </p>
      </div>
      <div class="action-group">
        <el-button plain @click="goToCourse">返回课程</el-button>
        <el-button plain @click="goToPeerReview">作品互评</el-button>
        <el-button v-if="currentSubmission" plain @click="goToWorkDetail">查看已提交作品</el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <el-alert
      v-if="taskDetail && submitBlockedMessage"
      :closable="false"
      :title="submitBlockedMessage"
      type="warning"
    />
    <el-alert
      v-if="taskDetail?.group_collaboration && !groupDiscussionEnabled && groupDiscussionMessage"
      :closable="false"
      :title="groupDiscussionMessage"
      type="warning"
    />

    <div v-if="taskDetail" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">当前状态</p>
        <p class="metric-value metric-value--small">{{ submissionStatusLabel }}</p>
        <p class="metric-note">{{ submissionStatusNote }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">提交规则</p>
        <p class="metric-value metric-value--small">直接提交即保存</p>
        <p class="metric-note">教师评价前，可以再次提交覆盖作品。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">已保存附件</p>
        <p class="metric-value">{{ currentSubmission?.files.length || 0 }}</p>
        <p class="metric-note">
          {{ selectedFiles.length ? '本次选中的附件将替换当前附件。' : '不重新选附件时，会保留当前附件。' }}
        </p>
      </article>
      <article v-if="taskDetail.group_collaboration" class="mini-panel">
        <p class="metric-label">协作小组</p>
        <p class="metric-value metric-value--small">{{ taskDetail.group_collaboration.group_name }}</p>
        <p class="metric-note">
          {{ taskDetail.group_collaboration.member_count }} 人 · 我当前是{{ groupRoleLabel(taskDetail.group_collaboration.my_role) }}
        </p>
      </article>
    </div>

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="10" />
        </el-card>
      </template>

      <template #default>
        <div v-if="taskDetail" class="page-stack">
          <el-row :gutter="16">
            <el-col :lg="15" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="info-row">
                    <span>任务说明</span>
                    <el-tag round>{{ taskTypeLabel(taskDetail.task_type) }}</el-tag>
                  </div>
                </template>

                <div class="description-block">
                  <RichTextContent :html="taskDetail.description" empty-text="当前任务还没有补充说明。" />
                </div>

                <el-divider />

                <div class="submission-form">
                  <div class="section-head">
                    <h3>作品说明</h3>
                    <span>支持富文本排版，提交后即保存，教师评价前可再次提交。</span>
                  </div>
                  <div class="submission-editor">
                    <RichTextEditor
                      v-model="submissionNote"
                      :min-height="260"
                    placeholder="写下你的设计思路、步骤说明、图片说明或补充内容。支持标题、列表、加粗、链接和图片。"
                    />
                  </div>

                  <div class="section-head section-head--compact">
                    <h3>作品附件</h3>
                    <span>支持多文件。重新选择附件后，本次提交会替换当前已保存附件。</span>
                  </div>

                  <input
                    ref="fileInputRef"
                    class="file-input"
                    multiple
                    type="file"
                    @change="handleFileChange"
                  />

                  <div class="action-group">
                    <el-button :disabled="!taskDetail.can_submit" plain @click="openFilePicker">
                      选择附件
                    </el-button>
                    <el-button
                      v-if="selectedFiles.length"
                      :disabled="isSubmitting"
                      plain
                      @click="clearSelectedFiles"
                    >
                      清空本次选择
                    </el-button>
                  </div>

                  <el-alert
                    v-if="!taskDetail.can_submit"
                    :closable="false"
                    title="这份作业已经完成教师评价，不能再次提交。"
                    type="warning"
                  />

                  <div class="stack-list">
                    <article v-for="file in selectedFiles" :key="selectedFileKey(file)" class="file-item">
                      <div>
                        <p class="file-name">{{ file.name }}</p>
                        <p class="file-meta">{{ formatFileSize(file.size) }} · 本次提交附件</p>
                      </div>
                      <el-button link type="danger" @click="removeSelectedFile(file.name)">
                        移除
                      </el-button>
                    </article>

                    <article
                      v-for="file in displayedCurrentFiles"
                      :key="`saved-${file.id}`"
                      class="file-item"
                    >
                      <div>
                        <p class="file-name">{{ file.name }}</p>
                        <p class="file-meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB · 已保存</p>
                        </div>
                        <div class="file-actions">
                          <el-tag round type="info">{{ file.role }}</el-tag>
                          <el-button
                            :loading="downloadLoadingFileId === file.id"
                            link
                            type="primary"
                            @click="downloadSavedFile(file)"
                          >
                            下载
                          </el-button>
                        </div>
                      </article>

                    <el-empty
                      v-if="!selectedFiles.length && !displayedCurrentFiles.length"
                      description="还没有上传附件"
                    />
                  </div>
                </div>
              </el-card>
            </el-col>

            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>提交信息</template>

                <el-descriptions :column="1" border>
                  <el-descriptions-item label="课程">{{ taskDetail.course.title }}</el-descriptions-item>
                  <el-descriptions-item label="发布时间">
                    {{ formatDate(taskDetail.course.assigned_date) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="最近提交">
                    {{ formatDateTime(currentSubmission?.updated_at || null) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="提交方式">
                    {{ taskDetail.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
                  </el-descriptions-item>
                  <el-descriptions-item v-if="currentSubmission?.submission_scope === 'group'" label="最近提交人">
                    {{ currentSubmission?.submitted_by_name || '组内成员' }}
                  </el-descriptions-item>
                </el-descriptions>

                <div class="tip-panel">
                  <p class="tip-title">本页规则</p>
                  <p>1. 不再保存草稿，点击提交就是正式保存。</p>
                  <p>2. {{ taskDetail.submission_scope === 'group' ? '当前任务按小组共同提交，组内成员看到的是同一份作品。' : '当前任务按个人独立提交。' }}</p>
                  <p>3. 若本次不重新选择附件，将保留当前已保存附件。</p>
                  <p v-if="taskDetail.submission_scope === 'group'">4. 可先同步共享草稿共同编辑作品说明，再由任一成员正式提交附件与最终版本。</p>
                </div>

                <el-button
                  :disabled="!taskDetail.can_submit"
                  :loading="isSubmitting"
                  class="submit-button"
                  type="primary"
                  @click="submitTask"
                >
                  {{ submitButtonText }}
                </el-button>
              </el-card>

              <el-card v-if="taskDetail.group_collaboration" class="soft-card">
                <template #header>小组共同编辑</template>

                <div class="tip-panel">
                  <p class="tip-title">共享草稿</p>
                  <p>{{ groupDraftSummary }}</p>
                  <p>{{ groupDraftMeta }}</p>
                  <p>当前只同步作品说明；附件仍需由任一组员在正式提交时上传。</p>
                </div>

                <div class="file-actions">
                  <el-tag round type="info">
                    {{ currentGroupDraft ? `版本 ${currentGroupDraft.version_no}` : '未同步' }}
                  </el-tag>
                  <el-tag v-if="currentGroupDraft?.updated_by_name" round type="success">
                    {{ currentGroupDraft.updated_by_name }}
                  </el-tag>
                </div>

                <div class="page-stack page-stack--compact">
                  <el-button
                    :disabled="!groupDraftActionsEnabled"
                    :loading="isGroupDraftSaving"
                    plain
                    type="primary"
                    @click="saveGroupDraft"
                  >
                    同步到小组草稿
                  </el-button>
                  <el-button :disabled="!currentGroupDraft" plain @click="applyGroupDraft">
                    恢复小组草稿
                  </el-button>
                  <el-button :loading="isRefreshingTask" plain @click="refreshTaskDetail">
                    刷新协作内容
                  </el-button>
                  <el-button plain @click="isGroupDraftHistoryVisible = true">
                    历史版本
                  </el-button>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <RecommendedWorksShowcase
            :items="taskDetail.recommended_showcase.items"
            :token="authStore.token || ''"
            description="教师评分为 G 级的作品会自动进入这里，便于同学参考优秀完成方式。"
            empty-description="当前课题还没有推荐作品"
            title="当前课题推荐作品展示"
          />

          <GroupDraftHistoryDialog
            v-if="taskDetail.group_collaboration"
            v-model="isGroupDraftHistoryVisible"
            :code-enabled="false"
            :task-id="taskDetail.id"
            :token="authStore.token || ''"
          />
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPut, apiUpload } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import GroupDraftHistoryDialog from '@/modules/student-task/components/GroupDraftHistoryDialog.vue';
import { useAuthStore } from '@/stores/auth';
import { normalizeRichTextHtml } from '@/utils/richText';

type TaskSubmissionFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
};

type TaskSubmission = {
  id: number;
  status: 'submitted' | 'reviewed';
  score: number | null;
  is_recommended: boolean;
  peer_review_score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  can_resubmit: boolean;
  submission_scope: 'individual' | 'group';
  group_id: number | null;
  group_name: string | null;
  group_no: number | null;
  submitted_by_name: string | null;
  submitted_by_student_no: string | null;
  files: TaskSubmissionFile[];
};

type RecommendedSubmissionFile = TaskSubmissionFile & {
  mime_type: string;
  previewable: boolean;
};

type RecommendedSubmissionItem = {
  submission_id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  files: RecommendedSubmissionFile[];
};

type GroupTaskDraft = {
  id: number;
  submission_note: string | null;
  source_code: string | null;
  version_no: number;
  updated_at: string | null;
  updated_by_name: string | null;
  updated_by_student_no: string | null;
};

type TaskDetailPayload = {
  id: number;
  title: string;
  task_type: string;
  submission_scope: 'individual' | 'group';
  description: string | null;
  is_required: boolean;
  course: {
    id: number;
    title: string;
    assigned_date: string;
    lesson_title: string;
    unit_title: string;
  };
  submission_policy: {
    direct_submit: boolean;
    allow_resubmit_until_reviewed: boolean;
    draft_enabled: boolean;
  };
  group_collaboration: {
    group_id: number;
    group_name: string;
    group_no: number;
    class_name: string | null;
    my_role: string | null;
    member_count: number;
    members: Array<{
      user_id: number;
      display_name: string;
      student_no: string;
      role: string;
    }>;
  } | null;
  group_draft: GroupTaskDraft | null;
  current_submission: TaskSubmission | null;
  recommended_showcase: {
    count: number;
    items: RecommendedSubmissionItem[];
  };
  can_submit: boolean;
  submit_blocked_message?: string;
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
    programming_control?: {
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

const taskDetail = ref<TaskDetailPayload | null>(null);
const submissionNote = ref('');
const selectedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isLoading = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const downloadLoadingFileId = ref<number | null>(null);
const isGroupDraftSaving = ref(false);
const isRefreshingTask = ref(false);
const isGroupDraftHistoryVisible = ref(false);

const currentSubmission = computed(() => taskDetail.value?.current_submission || null);
const currentGroupDraft = computed(() => taskDetail.value?.group_draft || null);
const submitBlockedMessage = computed(() => taskDetail.value?.submit_blocked_message || '');
const groupDiscussionCapability = computed(() => taskDetail.value?.classroom_capabilities?.group_discussion);
const groupDiscussionEnabled = computed(() => groupDiscussionCapability.value?.enabled ?? true);
const groupDiscussionMessage = computed(() => groupDiscussionCapability.value?.message || '');
const groupDraftActionsEnabled = computed(
  () => Boolean(taskDetail.value?.can_submit) && groupDiscussionEnabled.value
);
const displayedCurrentFiles = computed(() => {
  if (selectedFiles.value.length) {
    return [];
  }
  return currentSubmission.value?.files || [];
});
const submissionStatusLabel = computed(() => {
  if (!currentSubmission.value) {
    return '未提交';
  }
  return currentSubmission.value.status === 'reviewed' ? '已评价' : '待教师评价';
});
const submissionStatusNote = computed(() => {
  if (!currentSubmission.value) {
    return taskDetail.value?.submission_scope === 'group' ? '你的小组还没有提交这项任务。' : '你还没有提交这项任务。';
  }
  if (currentSubmission.value.status === 'reviewed') {
    return currentSubmission.value.submission_scope === 'group'
      ? '教师已经完成本组评价，本次提交入口会关闭。'
      : '教师已经完成评价，本次提交入口会关闭。';
  }
  return currentSubmission.value.submission_scope === 'group'
    ? '当前是小组共同提交作品，组内成员都可以再次提交覆盖。'
    : '当前作品还未评价，你可以再次提交覆盖。';
});
const submitButtonText = computed(() => {
  if (!taskDetail.value) return '提交作品';
  if (taskDetail.value.submission_scope === 'group') {
    return currentSubmission.value ? '再次提交小组作品' : '提交小组作品';
  }
  return currentSubmission.value ? '再次提交作品' : '提交作品';
});
const groupDraftSummary = computed(() => {
  if (!taskDetail.value?.group_collaboration) {
    return '当前任务不是小组协作任务。';
  }
  if (!currentGroupDraft.value) {
    return '组内还没有共享草稿，可以先同步作品说明再继续讨论附件分工。';
  }
  return currentGroupDraft.value.submission_note
    ? '当前编辑器可以恢复到最近一次共享草稿内容。'
    : '当前共享草稿中还没有作品说明内容。';
});
const groupDraftMeta = computed(() => {
  if (!currentGroupDraft.value) {
    return '刷新页面后会读取组内最近一次同步的共享草稿。';
  }
  return [
    currentGroupDraft.value.updated_by_name ? `最近同步人 ${currentGroupDraft.value.updated_by_name}` : '组内成员',
    currentGroupDraft.value.updated_at ? `同步时间 ${formatDateTime(currentGroupDraft.value.updated_at)}` : '暂无时间',
  ].join(' · ');
});

function pickInitialSubmissionNote(payload: TaskDetailPayload) {
  const submissionText = payload.current_submission?.submission_note || '';
  const draftText = payload.group_draft?.submission_note || '';
  if (!payload.group_collaboration || !payload.group_draft) {
    return submissionText;
  }
  if (!payload.current_submission) {
    return draftText || submissionText;
  }
  const draftTime = Date.parse(payload.group_draft.updated_at || '');
  const submissionTime = Date.parse(payload.current_submission.updated_at || '');
  if (!Number.isNaN(draftTime) && (Number.isNaN(submissionTime) || draftTime >= submissionTime)) {
    return draftText || submissionText;
  }
  return submissionText || draftText;
}

function hydrateTaskDetail(payload: TaskDetailPayload) {
  taskDetail.value = payload;
  submissionNote.value = pickInitialSubmissionNote(payload);
  selectedFiles.value = [];
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function taskTypeLabel(taskType: string) {
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读任务';
  }
  return taskType;
}

function groupRoleLabel(role: string | null | undefined) {
  if (role === 'leader') {
    return '组长';
  }
  if (role === 'member') {
    return '组员';
  }
  return '未分组成员';
}

function formatDate(value: string) {
  return value.split('-').join('.');
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function formatFileSize(size: number) {
  const sizeKb = Math.max(1, Math.ceil(size / 1024));
  return `${sizeKb} KB`;
}

function selectedFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFiles.value = Array.from(input.files || []);
}

function removeSelectedFile(fileName: string) {
  selectedFiles.value = selectedFiles.value.filter((file) => file.name !== fileName);
  if (!selectedFiles.value.length && fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function clearSelectedFiles() {
  selectedFiles.value = [];
  if (fileInputRef.value) {
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

  const basicMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
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

async function downloadSavedFile(file: TaskSubmissionFile) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }

  downloadLoadingFileId.value = file.id;
  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载附件失败');
  } finally {
    downloadLoadingFileId.value = null;
  }
}

async function loadTask() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiGet<TaskDetailPayload>(`/tasks/${route.params.taskId}`, authStore.token);
    hydrateTaskDetail(payload);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载任务详情失败';
  } finally {
    isLoading.value = false;
  }
}

function applyGroupDraft() {
  if (!currentGroupDraft.value) {
    return;
  }
  submissionNote.value = currentGroupDraft.value.submission_note || '';
  ElMessage.success('已恢复到小组共享草稿');
}

async function refreshTaskDetail() {
  isRefreshingTask.value = true;
  try {
    await loadTask();
    ElMessage.success('已刷新协作内容');
  } finally {
    isRefreshingTask.value = false;
  }
}

async function saveGroupDraft() {
  if (!taskDetail.value?.group_collaboration || !authStore.token) {
    return;
  }
  if (!groupDiscussionEnabled.value) {
    const message = groupDiscussionMessage.value || '课堂暂时关闭了小组讨论。';
    errorMessage.value = message;
    ElMessage.warning(message);
    return;
  }

  isGroupDraftSaving.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPut<GroupTaskDraft | null>(
      `/tasks/${taskDetail.value.id}/group-draft`,
      { submission_note: normalizeRichTextHtml(submissionNote.value), source_code: '' },
      authStore.token
    );
    if (taskDetail.value) {
      taskDetail.value.group_draft = payload;
    }
    ElMessage.success(payload ? '已同步到小组共享草稿' : '已清空小组共享草稿');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '同步小组草稿失败';
  } finally {
    isGroupDraftSaving.value = false;
  }
}

async function submitTask() {
  if (!taskDetail.value || !authStore.token) {
    return;
  }
  if (!taskDetail.value.can_submit) {
    const message = submitBlockedMessage.value || '当前任务暂不可提交。';
    errorMessage.value = message;
    ElMessage.warning(message);
    return;
  }

  const hadSubmission = Boolean(currentSubmission.value);
  const formData = new FormData();
  formData.append('submission_note', normalizeRichTextHtml(submissionNote.value));
  selectedFiles.value.forEach((file) => {
    formData.append('files', file);
  });

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiUpload<TaskDetailPayload>(
      `/tasks/${taskDetail.value.id}/submit`,
      formData,
      authStore.token
    );
    hydrateTaskDetail(payload);
    ElMessage.success(
      taskDetail.value.submission_scope === 'group'
        ? hadSubmission
          ? '小组作品已更新提交'
          : '小组作品提交成功'
        : hadSubmission
          ? '作品已更新提交'
          : '作品提交成功'
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '提交作品失败';
  } finally {
    isSubmitting.value = false;
  }
}

async function goToCourse() {
  const courseId = taskDetail.value?.course.id || route.params.courseId;
  await router.push(`/student/courses/${courseId}`);
}

async function goToWorkDetail() {
  if (!currentSubmission.value) {
    return;
  }
  await router.push(`/student/work/${currentSubmission.value.id}`);
}

async function goToPeerReview() {
  await router.push(`/student/reviews/${route.params.taskId}`);
}

onMounted(loadTask);
</script>

<style scoped>
.action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.description-block p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.8;
}

.description-block {
  min-height: 140px;
}

.submission-form {
  display: grid;
  gap: 20px;
}

.submission-editor {
  margin-bottom: 8px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
}

.section-head h3 {
  margin: 0;
}

.section-head span {
  color: var(--ls-muted);
  font-size: 13px;
}

.section-head--compact {
  margin-top: 4px;
}

.file-input {
  display: none;
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

.file-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.file-name,
.file-meta {
  margin: 0;
}

.file-name {
  font-weight: 600;
}

.file-meta {
  margin-top: 4px;
  color: var(--ls-muted);
  font-size: 12px;
}

.tip-panel {
  margin-top: 20px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.tip-panel p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.8;
}

.tip-title {
  margin-bottom: 8px;
  color: var(--ls-ink) !important;
  font-weight: 700;
}

.submit-button {
  width: 100%;
  margin-top: 20px;
}

.metric-value--small {
  font-size: 22px;
}
</style>
