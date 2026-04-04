<template>
  <el-dialog v-model="dialogVisible" title="共享草稿历史版本" width="min(1120px, 92vw)">
    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div class="history-shell">
      <aside class="history-sidebar">
        <div class="history-sidebar-head">
          <div>
            <p class="history-title">版本列表</p>
            <p class="history-note">默认对比当前版本与上一版的差异</p>
          </div>
          <div class="chip-row">
            <el-tag round>{{ historyItems.length }} 条</el-tag>
            <el-button :loading="isLoading" plain @click="loadHistory">刷新</el-button>
          </div>
        </div>

        <el-scrollbar max-height="60vh">
          <div v-if="historyItems.length" class="version-list">
            <button
              v-for="item in historyItems"
              :key="item.id"
              class="version-card"
              :class="{ 'version-card-active': item.version_no === selectedVersionNo }"
              type="button"
              @click="selectedVersionNo = item.version_no"
            >
              <div class="version-card-top">
                <strong>v{{ item.version_no }}</strong>
                <el-tag round size="small" :type="tagType(item.event_type)">{{ item.event_label }}</el-tag>
              </div>
              <p>{{ item.updated_by_name || '组内成员' }}</p>
              <p>{{ formatDateTime(item.occurred_at) }}</p>
            </button>
          </div>
          <el-empty v-else description="还没有共享草稿历史" />
        </el-scrollbar>
      </aside>

      <section class="history-main">
        <template v-if="selectedItem">
          <div class="chip-row history-summary">
            <el-tag round type="primary">当前 v{{ selectedItem.version_no }}</el-tag>
            <el-tag round type="info">
              {{ compareItem ? `对比 v${compareItem.version_no}` : '首个版本' }}
            </el-tag>
            <el-tag v-if="selectedItem.updated_by_name" round type="success">
              {{ selectedItem.updated_by_name }}
            </el-tag>
          </div>

          <div class="history-preview-grid">
            <article class="history-card">
              <div class="section-head">
                <h4>说明预览</h4>
                <span>{{ formatDateTime(selectedItem.occurred_at) }}</span>
              </div>
              <RichTextContent :html="selectedItem.submission_note" empty-text="该版本没有说明内容" />
            </article>

            <article v-if="codeEnabled" class="history-card">
              <div class="section-head">
                <h4>代码预览</h4>
                <span>{{ selectedItem.source_code ? `${selectedItem.source_code.length} 字符` : '无代码' }}</span>
              </div>
              <pre class="code-preview">{{ selectedItem.source_code || '该版本没有代码内容' }}</pre>
            </article>
          </div>

          <article class="history-card">
            <div class="section-head">
              <h4>说明差异</h4>
              <span>{{ summarizeDiff(noteDiffLines) }}</span>
            </div>
            <div class="diff-view">
              <article
                v-for="(line, index) in noteDiffLines"
                :key="`note-${index}`"
                class="diff-line"
                :class="`diff-line-${line.type}`"
              >
                <span class="diff-sign">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
                <span class="diff-text">{{ line.text || ' ' }}</span>
              </article>
              <el-empty v-if="!noteDiffLines.length" description="说明内容没有变化" />
            </div>
          </article>

          <article v-if="codeEnabled" class="history-card">
            <div class="section-head">
              <h4>代码差异</h4>
              <span>{{ summarizeDiff(codeDiffLines) }}</span>
            </div>
            <div class="diff-view">
              <article
                v-for="(line, index) in codeDiffLines"
                :key="`code-${index}`"
                class="diff-line"
                :class="`diff-line-${line.type}`"
              >
                <span class="diff-sign">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
                <span class="diff-text diff-text-code">{{ line.text || ' ' }}</span>
              </article>
              <el-empty v-if="!codeDiffLines.length" description="代码内容没有变化" />
            </div>
          </article>
        </template>

        <el-empty v-else description="请选择要查看的版本" />
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';

type GroupDraftHistoryItem = {
  id: number;
  version_no: number;
  previous_version_no: number | null;
  event_type: string;
  event_label: string;
  submission_note: string | null;
  source_code: string | null;
  occurred_at: string | null;
  updated_by_name: string | null;
  updated_by_student_no: string | null;
};

type GroupDraftHistoryPayload = {
  task_id: number;
  group_id: number;
  items: GroupDraftHistoryItem[];
};

type DiffLine = {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
};

const props = defineProps<{
  modelValue: boolean;
  taskId: number;
  token: string;
  codeEnabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const isLoading = ref(false);
const errorMessage = ref('');
const historyItems = ref<GroupDraftHistoryItem[]>([]);
const selectedVersionNo = ref<number | null>(null);

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const codeEnabled = computed(() => Boolean(props.codeEnabled));
const selectedItem = computed(
  () => historyItems.value.find((item) => item.version_no === selectedVersionNo.value) ?? historyItems.value[0] ?? null
);
const compareItem = computed(() => {
  if (!selectedItem.value) {
    return null;
  }
  if (selectedItem.value.previous_version_no !== null) {
    return historyItems.value.find((item) => item.version_no === selectedItem.value?.previous_version_no) ?? null;
  }
  const selectedIndex = historyItems.value.findIndex((item) => item.id === selectedItem.value?.id);
  if (selectedIndex < 0) {
    return null;
  }
  return historyItems.value[selectedIndex + 1] ?? null;
});
const noteDiffLines = computed(() =>
  buildDiffLines(htmlToPlainText(compareItem.value?.submission_note), htmlToPlainText(selectedItem.value?.submission_note))
);
const codeDiffLines = computed(() =>
  buildDiffLines(compareItem.value?.source_code || '', selectedItem.value?.source_code || '')
);

function splitLines(value: string) {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function htmlToPlainText(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  if (typeof window === 'undefined') {
    return value.replace(/<[^>]+>/g, ' ');
  }
  const container = document.createElement('div');
  container.innerHTML = value;
  return (container.textContent || '').replace(/\r\n/g, '\n').trim();
}

function buildDiffLines(previousValue: string, currentValue: string) {
  const previousLines = splitLines(previousValue);
  const currentLines = splitLines(currentValue);
  if (!previousValue && !currentValue) {
    return [] as DiffLine[];
  }

  const previousLength = previousLines.length;
  const currentLength = currentLines.length;
  const lcs = Array.from({ length: previousLength + 1 }, () => Array<number>(currentLength + 1).fill(0));

  for (let previousIndex = previousLength - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let currentIndex = currentLength - 1; currentIndex >= 0; currentIndex -= 1) {
      if (previousLines[previousIndex] === currentLines[currentIndex]) {
        lcs[previousIndex][currentIndex] = lcs[previousIndex + 1][currentIndex + 1] + 1;
      } else {
        lcs[previousIndex][currentIndex] = Math.max(
          lcs[previousIndex + 1][currentIndex],
          lcs[previousIndex][currentIndex + 1]
        );
      }
    }
  }

  const diffLines: DiffLine[] = [];
  let previousIndex = 0;
  let currentIndex = 0;
  while (previousIndex < previousLength && currentIndex < currentLength) {
    if (previousLines[previousIndex] === currentLines[currentIndex]) {
      diffLines.push({ type: 'unchanged', text: currentLines[currentIndex] });
      previousIndex += 1;
      currentIndex += 1;
    } else if (lcs[previousIndex + 1][currentIndex] >= lcs[previousIndex][currentIndex + 1]) {
      diffLines.push({ type: 'removed', text: previousLines[previousIndex] });
      previousIndex += 1;
    } else {
      diffLines.push({ type: 'added', text: currentLines[currentIndex] });
      currentIndex += 1;
    }
  }

  while (previousIndex < previousLength) {
    diffLines.push({ type: 'removed', text: previousLines[previousIndex] });
    previousIndex += 1;
  }
  while (currentIndex < currentLength) {
    diffLines.push({ type: 'added', text: currentLines[currentIndex] });
    currentIndex += 1;
  }

  return diffLines;
}

function summarizeDiff(lines: DiffLine[]) {
  const addedCount = lines.filter((line) => line.type === 'added').length;
  const removedCount = lines.filter((line) => line.type === 'removed').length;
  if (!addedCount && !removedCount) {
    return '无变化';
  }
  return `+${addedCount} / -${removedCount}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function tagType(eventType: string) {
  if (eventType === 'submitted') {
    return 'success';
  }
  if (eventType === 'cleared') {
    return 'danger';
  }
  return 'info';
}

async function loadHistory() {
  if (!props.token || !props.taskId) {
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiGet<GroupDraftHistoryPayload>(`/tasks/${props.taskId}/group-draft/history`, props.token);
    historyItems.value = payload.items;
    selectedVersionNo.value = payload.items[0]?.version_no ?? null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载共享草稿历史失败';
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      void loadHistory();
    }
  }
);
</script>

<style scoped>
.history-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  min-height: 420px;
}

.history-sidebar,
.history-main,
.history-card {
  display: grid;
  gap: 12px;
}

.history-sidebar {
  padding: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(245, 250, 255, 0.92);
}

.history-main {
  align-content: start;
}

.history-sidebar-head,
.version-card-top,
.section-head,
.chip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.history-title,
.history-note,
.version-card p,
.section-head h4,
.section-head span {
  margin: 0;
}

.history-title,
.section-head h4 {
  font-weight: 700;
  color: var(--ls-text);
}

.history-note,
.version-card p,
.section-head span {
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.7;
}

.version-list {
  display: grid;
  gap: 10px;
}

.version-card {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(67, 109, 185, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  text-align: left;
  cursor: pointer;
}

.version-card-active {
  border-color: rgba(47, 135, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(47, 135, 255, 0.12);
}

.history-summary {
  margin-bottom: 4px;
}

.history-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.history-card {
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.95);
}

.code-preview {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
  color: #1f2a44;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-view {
  display: grid;
  gap: 6px;
}

.diff-line {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.03);
}

.diff-line-added {
  background: rgba(24, 172, 114, 0.12);
}

.diff-line-removed {
  background: rgba(225, 72, 72, 0.1);
}

.diff-sign {
  font-weight: 700;
  color: var(--ls-muted);
}

.diff-text {
  min-width: 0;
  color: var(--ls-text);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-text-code {
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
}

@media (max-width: 960px) {
  .history-shell,
  .history-preview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
