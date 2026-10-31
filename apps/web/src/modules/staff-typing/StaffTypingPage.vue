<template>
  <div class="page-stack">
    <StaffPageHead title="打字训练" :sub="pageSummary">
      <template #actions>
        <n-button type="primary" @click="openCreate">新建内容</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="bootstrap">
      <StaffStatStrip :items="statItems" />

      <section class="sf-panel">
        <div class="sf-tabs">
          <button
            v-for="tab in modeTabs"
            :key="tab.key"
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeMode === tab.key }]"
            @click="activeMode = tab.key"
          >
            {{ tab.label }}
            <span class="sf-tabs__count">{{ tab.count }}</span>
          </button>
        </div>

        <header class="sf-panel__head">
          <h2 class="sf-panel__title">
            内容清单
            <span class="sf-panel__count">{{ filteredSets.length }} 套</span>
          </h2>
          <div class="sf-panel__actions">
            <n-button :loading="isLoading" text @click="loadBootstrap">刷新</n-button>
          </div>
        </header>

        <p v-if="!filteredSets.length" class="sf-empty">
          {{
            bootstrap.sets.length
              ? '当前筛选条件下没有打字内容。'
              : '还没有打字内容。点右上角「新建内容」录入第一套练习，学生端才会出现打字训练。'
          }}
        </p>

        <template v-else>
          <div class="sf-rows__head sf-cols-typing">
            <span>内容</span>
            <span>练习</span>
            <span>平均 CPM</span>
            <span>最佳 CPM</span>
            <span>操作</span>
          </div>
          <div class="sf-rows">
            <article
              v-for="item in filteredSets"
              :key="item.id"
              class="sf-row sf-row--cols sf-row--link sf-cols-typing"
              @click="openPreview(item)"
            >
              <div class="sf-row__main">
                <p class="sf-row__title">
                  <span class="sf-row__title-text">{{ item.title }}</span>
                  <span :class="['sf-pill', item.is_active ? 'sf-pill--pos' : '']">
                    <span v-if="item.is_active" class="sf-pill__dot" />
                    {{ item.is_active ? '学生端可见' : '未启用' }}
                  </span>
                </p>
                <p class="sf-row__meta">
                  <span>{{ modeLabel(item.typing_mode) }}</span>
                  <span>{{ item.difficulty }}</span>
                  <span>{{ item.owner_name }}</span>
                  <span>更新于 {{ formatDateTime(item.updated_at) }}</span>
                  <span v-if="item.description">{{ item.description }}</span>
                </p>
              </div>

              <span class="sf-row__num" data-label="练习">{{ item.record_count }}</span>
              <span class="sf-row__num" data-label="平均 CPM">{{ item.average_speed ?? '--' }}</span>
              <span class="sf-row__num" data-label="最佳 CPM">{{ item.best_speed ?? '--' }}</span>

              <div class="sf-row__action" @click.stop>
                <n-button text @click="openPreview(item)">查看全文</n-button>
              </div>
            </article>
          </div>
        </template>
      </section>
    </template>

    <n-drawer v-model:show="createVisible" :width="drawerWidth" placement="right">
      <n-drawer-content closable title="新建打字内容">
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
              placeholder="输入学生实际要练习输入的正文内容"
              type="textarea"
            />
          </n-form-item>

          <n-form-item label="学生端可见">
            <n-switch v-model:value="form.is_active">
              <template #checked>启用</template>
              <template #unchecked>停用</template>
            </n-switch>
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="createVisible = false">取消</n-button>
            <n-button :loading="submitting" type="primary" @click="submitSet">保存内容</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal
      v-model:show="previewVisible"
      :title="previewSet?.title || '内容预览'"
      preset="card"
      style="width: min(720px, 94vw)"
    >
      <template v-if="previewSet">
        <div class="preview-meta">
          <span class="sf-pill">{{ modeLabel(previewSet.typing_mode) }}</span>
          <span class="sf-pill">{{ previewSet.difficulty }}</span>
          <span :class="['sf-pill', previewSet.is_active ? 'sf-pill--pos' : '']">
            {{ previewSet.is_active ? '学生端可见' : '未启用' }}
          </span>
        </div>
        <p class="preview-summary">
          {{ previewSet.description || '暂无内容说明。' }}
        </p>
        <p class="preview-stats">
          练习 {{ previewSet.record_count }} 次 · 平均 {{ previewSet.average_speed ?? '--' }} CPM · 最佳
          {{ previewSet.best_speed ?? '--' }} CPM · 更新于 {{ formatDateTime(previewSet.updated_at) }}
        </p>
        <p class="preview-content">{{ previewSet.content }}</p>
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button @click="previewVisible = false">关闭</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NDrawer, NDrawerContent, NForm, NFormItem, NInput, NModal, NSelect, NSkeleton, NSpace, NSwitch } from 'naive-ui';
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import { apiGet, apiPost } from '@/api/http';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime as formatDateTimeValue } from '@/utils/datetime';

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

type TypingSet = StaffTypingBootstrap['sets'][number];
type ModeKey = 'all' | 'english' | 'chinese' | 'pinyin';

const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const submitting = ref(false);
const activeMode = ref<ModeKey>('all');
const bootstrap = ref<StaffTypingBootstrap | null>(null);
const createVisible = ref(false);
const previewVisible = ref(false);
const previewSet = ref<TypingSet | null>(null);

const drawerWidth = 'min(560px, 94vw)';

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

const sets = computed(() => bootstrap.value?.sets || []);
const classes = computed(() => bootstrap.value?.classes || []);

const filteredSets = computed(() => {
  if (activeMode.value === 'all') {
    return sets.value;
  }
  return sets.value.filter((item) => item.typing_mode === activeMode.value);
});

const modeTabs = computed(() => [
  { key: 'all' as const, label: '全部', count: sets.value.length },
  { key: 'english' as const, label: '英文', count: sets.value.filter((item) => item.typing_mode === 'english').length },
  { key: 'chinese' as const, label: '中文', count: sets.value.filter((item) => item.typing_mode === 'chinese').length },
  { key: 'pinyin' as const, label: '拼音', count: sets.value.filter((item) => item.typing_mode === 'pinyin').length },
]);

const activeSetCount = computed(() => sets.value.filter((item) => item.is_active).length);
const totalRecords = computed(() => sets.value.reduce((sum, item) => sum + item.record_count, 0));
const bestSpeedOverall = computed(() => Math.max(0, ...sets.value.map((item) => item.best_speed || 0)));

const pageSummary = computed(() => {
  if (!sets.value.length) {
    return '还没有打字内容。先新建一套练习，学生端才会出现打字训练。';
  }
  if (!activeSetCount.value) {
    return `有 ${sets.value.length} 套内容，但都未启用，学生端现在还看不到练习。`;
  }
  return `学生端可见 ${activeSetCount.value} 套内容，覆盖 ${classes.value.length} 个班级；累计 ${totalRecords.value} 次练习。`;
});

const statItems = computed<StaffStatItem[]>(() => [
  { label: '覆盖班级', value: classes.value.length, unit: '个', note: '当前账号可见班级' },
  { label: '内容套数', value: sets.value.length, unit: '套', note: '含未启用内容' },
  {
    label: '学生端可见',
    value: activeSetCount.value,
    unit: '套',
    note: activeSetCount.value ? '启用中的内容' : '暂无启用内容',
  },
  {
    label: '累计练习',
    value: totalRecords.value,
    unit: '次',
    note: bestSpeedOverall.value ? `全站最高 ${bestSpeedOverall.value} CPM` : '还没有成绩',
  },
]);

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

function formatDateTime(value: string | null) {
  return formatDateTimeValue(value, { fallback: '暂无', sliceStart: 0, sliceEnd: 16 });
}

function resetForm() {
  form.title = '';
  form.typing_mode = 'english';
  form.difficulty = '基础';
  form.description = '';
  form.content = '';
  form.is_active = true;
}

function openCreate() {
  resetForm();
  createVisible.value = true;
}

function openPreview(item: TypingSet) {
  previewSet.value = item;
  previewVisible.value = true;
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
    createVisible.value = false;
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
.form-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.full-width {
  width: 100%;
}

.sf-cols-typing {
  grid-template-columns: minmax(0, 1fr) 72px 96px 96px 84px;
}

.preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.preview-summary {
  margin: 0 0 6px;
  color: var(--sf-text);
  font-size: 14px;
  line-height: 1.6;
}

.preview-stats {
  margin: 0 0 16px;
  color: var(--sf-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.preview-content {
  margin: 0;
  padding: 16px;
  border: 1px solid var(--sf-line-soft);
  border-radius: var(--sf-r-card);
  background: var(--sf-surface-2);
  color: var(--sf-ink);
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .form-inline-grid {
    grid-template-columns: 1fr;
  }
}
</style>
