<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="选择班级，AI 基于提交、评分、互评与签到数据生成结构化学情报告，可查看历史报告。"
      eyebrow="AI 学情报告"
      title="班级学情分析"
    >
      <template #actions>
        <n-select
          v-model:value="selectedClassId"
          :disabled="isLoading || isGenerating"
          :options="classOptions"
          placeholder="选择班级"
          style="width: 220px"
          @update:value="onClassChange"
        />
        <n-button
          :disabled="!selectedClassId || isGenerating"
          :loading="isGenerating"
          type="primary"
          @click="generateReport"
        >
          {{ isGenerating ? 'AI 分析中…' : '生成学情报告' }}
        </n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="6" animated />
    </SaPanel>

    <div v-else class="report-layout">
      <SaPanel body-class="history-body" panel-class="history-card">
        <template #header>
          <div class="history-header">
            <span>历史报告</span>
            <n-tag v-if="historyTotal > 0" round size="small">{{ historyTotal }}</n-tag>
          </div>
        </template>
        <div v-if="!reports.length" class="history-empty">该班级还没有学情报告</div>
        <div
          v-for="item in reports"
          :key="item.id"
          class="history-item"
          :class="{ 'is-active': item.id === currentReport?.id }"
          role="button"
          tabindex="0"
          @click="viewReport(item.id)"
          @keydown.enter="viewReport(item.id)"
        >
          <p class="history-item-title">{{ item.title }}</p>
          <p class="history-item-meta">
            <span>{{ formatDateTime(item.created_at) }}</span>
            <n-tag :type="item.status === 'completed' ? 'success' : 'error'" round size="small">
              {{ item.status === 'completed' ? '已完成' : '生成失败' }}
            </n-tag>
          </p>
          <p v-if="item.error_message" class="history-item-error">{{ item.error_message }}</p>
        </div>
      </SaPanel>

      <SaPanel panel-class="report-card">
        <template #header>
          <div class="report-header">
            <div>
              <p v-if="currentReport" class="report-title">{{ currentReport.title }}</p>
              <p v-else class="report-title">学情报告</p>
              <p v-if="currentReport" class="report-meta">
                {{ currentReport.class_name }} · 生成于 {{ formatDateTime(currentReport.created_at) }}
              </p>
            </div>
          </div>
        </template>

        <div v-if="isGenerating" class="report-generating">
          <n-spin :size="28" />
          <p>AI 正在分析本班学情数据，通常需要几十秒，请稍候…</p>
        </div>

        <template v-else-if="currentReport">
          <div v-if="currentReport.status === 'failed'" class="report-failed">
            <n-alert
              :closable="false"
              :title="`报告生成失败：${currentReport.error_message || '未知原因'}`"
              type="error"
            />
          </div>
          <MarkdownContent v-else :content="currentReport.content_md" />
        </template>

        <n-empty
          v-else
          description="选择班级后点击「生成学情报告」，AI 将基于本班提交、评分、互评与签到数据输出分析报告"
        />
      </SaPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSelect, NSkeleton, NSpin, NTag } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import { apiGet, apiPost } from '@/api/http';
import MarkdownContent from '@/components/MarkdownContent.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAuthStore } from '@/stores/auth';

type ClassItem = {
  id: number;
  class_name: string;
  grade_no: number;
  class_no: number;
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

function formatDateTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
}

async function loadClasses() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教职工账号';
    return;
  }
  const payload = await apiGet<{ classes: ClassItem[] }>('/staff/attendance/bootstrap', authStore.token);
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
.report-layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.history-card :deep(.history-body) {
  max-height: 640px;
  overflow-y: auto;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  font-weight: 700;
}

.history-empty {
  padding: 18px 4px;
  color: var(--ls-summary-label);
  font-size: 13px;
}

.history-item {
  padding: 12px;
  border: 1px solid var(--ls-shell-divider, rgba(32, 60, 112, 0.12));
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.history-item + .history-item {
  margin-top: 10px;
}

.history-item:hover,
.history-item.is-active {
  background: var(--ls-nav-active-bg, rgba(47, 135, 255, 0.08));
}

.history-item-title {
  margin: 0 0 6px;
  font-weight: 600;
  line-height: 1.4;
}

.history-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  color: var(--ls-summary-label);
  font-size: 12px;
}

.history-item-error {
  margin: 6px 0 0;
  color: var(--ls-error-text);
  font-size: 12px;
}

.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.report-title {
  margin: 0;
  font-weight: 700;
}

.report-meta {
  margin: 4px 0 0;
  color: var(--ls-summary-label);
  font-size: 12px;
}

.report-generating {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--ls-summary-label);
}

.report-failed {
  padding: 8px 0;
}

@media (max-width: 960px) {
  .report-layout {
    grid-template-columns: 1fr;
  }
}
</style>
