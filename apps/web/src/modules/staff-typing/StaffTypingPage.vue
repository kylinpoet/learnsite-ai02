<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="统一管理中文打字、拼音打字等练习内容，并查看每套内容的使用情况。"
      eyebrow="打字内容管理"
      title="教师打字内容与成绩概览"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadBootstrap">刷新数据</n-button>
        <n-button secondary @click="resetForm">重置表单</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="12" animated />
    </SaPanel>

    <template v-else-if="bootstrap">
      <div class="ls-row">
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

      <SaPanel>
        <template #header>
          <div class="section-head">
            <div>
              <h3>内容练习与成绩对比</h3>
              <p class="section-note">柱为练习次数，折线为平均 / 最佳速度（CPM），快速定位热门与难点内容。</p>
            </div>
          </div>
        </template>
        <n-empty v-if="!bootstrap.sets.length" description="当前还没有打字练习内容。" />
        <AppChart v-else :height="300" :option="setPerformanceOption" />
      </SaPanel>

      <div class="split-grid">
        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>新建打字内容</h3>
                <p class="section-note">支持英文、中文和拼音三种模式。</p>
              </div>
            </div>
          </template>

          <n-form label-placement="top" @submit.prevent>
            <n-form-item label="标题">
              <n-input v-model:value="form.title" maxlength="120" placeholder="例如：拼音训练 · 人工智能应用" />
            </n-form-item>

            <div class="form-inline-grid">
              <n-form-item label="练习模式">
                <n-select v-model:value="form.typing_mode" :options="typingModeOptions" class="full-width" />
              </n-form-item>
              <n-form-item label="难度">
                <n-select v-model:value="form.difficulty" :options="difficultyOptions" class="full-width" />
              </n-form-item>
            </div>

            <n-form-item label="内容说明">
              <n-input
                v-model:value="form.description"
                :rows="3"
                maxlength="1000"
                placeholder="说明练习主题或适用年级"
                type="textarea"
              />
            </n-form-item>

            <n-form-item label="练习正文">
              <n-input
                v-model:value="form.content"
                :rows="10"
                maxlength="10000"
                placeholder="请输入学生实际要练习输入的正文内容"
                type="textarea"
              />
            </n-form-item>

            <n-form-item label="是否启用">
              <n-switch v-model:value="form.is_active">
                <template #checked>启用</template>
                <template #unchecked>停用</template>
              </n-switch>
            </n-form-item>

            <n-button :loading="submitting" type="primary" @click="submitSet">保存内容</n-button>
          </n-form>
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>内容列表</h3>
                <p class="section-note">可按模式快速筛选查看。</p>
              </div>
              <n-radio-group v-model:value="activeMode" size="small">
                <n-radio-button value="all">全部</n-radio-button>
                <n-radio-button value="english">英文</n-radio-button>
                <n-radio-button value="chinese">中文</n-radio-button>
                <n-radio-button value="pinyin">拼音</n-radio-button>
              </n-radio-group>
            </div>
          </template>

          <div class="chip-row classroom-chip-row">
            <n-tag v-for="item in bootstrap.classes" :key="item.id" round>
              {{ item.class_name }} · {{ item.student_count }} 人
            </n-tag>
          </div>

          <n-empty v-if="!filteredSets.length" description="当前筛选条件下没有打字内容" />

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
                  <n-tag :type="item.is_active ? 'success' : 'info'" round>
                    {{ item.is_active ? '已启用' : '未启用' }}
                  </n-tag>
                  <n-tag round>{{ item.record_count }} 次练习</n-tag>
                </div>
              </div>

              <p class="set-card__desc">{{ item.description || '暂无内容说明。' }}</p>
              <p class="set-card__preview">{{ previewContent(item.content) }}</p>

              <div class="chip-row">
                <n-tag round type="success">
                  平均速度 {{ item.average_speed ?? '--' }}
                </n-tag>
                <n-tag round type="warning">
                  最佳速度 {{ item.best_speed ?? '--' }}
                </n-tag>
                <n-tag round type="info">
                  更新于 {{ formatDateTime(item.updated_at) }}
                </n-tag>
              </div>
            </article>
          </div>
        </SaPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NForm, NFormItem, NInput, NRadioButton, NRadioGroup, NSelect, NSkeleton, NSwitch, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import { apiGet, apiPost } from '@/api/http';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

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
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();

const isLoading = ref(true);
const errorMessage = ref('');
const submitting = ref(false);
const activeMode = ref<'all' | 'english' | 'chinese' | 'pinyin'>('all');
const bootstrap = ref<StaffTypingBootstrap | null>(null);

const typingModeOptions = [
  { label: '英文', value: 'english' },
  { label: '中文', value: 'chinese' },
  { label: '拼音', value: 'pinyin' },
];

const difficultyOptions = [
  { label: '基础', value: '基础' },
  { label: '提升', value: '提升' },
  { label: '挑战', value: '挑战' },
];

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

const setPerformanceOption = computed(() => {
  const sets = (bootstrap.value?.sets || []).slice(0, 12);
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(sets.map((item) => item.title), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 72, overflow: 'truncate', interval: 0 },
    }),
    yAxis: [
      axisY({ name: '练习次数', nameTextStyle: { color: tokens.value.muted } }),
      axisY({ name: 'CPM', nameTextStyle: { color: tokens.value.muted }, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '练习次数',
        type: 'bar',
        barMaxWidth: 30,
        itemStyle: { color: palette.value[0], borderRadius: [6, 6, 0, 0] },
        data: sets.map((item) => item.record_count),
      },
      {
        name: '平均速度',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        connectNulls: true,
        lineStyle: { color: palette.value[1] },
        itemStyle: { color: palette.value[1] },
        data: sets.map((item) => item.average_speed),
      },
      {
        name: '最佳速度',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        connectNulls: true,
        lineStyle: { color: palette.value[2], type: 'dashed' },
        itemStyle: { color: palette.value[2] },
        data: sets.map((item) => item.best_speed),
      },
    ],
  });
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
  width: 100%;
}

.split-grid {
  display: grid;
  grid-template-columns: minmax(0, 9fr) minmax(0, 15fr);
  gap: 16px;
  align-items: start;
}

.full-width {
  width: 100%;
}

@media (max-width: 1199px) {
  .split-grid {
    grid-template-columns: 1fr;
  }
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
  background: var(--ls-card);
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
  background: var(--ls-panel-soft);
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
