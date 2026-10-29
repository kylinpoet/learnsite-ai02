<template>
  <div class="sw-detail">
    <StudentPageHead :title="detailData?.task.title || `作品 ${route.params.submissionId}`" :sub="headSub">
      <template #back>
        <button type="button" class="sw-back" @click="goBack">← 返回作品列表</button>
      </template>
      <template v-if="detailData" #actions>
        <n-button
          v-if="detailData.submission.can_resubmit"
          type="primary"
          @click="goToTask(detailData.course.id, detailData.task.id)"
        >
          再次提交
        </n-button>
        <n-button
          v-else-if="detailData.submission.status === 'reviewed'"
          :loading="isRevokingReview"
          @click="revokeReviewedSubmission"
        >
          撤销评阅
        </n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="detailData">
      <StudentStatStrip :items="statItems" />

      <div class="sw-split">
        <div class="sw-detail__main">
          <p class="sw-row__meta sw-detail__meta">
            <RouterLink class="sw-link" :to="`/student/courses/${detailData.course.id}`">
              {{ detailData.course.title }}
            </RouterLink>
            <span>{{ taskTypeLabel(detailData.task.task_type) }}</span>
            <span v-if="detailData.submission.submission_scope === 'group'">
              {{ groupDisplayLabel(detailData.submission) }}
            </span>
            <span v-if="detailData.submission.submitted_by_name">
              最近提交 {{ detailData.submission.submitted_by_name }}
            </span>
            <span>更新于 {{ formatDateTime(detailData.submission.updated_at) }}</span>
          </p>

          <StudentPanel title="作品说明">
            <div class="sw-detail__prose">
              <RichTextContent
                :html="detailData.submission.submission_note"
                empty-text="这次提交没有写作品说明。"
              />
            </div>
          </StudentPanel>

          <StudentPanel title="教师评语">
            <p v-if="detailData.submission.teacher_comment" class="sw-detail__text">
              {{ detailData.submission.teacher_comment }}
            </p>
            <StudentEmpty v-else text="教师还没有留下评语，评阅后会显示在这里。" />
          </StudentPanel>
        </div>

        <div class="sw-split__aside">
          <StudentPanel title="附件" :count="`${detailData.files.length} 个`" flush>
            <template v-if="detailData.files.length">
              <div v-for="file in detailData.files" :key="file.id" class="sw-row">
                <span class="sw-row__main">
                  <span class="sw-row__title">{{ file.name }}</span>
                  <span class="sw-row__meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB</span>
                </span>
                <span class="sw-row__action">
                  <n-button
                    :loading="downloadLoadingFileId === file.id"
                    text
                    @click="downloadFile(file)"
                  >
                    下载
                  </n-button>
                </span>
              </div>
            </template>
            <StudentEmpty v-else text="这次提交没有附件。" />
          </StudentPanel>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

type SubmissionFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
};

type DetailPayload = {
  submission: {
    id: number;
    status: 'submitted' | 'reviewed';
    score: number | null;
    peer_review_score: number | null;
    submitted_at: string | null;
    updated_at: string | null;
    submission_note: string | null;
    teacher_comment: string | null;
    can_resubmit: boolean;
    submission_scope: 'individual' | 'group';
    group_id: number | null;
    group_name: string | null;
    group_no: number | null;
    submitted_by_name: string | null;
  };
  course: {
    id: number;
    title: string;
    assigned_date: string;
  };
  task: {
    id: number;
    title: string;
    task_type: string;
    description: string | null;
  };
  files: SubmissionFile[];
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const detailData = ref<DetailPayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const downloadLoadingFileId = ref<number | null>(null);
const isRevokingReview = ref(false);

const headSub = computed(() => {
  const submission = detailData.value?.submission;
  if (!submission) {
    return '';
  }
  const submitted = submission.submitted_at
    ? `${formatDateTime(submission.submitted_at)} 提交`
    : '提交时间未记录';
  return `${submitted} · ${submissionScopeLabel(submission.submission_scope)}`;
});

const statItems = computed<StudentStatItem[]>(() => {
  const submission = detailData.value?.submission;
  if (!submission) {
    return [];
  }
  return [
    {
      label: '状态',
      value: statusLabel(submission.status),
      note: submission.can_resubmit ? '评阅前可再次提交' : '本次提交已锁定',
    },
    {
      label: '教师评分',
      value: submission.score ?? '--',
      unit: submission.score === null ? undefined : '分',
    },
    {
      label: '互评得分',
      value: submission.peer_review_score ?? '--',
      unit: submission.peer_review_score === null ? undefined : '分',
    },
  ];
});

function statusLabel(status: DetailPayload['submission']['status']) {
  return status === 'reviewed' ? '已评阅' : '待评阅';
}

function submissionScopeLabel(scope: DetailPayload['submission']['submission_scope']) {
  return scope === 'group' ? '小组共同提交' : '个人提交';
}

function groupDisplayLabel(submission: DetailPayload['submission']) {
  if (submission.group_name) {
    return submission.group_name;
  }
  if (submission.group_no !== null) {
    return `第 ${submission.group_no} 组`;
  }
  return '当前小组';
}

function taskTypeLabel(taskType: string) {
  if (taskType === 'rich_text') {
    return '图文活动';
  }
  if (taskType === 'web_page') {
    return '网页活动';
  }
  if (taskType === 'discussion') {
    return '讨论活动';
  }
  if (taskType === 'data_submit') {
    return '数据提交活动';
  }
  if (taskType === 'programming') {
    return '编程活动';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读活动';
  }
  return taskType;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
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

async function downloadFile(file: SubmissionFile) {
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

async function loadDetail() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    detailData.value = await apiGet<DetailPayload>(`/submissions/${route.params.submissionId}`, authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品详情失败';
  } finally {
    isLoading.value = false;
  }
}

async function goBack() {
  await router.push('/student/work');
}

async function goToTask(courseId: number, taskId: number) {
  const taskType = detailData.value?.task.task_type;
  const taskSegment = taskType === 'programming' ? 'programs' : taskType === 'reading' ? 'readings' : 'tasks';
  await router.push(`/student/courses/${courseId}/${taskSegment}/${taskId}`);
}

async function revokeReviewedSubmission() {
  if (!authStore.token || !detailData.value) {
    errorMessage.value = '请先登录学生账号';
    return;
  }
  if (detailData.value.submission.status !== 'reviewed') {
    ElMessage.info('当前作品未处于已评阅状态');
    return;
  }

  isRevokingReview.value = true;
  try {
    await apiPost(`/submissions/${detailData.value.submission.id}/revoke`, {}, authStore.token);
    ElMessage.success('已撤销评阅，可继续提交修改');
    await loadDetail();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '撤销评阅失败');
  } finally {
    isRevokingReview.value = false;
  }
}

onMounted(loadDetail);
</script>

<style scoped>
.sw-detail {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-detail__meta {
  margin: 0;
}

.sw-detail__main {
  display: grid;
  gap: var(--sw-gap);
  min-width: 0;
}

.sw-detail__prose {
  font-size: 14px;
  line-height: 1.7;
}

.sw-detail__prose :deep(.rich-text-content) {
  font-size: 14px;
  line-height: 1.7;
}

.sw-detail__text {
  margin: 0;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.7;
}
</style>
