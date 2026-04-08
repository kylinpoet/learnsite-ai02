<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">打字训练</p>
        <h2>课堂打字练习与速度反馈</h2>
        <p class="hero-copy">
          在这里完成英文、中文与拼音练习，系统会将成绩实时同步到排行榜。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadHome">刷新练习数据</el-button>
        <el-button plain @click="router.push('/student/typing/rankings')">查看排行榜</el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="10" />
        </el-card>
      </template>

      <template #default>
        <template v-if="homeData">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">平均速度</p>
              <p class="metric-value">{{ displayNumber(homeData.overview.average_speed) }}</p>
              <p class="metric-note">单位 CPM，按历史练习成绩计算</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">最佳速度</p>
              <p class="metric-value">{{ displayNumber(homeData.overview.best_speed) }}</p>
              <p class="metric-note">当前账号历史最高速度</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">最佳准确率</p>
              <p class="metric-value">
                {{ homeData.overview.best_accuracy === null ? '--' : `${homeData.overview.best_accuracy}%` }}
              </p>
              <p class="metric-note">按字符匹配结果估算</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">今日排名</p>
              <p class="metric-value">
                {{ homeData.overview.today_rank ? `#${homeData.overview.today_rank}` : '--' }}
              </p>
              <p class="metric-note">今日已有 {{ homeData.overview.today_participants }} 名同学参与</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="16" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>练习内容</h3>
                      <p class="section-note">点击任意练习即可进入打字窗口并记录成绩。</p>
                    </div>
                    <el-tag round type="info">共 {{ homeData.typing_sets.length }} 套</el-tag>
                  </div>
                </template>

                <el-empty v-if="!homeData.typing_sets.length" description="当前还没有可练习内容" />

                <div v-else class="typing-set-list">
                  <article
                    v-for="item in homeData.typing_sets"
                    :key="item.id"
                    class="typing-set-card"
                  >
                    <div class="typing-set-card__top">
                      <div>
                        <h4>{{ item.title }}</h4>
                        <p class="typing-set-card__desc">
                          {{ item.description || '教师暂未填写练习说明。' }}
                        </p>
                      </div>
                      <el-tag round>{{ modeLabel(item.typing_mode) }}</el-tag>
                    </div>

                    <div class="chip-row">
                      <el-tag round type="warning">{{ item.difficulty }}</el-tag>
                      <el-tag round>{{ item.content_length }} 字</el-tag>
                      <el-tag v-if="item.last_speed !== null" round type="success">
                        上次速度 {{ item.last_speed }}
                      </el-tag>
                      <el-tag v-if="item.last_accuracy !== null" round type="info">
                        上次准确率 {{ item.last_accuracy }}%
                      </el-tag>
                    </div>

                    <p class="typing-set-card__content">
                      {{ contentPreview(item.content) }}
                    </p>

                    <div class="typing-set-card__footer">
                      <span class="section-note">
                        {{ item.last_played_at ? `上次练习 ${formatDateTime(item.last_played_at)}` : '还没有练习记录' }}
                      </span>
                      <el-button type="primary" @click="openPractice(item)">开始练习</el-button>
                    </div>
                  </article>
                </div>
              </el-card>
            </el-col>

            <el-col :lg="8" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>班级榜预览</h3>
                      <p class="section-note">{{ homeData.ranking_preview.label }}</p>
                    </div>
                    <el-button link type="primary" @click="router.push('/student/typing/rankings')">
                      完整榜单
                    </el-button>
                  </div>
                </template>

                <el-empty
                  v-if="!homeData.ranking_preview.items.length"
                  description="今天还没有打字成绩"
                />

                <div v-else class="ranking-preview-list">
                  <article
                    v-for="item in homeData.ranking_preview.items"
                    :key="`${item.student_no}-${item.played_at}`"
                    class="ranking-preview-item"
                  >
                    <div>
                      <p class="ranking-preview-item__name">#{{ item.rank }} {{ item.student_name }}</p>
                      <p class="section-note">
                        {{ item.typing_set_title }} · {{ item.accuracy_percent }}%
                      </p>
                    </div>
                    <strong>{{ item.speed_cpm }}</strong>
                  </article>
                </div>

                <div class="pending-box">
                  <p class="pending-box__title">今日未练习</p>
                  <el-empty
                    v-if="!homeData.ranking_preview.pending_students.length"
                    description="本班学生都已参与"
                  />
                  <div v-else class="chip-row">
                    <el-tag
                      v-for="item in homeData.ranking_preview.pending_students"
                      :key="item.student_no"
                      round
                      type="warning"
                    >
                      {{ item.student_name }}
                    </el-tag>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-card class="soft-card">
            <template #header>
              <div class="section-head">
                <div>
                  <h3>最近练习记录</h3>
                  <p class="section-note">保留最近 5 次成绩，便于学生回看进步情况。</p>
                </div>
              </div>
            </template>

            <el-empty v-if="!homeData.recent_records.length" description="你还没有练习记录" />

            <el-table v-else :data="homeData.recent_records" stripe>
              <el-table-column label="练习名称" min-width="220" prop="typing_set_title" />
              <el-table-column label="速度" min-width="100" prop="speed_cpm" />
              <el-table-column label="准确率" min-width="100">
                <template #default="{ row }">
                  {{ row.accuracy_percent }}%
                </template>
              </el-table-column>
              <el-table-column label="时长" min-width="100">
                <template #default="{ row }">
                  {{ row.duration_sec }} 秒
                </template>
              </el-table-column>
              <el-table-column label="字数" min-width="100" prop="typed_chars" />
              <el-table-column label="练习时间" min-width="180">
                <template #default="{ row }">
                  {{ formatDateTime(row.played_at) }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </template>
      </template>
    </el-skeleton>

    <el-dialog
      v-model="practiceDialogVisible"
      :close-on-click-modal="false"
      destroy-on-close
      top="4vh"
      width="min(1100px, 94vw)"
      @closed="stopPracticeTimer"
    >
      <template #header>
        <div class="section-head">
          <div>
            <p class="eyebrow">{{ practiceResult ? '练习结果' : '正在练习' }}</p>
            <h3>{{ activePracticeSet?.title || '打字练习' }}</h3>
            <p class="section-note">
              {{ practiceResult ? '成绩已经保存，可以继续再练一次。' : (activePracticeSet?.description || '请尽量对照原文完整输入。') }}
            </p>
          </div>
          <div class="chip-row">
            <el-tag round>{{ activePracticeSet ? modeLabel(activePracticeSet.typing_mode) : '--' }}</el-tag>
            <el-tag round type="warning">{{ activePracticeSet?.difficulty || '--' }}</el-tag>
            <el-tag round type="success">计时 {{ elapsedSec }} 秒</el-tag>
          </div>
        </div>
      </template>

      <div v-if="!practiceResult" class="practice-shell">
        <div class="practice-panel">
          <div class="panel-head">
            <h4>原文内容</h4>
            <el-tag round>{{ activePracticeSet?.content_length || 0 }} 字</el-tag>
          </div>
          <div class="practice-source">
            {{ activePracticeSet?.content || '' }}
          </div>
        </div>

        <div class="practice-panel">
          <div class="panel-head">
            <h4>输入区</h4>
            <div class="chip-row">
              <el-tag round>当前速度 {{ liveSpeedCpm }}</el-tag>
              <el-tag round type="info">准确率 {{ liveAccuracyPercent }}%</el-tag>
            </div>
          </div>

          <el-input
            v-model="typedText"
            :autosize="{ minRows: 12, maxRows: 18 }"
            placeholder="请在这里开始输入原文内容"
            resize="none"
            type="textarea"
          />

          <div class="metric-grid practice-metrics">
            <article class="metric-tile">
              <p class="metric-label">已输入字符</p>
              <p class="metric-value">{{ typedText.length }}</p>
              <p class="metric-note">按当前输入统计</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">当前速度</p>
              <p class="metric-value">{{ liveSpeedCpm }}</p>
              <p class="metric-note">按当前时间折算 CPM</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">当前准确率</p>
              <p class="metric-value">{{ liveAccuracyPercent }}%</p>
              <p class="metric-note">按字符位置估算</p>
            </article>
          </div>
        </div>
      </div>

      <div v-else class="page-stack">
        <div class="metric-grid">
          <article class="metric-tile">
            <p class="metric-label">本次速度</p>
            <p class="metric-value">{{ practiceResult.speed_cpm }}</p>
            <p class="metric-note">单位 CPM</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">准确率</p>
            <p class="metric-value">{{ practiceResult.accuracy_percent }}%</p>
            <p class="metric-note">已自动保存</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">今日排名</p>
            <p class="metric-value">{{ practiceResult.today_rank ? `#${practiceResult.today_rank}` : '--' }}</p>
            <p class="metric-note">{{ formatDateTime(practiceResult.played_at) }}</p>
          </article>
        </div>

        <el-card class="soft-card">
          <template #header>
            <div class="section-head">
              <div>
                <h3>最新榜单预览</h3>
                <p class="section-note">{{ practiceRankingPreview?.label || '当前班级' }}</p>
              </div>
            </div>
          </template>

          <div v-if="practiceRankingPreview?.items.length" class="ranking-preview-list">
            <article
              v-for="item in practiceRankingPreview.items"
              :key="`${item.student_no}-${item.played_at}`"
              class="ranking-preview-item"
            >
              <div>
                <p class="ranking-preview-item__name">#{{ item.rank }} {{ item.student_name }}</p>
                <p class="section-note">
                  {{ item.typing_set_title }} · {{ item.accuracy_percent }}%
                </p>
              </div>
              <strong>{{ item.speed_cpm }}</strong>
            </article>
          </div>
        </el-card>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closePracticeDialog">
            {{ practiceResult ? '关闭' : '取消' }}
          </el-button>
          <el-button v-if="practiceResult" plain @click="restartPractice">再练一次</el-button>
          <el-button
            v-else
            :disabled="!activePracticeSet || !typedText.length"
            :loading="submittingPractice"
            type="primary"
            @click="submitPractice"
          >
            提交成绩
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
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

function contentPreview(content: string) {
  return content.length > 110 ? `${content.slice(0, 110)}...` : content;
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
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-head h3 {
  margin: 0 0 4px;
}

.typing-set-list {
  display: grid;
  gap: 14px;
}

.typing-set-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 255, 0.94));
}

.typing-set-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.typing-set-card__top h4 {
  margin: 0 0 8px;
}

.typing-set-card__desc,
.typing-set-card__content {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.typing-set-card__content {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 255, 0.95);
  color: var(--ls-text);
}

.typing-set-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ranking-preview-list {
  display: grid;
  gap: 10px;
}

.ranking-preview-item {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(223, 230, 245, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ranking-preview-item__name {
  margin: 0 0 4px;
  font-weight: 700;
}

.pending-box {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--ls-border);
}

.pending-box__title {
  margin: 0 0 10px;
  font-weight: 700;
}

.practice-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 16px;
}

.practice-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--ls-border);
  background: rgba(255, 255, 255, 0.96);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-head h4 {
  margin: 0;
}

.practice-source {
  padding: 16px;
  border-radius: 16px;
  background: rgba(248, 250, 255, 0.96);
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 320px;
}

.practice-metrics {
  margin-top: 2px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .practice-shell {
    grid-template-columns: 1fr;
  }

  .typing-set-card__top {
    flex-direction: column;
  }
}
</style>
