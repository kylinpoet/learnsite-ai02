<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">打字内容管理</p>
        <h2>教师打字内容与成绩概览</h2>
        <p class="hero-copy">
          教师可在这里统一管理中文打字、拼音打字等练习内容，并查看每套内容的使用情况。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadBootstrap">刷新数据</el-button>
        <el-button plain @click="resetForm">重置表单</el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="12" />
        </el-card>
      </template>

      <template #default>
        <template v-if="bootstrap">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">班级数量</p>
              <p class="metric-value">{{ bootstrap.classes.length }}</p>
              <p class="metric-note">当前账号可见班级</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">内容套数</p>
              <p class="metric-value">{{ bootstrap.sets.length }}</p>
              <p class="metric-note">全部打字练习内容</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">启用中</p>
              <p class="metric-value">{{ activeSetCount }}</p>
              <p class="metric-note">学生端可见的内容数量</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">最高速度</p>
              <p class="metric-value">{{ bestSpeedOverall }}</p>
              <p class="metric-note">按已有成绩统计</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>新建打字内容</h3>
                      <p class="section-note">支持英文、中文和拼音三种模式。</p>
                    </div>
                  </div>
                </template>

                <el-form label-position="top" @submit.prevent>
                  <el-form-item label="标题">
                    <el-input v-model="form.title" maxlength="120" placeholder="例如：拼音训练 · 人工智能应用" />
                  </el-form-item>

                  <div class="form-inline-grid">
                    <el-form-item label="练习模式">
                      <el-select v-model="form.typing_mode" class="full-width">
                        <el-option label="英文" value="english" />
                        <el-option label="中文" value="chinese" />
                        <el-option label="拼音" value="pinyin" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="难度">
                      <el-select v-model="form.difficulty" class="full-width">
                        <el-option label="基础" value="基础" />
                        <el-option label="提升" value="提升" />
                        <el-option label="挑战" value="挑战" />
                      </el-select>
                    </el-form-item>
                  </div>

                  <el-form-item label="内容说明">
                    <el-input
                      v-model="form.description"
                      :rows="3"
                      maxlength="1000"
                      placeholder="说明练习主题或适用年级"
                      type="textarea"
                    />
                  </el-form-item>

                  <el-form-item label="练习正文">
                    <el-input
                      v-model="form.content"
                      :rows="10"
                      maxlength="10000"
                      placeholder="请输入学生实际要练习输入的正文内容"
                      type="textarea"
                    />
                  </el-form-item>

                  <el-form-item label="是否启用">
                    <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
                  </el-form-item>

                  <el-button :loading="submitting" type="primary" @click="submitSet">保存内容</el-button>
                </el-form>
              </el-card>
            </el-col>

            <el-col :lg="15" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>内容列表</h3>
                      <p class="section-note">可按模式快速筛选查看。</p>
                    </div>
                    <el-radio-group v-model="activeMode" size="small">
                      <el-radio-button label="all">全部</el-radio-button>
                      <el-radio-button label="english">英文</el-radio-button>
                      <el-radio-button label="chinese">中文</el-radio-button>
                      <el-radio-button label="pinyin">拼音</el-radio-button>
                    </el-radio-group>
                  </div>
                </template>

                <div class="chip-row classroom-chip-row">
                  <el-tag v-for="item in bootstrap.classes" :key="item.id" round>
                    {{ item.class_name }} · {{ item.student_count }} 人
                  </el-tag>
                </div>

                <el-empty v-if="!filteredSets.length" description="当前筛选条件下没有打字内容" />

                <div v-else class="set-list">
                  <article
                    v-for="item in filteredSets"
                    :key="item.id"
                    class="set-card"
                  >
                    <div class="set-card__top">
                      <div>
                        <h4>{{ item.title }}</h4>
                        <p class="set-card__meta">
                          {{ item.owner_name }} · {{ modeLabel(item.typing_mode) }} · {{ item.difficulty }}
                        </p>
                      </div>
                      <div class="chip-row">
                        <el-tag :type="item.is_active ? 'success' : 'info'" round>
                          {{ item.is_active ? '已启用' : '未启用' }}
                        </el-tag>
                        <el-tag round>{{ item.record_count }} 次练习</el-tag>
                      </div>
                    </div>

                    <p class="set-card__desc">{{ item.description || '暂无内容说明。' }}</p>
                    <p class="set-card__preview">{{ previewContent(item.content) }}</p>

                    <div class="chip-row">
                      <el-tag round type="success">
                        平均速度 {{ item.average_speed ?? '--' }}
                      </el-tag>
                      <el-tag round type="warning">
                        最佳速度 {{ item.best_speed ?? '--' }}
                      </el-tag>
                      <el-tag round type="info">
                        更新于 {{ formatDateTime(item.updated_at) }}
                      </el-tag>
                    </div>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

import { apiGet, apiPost } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type StaffTypingBootstrap = {
  classes: Array<{
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
  }>;
  sets: Array<{
    id: number;
    title: string;
    typing_mode: string;
    difficulty: string;
    description: string | null;
    content: string;
    is_active: boolean;
    owner_name: string;
    record_count: number;
    average_speed: number | null;
    best_speed: number | null;
    updated_at: string | null;
  }>;
};

const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const submitting = ref(false);
const activeMode = ref<'all' | 'english' | 'chinese' | 'pinyin'>('all');
const bootstrap = ref<StaffTypingBootstrap | null>(null);

const form = reactive({
  title: '',
  typing_mode: 'english',
  difficulty: '基础',
  description: '',
  content: '',
  is_active: true,
});

const filteredSets = computed(() => {
  const items = bootstrap.value?.sets || [];
  if (activeMode.value === 'all') {
    return items;
  }
  return items.filter((item) => item.typing_mode === activeMode.value);
});

const activeSetCount = computed(() =>
  (bootstrap.value?.sets || []).filter((item) => item.is_active).length
);

const bestSpeedOverall = computed(() => {
  const max = Math.max(...(bootstrap.value?.sets || []).map((item) => item.best_speed || 0), 0);
  return max || '--';
});

function modeLabel(mode: string) {
  if (mode === 'english') {
    return '英文';
  }
  if (mode === 'chinese') {
    return '中文';
  }
  if (mode === 'pinyin') {
    return '拼音';
  }
  return mode;
}

function previewContent(content: string) {
  return content.length > 140 ? `${content.slice(0, 140)}...` : content;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function resetForm() {
  form.title = '';
  form.typing_mode = 'english';
  form.difficulty = '基础';
  form.description = '';
  form.content = '';
  form.is_active = true;
}

async function loadBootstrap() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    bootstrap.value = await apiGet<StaffTypingBootstrap>('/typing/staff/bootstrap', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载打字内容失败';
  } finally {
    isLoading.value = false;
  }
}

async function submitSet() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!form.title.trim()) {
    ElMessage.warning('请填写内容标题');
    return;
  }
  if (!form.content.trim()) {
    ElMessage.warning('请填写练习正文');
    return;
  }

  submitting.value = true;
  try {
    bootstrap.value = await apiPost<StaffTypingBootstrap>(
      '/typing/staff/sets',
      {
        title: form.title.trim(),
        typing_mode: form.typing_mode,
        difficulty: form.difficulty,
        description: form.description.trim() || null,
        content: form.content.trim(),
        is_active: form.is_active,
      },
      authStore.token
    );
    ElMessage.success('打字内容已保存');
    resetForm();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存打字内容失败');
  } finally {
    submitting.value = false;
  }
}

onMounted(loadBootstrap);
</script>

<style scoped>
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-head h3 {
  margin: 0 0 4px;
}

.form-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.classroom-chip-row {
  margin-bottom: 16px;
}

.set-list {
  display: grid;
  gap: 14px;
}

.set-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.95);
}

.set-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.set-card__top h4 {
  margin: 0 0 6px;
}

.set-card__meta,
.set-card__desc,
.set-card__preview {
  margin: 0;
  color: var(--ls-muted);
}

.set-card__preview {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 255, 0.95);
  color: var(--ls-text);
  line-height: 1.8;
}

@media (max-width: 900px) {
  .form-inline-grid {
    grid-template-columns: 1fr;
  }

  .set-card__top {
    flex-direction: column;
  }
}
</style>
