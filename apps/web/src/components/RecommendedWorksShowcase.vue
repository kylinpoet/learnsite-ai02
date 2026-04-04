<template>
  <el-card class="soft-card showcase-card">
    <template #header>
      <div class="showcase-header">
        <div>
          <span>{{ title }}</span>
          <p class="showcase-description">{{ description }}</p>
        </div>
        <el-tag round type="success">已推荐 {{ items.length }} 份</el-tag>
      </div>
    </template>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <el-empty v-if="!items.length" :description="emptyDescription" />

    <div v-else class="showcase-shell">
      <aside class="showcase-list">
        <button
          v-for="item in items"
          :key="item.submission_id"
          :class="['showcase-list-item', { 'showcase-list-item--active': item.submission_id === selectedSubmissionId }]"
          type="button"
          @click="selectSubmission(item.submission_id)"
        >
          <div class="showcase-item-head">
            <strong>{{ item.student_name }}</strong>
            <el-tag round type="success">{{ formatScoreText(item.score) }}</el-tag>
          </div>
          <p class="showcase-meta">{{ item.student_no }} · {{ item.class_name }}</p>
          <p class="showcase-snippet">
            {{ richTextToExcerpt(item.submission_note, 90) || item.teacher_comment || '暂无作品说明' }}
          </p>
        </button>
      </aside>

      <section v-if="selectedSubmission" class="showcase-stage">
        <div class="showcase-info">
          <div class="showcase-item-head">
            <strong>{{ selectedSubmission.student_name }}</strong>
            <div class="showcase-tag-row">
              <el-tag round type="success">{{ formatScoreText(selectedSubmission.score) }}</el-tag>
              <el-tag round type="info">推荐作品</el-tag>
            </div>
          </div>
          <p class="showcase-meta">
            {{ selectedSubmission.student_no }} · {{ selectedSubmission.class_name }}
          </p>
          <p class="showcase-meta">更新时间：{{ formatDateTime(selectedSubmission.updated_at) }}</p>
        </div>

        <div class="showcase-content">
          <h3>作品说明</h3>
          <RichTextContent
            :html="selectedSubmission.submission_note"
            empty-text="该作品没有填写额外说明。"
          />
        </div>

        <div v-if="selectedSubmission.teacher_comment" class="showcase-content">
          <h3>教师评语</h3>
          <p>{{ selectedSubmission.teacher_comment }}</p>
        </div>

        <div class="showcase-files-head">
          <h3>附件展示</h3>
          <el-tag round type="success">共 {{ selectedSubmission.files.length }} 个附件</el-tag>
        </div>

        <el-empty v-if="!selectedSubmission.files.length" description="暂无附件" />

        <template v-else>
          <div class="showcase-file-list">
            <button
              v-for="file in selectedSubmission.files"
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

          <div v-loading="isPreviewLoading" class="showcase-preview">
            <iframe
              v-if="!isPreviewLoading && previewKind === 'pdf' && previewUrl"
              :src="previewUrl"
              class="preview-frame"
              title="推荐作品预览"
            />
            <img
              v-else-if="!isPreviewLoading && previewKind === 'image' && previewUrl"
              :src="previewUrl"
              alt="推荐作品预览"
              class="preview-image"
            />
            <pre v-else-if="!isPreviewLoading && previewKind === 'text'" class="preview-text">{{
              previewText
            }}</pre>
            <div v-else-if="selectedFile" class="preview-fallback">
              <p>当前附件暂不支持直接展示，请下载后查看。</p>
              <el-button
                :loading="downloadLoadingFileId === selectedFile.id"
                type="success"
                @click="downloadFile(selectedFile)"
              >
                下载当前附件
              </el-button>
            </div>
            <el-empty v-else description="请选择一个附件进行查看" />
          </div>
        </template>
      </section>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { apiGetBlob } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { richTextToExcerpt } from '@/utils/richText';

type RecommendedShowcaseFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
  mime_type?: string;
  previewable?: boolean;
};

type RecommendedShowcaseItem = {
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
  files: RecommendedShowcaseFile[];
};

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';

const props = withDefaults(
  defineProps<{
    items: RecommendedShowcaseItem[];
    token?: string;
    title?: string;
    description?: string;
    emptyDescription?: string;
  }>(),
  {
    token: '',
    title: '推荐作品展示',
    description: '教师评为 G 级的作品会自动进入这里，便于同学和教师快速查看优秀示例。',
    emptyDescription: '当前还没有推荐作品',
  }
);

const selectedSubmissionId = ref<number | null>(null);
const selectedFileId = ref<number | null>(null);
const previewKind = ref<PreviewKind>('unsupported');
const previewUrl = ref('');
const previewText = ref('');
const isPreviewLoading = ref(false);
const downloadLoadingFileId = ref<number | null>(null);
const errorMessage = ref('');

const selectedSubmission = computed(() => {
  if (selectedSubmissionId.value === null) {
    return null;
  }
  return props.items.find((item) => item.submission_id === selectedSubmissionId.value) || null;
});

const selectedFile = computed(() => {
  if (!selectedSubmission.value || selectedFileId.value === null) {
    return null;
  }
  return selectedSubmission.value.files.find((file) => file.id === selectedFileId.value) || null;
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

function formatScoreText(score: number | null) {
  if (score === null) {
    return '--';
  }
  const gradeMap = new Map<number, string>([
    [120, 'G'],
    [100, 'A'],
    [80, 'B'],
    [60, 'C'],
    [40, 'D'],
    [20, 'E'],
    [0, 'F'],
  ]);
  const grade = gradeMap.get(score);
  return grade ? `${grade} · ${score}` : `${score}`;
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

function pickDefaultPreviewFile(item: RecommendedShowcaseItem | null) {
  if (!item?.files.length) {
    return null;
  }
  return item.files.find((file) => file.previewable) || item.files[0];
}

function detectPreviewKind(file: RecommendedShowcaseFile, blob: Blob): PreviewKind {
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

async function loadPreview(file: RecommendedShowcaseFile | null) {
  resetPreviewState();

  if (!file) {
    return;
  }

  selectedFileId.value = file.id;
  if (!file.previewable) {
    return;
  }

  if (!props.token) {
    errorMessage.value = '请先登录后查看推荐作品附件';
    return;
  }

  isPreviewLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, props.token);
    const blob = await response.blob();
    const nextKind = detectPreviewKind(file, blob);
    previewKind.value = nextKind;

    if (nextKind === 'text') {
      previewText.value = await blob.text();
      return;
    }

    previewUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载推荐作品预览失败';
  } finally {
    isPreviewLoading.value = false;
  }
}

async function syncSelectionAndPreview() {
  const nextSubmission =
    props.items.find((item) => item.submission_id === selectedSubmissionId.value) || props.items[0] || null;
  selectedSubmissionId.value = nextSubmission?.submission_id || null;

  const nextFile =
    nextSubmission?.files.find((file) => file.id === selectedFileId.value) || pickDefaultPreviewFile(nextSubmission);
  selectedFileId.value = nextFile?.id || null;

  await nextTick();
  await loadPreview(nextFile || null);
}

function selectSubmission(submissionId: number) {
  selectedSubmissionId.value = submissionId;
  selectedFileId.value = null;
  void syncSelectionAndPreview();
}

function selectFile(fileId: number) {
  const file = selectedSubmission.value?.files.find((item) => item.id === fileId) || null;
  if (!file) {
    return;
  }
  void loadPreview(file);
}

async function downloadFile(file: RecommendedShowcaseFile) {
  if (!props.token) {
    errorMessage.value = '请先登录后下载推荐作品附件';
    return;
  }

  downloadLoadingFileId.value = file.id;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, props.token);
    const blob = await response.blob();
    triggerBrowserDownload(
      blob,
      getDownloadFileName(response.headers.get('content-disposition'), file.name)
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '下载推荐作品附件失败';
  } finally {
    downloadLoadingFileId.value = null;
  }
}

watch(
  () => props.items,
  () => {
    void syncSelectionAndPreview();
  },
  { deep: true, immediate: true }
);

onBeforeUnmount(() => {
  resetPreviewState();
});
</script>

<style scoped>
.showcase-card :deep(.el-card__body) {
  display: grid;
  gap: 16px;
}

.showcase-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.showcase-description,
.showcase-meta,
.showcase-snippet,
.showcase-file-meta,
.showcase-content :deep(.rich-text-content),
.showcase-content p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.showcase-description {
  margin-top: 4px;
  font-size: 12px;
}

.showcase-shell {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.2fr);
  gap: 18px;
}

.showcase-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.showcase-list-item,
.showcase-file-card {
  width: 100%;
  border: 1px solid rgba(67, 109, 185, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
  cursor: pointer;
}

.showcase-list-item {
  padding: 14px 16px;
}

.showcase-list-item:hover,
.showcase-file-card:hover {
  border-color: rgba(67, 109, 185, 0.3);
  box-shadow: 0 10px 26px rgba(67, 109, 185, 0.08);
  transform: translateY(-1px);
}

.showcase-list-item--active,
.showcase-file-card--active {
  border-color: rgba(67, 109, 185, 0.42);
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.08), rgba(111, 179, 149, 0.08)),
    rgba(255, 255, 255, 0.98);
}

.showcase-item-head,
.showcase-files-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.showcase-tag-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.showcase-meta {
  margin-top: 6px;
  font-size: 12px;
}

.showcase-snippet {
  margin-top: 10px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.showcase-stage {
  display: grid;
  gap: 16px;
}

.showcase-info {
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.showcase-content h3,
.showcase-files-head h3 {
  margin: 0 0 10px;
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
  color: #1f2a44;
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
  border: 1px solid rgba(67, 109, 185, 0.14);
  background:
    radial-gradient(circle at top left, rgba(67, 109, 185, 0.08), transparent 45%),
    rgba(255, 255, 255, 0.96);
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
  background: rgba(67, 109, 185, 0.08);
  color: #1f2a44;
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
  .showcase-header,
  .showcase-item-head,
  .showcase-files-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .showcase-shell {
    grid-template-columns: 1fr;
  }

  .showcase-file-list {
    grid-template-columns: 1fr;
  }
}
</style>
