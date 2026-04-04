<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">常识测验</p>
        <h2>课堂测验与即时反馈</h2>
        <p class="hero-copy">
          学生可以从这里直接开始本班测验，提交后立即看到分数、正确题数和当日班级排名预览。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadHome">刷新测验数据</el-button>
        <el-button plain @click="router.push('/student/quiz/rankings')">查看今日排行榜</el-button>
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
              <p class="metric-label">平均分</p>
              <p class="metric-value">{{ displayNumber(homeData.overview.average_score) }}</p>
              <p class="metric-note">已提交测验的平均成绩</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">最佳成绩</p>
              <p class="metric-value">{{ displayNumber(homeData.overview.best_score) }}</p>
              <p class="metric-note">当前账号历史最高分</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已测验次数</p>
              <p class="metric-value">{{ homeData.overview.attempt_count }}</p>
              <p class="metric-note">仅统计已提交记录</p>
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
                      <h3>可开始的课堂测验</h3>
                      <p class="section-note">直接从当前班级的已发布测验中选择开始。</p>
                    </div>
                    <el-tag round type="info">共 {{ homeData.available_quizzes.length }} 份</el-tag>
                  </div>
                </template>

                <el-empty
                  v-if="!homeData.available_quizzes.length"
                  description="当前班级还没有可开始的测验"
                />

                <div v-else class="quiz-card-list">
                  <article
                    v-for="quiz in homeData.available_quizzes"
                    :key="quiz.id"
                    class="quiz-card"
                  >
                    <div class="quiz-card__top">
                      <div>
                        <h4>{{ quiz.title }}</h4>
                        <p class="quiz-card__desc">
                          {{ quiz.description || '教师暂未填写测验说明。' }}
                        </p>
                      </div>
                      <el-tag round>{{ quiz.question_count }} 题</el-tag>
                    </div>

                    <div class="chip-row">
                      <el-tag
                        v-if="quiz.last_score !== null"
                        round
                        type="success"
                      >
                        上次成绩 {{ quiz.last_score }}
                      </el-tag>
                      <el-tag
                        v-if="quiz.last_submitted_at"
                        round
                        type="info"
                      >
                        上次提交 {{ formatDateTime(quiz.last_submitted_at) }}
                      </el-tag>
                    </div>

                    <div class="quiz-card__footer">
                      <span class="section-note">开始后会生成一次新的答题记录。</span>
                      <el-button
                        :loading="startingQuizId === quiz.id"
                        type="primary"
                        @click="startQuiz(quiz.id)"
                      >
                        开始测验
                      </el-button>
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
                      <h3>今日排行榜预览</h3>
                      <p class="section-note">{{ homeData.ranking_preview.class_name || '当前班级' }}</p>
                    </div>
                    <el-button link type="primary" @click="router.push('/student/quiz/rankings')">
                      完整榜单
                    </el-button>
                  </div>
                </template>

                <el-empty
                  v-if="!homeData.ranking_preview.items.length"
                  description="今天还没有同学提交测验"
                />

                <div v-else class="ranking-preview-list">
                  <article
                    v-for="item in homeData.ranking_preview.items"
                    :key="`${item.student_no}-${item.submitted_at}`"
                    class="ranking-preview-item"
                  >
                    <div>
                      <p class="ranking-preview-item__name">
                        #{{ item.rank }} {{ item.student_name }}
                      </p>
                      <p class="section-note">
                        {{ item.quiz_title }} · {{ formatDateTime(item.submitted_at) }}
                      </p>
                    </div>
                    <strong>{{ item.score }}</strong>
                  </article>
                </div>

                <div class="pending-box">
                  <p class="pending-box__title">今日未测验</p>
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
                  <h3>最近测验记录</h3>
                  <p class="section-note">保留最近 5 次已提交记录，方便学生回看成绩。</p>
                </div>
              </div>
            </template>

            <el-empty
              v-if="!homeData.recent_attempts.length"
              description="你还没有提交过测验"
            />

            <el-table v-else :data="homeData.recent_attempts" stripe>
              <el-table-column label="测验名称" min-width="220" prop="quiz_title" />
              <el-table-column label="成绩" min-width="100">
                <template #default="{ row }">
                  {{ displayNumber(row.score) }}
                </template>
              </el-table-column>
              <el-table-column label="正确 / 总题" min-width="120">
                <template #default="{ row }">
                  {{ row.correct_count }} / {{ row.total_count }}
                </template>
              </el-table-column>
              <el-table-column label="提交时间" min-width="180">
                <template #default="{ row }">
                  {{ formatDateTime(row.submitted_at) }}
                </template>
              </el-table-column>
              <el-table-column label="状态" min-width="100" prop="status" />
            </el-table>
          </el-card>
        </template>
      </template>
    </el-skeleton>

    <el-dialog
      v-model="attemptDialogVisible"
      :close-on-click-modal="false"
      destroy-on-close
      top="4vh"
      width="min(960px, 92vw)"
    >
      <template #header>
        <div class="attempt-dialog__header">
          <div>
            <p class="eyebrow">{{ resultSummary ? '测验结果' : '正在答题' }}</p>
            <h3>{{ attemptMeta?.title || '课堂测验' }}</h3>
            <p class="section-note">
              {{ resultSummary ? '本次结果已经提交保存。' : attemptMeta?.description || '请认真作答后提交。' }}
            </p>
          </div>
          <div class="chip-row">
            <el-tag round>{{ attemptQuestions.length }} 题</el-tag>
            <el-tag v-if="!resultSummary" round type="success">已作答 {{ answeredCount }}</el-tag>
            <el-tag v-else round type="warning">今日排名 {{ resultSummary.today_rank || '--' }}</el-tag>
          </div>
        </div>
      </template>

      <div v-if="!resultSummary" class="attempt-dialog__body">
        <el-alert
          v-if="attemptErrorMessage"
          :closable="false"
          :title="attemptErrorMessage"
          type="error"
        />

        <div class="attempt-progress">
          <span>答题进度</span>
          <el-progress :percentage="progressPercent" :stroke-width="10" />
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
              <el-tag round>{{ question.difficulty }}</el-tag>
            </div>

            <el-radio-group v-model="selectedAnswers[question.id]" class="option-list">
              <el-radio
                v-for="option in question.options"
                :key="option.key"
                :label="option.key"
                border
                class="option-item"
              >
                {{ option.key }}. {{ option.text }}
              </el-radio>
            </el-radio-group>
          </article>
        </div>
      </div>

      <div v-else class="attempt-dialog__body">
        <div class="metric-grid result-metrics">
          <article class="metric-tile">
            <p class="metric-label">本次得分</p>
            <p class="metric-value">{{ resultSummary.score }}</p>
            <p class="metric-note">已自动保存到测验记录</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">答对题数</p>
            <p class="metric-value">{{ resultSummary.correct_count }}</p>
            <p class="metric-note">共 {{ resultSummary.total_count }} 题</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">今日排名</p>
            <p class="metric-value">{{ resultSummary.today_rank ? `#${resultSummary.today_rank}` : '--' }}</p>
            <p class="metric-note">提交时间 {{ formatDateTime(resultSummary.submitted_at) }}</p>
          </article>
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
              <el-tag :type="answer.is_correct ? 'success' : 'danger'" round>
                {{ answer.is_correct ? '回答正确' : '需要订正' }}
              </el-tag>
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
          <el-button @click="closeAttemptDialog">
            {{ resultSummary ? '关闭' : '取消' }}
          </el-button>
          <el-button
            v-if="resultSummary"
            plain
            @click="restartCurrentQuiz"
          >
            再测一次
          </el-button>
          <el-button
            v-else
            :disabled="!attemptMeta"
            :loading="submitLoading"
            type="primary"
            @click="submitCurrentAttempt"
          >
            提交测验
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
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

.quiz-card-list {
  display: grid;
  gap: 14px;
}

.quiz-card {
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 248, 255, 0.94));
  display: grid;
  gap: 14px;
}

.quiz-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.quiz-card__top h4 {
  margin: 0 0 8px;
}

.quiz-card__desc {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.quiz-card__footer {
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

.attempt-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.attempt-dialog__header h3 {
  margin: 4px 0;
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
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.96);
  display: grid;
  gap: 16px;
}

.question-card-correct {
  border-color: rgba(78, 189, 139, 0.35);
  background: rgba(240, 252, 246, 0.96);
}

.question-card-wrong {
  border-color: rgba(235, 96, 96, 0.24);
  background: rgba(255, 248, 248, 0.96);
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
}

.result-metrics {
  margin-bottom: 4px;
}

.result-answer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.result-answer-grid__item {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(247, 249, 255, 0.95);
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

  .quiz-card__top,
  .question-card__head {
    flex-direction: column;
  }
}
</style>
