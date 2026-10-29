<template>
  <div class="ls-stack ls-stack--md">
    <div class="progress-head">
      <div>
        <p class="ls-card__title">小组活动进度</p>
        <p class="ls-card__sub">只看「小组共同提交」活动：哪些组还没开始、哪些已提交、哪些已评阅。</p>
      </div>
      <div class="ls-chip-row">
        <n-select
          v-model:value="planId"
          :options="planOptions"
          :loading="loadingPlans"
          class="plan-select"
          filterable
          placeholder="选择学案"
          size="small"
        />
        <n-button :loading="loading" secondary size="small" @click="loadProgress">刷新</n-button>
      </div>
    </div>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <n-empty v-if="!classId" description="请先在页面顶部选择班级" />
    <n-empty v-else-if="!planId && !loadingPlans" description="当前班级还没有已发布的学案" />

    <div v-else-if="loading" class="progress-grid">
      <div v-for="index in 2" :key="index" class="ls-card">
        <n-skeleton :rows="5" animated />
      </div>
    </div>

    <template v-else-if="payload">
      <div class="summary-bar">
        <div class="summary-item">
          <span class="ls-label">小组活动</span>
          <span class="ls-num">{{ payload.summary.task_count }}</span>
        </div>
        <div class="summary-item">
          <span class="ls-label">已提交</span>
          <span class="ls-num">{{ payload.summary.submitted_count }}/{{ payload.summary.slot_count }}</span>
        </div>
        <div class="summary-item">
          <span class="ls-label">已评阅</span>
          <span class="ls-num">{{ payload.summary.reviewed_count }}/{{ payload.summary.slot_count }}</span>
        </div>
        <div class="summary-item">
          <span class="ls-label">涉及小组</span>
          <span class="ls-num">{{ payload.summary.group_count }}</span>
        </div>
        <div class="summary-note">
          {{ payload.plan.title }} · {{ payload.plan.unit_title }} / {{ payload.plan.lesson_title }}
        </div>
      </div>

      <n-empty v-if="!payload.tasks.length" description="当前学案还没有设置小组共同提交活动" />

      <template v-else>
        <div class="progress-grid">
          <article v-for="group in completionRows" :key="group.group_id" class="ls-card progress-card">
            <div class="progress-card__head">
              <div>
                <p class="ls-card__title">{{ group.group_name }}</p>
                <p class="ls-card__sub">
                  第 {{ group.group_no }} 组
                  <span v-if="group.leader_name"> · 组长 {{ group.leader_name }}</span>
                  · {{ group.member_count }} 人
                </p>
              </div>
              <n-tag round size="small" type="success">
                {{ group.submitted_count }}/{{ group.total_task_count }}
              </n-tag>
            </div>
            <n-progress
              :percentage="group.completion_percent"
              :show-indicator="false"
              :stroke-width="6"
              status="success"
            />
            <p class="ls-card__sub">
              提交 {{ group.completion_percent }}% · 评阅 {{ group.review_percent }}% · 待完成 {{ group.pending_count }}
            </p>
          </article>
        </div>

        <article v-for="task in payload.tasks" :key="task.task_id" class="ls-card">
          <div class="ls-card__head">
            <div>
              <p class="ls-card__title">{{ task.task_title }}</p>
              <p class="ls-card__sub">
                {{ task.task_type === 'programming' ? '编程活动' : '上传活动' }} · 小组共同提交 · 已提交
                {{ task.submitted_count }}/{{ payload.summary.group_count }} · 已评阅 {{ task.reviewed_count }}
              </p>
            </div>
            <n-button size="small" text type="primary" @click="openTaskReview(task.task_id)">打开评分页</n-button>
          </div>

          <div class="task-grid">
            <article v-for="item in task.items" :key="`${task.task_id}-${item.group_id}`" class="task-item">
              <div class="task-item__head">
                <span class="task-item__name">{{ item.group_name }}</span>
                <n-tag round size="tiny" :type="groupTaskStatusType(item.status)">
                  {{ groupTaskStatusText(item.status) }}
                </n-tag>
              </div>
              <p class="ls-card__sub">
                {{ item.member_count }} 人 · 文件 {{ item.file_count }}
                <span v-if="item.score !== null"> · 得分 {{ item.score }}</span>
                <span v-if="item.is_recommended"> · 推荐作品</span>
              </p>
              <p class="ls-card__sub">
                {{ item.submitted_by_name ? `提交人 ${item.submitted_by_name}` : '还没有小组提交记录' }}
              </p>
              <p class="ls-card__sub">
                {{ item.updated_at ? `更新于 ${formatDateTime(item.updated_at)}` : '等待本组开始提交' }}
              </p>
            </article>
          </div>
        </article>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NProgress, NSelect, NSkeleton, NTag } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import {
  formatDateTime,
  groupTaskStatusText,
  groupTaskStatusType,
  progressPercent,
  type GroupTaskCompletionRow,
  type GroupTaskProgressPayload,
} from './groupPanelShared';

type LaunchpadPlan = { id: number; title: string; lesson_title: string; unit_title: string; status?: string };

const props = defineProps<{ classId: number | null }>();

const authStore = useAuthStore();
const router = useRouter();

const payload = ref<GroupTaskProgressPayload | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const planId = ref<number | null>(null);
const plans = ref<LaunchpadPlan[]>([]);
const loadingPlans = ref(false);

const planOptions = computed(() =>
  plans.value.map((plan) => ({
    label: `${plan.title} · ${plan.unit_title} / ${plan.lesson_title}`,
    value: plan.id,
  })),
);

const completionRows = computed<GroupTaskCompletionRow[]>(() => {
  const data = payload.value;
  if (!data || !data.tasks.length) return [];

  const rows = new Map<number, GroupTaskCompletionRow>();
  for (const task of data.tasks) {
    for (const item of task.items) {
      const existing = rows.get(item.group_id) ?? {
        group_id: item.group_id,
        group_no: item.group_no,
        group_name: item.group_name,
        leader_name: item.leader_name,
        member_count: item.member_count,
        total_task_count: data.tasks.length,
        submitted_count: 0,
        reviewed_count: 0,
        pending_count: 0,
        completion_percent: 0,
        review_percent: 0,
      };
      if (item.status === 'submitted' || item.status === 'reviewed') existing.submitted_count += 1;
      if (item.status === 'reviewed') existing.reviewed_count += 1;
      rows.set(item.group_id, existing);
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      pending_count: Math.max(row.total_task_count - row.submitted_count, 0),
      completion_percent: progressPercent(row.submitted_count, row.total_task_count),
      review_percent: progressPercent(row.reviewed_count, row.total_task_count),
    }))
    .sort((left, right) => left.group_no - right.group_no || left.group_id - right.group_id);
});

async function loadPlans() {
  if (!authStore.token) return;
  loadingPlans.value = true;
  try {
    const launchpad = await apiGet<{ ready_plans: LaunchpadPlan[] }>('/classroom/launchpad', authStore.token);
    plans.value = launchpad.ready_plans || [];
    if (!plans.value.some((plan) => plan.id === planId.value)) {
      planId.value = plans.value[0]?.id ?? null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载可开课学案失败';
  } finally {
    loadingPlans.value = false;
  }
}

async function loadProgress() {
  if (!authStore.token || !props.classId || !planId.value) {
    payload.value = null;
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    payload.value = await apiGet<GroupTaskProgressPayload>(
      `/staff/classes/${props.classId}/plans/${planId.value}/group-task-progress`,
      authStore.token,
    );
  } catch (error) {
    payload.value = null;
    errorMessage.value = error instanceof Error ? error.message : '加载小组活动进度失败';
  } finally {
    loading.value = false;
  }
}

function openTaskReview(taskId: number) {
  void router.push(`/staff/submissions/${taskId}`);
}

watch(
  () => props.classId,
  async () => {
    payload.value = null;
    await loadPlans();
    await loadProgress();
  },
);

watch(planId, () => {
  void loadProgress();
});

onMounted(async () => {
  await loadPlans();
  await loadProgress();
});

defineExpose({ reload: loadProgress });
</script>

<style scoped>
.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-md, 14px);
  background: var(--ls-panel-soft, var(--ls-surface));
}

.plan-select {
  width: 320px;
}

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  padding: 10px 14px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-md, 14px);
  background: var(--ls-panel-strong, var(--ls-surface));
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.summary-note {
  margin-left: auto;
  color: var(--ls-muted);
  font-size: 12px;
}

.progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--ls-gap-md, 12px);
}

.progress-card {
  gap: 6px;
}

.progress-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.task-item {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-sm, 10px);
  background: var(--ls-panel-soft, transparent);
}

.task-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.task-item__name {
  color: var(--ls-ink);
  font-size: 12.5px;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .progress-head {
    flex-direction: column;
    align-items: stretch;
  }

  .plan-select {
    width: 100%;
  }

  .summary-note {
    margin-left: 0;
  }
}
</style>
