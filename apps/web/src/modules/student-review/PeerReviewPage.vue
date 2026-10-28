<template>
  <div class="page-stack">
    <SaPageHeader eyebrow="作品互评" :title="pageData?.task.title || `任务 ${route.params.taskId}`">
      <p class="hero-copy">
        {{ pageData?.task.course.title || '正在加载课次信息' }}
        <span v-if="pageData">
          · {{ pageData.task.course.unit_title }} · {{ pageData.task.course.lesson_title }}
        </span>
      </p>
      <template #actions>
        <div class="action-group">
          <n-button secondary @click="goToTask">返回任务</n-button>
          <n-button secondary @click="goToCourse">返回课程</n-button>
        </div>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="pageData" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">作品总数</p>
        <p class="metric-value">{{ pageData.summary.total_works }}</p>
        <p class="metric-note">当前课题已经提交到作品墙的数量。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">可投次数</p>
        <p class="metric-value">{{ pageData.summary.votes_remaining }}</p>
        <p class="metric-note">
          已用 {{ pageData.summary.votes_used }} / {{ pageData.summary.vote_limit }} 次推荐。
        </p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">我的得票</p>
        <p class="metric-value">{{ pageData.summary.my_received_votes }}</p>
        <p class="metric-note">表示同学给你这份作品投出的推荐票数。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">互评得分</p>
        <p class="metric-value">{{ pageData.summary.my_peer_review_score ?? '--' }}</p>
        <p class="metric-note">当前按推荐票累计，后续仍可扩展更细的评分规则。</p>
      </article>
    </div>

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="10" animated />
    </SaPanel>

    <div v-else-if="pageData" class="page-stack">
      <SaPanel v-if="pageData.gate.requires_submission" class="gate-card" title="参与说明">
        <div class="gate-body">
          <p>{{ pageData.gate.message }}</p>
          <n-button type="primary" @click="goToTask">先去提交作品</n-button>
        </div>
      </SaPanel>

      <template v-else>
        <SaPanel>
          <template #header>
            <div class="chart-head">
              <div>
                <strong>作品得票与互评对比</strong>
                <p class="section-note">柱为每份作品的推荐票数，折线为互评得分，便于横向比较人气与评分。</p>
              </div>
            </div>
          </template>
          <n-empty v-if="!pageData.items.length" description="作品墙上还没有作品。" />
          <AppChart v-else :height="280" :option="voteComparisonOption" />
        </SaPanel>

        <div class="detail-grid">
        <SaPanel title="作品墙">
          <template #actions>
            <n-tag round type="success">共 {{ pageData.items.length }} 份</n-tag>
          </template>

          <div class="wall-list">
            <button
              v-for="item in pageData.items"
              :key="item.submission_id"
              :class="['wall-item', { 'wall-item--active': item.submission_id === selectedSubmissionId }]"
              type="button"
              @click="selectSubmission(item.submission_id)"
            >
              <div class="wall-item-head">
                <strong>{{ item.student_name }}</strong>
                <div class="wall-tags">
                  <n-tag v-if="item.is_mine" round type="info">我的作品</n-tag>
                  <n-tag v-else-if="item.has_voted" round type="success">已推荐</n-tag>
                  <n-tag v-if="item.is_teacher_recommended" round type="warning">教师推荐</n-tag>
                </div>
              </div>
              <p class="wall-meta">{{ item.student_no }} · {{ item.class_name }}</p>
              <p class="wall-note">
                {{ richTextToExcerpt(item.submission_note, 90) || '这份作品还没有填写额外说明。' }}
              </p>
              <div class="wall-item-foot">
                <span>得票 {{ item.vote_count }}</span>
                <span>互评 {{ item.peer_review_score }}</span>
              </div>
            </button>
          </div>
        </SaPanel>

        <SaPanel class="stage-card" title="作品详情">
          <template #actions>
            <n-tag round type="info">
              {{ selectedItem ? formatDateTime(selectedItem.updated_at) : '请选择作品' }}
            </n-tag>
          </template>

          <n-empty v-if="!selectedItem" description="请选择左侧的一份作品查看" />

          <div v-else class="stage-stack">
            <div class="detail-hero">
              <div>
                <div class="wall-item-head">
                  <strong>{{ selectedItem.student_name }}</strong>
                  <div class="wall-tags">
                    <n-tag v-if="selectedItem.is_mine" round type="info">我的作品</n-tag>
                    <n-tag v-if="selectedItem.has_voted" round type="success">已推荐</n-tag>
                    <n-tag v-if="selectedItem.is_teacher_recommended" round type="warning">
                      教师推荐
                    </n-tag>
                  </div>
                </div>
                <p class="wall-meta">{{ selectedItem.student_no }} · {{ selectedItem.class_name }}</p>
              </div>

              <div class="detail-score-grid">
                <div>
                  <span class="detail-score-label">得票</span>
                  <strong>{{ selectedItem.vote_count }}</strong>
                </div>
                <div>
                  <span class="detail-score-label">互评</span>
                  <strong>{{ selectedItem.peer_review_score }}</strong>
                </div>
              </div>
            </div>

            <div class="content-block">
              <h3>作品说明</h3>
              <RichTextContent
                :html="selectedItem.submission_note"
                empty-text="该作品没有填写额外说明。"
              />
            </div>

            <div class="vote-panel">
              <div>
                <h3>推荐操作</h3>
                <p>{{ voteStatusText }}</p>
              </div>
              <n-button
                :disabled="voteDisabled"
                :loading="isVoting"
                type="primary"
                @click="voteForSelected"
              >
                推荐这份作品
              </n-button>
            </div>

            <div class="showcase-files-head">
              <h3>附件展示</h3>
              <n-tag round type="success">共 {{ selectedItem.files.length }} 个附件</n-tag>
            </div>

            <n-empty v-if="!selectedItem.files.length" description="这份作品没有附件" />

            <template v-else>
              <div class="showcase-file-list">
                <button
                  v-for="file in selectedItem.files"
                  :key="file.id"
                  :class="['showcase-file-card', { 'showcase-file-card--active': file.id === selectedFileId }]"
                  type="button"
                  @click="selectFile(file.id)"
                >
                  <span class="showcase-file-name">{{ file.name }}</span>
                  <span class="showcase-file-meta">
                    {{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB
                    {{ file.previewable ? ' · 可直接展示' : ' · 仅下载' }}
                  </span>
                </button>
              </div>

              <n-spin :show="isPreviewLoading">
                <div class="showcase-preview">
                  <iframe
                    v-if="!isPreviewLoading && previewKind === 'pdf' && previewUrl"
                    :src="previewUrl"
                    class="preview-frame"
                    title="互评作品预览"
                  />
                  <img
                    v-else-if="!isPreviewLoading && previewKind === 'image' && previewUrl"
                    :src="previewUrl"
                    alt="互评作品预览"
                    class="preview-image"
                  />
                  <pre v-else-if="!isPreviewLoading && previewKind === 'text'" class="preview-text">{{
                    previewText
                  }}</pre>
                  <div v-else-if="selectedFile" class="preview-fallback">
                    <p>当前附件暂不支持直接展示，请下载后查看。</p>
                    <n-button
                      :loading="downloadLoadingFileId === selectedFile.id"
                      type="success"
                      @click="downloadFile(selectedFile)"
                    >
                      下载当前附件
                    </n-button>
                  </div>
                  <n-empty v-else description="请选择一个附件进行查看" />
                </div>
              </n-spin>
            </template>
          </div>
        </SaPanel>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSkeleton, NSpin, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';
import { richTextToExcerpt } from '@/utils/richText';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

type PeerReviewFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
  mime_type?: string;
  previewable?: boolean;
};

type PeerReviewItem = {
  submission_id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  status: string;
  teacher_score: number | null;
  peer_review_score: number;
  vote_count: number;
  submission_note: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  is_mine: boolean;
  has_voted: boolean;
  can_vote: boolean;
  is_teacher_recommended: boolean;
  files: PeerReviewFile[];
};

type PeerReviewPayload = {
  task: {
    id: number;
    title: string;
    task_type: string;
    course: {
      id: number;
      title: string;
      assigned_date: string;
      lesson_title: string;
      unit_title: string;
    };
  };
  summary: {
    total_works: number;
    vote_limit: number;
    votes_used: number;
    votes_remaining: number;
    my_received_votes: number;
    my_peer_review_score: number | null;
  };
  gate: {
    requires_submission: boolean;
    can_view_wall: boolean;
    message: string;
  };
  my_submission: {
    submission_id: number;
    status: string;
    peer_review_score: number;
    vote_count: number;
    updated_at: string | null;
  } | null;
  items: PeerReviewItem[];
};

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();

const pageData = ref<PeerReviewPayload | null>(null);
const selectedSubmissionId = ref<number | null>(null);
const selectedFileId = ref<number | null>(null);
const previewKind = ref<PreviewKind>('unsupported');
const previewUrl = ref('');
const previewText = ref('');
const isLoading = ref(true);
const isVoting = ref(false);
const isPreviewLoading = ref(false);
const downloadLoadingFileId = ref<number | null>(null);
const errorMessage = ref('');

const selectedItem = computed(() => {
  if (!pageData.value || selectedSubmissionId.value === null) {
    return null;
  }
  return pageData.value.items.find((item) => item.submission_id === selectedSubmissionId.value) || null;
});

const voteComparisonOption = computed(() => {
  const items = (pageData.value?.items || []).slice(0, 12);
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 40, bottom: 8 }),
    xAxis: axisX(items.map((item) => item.student_name), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 54, overflow: 'truncate', interval: 0 },
    }),
    yAxis: axisY({ name: '得票 / 互评', nameTextStyle: { color: tokens.value.muted } }),
    series: [
      {
        name: '得票',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: palette.value[0], borderRadius: [6, 6, 0, 0] },
        data: items.map((item) => item.vote_count),
      },
      {
        name: '互评得分',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        lineStyle: { color: palette.value[1] },
        itemStyle: { color: palette.value[1] },
        data: items.map((item) => item.peer_review_score),
      },
    ],
  });
});

const selectedFile = computed(() => {
  if (!selectedItem.value || selectedFileId.value === null) {
    return null;
  }
  return selectedItem.value.files.find((file) => file.id === selectedFileId.value) || null;
});

const voteDisabled = computed(() => {
  if (!pageData.value || !selectedItem.value) {
    return true;
  }
  if (selectedItem.value.is_mine || selectedItem.value.has_voted) {
    return true;
  }
  return pageData.value.summary.votes_remaining <= 0;
});

const voteStatusText = computed(() => {
  if (!pageData.value || !selectedItem.value) {
    return '请选择一份作品后再进行推荐。';
  }
  if (selectedItem.value.is_mine) {
    return '自己的作品不能给自己投票，但你可以在这里查看当前得票与附件内容。';
  }
  if (selectedItem.value.has_voted) {
    return '你已经推荐过这份作品了，可以继续查看其他同学的作品。';
  }
  if (pageData.value.summary.votes_remaining <= 0) {
    return '当前任务的推荐次数已经用完。';
  }
  return `你还可以推荐 ${pageData.value.summary.votes_remaining} 份作品。`;
});

function revokePreviewUrl() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
  }
}

function resetPreviewState() {
  revokePreviewUrl();
  previewKind.value = 'unsupported';
  previewText.value = '';
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

function detectPreviewKind(file: PeerReviewFile, blob: Blob): PreviewKind {
  const ext = file.ext.toLowerCase();
  const mediaType = blob.type || file.mime_type || '';

  if (ext === 'pdf' || mediaType.includes('pdf')) {
    return 'pdf';
  }
  if (mediaType.startsWith('image/') || ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(ext)) {
    return 'image';
  }
  if (mediaType.startsWith('text/') || ['md', 'txt'].includes(ext)) {
    return 'text';
  }
  return 'unsupported';
}

function pickDefaultSubmission(items: PeerReviewItem[]) {
  if (!items.length) {
    return null;
  }
  return items.find((item) => !item.is_mine && !item.has_voted) || items[0];
}

function pickDefaultFile(item: PeerReviewItem | null) {
  if (!item?.files.length) {
    return null;
  }
  return item.files.find((file) => file.previewable) || item.files[0];
}

async function loadPreview(file: PeerReviewFile | null) {
  resetPreviewState();

  if (!file) {
    selectedFileId.value = null;
    return;
  }

  selectedFileId.value = file.id;
  if (!file.previewable) {
    return;
  }

  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }

  isPreviewLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/peer-reviews/files/${file.id}?disposition=inline`, authStore.token);
    const blob = await response.blob();
    const nextKind = detectPreviewKind(file, blob);
    previewKind.value = nextKind;

    if (nextKind === 'text') {
      previewText.value = await blob.text();
      return;
    }

    previewUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品预览失败';
  } finally {
    isPreviewLoading.value = false;
  }
}

async function syncSelection(preferredSubmissionId?: number | null) {
  if (!pageData.value || pageData.value.gate.requires_submission || !pageData.value.items.length) {
    selectedSubmissionId.value = null;
    selectedFileId.value = null;
    resetPreviewState();
    return;
  }

  const nextSubmission =
    pageData.value.items.find((item) => item.submission_id === preferredSubmissionId) ||
    pickDefaultSubmission(pageData.value.items);
  selectedSubmissionId.value = nextSubmission?.submission_id || null;

  const nextFile =
    nextSubmission?.files.find((file) => file.id === selectedFileId.value) || pickDefaultFile(nextSubmission || null);
  selectedFileId.value = nextFile?.id || null;

  await nextTick();
  await loadPreview(nextFile || null);
}

async function loadPage(preferredSubmissionId?: number | null) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    pageData.value = await apiGet<PeerReviewPayload>(`/peer-reviews/task/${route.params.taskId}`, authStore.token);
    await syncSelection(preferredSubmissionId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品互评失败';
  } finally {
    isLoading.value = false;
  }
}

function selectSubmission(submissionId: number) {
  selectedSubmissionId.value = submissionId;
  selectedFileId.value = null;
  void syncSelection(submissionId);
}

function selectFile(fileId: number) {
  const file = selectedItem.value?.files.find((item) => item.id === fileId) || null;
  if (!file) {
    return;
  }
  void loadPreview(file);
}

async function voteForSelected() {
  if (!selectedItem.value || !authStore.token || voteDisabled.value) {
    return;
  }

  isVoting.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiPost<PeerReviewPayload>(
      `/peer-reviews/task/${route.params.taskId}/vote`,
      {
        target_submission_id: selectedItem.value.submission_id,
        score: 1,
      },
      authStore.token
    );
    pageData.value = payload;
    ElMessage.success('推荐已保存');
    await syncSelection(selectedItem.value.submission_id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存推荐失败';
  } finally {
    isVoting.value = false;
  }
}

async function downloadFile(file: PeerReviewFile) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }

  downloadLoadingFileId.value = file.id;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/peer-reviews/files/${file.id}?disposition=attachment`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '下载附件失败';
  } finally {
    downloadLoadingFileId.value = null;
  }
}

async function goToTask() {
  const courseId = pageData.value?.task.course.id;
  if (!courseId) {
    return;
  }
  await router.push(`/student/courses/${courseId}/tasks/${route.params.taskId}`);
}

async function goToCourse() {
  const courseId = pageData.value?.task.course.id;
  if (!courseId) {
    return;
  }
  await router.push(`/student/courses/${courseId}`);
}

watch(
  () => route.params.taskId,
  () => {
    void loadPage();
  }
);

onMounted(() => {
  void loadPage();
});

onBeforeUnmount(() => {
  resetPreviewState();
});
</script>

<style scoped>
.action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 9fr) minmax(0, 15fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1200px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.wall-tags,
.wall-item-head,
.info-row,
.showcase-files-head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.gate-card :deep(.sa-panel__body) {
  display: grid;
  gap: 16px;
}

.gate-body p,
.wall-meta,
.wall-note,
.content-block :deep(.rich-text-content),
.content-block p,
.detail-score-label,
.showcase-file-meta {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.wall-list,
.stage-stack {
  display: grid;
  gap: 14px;
}

.wall-item,
.showcase-file-card {
  width: 100%;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: var(--ls-card);
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
  cursor: pointer;
}

.wall-item {
  padding: 16px;
}

.wall-item:hover,
.showcase-file-card:hover {
  border-color: rgba(67, 109, 185, 0.3);
  box-shadow: 0 10px 26px rgba(67, 109, 185, 0.08);
  transform: translateY(-1px);
}

.wall-item--active,
.showcase-file-card--active {
  border-color: rgba(67, 109, 185, 0.42);
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.08), rgba(111, 179, 149, 0.08)),
    var(--ls-card);
}

.wall-meta {
  margin-top: 6px;
  font-size: 12px;
}

.wall-note {
  margin-top: 10px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.wall-item-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  color: var(--ls-ink);
  font-weight: 700;
}

.stage-card :deep(.sa-panel__body) {
  display: grid;
  gap: 16px;
}

.detail-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: 18px;
  background: var(--ls-primary-soft);
}

.detail-score-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(72px, 1fr));
  gap: 12px;
}

.detail-score-grid > div {
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--ls-elevated);
  text-align: center;
}

.detail-score-grid strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
  color: var(--ls-ink);
}

.vote-panel {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 16px;
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(111, 179, 149, 0.12), rgba(255, 186, 73, 0.14)),
    var(--ls-card);
}

.vote-panel h3,
.content-block h3,
.showcase-files-head h3 {
  margin: 0 0 8px;
}

.showcase-file-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.showcase-file-card {
  padding: 12px 14px;
}

.showcase-file-name,
.showcase-file-meta {
  display: block;
}

.showcase-file-name {
  font-weight: 700;
  color: var(--ls-ink);
  word-break: break-word;
}

.showcase-file-meta {
  margin-top: 4px;
  font-size: 12px;
}

.showcase-preview {
  min-height: 380px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid var(--ls-border);
  background:
    radial-gradient(circle at top left, rgba(67, 109, 185, 0.08), transparent 45%),
    var(--ls-card);
}

.preview-frame {
  width: 100%;
  min-height: 70vh;
  border: none;
  border-radius: 16px;
  background: #fff;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  border-radius: 16px;
}

.preview-text {
  margin: 0;
  max-height: 70vh;
  overflow: auto;
  padding: 16px;
  border-radius: 16px;
  background: var(--ls-code-bg);
  color: var(--ls-code-text);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-fallback {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  text-align: center;
  color: var(--ls-muted);
}

@media (max-width: 960px) {
  .detail-hero,
  .vote-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .showcase-file-list {
    grid-template-columns: 1fr;
  }
}
</style>
