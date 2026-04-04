<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">我的作品</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这里会汇总你已经提交的作品、教师评价状态以及最近一次更新时间。教师评价前，你仍然可以回到任务页继续覆盖提交。
        </p>
      </div>
      <el-button :loading="isLoading" type="primary" @click="loadWorkList">刷新作品列表</el-button>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="workData" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">作品总数</p>
        <p class="metric-value">{{ workData.summary.total_count }}</p>
        <p class="metric-note">已经正式保存的作品记录总数。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">已评价</p>
        <p class="metric-value">{{ workData.summary.reviewed_count }}</p>
        <p class="metric-note">教师已经完成评分或反馈的作品。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">待教师评价</p>
        <p class="metric-value">{{ workData.summary.submitted_count }}</p>
        <p class="metric-note">已提交，等待教师查看。</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">可再次提交</p>
        <p class="metric-value">{{ workData.summary.resubmittable_count }}</p>
        <p class="metric-note">教师评价前，还可以继续覆盖提交。</p>
      </article>
    </div>

    <el-card class="soft-card">
      <template #header>
        <div class="info-row">
          <span>作品记录</span>
          <el-tag round type="info">{{ latestUpdateText }}</el-tag>
        </div>
      </template>

      <el-skeleton :loading="isLoading" animated>
        <template #template>
          <el-skeleton :rows="6" />
        </template>

        <template #default>
          <el-empty v-if="!workData?.items.length" description="还没有作品记录" />

          <el-table v-else :data="workData.items" stripe>
            <el-table-column label="课程" min-width="220" prop="course_title" />
            <el-table-column label="任务" min-width="180" prop="task_title" />
            <el-table-column label="提交方式" min-width="220">
              <template #default="{ row }">
                <el-tag :type="submissionScopeTagType(row)" round>{{ submissionScopeLabel(row) }}</el-tag>
                <p v-if="row.submission_scope === 'group'" class="submission-meta">
                  {{ groupDisplayLabel(row) }}
                  <span v-if="row.submitted_by_name"> · 最近提交 {{ row.submitted_by_name }}</span>
                </p>
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="120">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" round>{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="得分" min-width="90">
              <template #default="{ row }">
                {{ row.score ?? '--' }}
              </template>
            </el-table-column>
            <el-table-column label="附件" min-width="180">
              <template #default="{ row }">
                <span>{{ row.primary_file_name || '暂无附件' }}</span>
                <span v-if="row.file_count > 1" class="file-count">+{{ row.file_count - 1 }}</span>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" min-width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.updated_at) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="180" fixed="right">
              <template #default="{ row }">
                <el-space>
                  <el-button link type="primary" @click="goToDetail(row.submission_id)">查看详情</el-button>
                  <el-button
                    v-if="row.can_resubmit"
                    link
                    type="primary"
                    @click="goToTask(row.course_id, row.task_id, row.task_type)"
                  >
                    再次提交
                  </el-button>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-skeleton>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

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

const pageTitle = computed(() => {
  const displayName = authStore.user?.display_name || '同学';
  return `${displayName} 的作品中心`;
});

const latestUpdateText = computed(() => {
  const latestItem = workData.value?.items[0];
  if (!latestItem?.updated_at) {
    return '暂无更新记录';
  }
  return `最近更新：${formatDateTime(latestItem.updated_at)}`;
});

function statusLabel(status: SubmissionItem['status']) {
  return status === 'reviewed' ? '已评价' : '待教师评价';
}

function statusTagType(status: SubmissionItem['status']) {
  return status === 'reviewed' ? 'success' : 'warning';
}

function submissionScopeLabel(item: SubmissionItem) {
  return item.submission_scope === 'group' ? '小组共同提交' : '个人提交';
}

function submissionScopeTagType(item: SubmissionItem) {
  return item.submission_scope === 'group' ? 'warning' : 'success';
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

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
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

onMounted(loadWorkList);
</script>

<style scoped>
.file-count {
  margin-left: 6px;
  color: var(--ls-muted);
  font-size: 12px;
}

.submission-meta {
  margin: 8px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
}
</style>
