<template>
  <div class="sw-work">
    <StudentPageHead title="作品" :sub="headSub">
      <template #actions>
        <n-button :loading="isLoading" @click="loadWorkList">刷新</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading && !workData" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="6" animated />
      </div>
    </div>

    <template v-else-if="workData">
      <StudentStatStrip :items="statItems" />

      <StudentPanel title="作品记录" :count="`${workData.summary.total_count} 份`" flush>
        <SaDataTable
          v-if="workData.items.length"
          :data="workData.items"
          :loading="isLoading"
          :scroll-x="1024"
          row-key="submission_id"
        >
          <SaTableColumn label="作品" min-width="280">
            <template #default="{ row }">
              <span class="sw-row__title">{{ row.task_title }}</span>
              <span class="sw-row__meta">
                <span>{{ row.course_title }}</span>
                <span>{{ submissionScopeLabel(row) }}</span>
                <span v-if="row.submission_scope === 'group'">{{ groupDisplayLabel(row) }}</span>
                <span>{{ attachmentLabel(row) }}</span>
              </span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="状态" width="112">
            <template #default="{ row }">
              <span :class="['sw-chip', row.status === 'reviewed' ? 'sw-chip--done' : 'sw-chip--todo']">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </SaTableColumn>
          <SaTableColumn align="right" header-align="right" label="得分" width="84">
            <template #default="{ row }">
              <span class="sw-num">{{ row.score ?? '--' }}</span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="教师评语" min-width="200">
            <template #default="{ row }">{{ teacherCommentPreview(row.teacher_comment) }}</template>
          </SaTableColumn>
          <SaTableColumn label="更新" width="140">
            <template #default="{ row }">
              <span class="sw-num">{{ formatDateTime(row.updated_at) }}</span>
            </template>
          </SaTableColumn>
          <SaTableColumn fixed="right" label="操作" width="204">
            <template #default="{ row }">
              <n-space :size="12" :wrap="false">
                <n-button text @click="goToDetail(row.submission_id)">查看详情</n-button>
                <n-button v-if="row.can_resubmit" text @click="goToTask(row.course_id, row.task_id, row.task_type)">
                  再次提交
                </n-button>
                <n-button
                  v-if="row.status === 'reviewed'"
                  :loading="revokingSubmissionId === row.submission_id"
                  text
                  @click="revokeReviewedSubmission(row)"
                >
                  撤销评阅
                </n-button>
              </n-space>
            </template>
          </SaTableColumn>
        </SaDataTable>
        <StudentEmpty v-else text="还没有作品记录。完成一次任务提交后，这里会显示每份作品的评阅状态和得分。" />
      </StudentPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton, NSpace } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

type SubmissionItem = {
  submission_id: number;
  course_id: number;
  course_title: string;
  task_id: number;
  task_title: string;
  task_type: string;
  submission_scope: 'individual' | 'group';
  status: 'submitted' | 'reviewed';
  score: number | null;
  teacher_comment: string | null;
  peer_review_score: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  group_id: number | null;
  group_name: string | null;
  group_no: number | null;
  submitted_by_name: string | null;
  file_count: number;
  primary_file_name: string | null;
  can_resubmit: boolean;
};

type WorkPayload = {
  summary: {
    total_count: number;
    reviewed_count: number;
    submitted_count: number;
    resubmittable_count: number;
  };
  items: SubmissionItem[];
};

const router = useRouter();
const authStore = useAuthStore();
const workData = ref<WorkPayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const revokingSubmissionId = ref<number | null>(null);

const headSub = computed(() => {
  const summary = workData.value?.summary;
  if (!summary) {
    return '';
  }
  return `共 ${summary.total_count} 份，${summary.reviewed_count} 份已评阅`;
});

const statItems = computed<StudentStatItem[]>(() => {
  const summary = workData.value?.summary;
  return [
    { label: '作品', value: summary?.total_count ?? 0, unit: '份' },
    { label: '已评阅', value: summary?.reviewed_count ?? 0, unit: '份' },
    { label: '待评阅', value: summary?.submitted_count ?? 0, unit: '份' },
    { label: '可重交', value: summary?.resubmittable_count ?? 0, unit: '份', note: '评阅前可覆盖提交' },
  ];
});

function statusLabel(status: SubmissionItem['status']) {
  return status === 'reviewed' ? '已评阅' : '待评阅';
}

function submissionScopeLabel(item: SubmissionItem) {
  return item.submission_scope === 'group' ? '小组提交' : '个人提交';
}

function groupDisplayLabel(item: SubmissionItem) {
  if (item.group_name) {
    return item.group_name;
  }
  if (item.group_no !== null) {
    return `第 ${item.group_no} 组`;
  }
  return '当前小组';
}

function attachmentLabel(item: SubmissionItem) {
  if (!item.file_count) {
    return '暂无附件';
  }
  const name = item.primary_file_name || `${item.file_count} 个附件`;
  return item.file_count > 1 ? `${name} +${item.file_count - 1}` : name;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function teacherCommentPreview(comment: string | null) {
  const normalized = (comment || '').trim();
  if (!normalized) {
    return '--';
  }
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

async function loadWorkList() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    workData.value = await apiGet<WorkPayload>('/submissions/mine', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品中心失败';
  } finally {
    isLoading.value = false;
  }
}

async function goToDetail(submissionId: number) {
  await router.push(`/student/work/${submissionId}`);
}

async function goToTask(courseId: number, taskId: number, taskType: string) {
  const taskSegment = taskType === 'programming' ? 'programs' : taskType === 'reading' ? 'readings' : 'tasks';
  await router.push(`/student/courses/${courseId}/${taskSegment}/${taskId}`);
}

async function revokeReviewedSubmission(item: SubmissionItem) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }
  if (item.status !== 'reviewed') {
    ElMessage.info('当前作品未处于已评阅状态');
    return;
  }

  revokingSubmissionId.value = item.submission_id;
  try {
    await apiPost(`/submissions/${item.submission_id}/revoke`, {}, authStore.token);
    ElMessage.success('已撤销评阅，可继续提交修改');
    await loadWorkList();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '撤销评阅失败');
  } finally {
    revokingSubmissionId.value = null;
  }
}

onMounted(loadWorkList);
</script>

<style scoped>
.sw-work {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-num {
  font-variant-numeric: tabular-nums;
}
</style>
