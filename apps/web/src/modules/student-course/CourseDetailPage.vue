<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">学案详情</p>
        <h2>{{ planDetail?.title || `课程 ${route.params.courseId}` }}</h2>
        <p class="hero-copy">
          这一页展示本课次的任务清单。图文任务、讨论任务、网页任务和数据提交任务都可以直接从这里进入。
        </p>
      </div>
      <el-tag round>课程体系已接入</el-tag>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-card class="soft-card">
      <template #header>学案导读</template>
      <el-skeleton :loading="isLoading" animated>
        <template #template>
          <el-skeleton :rows="4" />
        </template>
        <template #default>
          <RichTextContent
            :html="planDetail?.content"
            empty-text="当前课程还没有补充学案导读。"
          />
        </template>
      </el-skeleton>
    </el-card>

    <el-card class="soft-card">
      <template #header>任务清单</template>
      <el-skeleton :loading="isLoading" animated>
        <template #template>
          <el-skeleton :rows="5" />
        </template>
        <template #default>
          <el-empty v-if="!planDetail?.tasks.length" description="当前课次还没有任务" />

          <div v-else class="task-list">
            <article v-for="task in planDetail.tasks" :key="task.id" class="task-card">
              <div class="task-main">
                <div class="task-head">
                  <p class="task-order">任务 {{ task.sort_order }}</p>
                  <el-tag round :type="task.is_required ? 'success' : 'warning'">
                    {{ task.is_required ? '必做' : '选做' }}
                  </el-tag>
                </div>
                <h3>{{ task.title }}</h3>
                <p class="task-type">{{ taskTypeLabel(task.task_type) }}</p>
                <p v-if="richTextToExcerpt(task.description, 90)" class="task-desc">
                  {{ richTextToExcerpt(task.description, 90) }}
                </p>
              </div>
              <el-button type="primary" @click="openTask(task)">进入任务</el-button>
            </article>
          </div>
        </template>
      </el-skeleton>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { richTextToExcerpt } from '@/utils/richText';

type PlanDetail = {
  id: number;
  title: string;
  content: string | null;
  lesson_id: number;
  lesson_title: string;
  tasks: Array<{
    id: number;
    title: string;
    task_type: string;
    description: string | null;
    sort_order: number;
    is_required: boolean;
  }>;
};

const route = useRoute();
const router = useRouter();
const planDetail = ref<PlanDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

  function taskTypeLabel(taskType: string) {
  if (taskType === 'rich_text') {
    return '图文任务';
  }
  if (taskType === 'web_page') {
    return '网页任务';
  }
  if (taskType === 'discussion') {
    return '讨论任务';
  }
  if (taskType === 'data_submit') {
    return '数据提交任务';
  }
  if (taskType === 'programming') {
    return '编程任务';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读任务';
  }
  return taskType;
}

async function loadPlan() {
  try {
    planDetail.value = await apiGet<PlanDetail>(`/lesson-plans/${route.params.courseId}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课程详情失败';
  } finally {
    isLoading.value = false;
  }
}

async function openTask(task: PlanDetail['tasks'][number]) {
  if (task.task_type === 'reading') {
    await router.push(`/student/courses/${route.params.courseId}/readings/${task.id}`);
    return;
  }

  if (task.task_type === 'programming') {
    await router.push(`/student/courses/${route.params.courseId}/programs/${task.id}`);
    return;
  }

  await router.push(`/student/courses/${route.params.courseId}/tasks/${task.id}`);
}

onMounted(loadPlan);
</script>

<style scoped>
.task-list {
  display: grid;
  gap: 14px;
}

.task-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.7);
}

.task-main h3,
.task-order,
.task-type {
  margin: 0;
}

.task-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.task-main h3 {
  margin-top: 6px;
  font-size: 18px;
}

.task-order,
.task-type {
  color: var(--ls-muted);
}

.task-type {
  margin-top: 6px;
}

.task-desc {
  margin: 8px 0 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

@media (max-width: 768px) {
  .task-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
