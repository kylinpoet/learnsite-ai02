<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">测验排行榜</p>
        <h2>今日班级测验榜</h2>
        <p class="hero-copy">
          这里只展示当前学生所在班级的当日最佳成绩，同时保留未参与学生名单，方便课堂即时反馈。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadRanking">刷新榜单</el-button>
        <el-button plain @click="router.push('/student/quiz')">返回测验首页</el-button>
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
        <template v-if="ranking">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">班级</p>
              <p class="metric-value ranking-metric-text">{{ ranking.class_name || '当前班级' }}</p>
              <p class="metric-note">已按成绩和提交时间排序</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">今日参与</p>
              <p class="metric-value">{{ ranking.items.length }}</p>
              <p class="metric-note">已有提交成绩的学生人数</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">待参与</p>
              <p class="metric-value">{{ ranking.pending_students.length }}</p>
              <p class="metric-note">还没有提交测验的学生人数</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">最高分</p>
              <p class="metric-value">{{ ranking.items[0]?.score ?? '--' }}</p>
              <p class="metric-note">生成时间 {{ formatDateTime(ranking.generated_at) }}</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="16" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>完整排行榜</h3>
                      <p class="section-note">每位学生取今日最佳一条成绩进入榜单。</p>
                    </div>
                  </div>
                </template>

                <el-empty v-if="!ranking.items.length" description="今天还没有学生提交测验" />

                <el-table v-else :data="ranking.items" stripe>
                  <el-table-column label="排名" min-width="80">
                    <template #default="{ row }">
                      <el-tag :type="rankTagType(row.rank)" round>#{{ row.rank }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="学生" min-width="140" prop="student_name" />
                  <el-table-column label="学号" min-width="120" prop="student_no" />
                  <el-table-column label="成绩" min-width="100" prop="score" />
                  <el-table-column label="测验名称" min-width="220" prop="quiz_title" />
                  <el-table-column label="提交时间" min-width="180">
                    <template #default="{ row }">
                      {{ formatDateTime(row.submitted_at) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>

            <el-col :lg="8" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>未参与学生</h3>
                      <p class="section-note">便于教师或学生快速确认还未参加的同学。</p>
                    </div>
                  </div>
                </template>

                <el-empty
                  v-if="!ranking.pending_students.length"
                  description="今天本班学生都已完成测验"
                />

                <div v-else class="pending-list">
                  <article
                    v-for="item in ranking.pending_students"
                    :key="item.student_no"
                    class="pending-item"
                  >
                    <strong>{{ item.student_name }}</strong>
                    <span>{{ item.student_no }}</span>
                  </article>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </template>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type RankingPayload = {
  class_id: number;
  class_name: string;
  items: Array<{
    rank: number;
    student_name: string;
    student_no: string;
    score: number;
    quiz_title: string;
    submitted_at: string | null;
  }>;
  pending_students: Array<{
    student_name: string;
    student_no: string;
  }>;
  generated_at: string;
};

const router = useRouter();
const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const ranking = ref<RankingPayload | null>(null);

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function rankTagType(rank: number) {
  if (rank === 1) {
    return 'warning';
  }
  if (rank === 2) {
    return 'success';
  }
  if (rank === 3) {
    return 'primary';
  }
  return 'info';
}

async function loadRanking() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    ranking.value = await apiGet<RankingPayload>('/quizzes/rankings/daily', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载排行榜失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadRanking);
</script>

<style scoped>
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.section-head h3 {
  margin: 0 0 4px;
}

.ranking-metric-text {
  font-size: clamp(24px, 2vw, 34px);
}

.pending-list {
  display: grid;
  gap: 10px;
}

.pending-item {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--ls-border);
  background: rgba(255, 250, 238, 0.95);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.pending-item span {
  color: var(--ls-muted);
  font-size: 13px;
}
</style>
