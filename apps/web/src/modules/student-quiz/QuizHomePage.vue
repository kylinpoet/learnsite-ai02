<template>
  <div class="page-stack">
    <SaPageHeader
      description="学生可以从这里直接开始本班测验，提交后立即看到分数、正确题数和当日班级排名预览。"
      eyebrow="常识测验"
      title="课堂测验与即时反馈"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadHome">刷新测验数据</n-button>
        <n-button secondary @click="router.push('/student/quiz/rankings')">查看今日排行榜</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="10" animated />
    </SaPanel>

    <template v-else-if="homeData">
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

      <div class="quiz-charts">
        <SaPanel>
          <template #header>
            <div class="chart-head">
              <div>
                <strong>我的成绩趋势</strong>
                <p class="section-note">按提交时间回看最近几次测验的得分与正确率。</p>
              </div>
            </div>
          </template>
          <n-empty v-if="!scoredAttempts.length" description="还没有可绘制的测验成绩。" />
          <AppChart v-else :height="260" :option="attemptTrendOption" />
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="chart-head">
              <div>
                <strong>今日班级参与</strong>
                <p class="section-note">{{ homeData.ranking_preview.class_name || '当前班级' }} 的参与与未参与比例。</p>
              </div>
            </div>
          </template>
          <n-empty
            v-if="!homeData.ranking_preview.items.length && !homeData.ranking_preview.pending_students.length"
            description="今日暂无可统计的参与数据。"
          />
          <AppChart v-else :height="260" :option="classParticipationOption" />
        </SaPanel>
      </div>

      <div class="split-grid">
        <SaPanel description="直接从当前班级的已发布测验中选择开始。" title="可开始的课堂测验">
          <template #actions>
            <n-tag round type="info">共 {{ homeData.available_quizzes.length }} 份</n-tag>
          </template>

          <n-empty
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
                <n-tag round>{{ quiz.question_count }} 题</n-tag>
              </div>

              <div class="chip-row">
                <n-tag
                  v-if="quiz.last_score !== null"
                  round
                  type="success"
                >
                  上次成绩 {{ quiz.last_score }}
                </n-tag>
                <n-tag
                  v-if="quiz.last_submitted_at"
                  round
                  type="info"
                >
                  上次提交 {{ formatDateTime(quiz.last_submitted_at) }}
                </n-tag>
              </div>

              <div class="quiz-card__footer">
                <span class="section-note">开始后会生成一次新的答题记录。</span>
                <n-button
                  :loading="startingQuizId === quiz.id"
                  type="primary"
                  @click="startQuiz(quiz.id)"
                >
                  开始测验
                </n-button>
              </div>
            </article>
          </div>
        </SaPanel>

        <SaPanel
          :description="homeData.ranking_preview.class_name || '当前班级'"
          title="今日排行榜预览"
        >
          <template #actions>
            <n-button text type="primary" @click="router.push('/student/quiz/rankings')">
              完整榜单
            </n-button>
          </template>

          <n-empty
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
            <n-empty
              v-if="!homeData.ranking_preview.pending_students.length"
              description="本班学生都已参与"
            />
            <div v-else class="chip-row">
              <n-tag
                v-for="item in homeData.ranking_preview.pending_students"
                :key="item.student_no"
                round
                type="warning"
              >
                {{ item.student_name }}
              </n-tag>
            </div>
          </div>
        </SaPanel>
      </div>

      <SaPanel description="保留最近 5 次已提交记录，方便学生回看成绩。" title="最近测验记录">
        <SaDataTable
          :data="homeData.recent_attempts"
          empty-text="你还没有提交过测验"
          row-key="id"
          stripe
        >
          <SaTableColumn label="测验名称" min-width="220" prop="quiz_title" />
          <SaTableColumn label="成绩" min-width="100">
            <template #default="{ row }">
              {{ displayNumber(row.score) }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="正确 / 总题" min-width="120">
            <template #default="{ row }">
              {{ row.correct_count }} / {{ row.total_count }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="提交时间" min-width="180">
            <template #default="{ row }">
              {{ formatDateTime(row.submitted_at) }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="状态" min-width="100" prop="status" />
        </SaDataTable>
      </SaPanel>
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
            <p class="eyebrow">{{ resultSummary ? '测验结果' : '正在答题' }}</p>
            <h3>{{ attemptMeta?.title || '课堂测验' }}</h3>
            <p class="section-note">
              {{ resultSummary ? '本次结果已经提交保存。' : attemptMeta?.description || '请认真作答后提交。' }}
            </p>
          </div>
          <div class="chip-row">
            <n-tag round>{{ attemptQuestions.length }} 题</n-tag>
            <n-tag v-if="!resultSummary" round type="success">已作答 {{ answeredCount }}</n-tag>
            <n-tag v-else round type="warning">今日排名 {{ resultSummary.today_rank || '--' }}</n-tag>
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
import { NAlert, NButton, NEmpty, NModal, NProgress, NRadio, NRadioGroup, NSkeleton, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

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
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();

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

const scoredAttempts = computed(() =>
  (homeData.value?.recent_attempts || [])
    .filter((item) => item.score !== null)
    .slice(0, 8)
    .reverse(),
);

const attemptTrendOption = computed(() => {
  const attempts = scoredAttempts.value;
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(attempts.map((_, index) => `第${index + 1}次`), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, interval: 0 },
    }),
    yAxis: [
      axisY({ name: '得分', nameTextStyle: { color: tokens.value.muted }, max: 100 }),
      axisY({ name: '正确率%', nameTextStyle: { color: tokens.value.muted }, max: 100, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '得分',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        lineStyle: { color: palette.value[0], width: 3 },
        itemStyle: { color: palette.value[0] },
        areaStyle: { opacity: 0.12, color: palette.value[0] },
        data: attempts.map((item) => item.score ?? 0),
      },
      {
        name: '正确率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        lineStyle: { color: palette.value[1], type: 'dashed' },
        itemStyle: { color: palette.value[1] },
        data: attempts.map((item) =>
          item.total_count ? Math.round((item.correct_count / item.total_count) * 100) : 0,
        ),
      },
    ],
  });
});

const classParticipationOption = computed(() => {
  const participated = homeData.value?.ranking_preview.items.length ?? 0;
  const pending = homeData.value?.ranking_preview.pending_students.length ?? 0;
  const total = participated + pending;

  return base({
    tooltip: tooltip('item'),
    legend: legend({ bottom: 0, top: 'auto' }),
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 12, borderColor: tokens.value.surface, borderWidth: 3 },
        label: { show: false },
        data: [
          { value: participated, name: '已参与', itemStyle: { color: palette.value[0] } },
          { value: pending, name: '未参与', itemStyle: { color: tokens.value.warning } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: `${total}`, fill: tokens.value.ink, fontSize: 26, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: { text: '本班学生', fill: tokens.value.muted, fontSize: 12 },
      },
    ],
  });
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
.quiz-charts {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
}

.quiz-charts :deep(.sa-panel__body) {
  display: grid;
  gap: 12px;
}

.chart-head strong {
  color: var(--ls-ink);
  font-size: 15px;
}

.quiz-card-list {
  display: grid;
  gap: 14px;
}

.quiz-card {
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: var(--ls-panel);
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

.split-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.ranking-preview-list {
  display: grid;
  gap: 10px;
}

.ranking-preview-item {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--ls-elevated);
  border: 1px solid var(--ls-border);
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

@media (max-width: 1200px) {
  .split-grid {
    grid-template-columns: 1fr;
  }

  .quiz-charts {
    grid-template-columns: 1fr;
  }
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
