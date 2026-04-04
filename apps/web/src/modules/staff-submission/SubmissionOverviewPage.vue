<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">作品评分</p>
        <h2>教师作品总览</h2>
        <p class="hero-copy">
          这里汇总所有已有学生提交的任务。教师可以快速定位未评阅任务，进入详情页查看作品、预览附件并完成评分。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadOverview">刷新列表</el-button>
        <el-button
          v-if="filteredItems.length"
          plain
          @click="goToTask(filteredItems[0].task_id)"
        >
          前往当前筛选首项
        </el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="8" />
        </el-card>
      </template>

      <template #default>
        <div class="page-stack">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">任务数</p>
              <p class="metric-value">{{ overview?.summary.task_count || 0 }}</p>
              <p class="metric-note">当前已有学生提交记录的任务总数。</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">作品总数</p>
              <p class="metric-value">{{ overview?.summary.submission_count || 0 }}</p>
              <p class="metric-note">教师可进入任务页查看作品说明和附件。</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已评阅</p>
              <p class="metric-value">{{ overview?.summary.reviewed_count || 0 }}</p>
              <p class="metric-note">已经录入评分或教师评语的作品数量。</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">待评阅</p>
              <p class="metric-value">{{ overview?.summary.pending_count || 0 }}</p>
              <p class="metric-note">学生已提交但教师尚未完成评阅的作品数量。</p>
            </article>
          </div>

          <el-card class="soft-card">
            <template #header>
              <div class="toolbar-row">
                <div class="info-row">
                  <span>任务列表</span>
                  <el-tag round type="info">
                    平均分 {{ overview?.summary.average_score ?? '--' }}
                  </el-tag>
                </div>
                <div class="filter-row">
                  <span class="filter-label">仅看未评阅任务</span>
                  <el-switch v-model="onlyPendingTasks" />
                  <el-select
                    v-model="selectedCourse"
                    class="filter-select"
                    clearable
                    placeholder="筛选课程"
                  >
                    <el-option
                      v-for="option in courseOptions"
                      :key="option"
                      :label="option"
                      :value="option"
                    />
                  </el-select>
                  <el-select
                    v-model="selectedLesson"
                    class="filter-select filter-select-wide"
                    clearable
                    placeholder="筛选课次"
                  >
                    <el-option
                      v-for="option in lessonOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                  <el-button
                    v-if="selectedCourse || selectedLesson || !onlyPendingTasks"
                    text
                    @click="resetFilters"
                  >
                    恢复默认
                  </el-button>
                  <el-tag round type="success">
                    当前显示 {{ filteredItems.length }} / {{ overview?.items.length || 0 }}
                  </el-tag>
                </div>
              </div>
            </template>

            <el-empty
              v-if="!overview?.items.length"
              description="当前还没有学生提交的作品任务。"
            />

            <el-empty
              v-else-if="!filteredItems.length"
              description="当前筛选条件下没有待处理任务。"
            />

            <el-table v-else :data="filteredItems" stripe @row-click="handleRowClick">
              <el-table-column label="课程" min-width="220" prop="course_title" />
              <el-table-column label="任务" min-width="220" prop="task_title" />
              <el-table-column label="所属课次" min-width="200">
                <template #default="{ row }">
                  <div>
                    <strong>{{ row.lesson_title }}</strong>
                    <p class="table-note">{{ row.unit_title }}</p>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="提交数" min-width="88" prop="submission_count" />
              <el-table-column label="已评阅" min-width="88" prop="reviewed_count" />
              <el-table-column label="待评阅" min-width="88" prop="pending_count" />
              <el-table-column label="平均分" min-width="100">
                <template #default="{ row }">
                  {{ row.average_score ?? '--' }}
                </template>
              </el-table-column>
              <el-table-column label="最近提交" min-width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.latest_submitted_at) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" min-width="120">
                <template #default="{ row }">
                  <el-button link type="primary" @click.stop="goToTask(row.task_id)">
                    进入评分
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

defineProps<{
  eyebrow?: string;
  title?: string;
  description?: string;
  highlights?: Array<{ title: string; text: string }>;
}>();

type OverviewItem = {
  task_id: number;
  task_title: string;
  task_type: string;
  course_id: number;
  course_title: string;
  assigned_date: string;
  lesson_title: string;
  unit_title: string;
  submission_count: number;
  reviewed_count: number;
  pending_count: number;
  average_score: number | null;
  latest_submitted_at: string | null;
};

type OverviewPayload = {
  summary: {
    task_count: number;
    submission_count: number;
    reviewed_count: number;
    pending_count: number;
    average_score: number | null;
  };
  items: OverviewItem[];
};

const router = useRouter();
const authStore = useAuthStore();
const overview = ref<OverviewPayload | null>(null);
const onlyPendingTasks = ref(true);
const selectedCourse = ref('');
const selectedLesson = ref('');
const isLoading = ref(true);
const errorMessage = ref('');

const overviewItems = computed(() => overview.value?.items || []);

const courseOptions = computed(() => {
  const options = new Set<string>();
  for (const item of overviewItems.value) {
    options.add(item.course_title);
  }
  return Array.from(options);
});

const lessonOptions = computed(() => {
  const options = new Map<string, string>();
  for (const item of overviewItems.value) {
    if (selectedCourse.value && item.course_title !== selectedCourse.value) {
      continue;
    }

    const value = buildLessonFilterValue(item);
    options.set(value, value);
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
});

const filteredItems = computed(() => {
  return overviewItems.value.filter((item) => {
    if (onlyPendingTasks.value && item.pending_count <= 0) {
      return false;
    }
    if (selectedCourse.value && item.course_title !== selectedCourse.value) {
      return false;
    }
    if (selectedLesson.value && buildLessonFilterValue(item) !== selectedLesson.value) {
      return false;
    }
    return true;
  });
});

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function buildLessonFilterValue(item: Pick<OverviewItem, 'unit_title' | 'lesson_title'>) {
  return `${item.unit_title} / ${item.lesson_title}`;
}

function resetFilters() {
  onlyPendingTasks.value = true;
  selectedCourse.value = '';
  selectedLesson.value = '';
}

async function loadOverview() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    overview.value = await apiGet<OverviewPayload>('/submissions/teacher', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载作品总览失败';
  } finally {
    isLoading.value = false;
  }
}

async function goToTask(taskId: number) {
  await router.push(`/staff/submissions/${taskId}`);
}

function handleRowClick(row: OverviewItem) {
  void goToTask(row.task_id);
}

watch(courseOptions, (options) => {
  if (selectedCourse.value && !options.includes(selectedCourse.value)) {
    selectedCourse.value = '';
  }
});

watch(lessonOptions, (options) => {
  if (selectedLesson.value && !options.some((option) => option.value === selectedLesson.value)) {
    selectedLesson.value = '';
  }
});

onMounted(loadOverview);
</script>

<style scoped>
.toolbar-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-select {
  width: 170px;
}

.filter-select-wide {
  width: 240px;
}

.filter-label {
  color: var(--ls-muted);
  font-size: 13px;
}

.table-note {
  margin: 4px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
}

@media (max-width: 900px) {
  .filter-select,
  .filter-select-wide {
    width: 100%;
  }
}
</style>
