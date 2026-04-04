<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">打字排行榜</p>
        <h2>打字速度与准确率榜单</h2>
        <p class="hero-copy">
          支持班级、年级、全校三个范围，默认按今日最佳速度排序，速度相同则比较准确率和完成时间。
        </p>
      </div>
      <el-space wrap>
        <el-select v-model="scope" class="scope-select" @change="loadRankings">
          <el-option label="班级榜" value="class" />
          <el-option label="年级榜" value="grade" />
          <el-option label="全校榜" value="school" />
        </el-select>
        <el-button :loading="isLoading" type="primary" @click="loadRankings">刷新榜单</el-button>
        <el-button plain @click="router.push('/student/typing')">返回打字首页</el-button>
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
              <p class="metric-label">榜单范围</p>
              <p class="metric-value ranking-metric-text">{{ ranking.label }}</p>
              <p class="metric-note">生成时间 {{ formatDateTime(ranking.generated_at) }}</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">上榜人数</p>
              <p class="metric-value">{{ ranking.items.length }}</p>
              <p class="metric-note">取当日最佳成绩进入榜单</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">待参与</p>
              <p class="metric-value">{{ ranking.pending_students.length }}</p>
              <p class="metric-note">仅班级榜显示未参与名单</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">最高速度</p>
              <p class="metric-value">{{ ranking.items[0]?.speed_cpm ?? '--' }}</p>
              <p class="metric-note">单位 CPM</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="16" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>完整排行榜</h3>
                      <p class="section-note">速度优先，准确率次之。</p>
                    </div>
                  </div>
                </template>

                <el-empty v-if="!ranking.items.length" description="当前范围内还没有打字成绩" />

                <el-table v-else :data="ranking.items" stripe>
                  <el-table-column label="排名" min-width="80">
                    <template #default="{ row }">
                      <el-tag :type="rankTagType(row.rank)" round>#{{ row.rank }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="学生" min-width="140" prop="student_name" />
                  <el-table-column label="学号" min-width="120" prop="student_no" />
                  <el-table-column label="班级" min-width="100" prop="class_name" />
                  <el-table-column label="速度" min-width="100" prop="speed_cpm" />
                  <el-table-column label="准确率" min-width="100">
                    <template #default="{ row }">
                      {{ row.accuracy_percent }}%
                    </template>
                  </el-table-column>
                  <el-table-column label="练习内容" min-width="200" prop="typing_set_title" />
                  <el-table-column label="时间" min-width="180">
                    <template #default="{ row }">
                      {{ formatDateTime(row.played_at) }}
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
                      <p class="section-note">仅在班级榜中显示。</p>
                    </div>
                  </div>
                </template>

                <el-empty
                  v-if="!ranking.pending_students.length"
                  description="当前范围内没有待参与名单"
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
  scope: string;
  label: string;
  items: Array<{
    rank: number;
    student_name: string;
    student_no: string;
    class_name: string;
    speed_cpm: number;
    accuracy_percent: number;
    typing_set_title: string;
    played_at: string;
  }>;
  pending_students: Array<{
    student_name: string;
    student_no: string;
  }>;
  generated_at: string;
};

const router = useRouter();
const authStore = useAuthStore();

const scope = ref<'class' | 'grade' | 'school'>('class');
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

async function loadRankings() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    ranking.value = await apiGet<RankingPayload>(`/typing/rankings?scope=${scope.value}`, authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载排行榜失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadRankings);
</script>

<style scoped>
.scope-select {
  width: 150px;
}

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
