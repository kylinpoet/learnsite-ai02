<template>
  <div class="sw-typing">
    <StudentPageHead title="打字训练" :sub="headSub">
      <template #actions>
        <n-button secondary @click="router.push('/student/typing/rankings')">查看排行榜</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="homeData">
      <StudentPanel title="练习清单" :count="`${homeData.typing_sets.length} 篇`" flush>
        <template v-if="homeData.typing_sets.length">
          <article
            v-for="item in homeData.typing_sets"
            :key="item.id"
            class="sw-row sw-typing-row"
          >
            <span class="sw-row__main">
              <span class="sw-row__title">{{ item.title }}</span>
              <span class="sw-row__meta">
                <span>{{ item.difficulty }}</span>
                <span>{{ item.content_length }} 字</span>
                <span>{{ modeLabel(item.typing_mode) }}</span>
                <span v-if="item.last_speed !== null">上次 {{ item.last_speed }} CPM</span>
              </span>
            </span>
            <span class="sw-row__action">
              <n-button type="primary" @click="openPractice(item)">开始练习</n-button>
            </span>
          </article>
        </template>
        <StudentEmpty v-else text="当前还没有可练习内容，老师发布后会出现在这里。" />
      </StudentPanel>

      <StudentStatStrip :items="statItems" />

      <div class="sw-split">
        <StudentPanel
          title="最近练习"
          :count="`${homeData.recent_records.length} 次`"
          flush
        >
          <template v-if="homeData.recent_records.length">
            <article
              v-for="item in homeData.recent_records"
              :key="item.id"
              class="sw-row"
            >
              <span class="sw-row__main">
                <span class="sw-row__title">{{ item.typing_set_title }}</span>
                <span class="sw-row__meta">
                  <span>{{ formatDateTime(item.played_at) }}</span>
                  <span>{{ item.duration_sec }} 秒</span>
                  <span>{{ item.typed_chars }} 字</span>
                  <span>准确率 {{ item.accuracy_percent }}%</span>
                </span>
              </span>
              <span class="sw-row__value">
                {{ item.speed_cpm }}<small class="sw-row__unit"> CPM</small>
              </span>
            </article>
          </template>
          <StudentEmpty v-else text="你还没有练习记录，完成第一篇后会留在这里。" />
        </StudentPanel>

        <div class="sw-split__aside">
          <StudentPanel
            title="今日榜前 5"
            :count="`${rankingItems.length} 人`"
            flush
          >
            <template v-if="rankingItems.length">
              <article
                v-for="item in rankingItems"
                :key="`${item.student_no}-${item.played_at}`"
                class="sw-row sw-rank-row"
              >
                <span
                  :class="['sw-rank-row__rank', { 'is-top': item.rank <= 3 }]"
                >
                  {{ item.rank }}
                </span>
                <span class="sw-row__main">
                  <span class="sw-row__title">{{ item.student_name }}</span>
                  <span class="sw-row__meta">
                    <span>{{ item.typing_set_title }}</span>
                    <span>准确率 {{ item.accuracy_percent }}%</span>
                  </span>
                </span>
                <span class="sw-row__value">{{ item.speed_cpm }}</span>
              </article>
            </template>
            <StudentEmpty v-else text="今天还没有打字成绩，完成后就能上榜。" />
          </StudentPanel>
        </div>
      </div>
    </template>

    <n-modal
      v-model:show="practiceDialogVisible"
      :content-style="{ maxHeight: 'calc(92vh - 180px)', overflow: 'auto' }"
      :mask-closable="false"
      :style="{ width: 'min(720px, 94vw)' }"
      display-directive="if"
      preset="card"
      @after-leave="stopPracticeTimer"
    >
      <template #header>
        <div class="practice-head">
          <div class="practice-head__main">
            <h3>{{ activePracticeSet?.title || '打字练习' }}</h3>
            <p class="practice-head__meta">
              <span>{{ activePracticeSet ? modeLabel(activePracticeSet.typing_mode) : '--' }}</span>
              <span>{{ activePracticeSet?.difficulty || '--' }}</span>
              <span>{{ activePracticeSet?.content_length || 0 }} 字</span>
              <span>
                {{ practiceResult ? `用时 ${practiceResult.duration_sec} 秒` : `计时 ${elapsedSec} 秒` }}
              </span>
            </p>
          </div>
          <span v-if="practiceResult" class="sw-chip sw-chip--done">已完成</span>
          <span v-else class="sw-chip sw-chip--now">进行中</span>
        </div>
      </template>

      <div v-if="!practiceResult" class="practice-body">
        <section class="practice-block">
          <header class="practice-block__head">
            <h4>原文内容</h4>
            <span>{{ activePracticeSet?.content_length || 0 }} 字</span>
          </header>
          <div class="practice-source">
            {{ activePracticeSet?.content || '' }}
          </div>
        </section>

        <section class="practice-block">
          <header class="practice-block__head">
            <h4>输入区</h4>
            <span>{{ typedText.length }} / {{ activePracticeSet?.content_length || 0 }}</span>
          </header>

          <n-input
            v-model:value="typedText"
            :autosize="{ minRows: 12, maxRows: 18 }"
            :resizable="false"
            placeholder="请在这里开始输入原文内容"
            type="textarea"
          />

          <p class="practice-metrics">
            <span>已输入<strong>{{ typedText.length }}</strong></span>
            <span>当前速度<strong>{{ liveSpeedCpm }}</strong><small>CPM</small></span>
            <span>准确率<strong>{{ liveAccuracyPercent }}%</strong></span>
          </p>
        </section>
      </div>

      <div v-else class="practice-body">
        <p class="practice-metrics">
          <span>本次速度<strong>{{ practiceResult.speed_cpm }}</strong><small>CPM</small></span>
          <span>准确率<strong>{{ practiceResult.accuracy_percent }}%</strong></span>
          <span>今日排名<strong>{{ practiceResult.today_rank ? `#${practiceResult.today_rank}` : '--' }}</strong></span>
          <span>提交<strong class="is-text">{{ formatDateTime(practiceResult.played_at) }}</strong></span>
        </p>

        <template v-if="practiceRankingPreview?.items.length">
          <StudentPanel
            :title="practiceRankingPreview.label || '最新榜'"
            :count="`${practiceRankingPreview.items.length} 人`"
            flush
          >
            <article
              v-for="item in practiceRankingPreview.items"
              :key="`${item.student_no}-${item.played_at}`"
              class="sw-row sw-rank-row"
            >
              <span :class="['sw-rank-row__rank', { 'is-top': item.rank <= 3 }]">
                {{ item.rank }}
              </span>
              <span class="sw-row__main">
                <span class="sw-row__title">{{ item.student_name }}</span>
                <span class="sw-row__meta">
                  <span>{{ item.typing_set_title }}</span>
                  <span>准确率 {{ item.accuracy_percent }}%</span>
                </span>
              </span>
              <span class="sw-row__value">{{ item.speed_cpm }}</span>
            </article>
          </StudentPanel>
        </template>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <n-button @click="closePracticeDialog">
            {{ practiceResult ? '关闭' : '取消' }}
          </n-button>
          <n-button v-if="practiceResult" secondary @click="restartPractice">再练一次</n-button>
          <n-button
            v-else
            :disabled="!activePracticeSet || !typedText.length"
            :loading="submittingPractice"
            type="primary"
            @click="submitPractice"
          >
            提交成绩
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NInput, NModal, NSkeleton } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';

type RankingItem = {
  rank: number;
  student_name: string;
  student_no: string;
  class_name: string;
  speed_cpm: number;
  accuracy_percent: number;
  typing_set_title: string;
  played_at: string;
};

type TypingHomePayload = {
  overview: {
    average_speed: number | null;
    best_speed: number | null;
    best_accuracy: number | null;
    attempt_count: number;
    today_rank: number | null;
    today_participants: number;
  };
  typing_sets: Array<{
    id: number;
    title: string;
    typing_mode: string;
    difficulty: string;
    description: string | null;
    content: string;
    content_length: number;
    last_speed: number | null;
    last_accuracy: number | null;
    last_played_at: string | null;
  }>;
  recent_records: Array<{
    id: number;
    typing_set_id: number;
    typing_set_title: string;
    speed_cpm: number;
    accuracy_percent: number;
    duration_sec: number;
    typed_chars: number;
    played_at: string;
  }>;
  ranking_preview: {
    label: string;
    items: RankingItem[];
    pending_students: Array<{
      student_name: string;
      student_no: string;
    }>;
  };
};

type TypingSessionPayload = {
  summary: {
    record_id: number;
    typing_set_id: number;
    typing_set_title: string;
    speed_cpm: number;
    accuracy_percent: number;
    duration_sec: number;
    typed_chars: number;
    played_at: string;
    today_rank: number | null;
  };
  ranking_preview: {
    label: string;
    items: RankingItem[];
    pending_students: Array<{
      student_name: string;
      student_no: string;
    }>;
  };
};

const router = useRouter();
const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const homeData = ref<TypingHomePayload | null>(null);

const practiceDialogVisible = ref(false);
const activePracticeSet = ref<TypingHomePayload['typing_sets'][number] | null>(null);
const typedText = ref('');
const practiceStartedAt = ref(0);
const elapsedSec = ref(0);
const submittingPractice = ref(false);
const practiceResult = ref<TypingSessionPayload['summary'] | null>(null);
const practiceRankingPreview = ref<TypingSessionPayload['ranking_preview'] | null>(null);

let practiceTimer: ReturnType<typeof window.setInterval> | null = null;

const liveAccuracyPercent = computed(() => {
  const source = activePracticeSet.value?.content || '';
  const input = typedText.value;
  if (!source && !input) {
    return 0;
  }
  const maxLength = Math.max(source.length, input.length, 1);
  let matched = 0;
  for (let index = 0; index < Math.min(source.length, input.length); index += 1) {
    if (source[index] === input[index]) {
      matched += 1;
    }
  }
  return Math.round((matched / maxLength) * 100);
});

const liveSpeedCpm = computed(() => {
  if (!elapsedSec.value) {
    return 0;
  }
  return Math.round((typedText.value.length * 60) / elapsedSec.value);
});

const lastRecord = computed(() => {
  const records = homeData.value?.recent_records || [];
  if (!records.length) {
    return null;
  }
  return records.reduce((latest, item) => (item.played_at > latest.played_at ? item : latest), records[0]);
});

const rankingItems = computed(() => homeData.value?.ranking_preview.items.slice(0, 5) || []);

const headSub = computed(() => {
  if (!homeData.value) {
    return '';
  }
  const record = lastRecord.value;
  if (!record) {
    return `共 ${homeData.value.typing_sets.length} 篇练习 · 还没有练习记录`;
  }
  return `上次 ${record.speed_cpm} 字/分 · 正确率 ${record.accuracy_percent}%`;
});

const statItems = computed<StudentStatItem[]>(() => {
  const overview = homeData.value?.overview;
  const bestAccuracy = overview?.best_accuracy;
  return [
    { label: '平均速度', value: displayNumber(overview?.average_speed ?? null), unit: 'CPM' },
    { label: '最佳速度', value: displayNumber(overview?.best_speed ?? null), unit: 'CPM' },
    {
      label: '最佳准确率',
      value: bestAccuracy === null || bestAccuracy === undefined ? '--' : `${bestAccuracy}%`,
    },
    {
      label: '今日排名',
      value: overview?.today_rank ? `#${overview.today_rank}` : '--',
      note: `${overview?.today_participants ?? 0} 人已参与`,
    },
  ];
});

function displayNumber(value: number | null) {
  return value === null ? '--' : value;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function modeLabel(mode: string) {
  if (mode === 'english') {
    return '英文';
  }
  if (mode === 'chinese') {
    return '中文';
  }
  if (mode === 'pinyin') {
    return '拼音';
  }
  return mode;
}

function stopPracticeTimer() {
  if (practiceTimer !== null) {
    window.clearInterval(practiceTimer);
    practiceTimer = null;
  }
}

function startPracticeTimer() {
  stopPracticeTimer();
  elapsedSec.value = 0;
  practiceStartedAt.value = Date.now();
  practiceTimer = window.setInterval(() => {
    elapsedSec.value = Math.max(1, Math.round((Date.now() - practiceStartedAt.value) / 1000));
  }, 1000);
}

function resetPracticeState() {
  typedText.value = '';
  practiceResult.value = null;
  practiceRankingPreview.value = null;
  elapsedSec.value = 0;
  practiceStartedAt.value = 0;
  submittingPractice.value = false;
}

function openPractice(item: TypingHomePayload['typing_sets'][number]) {
  activePracticeSet.value = item;
  resetPracticeState();
  practiceDialogVisible.value = true;
  startPracticeTimer();
}

function closePracticeDialog() {
  practiceDialogVisible.value = false;
  stopPracticeTimer();
  resetPracticeState();
  activePracticeSet.value = null;
}

function restartPractice() {
  if (!activePracticeSet.value) {
    return;
  }
  resetPracticeState();
  startPracticeTimer();
}

async function loadHome() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    homeData.value = await apiGet<TypingHomePayload>('/typing/home', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载打字数据失败';
  } finally {
    isLoading.value = false;
  }
}

async function submitPractice() {
  if (!authStore.token || !activePracticeSet.value) {
    return;
  }

  submittingPractice.value = true;

  try {
    const payload = await apiPost<TypingSessionPayload>(
      '/typing/sessions',
      {
        typing_set_id: activePracticeSet.value.id,
        typed_chars: typedText.value.length,
        duration_sec: Math.max(elapsedSec.value, 1),
        accuracy_percent: liveAccuracyPercent.value,
      },
      authStore.token
    );
    stopPracticeTimer();
    practiceResult.value = payload.summary;
    practiceRankingPreview.value = payload.ranking_preview;
    ElMessage.success(`成绩已保存，本次速度 ${payload.summary.speed_cpm} CPM`);
    await loadHome();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存打字成绩失败');
  } finally {
    submittingPractice.value = false;
  }
}

onMounted(loadHome);
onBeforeUnmount(stopPracticeTimer);
</script>

<style scoped>
.sw-typing {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-typing-row {
  min-height: 64px;
}

.sw-row__unit {
  color: var(--sw-muted);
  font-size: 11.5px;
  font-weight: 400;
}

.sw-rank-row__rank {
  flex: none;
  width: 26px;
  color: var(--sw-muted);
  font-size: 12px;
  line-height: 1.45;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sw-rank-row__rank.is-top {
  color: var(--sw-ink);
  font-weight: 600;
}

.sw-rank-row .sw-row__value {
  min-width: 48px;
  font-size: 14px;
}

/* 练习弹窗：单列，原文与输入区用分隔线过渡 */
.practice-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.practice-head__main {
  min-width: 0;
}

.practice-head h3 {
  margin: 0;
  color: var(--sw-ink);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.practice-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 5px 0 0;
  color: var(--sw-muted);
  font-size: 12px;
}

.practice-body {
  display: grid;
  gap: 16px;
}

.practice-block {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.practice-block + .practice-block {
  padding-top: 16px;
  border-top: 1px solid var(--sw-line-soft);
}

.practice-block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.practice-block__head h4 {
  margin: 0;
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 600;
}

.practice-block__head span {
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.practice-source {
  max-height: 200px;
  padding: 12px 14px;
  overflow: auto;
  border: 1px solid var(--sw-line-soft);
  border-radius: var(--sw-r-card);
  background: var(--sw-surface-2);
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}

.practice-metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 0;
  margin: 0;
  padding: 0;
}

.practice-metrics > span {
  padding: 0 16px;
  border-left: 1px solid var(--sw-line-soft);
  color: var(--sw-muted);
  font-size: 12px;
}

.practice-metrics > span:first-child {
  padding-left: 0;
  border-left: 0;
}

.practice-metrics strong {
  margin-left: 6px;
  color: var(--sw-ink);
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.practice-metrics strong.is-text {
  font-size: 13px;
  font-weight: 500;
}

.practice-metrics small {
  margin-left: 3px;
  color: var(--sw-muted);
  font-size: 11px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .practice-metrics > span {
    padding: 0 12px;
  }
}
</style>
