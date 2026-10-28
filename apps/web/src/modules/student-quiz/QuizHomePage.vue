<template>
  <div class="sw-quiz">
    <StudentPageHead title="随堂测验" :sub="headSub">
      <template #actions>
        <n-button secondary @click="router.push('/student/quiz/rankings')">查看今日排行榜</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="homeData">
      <StudentPanel title="可开始" :count="`${homeData.available_quizzes.length} 场`" flush>
        <template v-if="homeData.available_quizzes.length">
          <article
            v-for="quiz in homeData.available_quizzes"
            :key="quiz.id"
            class="sw-row sw-quiz-row"
          >
            <span class="sw-row__main">
              <span class="sw-row__title">{{ quiz.title }}</span>
              <span class="sw-row__meta">
                <span>{{ quiz.question_count }} 题</span>
                <span v-if="quiz.last_score !== null">上次 {{ quiz.last_score }} 分</span>
                <span v-if="quiz.last_submitted_at">上次提交 {{ formatDateTime(quiz.last_submitted_at) }}</span>
              </span>
            </span>
            <span class="sw-row__action">
              <n-button
                :loading="startingQuizId === quiz.id"
                type="primary"
                @click="startQuiz(quiz.id)"
              >
                开始测验
              </n-button>
            </span>
          </article>
        </template>
        <StudentEmpty v-else text="本班还没有可开始的测验，老师发布后会出现在这里。" />
      </StudentPanel>

      <StudentStatStrip :items="statItems" />

      <div class="sw-split">
        <StudentPanel title="最近测验" :count="`${homeData.recent_attempts.length} 次`" flush>
          <template v-if="homeData.recent_attempts.length">
            <article
              v-for="item in homeData.recent_attempts"
              :key="item.id"
              class="sw-row"
            >
              <span class="sw-row__main">
                <span class="sw-row__title">{{ item.quiz_title }}</span>
                <span class="sw-row__meta">
                  <span>答对 {{ item.correct_count }} / {{ item.total_count }} 题</span>
                  <span>{{ formatDateTime(item.submitted_at) }}</span>
                </span>
              </span>
              <span class="sw-row__value">{{ displayNumber(item.score) }}</span>
            </article>
          </template>
          <StudentEmpty v-else text="你还没有提交过测验，完成第一场后会留在这里。" />
        </StudentPanel>

        <div class="sw-split__aside">
          <StudentPanel title="今日榜前 5" :count="`${rankingItems.length} 人`" flush>
            <template v-if="rankingItems.length">
              <article
                v-for="item in rankingItems"
                :key="`${item.student_no}-${item.submitted_at}`"
                class="sw-row"
              >
                <span class="sw-row__main">
                  <span class="sw-row__title">{{ item.student_name }}</span>
                  <span class="sw-row__meta">
                    <span>{{ item.quiz_title }}</span>
                    <span>{{ formatDateTime(item.submitted_at) }}</span>
                  </span>
                </span>
                <span class="sw-row__value">{{ item.score }}</span>
              </article>
            </template>
            <StudentEmpty v-else text="今天还没有同学提交测验。" />
          </StudentPanel>
        </div>
      </div>
    </template>

    <n-modal
      v-model:show="attemptDialogVisible"
      :mask-closable="false"
      :style="{ width: 'min(960px, 92vw)' }"
      display-directive="if"
      preset="card"
    >
      <template #header>
        <div class="attempt-dialog__header">
          <div>
            <h3>{{ attemptMeta?.title || '课堂测验' }}</h3>
            <p class="attempt-dialog__meta">
              {{ attemptQuestions.length }} 题 ·
              {{ resultSummary ? `结果已保存，今日排名 ${resultSummary.today_rank || '--'}` : `已作答 ${answeredCount} 题` }}
            </p>
          </div>
        </div>
      </template>

      <div v-if="!resultSummary" class="attempt-dialog__body">
        <n-alert
          v-if="attemptErrorMessage"
          :closable="false"
          :title="attemptErrorMessage"
          type="error"
        />

        <div class="attempt-progress">
          <span>答题进度</span>
          <n-progress :percentage="progressPercent" :stroke-width="10" />
        </div>

        <div class="question-list">
          <article
            v-for="(question, index) in attemptQuestions"
            :key="question.id"
            class="question-card"
          >
            <div class="question-card__head">
              <div>
                <p class="question-card__index">第 {{ index + 1 }} 题</p>
                <h4>{{ question.content }}</h4>
              </div>
              <n-tag round>{{ question.difficulty }}</n-tag>
            </div>

            <n-radio-group v-model:value="selectedAnswers[question.id]" class="option-list">
              <n-radio
                v-for="option in question.options"
                :key="option.key"
                :value="option.key"
                class="option-item"
              >
                {{ option.key }}. {{ option.text }}
              </n-radio>
            </n-radio-group>
          </article>
        </div>
      </div>

      <div v-else class="attempt-dialog__body">
        <div class="result-line">
          <p class="result-line__item">
            <span>得分</span>
            <strong>{{ resultSummary.score }}</strong>
          </p>
          <p class="result-line__item">
            <span>答对</span>
            <strong>{{ resultSummary.correct_count }}<small>/ {{ resultSummary.total_count }}</small></strong>
          </p>
          <p class="result-line__item">
            <span>今日排名</span>
            <strong>{{ resultSummary.today_rank ? `#${resultSummary.today_rank}` : '--' }}</strong>
          </p>
          <p class="result-line__item">
            <span>提交时间</span>
            <strong class="is-text">{{ formatDateTime(resultSummary.submitted_at) }}</strong>
          </p>
        </div>

        <div class="question-list">
          <article
            v-for="(answer, index) in resultAnswers"
            :key="answer.question_id"
            class="question-card"
            :class="answer.is_correct ? 'question-card-correct' : 'question-card-wrong'"
          >
            <div class="question-card__head">
              <div>
                <p class="question-card__index">第 {{ index + 1 }} 题</p>
                <h4>{{ answer.content }}</h4>
              </div>
              <n-tag :type="answer.is_correct ? 'success' : 'error'" round>
                {{ answer.is_correct ? '回答正确' : '需要订正' }}
              </n-tag>
            </div>

            <div class="result-answer-grid">
              <div class="result-answer-grid__item">
                <span>你的答案</span>
                <strong>{{ answer.selected_option_key || '未作答' }}</strong>
              </div>
              <div class="result-answer-grid__item">
                <span>正确答案</span>
                <strong>{{ answer.correct_option_key || '--' }}</strong>
              </div>
            </div>

            <p v-if="answer.explanation" class="question-explanation">
              解析：{{ answer.explanation }}
            </p>
          </article>
        </div>
      </div>

      <template #footer>
        <div class="attempt-dialog__footer">
          <n-button @click="closeAttemptDialog">
            {{ resultSummary ? '关闭' : '取消' }}
          </n-button>
          <n-button
            v-if="resultSummary"
            secondary
            @click="restartCurrentQuiz"
          >
            再测一次
          </n-button>
          <n-button
            v-else
            :disabled="!attemptMeta"
            :loading="submitLoading"
            type="primary"
            @click="submitCurrentAttempt"
          >
            提交测验
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NModal, NProgress, NRadio, NRadioGroup, NSkeleton, NTag } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';

type RankingPreviewItem = {
  rank: number;
  student_name: string;
  student_no: string;
  score: number;
  quiz_title: string;
  submitted_at: string | null;
};

type QuizHomePayload = {
  overview: {
    average_score: number | null;
    best_score: number | null;
    attempt_count: number;
    today_rank: number | null;
    today_participants: number;
  };
  available_quizzes: Array<{
    id: number;
    title: string;
    description: string | null;
    question_count: number;
    last_score: number | null;
    last_submitted_at: string | null;
  }>;
  recent_attempts: Array<{
    id: number;
    quiz_id: number;
    quiz_title: string;
    score: number | null;
    correct_count: number;
    total_count: number;
    submitted_at: string | null;
    status: string;
  }>;
  ranking_preview: {
    class_name: string;
    items: RankingPreviewItem[];
    pending_students: Array<{
      student_name: string;
      student_no: string;
    }>;
  };
};

type QuizStartPayload = {
  attempt: {
    id: number;
    quiz_id: number;
    title: string;
    description: string | null;
    question_count: number;
    started_at: string;
  };
  questions: Array<{
    id: number;
    content: string;
    difficulty: string;
    options: Array<{
      key: string;
      text: string;
    }>;
  }>;
};

type QuizSubmitPayload = {
  summary: {
    attempt_id: number;
    quiz_id: number;
    quiz_title: string;
    score: number;
    correct_count: number;
    total_count: number;
    submitted_at: string | null;
    today_rank: number | null;
  };
  answers: Array<{
    question_id: number;
    content: string;
    selected_option_key: string | null;
    correct_option_key: string | null;
    is_correct: boolean;
    explanation: string | null;
  }>;
};

const router = useRouter();
const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const homeData = ref<QuizHomePayload | null>(null);

const startingQuizId = ref<number | null>(null);
const attemptDialogVisible = ref(false);
const attemptMeta = ref<QuizStartPayload['attempt'] | null>(null);
const attemptQuestions = ref<QuizStartPayload['questions']>([]);
const selectedAnswers = ref<Record<number, string>>({});
const attemptErrorMessage = ref('');
const submitLoading = ref(false);
const resultSummary = ref<QuizSubmitPayload['summary'] | null>(null);
const resultAnswers = ref<QuizSubmitPayload['answers']>([]);

const answeredCount = computed(() =>
  attemptQuestions.value.filter((question) => Boolean(selectedAnswers.value[question.id])).length
);

const progressPercent = computed(() => {
  if (!attemptQuestions.value.length) {
    return 0;
  }
  return Math.round((answeredCount.value / attemptQuestions.value.length) * 100);
});

const headSub = computed(() => {
  const overview = homeData.value?.overview;
  if (!overview) {
    return '';
  }
  const rank = overview.today_rank ? `第 ${overview.today_rank}` : '--';
  return `今天 ${overview.today_participants} 人已参与，我的排名 ${rank}`;
});

const statItems = computed<StudentStatItem[]>(() => {
  const overview = homeData.value?.overview;
  return [
    { label: '平均分', value: overview?.average_score ?? '--' },
    { label: '最佳', value: overview?.best_score ?? '--' },
    { label: '测验次数', value: overview?.attempt_count ?? 0, unit: '次' },
    {
      label: '今日排名',
      value: overview?.today_rank ? `#${overview.today_rank}` : '--',
      note: `${overview?.today_participants ?? 0} 人已参与`,
    },
  ];
});

const rankingItems = computed(() => homeData.value?.ranking_preview.items.slice(0, 5) || []);

function displayNumber(value: number | null) {
  return value === null ? '--' : value;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function resetAttemptState() {
  attemptMeta.value = null;
  attemptQuestions.value = [];
  selectedAnswers.value = {};
  attemptErrorMessage.value = '';
  resultSummary.value = null;
  resultAnswers.value = [];
}

function closeAttemptDialog() {
  attemptDialogVisible.value = false;
  resetAttemptState();
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
    homeData.value = await apiGet<QuizHomePayload>('/quizzes/student/home', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载测验数据失败';
  } finally {
    isLoading.value = false;
  }
}

async function startQuiz(quizId: number) {
  if (!authStore.token) {
    ElMessage.warning('请先登录学生账号');
    return;
  }

  startingQuizId.value = quizId;
  attemptErrorMessage.value = '';

  try {
    const payload = await apiPost<QuizStartPayload>(
      '/quizzes/start',
      { quiz_id: quizId },
      authStore.token
    );
    attemptMeta.value = payload.attempt;
    attemptQuestions.value = payload.questions;
    selectedAnswers.value = {};
    resultSummary.value = null;
    resultAnswers.value = [];
    attemptDialogVisible.value = true;
  } catch (error) {
    attemptErrorMessage.value = error instanceof Error ? error.message : '开始测验失败';
    ElMessage.error(attemptErrorMessage.value);
  } finally {
    startingQuizId.value = null;
  }
}

async function submitCurrentAttempt() {
  if (!authStore.token || !attemptMeta.value) {
    return;
  }

  submitLoading.value = true;
  attemptErrorMessage.value = '';

  try {
    const payload = await apiPost<QuizSubmitPayload>(
      `/quizzes/attempts/${attemptMeta.value.id}/submit`,
      {
        answers: attemptQuestions.value.map((question) => ({
          question_id: question.id,
          selected_option_key: selectedAnswers.value[question.id] || null,
        })),
      },
      authStore.token
    );

    resultSummary.value = payload.summary;
    resultAnswers.value = payload.answers;
    ElMessage.success(`测验已提交，本次得分 ${payload.summary.score}`);
    await loadHome();
  } catch (error) {
    attemptErrorMessage.value = error instanceof Error ? error.message : '提交测验失败';
    ElMessage.error(attemptErrorMessage.value);
  } finally {
    submitLoading.value = false;
  }
}

async function restartCurrentQuiz() {
  const quizId = resultSummary.value?.quiz_id || attemptMeta.value?.quiz_id;
  if (!quizId) {
    return;
  }
  resetAttemptState();
  await startQuiz(quizId);
}

onMounted(loadHome);
</script>

<style scoped>
.sw-quiz {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-quiz-row {
  min-height: 64px;
}

.attempt-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.attempt-dialog__header h3 {
  margin: 0 0 4px;
}

.attempt-dialog__meta {
  margin: 0;
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.attempt-dialog__body {
  display: grid;
  gap: 16px;
}

.attempt-progress {
  display: grid;
  gap: 8px;
}

.question-list {
  display: grid;
  gap: 16px;
  max-height: min(62vh, 860px);
  overflow: auto;
  padding-right: 4px;
}

.question-card {
  border: 1px solid var(--sw-line);
  border-radius: 10px;
  padding: 18px;
  background: var(--ls-card);
  display: grid;
  gap: 16px;
}

.question-card-correct {
  border-color: rgba(78, 189, 139, 0.35);
  background: rgba(40, 185, 126, 0.12);
}

.question-card-wrong {
  border-color: rgba(235, 96, 96, 0.24);
  background: rgba(235, 96, 96, 0.12);
}

.question-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.question-card__head h4 {
  margin: 6px 0 0;
  line-height: 1.7;
}

.question-card__index {
  margin: 0;
  color: var(--ls-muted);
  font-size: 13px;
}

.option-list {
  display: grid;
  gap: 10px;
}

.option-item {
  margin-right: 0;
  width: 100%;
  height: auto;
  align-items: flex-start;
  padding: 12px 14px;
  white-space: normal;
  border: 1px solid var(--ls-border);
  border-radius: 12px;
  background: var(--ls-elevated);
}

.option-item:hover {
  border-color: var(--ls-primary);
}

.option-item :deep(.n-radio__label) {
  white-space: normal;
}

/* 结果：一行数字，不是四张卡 */
.result-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 0;
  padding: 2px 0 14px;
  border-bottom: 1px solid var(--ls-border);
}

.result-line__item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 0 20px;
  border-right: 1px solid var(--ls-border);
}

.result-line__item:first-child {
  padding-left: 0;
}

.result-line__item:last-child {
  border-right: 0;
}

.result-line__item span {
  color: var(--ls-muted);
  font-size: 12px;
}

.result-line__item strong {
  color: var(--ls-ink);
  font-size: 20px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.result-line__item strong.is-text {
  font-size: 14px;
  font-weight: 400;
}

.result-line__item strong small {
  margin-left: 3px;
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 400;
}

.result-answer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.result-answer-grid__item {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--ls-panel-soft);
  display: grid;
  gap: 4px;
}

.result-answer-grid__item span {
  color: var(--ls-muted);
  font-size: 13px;
}

.question-explanation {
  margin: 0;
  line-height: 1.7;
  color: var(--ls-text);
}

.attempt-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .result-answer-grid {
    grid-template-columns: 1fr;
  }

  .question-card__head {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .result-line__item {
    padding: 0 14px;
  }
}
</style>
