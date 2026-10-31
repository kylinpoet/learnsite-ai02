<template>
  <div class="sw-review">
    <StudentPageHead :title="pageData?.task.title || `活动 ${route.params.taskId}`" :sub="headSub">
      <template #back>
        <button class="sw-back" type="button" @click="goToTask">← 返回活动</button>
      </template>
      <template #actions>
        <n-button secondary @click="goToCourse">返回课程</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <template v-else-if="pageData">
      <StudentStatStrip :items="statItems" />

      <StudentPanel v-if="pageData.gate.requires_submission" title="还不能参与互评">
        <div class="sw-review__gate">
          <p class="sw-review__gate-text">{{ pageData.gate.message }}</p>
          <n-button type="primary" @click="goToTask">先去提交作品</n-button>
        </div>
      </StudentPanel>

      <div v-else class="sw-review__grid">
        <StudentPanel title="作品墙" :count="`${pageData.items.length} 份`" flush>
          <template v-if="pageData.items.length">
            <button
              v-for="item in pageData.items"
              :key="item.submission_id"
              type="button"
              :class="['sw-review__wall-item', { 'is-active': item.submission_id === selectedSubmissionId }]"
              @click="selectSubmission(item.submission_id)"
            >
              <span class="sw-review__wall-head">
                <strong>{{ item.student_name }}</strong>
                <span v-if="item.is_mine" class="sw-chip">我的</span>
                <span v-else-if="item.has_voted" class="sw-chip sw-chip--done">已推荐</span>
                <span v-if="item.is_teacher_recommended" class="sw-chip sw-chip--now">教师推荐</span>
              </span>
              <span class="sw-review__wall-meta">{{ item.student_no }} · {{ item.class_name }}</span>
              <span class="sw-review__wall-note">
                {{ richTextToExcerpt(item.submission_note, 80) || '没有填写额外说明。' }}
              </span>
              <span class="sw-review__wall-foot">
                <span>得票 {{ item.vote_count }}</span>
                <span>互评 {{ item.peer_review_score }}</span>
              </span>
            </button>
          </template>
          <StudentEmpty v-else text="作品墙上还没有作品。" />
        </StudentPanel>

        <StudentPanel title="作品详情">
          <template #actions>
            <span v-if="selectedItem" class="sw-review__time">{{ formatDateTime(selectedItem.updated_at) }}</span>
          </template>

          <StudentEmpty v-if="!selectedItem" text="从左侧选择一份作品查看。" />

          <div v-else class="sw-review__detail">
            <div class="sw-review__identity">
              <div>
                <p class="sw-review__name">
                  {{ selectedItem.student_name }}
                  <span v-if="selectedItem.is_mine" class="sw-chip">我的</span>
                  <span v-if="selectedItem.has_voted" class="sw-chip sw-chip--done">已推荐</span>
                  <span v-if="selectedItem.is_teacher_recommended" class="sw-chip sw-chip--now">教师推荐</span>
                </p>
                <p class="sw-review__meta">{{ selectedItem.student_no }} · {{ selectedItem.class_name }}</p>
              </div>
              <div class="sw-review__scores">
                <span><small>得票</small><strong>{{ selectedItem.vote_count }}</strong></span>
                <span><small>互评</small><strong>{{ selectedItem.peer_review_score }}</strong></span>
              </div>
            </div>

            <div class="sw-review__note">
              <RichTextContent
                :html="selectedItem.submission_note"
                empty-text="该作品没有填写额外说明。"
              />
            </div>

            <div class="sw-review__vote">
              <p class="sw-review__vote-text">{{ voteStatusText }}</p>
              <n-button :disabled="voteDisabled" :loading="isVoting" type="primary" @click="voteForSelected">
                推荐这份作品
              </n-button>
            </div>

            <div class="sw-review__files-head">
              <h3 class="sw-review__section-title">附件</h3>
              <span class="sw-review__meta">{{ selectedItem.files.length }} 个</span>
            </div>

            <StudentEmpty v-if="!selectedItem.files.length" text="这份作品没有附件。" />

            <template v-else>
              <div class="sw-review__file-list">
                <button
                  v-for="file in selectedItem.files"
                  :key="file.id"
                  type="button"
                  :class="['sw-review__file', { 'is-active': file.id === selectedFileId }]"
                  @click="selectFile(file.id)"
                >
                  <span class="sw-review__file-name">{{ file.name }}</span>
                  <span class="sw-review__meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB</span>
                </button>
              </div>

              <n-spin :show="isPreviewLoading">
                <div class="sw-review__preview">
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
                      type="primary"
                      @click="downloadFile(selectedFile)"
                    >
                      下载当前附件
                    </n-button>
                  </div>
                  <StudentEmpty v-else text="请选择一个附件查看。" />
                </div>
              </n-spin>
            </template>
          </div>
        </StudentPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton, NSpin } from 'naive-ui';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';
import { richTextToExcerpt } from '@/utils/richText';
import { formatDateTime } from '@/utils/datetime';
import { triggerBrowserDownload } from '@/utils/download';
import { detectPreviewKind, type PreviewKind } from '@/utils/filePreview';

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

const headSub = computed(() => {
  const payload = pageData.value;
  if (!payload) {
    return '';
  }
  return [
    payload.task.course.title,
    payload.task.course.unit_title,
    payload.task.course.lesson_title,
    `${payload.items.length} 份作品`,
  ]
    .filter(Boolean)
    .join(' · ');
});

const statItems = computed<StudentStatItem[]>(() => {
  const summary = pageData.value?.summary;
  return [
    { label: '作品', value: summary?.total_works ?? 0, unit: '份' },
    {
      label: '可推荐',
      value: summary?.votes_remaining ?? 0,
      unit: '次',
      note: `已用 ${summary?.votes_used ?? 0}/${summary?.vote_limit ?? 0}`,
    },
    { label: '我的得票', value: summary?.my_received_votes ?? 0, unit: '票' },
    { label: '互评得分', value: summary?.my_peer_review_score ?? '--' },
  ];
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
    return '当前活动的推荐次数已经用完。';
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
.sw-review {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-review__grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: var(--sw-gap);
  align-items: start;
}

/* 作品墙 */
.sw-review__wall-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sw-review__wall-item + .sw-review__wall-item {
  border-top: 1px solid var(--sw-line-soft);
}

.sw-review__wall-item:hover {
  background: var(--sw-surface-2);
}

.sw-review__wall-item.is-active {
  background: var(--sw-surface-3);
}

.sw-review__wall-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--sw-ink);
  font-size: 14px;
}

.sw-review__wall-meta {
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sw-review__wall-note {
  display: -webkit-box;
  overflow: hidden;
  color: var(--sw-text);
  font-size: 13px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.sw-review__wall-foot {
  display: flex;
  gap: 14px;
  margin-top: 2px;
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 详情 */
.sw-review__time {
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sw-review__detail {
  display: grid;
  gap: 18px;
}

.sw-review__identity {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.sw-review__name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--sw-ink);
  font-size: 17px;
  font-weight: 600;
}

.sw-review__meta {
  margin: 4px 0 0;
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sw-review__scores {
  display: flex;
  flex: none;
  gap: 24px;
  text-align: right;
}

.sw-review__scores span {
  display: grid;
  gap: 2px;
}

.sw-review__scores small {
  color: var(--sw-muted);
  font-size: 12px;
}

.sw-review__scores strong {
  color: var(--sw-ink);
  font-size: 22px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.sw-review__note {
  max-width: 76ch;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.75;
}

.sw-review__vote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.sw-review__vote-text {
  margin: 0;
  color: var(--sw-text);
  font-size: 13px;
  line-height: 1.55;
}

.sw-review__files-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
}

.sw-review__section-title {
  margin: 0;
  color: var(--sw-ink);
  font-size: 14px;
  font-weight: 600;
}

.sw-review__file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sw-review__file {
  display: grid;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--sw-line);
  border-radius: 6px;
  background: var(--sw-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sw-review__file.is-active {
  border-color: var(--sw-ink);
}

.sw-review__file-name {
  max-width: 240px;
  overflow: hidden;
  color: var(--sw-ink);
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sw-review__file .sw-review__meta {
  margin: 0;
}

.sw-review__preview {
  min-height: 360px;
  overflow: hidden;
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.preview-frame {
  width: 100%;
  min-height: 62vh;
  border: none;
  background: #ffffff;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 62vh;
  margin: 0 auto;
}

.preview-text {
  margin: 0;
  max-height: 62vh;
  overflow: auto;
  padding: 16px;
  color: var(--sw-text);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-fallback {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 56px 16px;
  color: var(--sw-muted);
  text-align: center;
}

.preview-fallback p {
  margin: 0;
  font-size: 13px;
}

.sw-review__gate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.sw-review__gate-text {
  margin: 0;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.6;
}

@media (max-width: 1080px) {
  .sw-review__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .sw-review__wall-item {
    padding: 12px 16px;
  }
}

@media (max-width: 640px) {
  .sw-review__identity,
  .sw-review__vote,
  .sw-review__gate {
    flex-direction: column;
    align-items: flex-start;
  }

  .sw-review__scores {
    justify-content: flex-start;
    text-align: left;
  }
}
</style>
