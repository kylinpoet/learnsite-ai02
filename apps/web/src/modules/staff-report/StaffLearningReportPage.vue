<template>
  <div class="page-stack">
    <StaffPageHead title="学情报告" :sub="pageSummary">
      <template #actions>
        <n-select
          v-model:value="selectedClassId"
          :disabled="isLoading || isGenerating"
          :options="classOptions"
          class="class-select"
          placeholder="选择班级"
          @update:value="onClassChange"
        />
        <n-button
          :disabled="!selectedClassId || isGenerating"
          :loading="isGenerating"
          type="primary"
          @click="generateReport"
        >
          {{ isGenerating ? 'AI 分析中…' : '生成报告' }}
        </n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else>
      <div class="report-layout">
        <section class="sf-panel">
          <header class="sf-panel__head">
            <h2 class="sf-panel__title">
              历史报告
              <span class="sf-panel__count">{{ historyTotal }} 份</span>
            </h2>
          </header>

          <p v-if="!reports.length" class="sf-empty">
            该班级还没有报告。生成第一份后，这里会按时间倒序列出每次分析。
          </p>

          <div v-else class="sf-rows">
            <article
              v-for="item in reports"
              :key="item.id"
              :class="['sf-row', 'history-row', { 'is-active': item.id === currentReport?.id }]"
              role="button"
              tabindex="0"
              @click="viewReport(item.id)"
              @keydown.enter="viewReport(item.id)"
            >
              <div class="sf-row__main">
                <p class="sf-row__title">
                  <span class="sf-row__title-text">{{ item.title }}</span>
                </p>
                <p class="sf-row__meta">
                  <span>{{ formatDateTime(item.created_at) }}</span>
                  <span>{{ item.teacher_name }}</span>
                </p>
              </div>
              <span :class="['sf-pill', item.status === 'completed' ? 'sf-pill--pos' : 'sf-pill--neg']">
                {{ item.status === 'completed' ? '已完成' : '生成失败' }}
              </span>
            </article>
          </div>
        </section>

        <section class="sf-panel report-panel">
          <header class="sf-panel__head report-head">
            <div class="report-head__main">
              <h2 class="sf-panel__title">{{ currentReport?.title || '班级学情报告' }}</h2>
              <p v-if="currentReport" class="report-meta">
                {{ currentReport.class_name }}
                <span>·</span>
                {{ formatDateTime(currentReport.created_at) }} 生成
                <template v-if="currentReport.teacher_name">
                  <span>·</span>
                  {{ currentReport.teacher_name }}
                </template>
              </p>
              <p v-else class="report-meta">
                {{ selectedClass ? `${selectedClass.class_name} · 尚无报告` : '尚未选择班级' }}
              </p>
            </div>
          </header>

          <div class="report-body">
            <div v-if="isGenerating" class="report-state">
              <n-spin :size="24" />
              <p class="report-state__title">正在分析本班学情</p>
              <p class="report-state__note">
                读取提交、评分、互评与签到数据，通常需要几十秒；生成完成后会自动出现在左侧历史里。
              </p>
            </div>

            <template v-else-if="currentReport">
              <n-alert
                v-if="currentReport.status === 'failed'"
                :closable="false"
                :title="`上次生成失败：${currentReport.error_message || '未知原因'}`"
                type="error"
              />
              <article v-else class="report-sheet">
                <MarkdownContent :content="currentReport.content_md" />
              </article>
            </template>

            <div v-else class="report-state report-state--empty">
              <p class="report-state__title">这个班还没有学情报告</p>
              <p class="report-state__note">
                AI 会读取本班的作品提交与评分、学生互评记录和每日签到，输出结构化的班级分析。点击右上角「生成报告」即可。
              </p>
              <ul class="source-list">
                <li><strong>提交与评分</strong><span>作品数量、得分分布、待评阅积压</span></li>
                <li><strong>互评记录</strong><span>同伴互评的参与度与评分差异</span></li>
                <li><strong>签到数据</strong><span>出勤情况与近期变化</span></li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSelect, NSkeleton, NSpin } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';

import { apiGet, apiPost } from '@/api/http';
import MarkdownContent from '@/components/MarkdownContent.vue';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';
import { formatDateTime as formatDateTimeValue } from '@/utils/datetime';

type ClassItem = {
  id: number;
  class_name: string;
  grade_no: number;
  class_no: number;
  student_count: number;
};

type LearningReportSummary = {
  id: number;
  class_id: number;
  class_name: string;
  lesson_plan_id: number | null;
  lesson_plan_title: string | null;
  teacher_id: number;
  teacher_name: string;
  title: string;
  status: 'completed' | 'failed';
  error_message: string | null;
  created_at: string | null;
};

type LearningReportDetail = LearningReportSummary & {
  content_md: string;
};

type LearningReportListPayload = {
  items: LearningReportSummary[];
  total: number;
  page: number;
  page_size: number;
};

type AttendanceBootstrapPayload = {
  classes: ClassItem[];
};

const authStore = useAuthStore();
const classes = ref<ClassItem[]>([]);
const selectedClassId = ref<number | null>(null);
const reports = ref<LearningReportSummary[]>([]);
const historyTotal = ref(0);
const currentReport = ref<LearningReportDetail | null>(null);
const isLoading = ref(true);
const isGenerating = ref(false);
const errorMessage = ref('');

const classOptions = computed(() =>
  classes.value.map((item) => ({ label: item.class_name, value: item.id })),
);

const selectedClass = computed(
  () => classes.value.find((item) => item.id === selectedClassId.value) || null,
);

const pageSummary = computed(() => {
  if (!selectedClass.value) {
    return '选择班级后，AI 会基于提交、评分、互评与签到数据生成结构化的班级分析。';
  }
  if (!historyTotal.value) {
    return `${selectedClass.value.class_name} 还没有报告，生成第一份可看到完整分析。`;
  }
  const latest = reports.value[0];
  return `${selectedClass.value.class_name} · 共 ${historyTotal.value} 份报告 · 最近 ${formatDateTime(latest?.created_at ?? null)}`;
});

function formatDateTime(value: string | null) {
  return formatDateTimeValue(value, { fallback: '--', sliceStart: 0, sliceEnd: 16 });
}

async function loadClasses() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教职工账号';
    return;
  }
  // 班级列表与签到页共用同一个接口：它已经按教师可访问班级返回 id / 班名 / 人数。
  const payload = await apiGet<AttendanceBootstrapPayload>('/staff/attendance', authStore.token);
  classes.value = payload.classes || [];
}

async function loadReports(classId: number) {
  if (!authStore.token) {
    return;
  }
  const payload = await apiGet<LearningReportListPayload>(
    `/staff/learning-reports?class_id=${classId}`,
    authStore.token
  );
  reports.value = payload.items || [];
  historyTotal.value = payload.total || 0;
}

async function onClassChange() {
  currentReport.value = null;
  errorMessage.value = '';
  if (!selectedClassId.value) {
    reports.value = [];
    historyTotal.value = 0;
    return;
  }
  isLoading.value = true;
  try {
    await loadReports(selectedClassId.value);
    if (reports.value.length) {
      await viewReport(reports.value[0].id);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载历史报告失败';
  } finally {
    isLoading.value = false;
  }
}

async function viewReport(reportId: number) {
  if (!authStore.token) {
    return;
  }
  try {
    const payload = await apiGet<{ report: LearningReportDetail }>(
      `/staff/learning-reports/${reportId}`,
      authStore.token
    );
    currentReport.value = payload.report;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载报告详情失败';
  }
}

async function generateReport() {
  if (!authStore.token || !selectedClassId.value || isGenerating.value) {
    return;
  }
  isGenerating.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPost<{ report: LearningReportDetail }>(
      '/staff/learning-reports/generate',
      { class_id: selectedClassId.value },
      authStore.token
    );
    currentReport.value = payload.report;
    ElMessage.success('学情报告已生成');
    await loadReports(selectedClassId.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成学情报告失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isGenerating.value = false;
  }
}

onMounted(async () => {
  try {
    await loadClasses();
    if (classes.value.length) {
      selectedClassId.value = classes.value[0].id;
      await onClassChange();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载班级数据失败';
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
.class-select {
  width: 200px;
}

/* 历史在左、报告在右：报告是阅读面，宽度收在可读行宽而不是铺满 */
.report-layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: var(--sf-section-gap);
  align-items: start;
}

.history-row {
  cursor: pointer;
  align-items: flex-start;
}

.history-row:hover {
  background: var(--sf-surface-2);
}

.history-row.is-active {
  background: var(--sf-accent-soft);
}

.history-row.is-active .sf-row__title {
  font-weight: 600;
}

.history-row:focus-visible {
  outline: 2px solid var(--sf-accent);
  outline-offset: -2px;
}

.report-head {
  align-items: flex-start;
}

.report-head__main {
  min-width: 0;
}

.report-head .sf-panel__title {
  font-size: 16px;
  line-height: 1.45;
}

.report-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin: 5px 0 0;
  color: var(--sf-muted);
  font-size: 12px;
}

.report-body {
  min-width: 0;
  padding: 22px 28px 28px;
}

.report-sheet {
  max-width: 74ch;
  color: var(--sf-text);
  font-size: 14px;
  line-height: 1.85;
}

.report-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 56ch;
  padding: 12px 0;
}

.report-state__title {
  margin: 0;
  color: var(--sf-ink);
  font-size: 15px;
  font-weight: 600;
}

.report-state__note {
  margin: 0;
  color: var(--sf-muted);
  font-size: 13px;
  line-height: 1.7;
}

.report-state--empty {
  gap: 10px;
  padding: 18px 0 8px;
}

.source-list {
  display: grid;
  gap: 8px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.source-list li {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  font-size: 13px;
}

.source-list strong {
  color: var(--sf-ink);
  font-weight: 500;
}

.source-list span {
  color: var(--sf-muted);
}

@media (max-width: 1100px) {
  .report-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .report-body {
    padding: 18px;
  }
}
</style>
