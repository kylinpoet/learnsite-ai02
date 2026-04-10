<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">作品详情</p>
        <h2>{{ detailData?.task.title || `作品 ${route.params.submissionId}` }}</h2>
        <p class="hero-copy">
          这里展示作品状态、教师评语、互评分数和附件列表。教师评价前，你可以直接回到任务页继续覆盖提交。
        </p>
      </div>
      <div class="action-group">
        <el-button plain @click="goBack">返回作品列表</el-button>
        <el-button v-if="detailData" plain @click="goToCourse(detailData.course.id)">返回所属课程</el-button>
        <el-button
          v-if="detailData?.submission.can_resubmit"
          type="primary"
          @click="goToTask(detailData.course.id, detailData.task.id)"
        >
          {{ detailData?.submission.submission_scope === 'group' ? '再次提交小组作品' : '再次提交作品' }}
        </el-button>
        <el-button
          v-if="detailData?.submission.status === 'reviewed'"
          :loading="isRevokingReview"
          plain
          type="warning"
          @click="revokeReviewedSubmission"
        >
          撤销评阅
        </el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="8" />
        </el-card>
      </template>

      <template #default>
        <div v-if="detailData" class="page-stack">
          <div class="metric-grid">
            <article class="mini-panel">
              <p class="metric-label">状态</p>
              <p class="metric-value metric-value--small">{{ statusLabel(detailData.submission.status) }}</p>
              <p class="metric-note">
                {{ detailData.submission.can_resubmit ? '教师尚未完成评价，还可以再次提交。' : '教师已经完成评价，本次提交已锁定。' }}
              </p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">教师评分</p>
              <p class="metric-value">{{ detailData.submission.score ?? '--' }}</p>
              <p class="metric-note">没有评分时，会显示为待教师评价。</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">互评得分</p>
              <p class="metric-value">{{ detailData.submission.peer_review_score ?? '--' }}</p>
              <p class="metric-note">后续可继续扩展互评明细。</p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">提交方式</p>
              <p class="metric-value metric-value--small">{{ submissionScopeLabel(detailData.submission.submission_scope) }}</p>
              <p class="metric-note">
                {{
                  detailData.submission.submission_scope === 'group'
                    ? `${groupDisplayLabel(detailData.submission)} · 组内成员共享同一份最终提交。`
                    : '当前作品按个人独立提交。'
                }}
              </p>
            </article>
            <article class="mini-panel">
              <p class="metric-label">更新时间</p>
              <p class="metric-value metric-value--small">{{ formatDateTime(detailData.submission.updated_at) }}</p>
              <p class="metric-note">
                {{
                  detailData.submission.submitted_by_name
                    ? `最近保存 ${detailData.submission.submitted_by_name}`
                    : '这里显示最近一次提交保存时间。'
                }}
              </p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="15" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="info-row">
                    <span>任务信息</span>
                    <el-tag :type="statusTagType(detailData.submission.status)" round>
                      {{ statusLabel(detailData.submission.status) }}
                    </el-tag>
                  </div>
                </template>

                <el-descriptions :column="1" border>
                  <el-descriptions-item label="课程">{{ detailData.course.title }}</el-descriptions-item>
                  <el-descriptions-item label="任务">{{ detailData.task.title }}</el-descriptions-item>
                  <el-descriptions-item label="任务类型">{{ taskTypeLabel(detailData.task.task_type) }}</el-descriptions-item>
                  <el-descriptions-item label="提交时间">
                    {{ formatDateTime(detailData.submission.submitted_at) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="最近更新">
                    {{ formatDateTime(detailData.submission.updated_at) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="提交方式">
                    {{ submissionScopeLabel(detailData.submission.submission_scope) }}
                  </el-descriptions-item>
                  <el-descriptions-item v-if="detailData.submission.submission_scope === 'group'" label="协作小组">
                    {{ groupDisplayLabel(detailData.submission) }}
                  </el-descriptions-item>
                  <el-descriptions-item v-if="detailData.submission.submitted_by_name" label="最近提交人">
                    {{ detailData.submission.submitted_by_name }}
                  </el-descriptions-item>
                </el-descriptions>

                <div class="content-block">
                  <h3>作品说明</h3>
                  <RichTextContent :html="detailData.submission.submission_note" empty-text="暂无作品说明" />
                </div>

                <div class="content-block">
                  <h3>教师评语</h3>
                  <p>{{ detailData.submission.teacher_comment || '教师暂时还没有留下评语。' }}</p>
                </div>
              </el-card>
            </el-col>

            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>附件列表</template>
                <el-empty v-if="!detailData.files.length" description="暂无附件" />
                <div v-else class="stack-list">
                  <article v-for="file in detailData.files" :key="file.id" class="file-item">
                    <div>
                      <p class="file-name">{{ file.name }}</p>
                      <p class="file-meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB</p>
                    </div>
                    <div class="file-actions">
                      <el-tag round type="info">{{ file.role }}</el-tag>
                      <el-button
                        :loading="downloadLoadingFileId === file.id"
                        link
                        type="primary"
                        @click="downloadFile(file)"
                      >
                        下载
                      </el-button>
                    </div>
                  </article>
                </div>
              </el-card>

              <el-card class="soft-card">
                <template #header>下一步</template>
                <div class="stack-list">
                  <el-button
                    :disabled="!detailData.submission.can_resubmit"
                    plain
                    @click="goToTask(detailData.course.id, detailData.task.id)"
                  >
                    {{ detailData.submission.submission_scope === 'group' ? '回到小组任务继续提交' : '回到任务页继续提交' }}
                  </el-button>
                  <el-button plain @click="goToCourse(detailData.course.id)">回到课程任务</el-button>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { useAuthStore } from '@/stores/auth';

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

function statusLabel(status: DetailPayload['submission']['status']) {
  return status === 'reviewed' ? '已评价' : '待教师评价';
}

function statusTagType(status: DetailPayload['submission']['status']) {
  return status === 'reviewed' ? 'success' : 'warning';
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
  if (taskType === 'programming') {
    return '编程任务';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读任务';
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

async function goToCourse(courseId: number) {
  await router.push(`/student/courses/${courseId}`);
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
.action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.content-block {
  margin-top: 20px;
}

.content-block h3 {
  margin-bottom: 10px;
}

.content-block :deep(.rich-text-content),
.content-block p {
  color: var(--ls-muted);
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

.metric-value--small {
  font-size: 22px;
}
</style>
