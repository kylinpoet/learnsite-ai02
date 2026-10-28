<template>
  <n-drawer
    :show="show"
    :width="drawerWidth"
    display-directive="if"
    placement="right"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <n-drawer-content :native-scrollbar="false" closable>
      <template #header>
        <div class="sp-drawer-head">
          <div class="sp-drawer-head__main">
            <p class="sp-drawer-head__eyebrow">学生视角预览</p>
            <strong class="sp-drawer-head__title">{{ plan?.title || '学生端页面' }}</strong>
          </div>
          <div class="sp-drawer-head__actions">
            <div class="sp-device-switch">
              <n-button
                v-for="option in deviceOptions"
                :key="option.value"
                :secondary="device !== option.value"
                :type="device === option.value ? 'primary' : 'default'"
                size="tiny"
                @click="device = option.value"
              >
                {{ option.label }}
              </n-button>
            </div>
            <n-button v-if="refreshable" :loading="refreshing" secondary size="tiny" @click="emit('refresh')">
              刷新
            </n-button>
          </div>
        </div>
      </template>

      <div class="sp-standalone-banner">
        <n-tag round size="small" type="warning">只读预览</n-tag>
        <span>这是学生打开页面时看到的内容；预览不会保存提交、讨论或附件记录。</span>
      </div>

      <n-alert v-if="error" :closable="false" :title="error" type="error" />

      <n-skeleton v-if="loading" :rows="10" animated />

      <template v-else-if="plan">
        <div class="sp-stage" :data-device="device">
          <div class="sp-frame" :style="frameStyle">
            <div class="sp-student-chrome">
              <span class="sp-student-chrome__brand">学习空间</span>
              <span class="sp-student-chrome__note">学生视角</span>
            </div>

            <header class="sp-hero">
              <p class="sp-hero__eyebrow">学案详情</p>
              <h2 class="sp-hero__title">{{ plan.title }}</h2>
              <p class="sp-hero__meta">{{ heroMeta }}</p>
            </header>

            <n-tabs v-model:value="activeTab" class="sp-tabs" type="line">
              <n-tab-pane name="guide" tab="学案导读">
                <RichTextContent :html="plan.content" empty-text="当前学案还没有补充导读内容。" />
              </n-tab-pane>

              <n-tab-pane
                v-for="(task, index) in plan.tasks"
                :key="task.key"
                :name="task.key"
                display-directive="if"
              >
                <template #tab>
                  <span class="sp-tab-label">
                    <span class="sp-tab-label__title">任务{{ index + 1 }}</span>
                    <span class="sp-tab-label__flag">{{ task.isRequired ? '必做' : '选做' }}</span>
                  </span>
                </template>
                <StudentPreviewTaskPane
                  :assigned-date="plan.assignedDate"
                  :course-title="plan.title"
                  :plan-content="plan.content"
                  :task="task"
                />
              </n-tab-pane>

              <n-tab-pane v-if="!plan.tasks.length" name="empty" tab="任务清单（0）">
                <n-empty description="当前学案还没有任务" />
              </n-tab-pane>
            </n-tabs>
          </div>
        </div>
      </template>

      <n-empty v-else description="暂无可预览的学案内容" />
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { NAlert, NButton, NDrawer, NDrawerContent, NEmpty, NSkeleton, NTabPane, NTabs, NTag } from 'naive-ui';
import { computed, ref, watch } from 'vue';

import RichTextContent from '@/components/RichTextContent.vue';

import StudentPreviewTaskPane from './StudentPreviewTaskPane.vue';
import { useStudentPreviewRuntimeRelay } from './useStudentPreviewRuntimeRelay';
import type { StudentPreviewDevice, StudentPreviewPlan } from './studentViewPreview.types';

const props = withDefaults(
  defineProps<{
    show: boolean;
    plan: StudentPreviewPlan | null;
    token?: string | null;
    loading?: boolean;
    refreshing?: boolean;
    error?: string;
    initialTaskKey?: string | null;
    /** 编辑页的预览直接读表单状态，不需要手动刷新 */
    refreshable?: boolean;
  }>(),
  {
    token: null,
    loading: false,
    refreshing: false,
    error: '',
    initialTaskKey: null,
    refreshable: true,
  }
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  refresh: [];
}>();

const deviceOptions: Array<{ label: string; value: StudentPreviewDevice }> = [
  { label: '桌面', value: 'desktop' },
  { label: '平板', value: 'tablet' },
  { label: '手机', value: 'phone' },
];

const device = ref<StudentPreviewDevice>('desktop');
const activeTab = ref('guide');

const drawerWidth = computed(() => (device.value === 'phone' ? 'min(560px, 96vw)' : 'min(1240px, 94vw)'));

const frameStyle = computed(() => {
  if (device.value === 'tablet') {
    return { maxWidth: '834px' };
  }
  if (device.value === 'phone') {
    return { maxWidth: '390px' };
  }
  return { maxWidth: '100%' };
});

const heroMeta = computed(() => {
  const plan = props.plan;
  if (!plan) {
    return '';
  }
  const lessonLine = [plan.bookTitle, plan.unitTitle, plan.lessonTitle].filter(Boolean).join(' · ');
  return [lessonLine, plan.assignedDate ? `发布 ${plan.assignedDate}` : ''].filter(Boolean).join(' · ');
});

const allowedTaskIds = computed(() =>
  (props.plan?.tasks || []).map((task) => task.id).filter((id): id is number => typeof id === 'number')
);

useStudentPreviewRuntimeRelay({
  allowedTaskIds,
  token: computed(() => props.token),
});

watch(
  () => props.initialTaskKey,
  (nextKey) => {
    if (nextKey) {
      activeTab.value = nextKey;
    }
  },
  { immediate: true }
);

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      return;
    }
    activeTab.value = props.initialTaskKey || 'guide';
  }
);
</script>

<style scoped>
.sp-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.sp-drawer-head__main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.sp-drawer-head__eyebrow {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.sp-drawer-head__title {
  color: var(--ls-ink);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
}

.sp-drawer-head__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sp-device-switch {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sp-standalone-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  border: 1px dashed var(--ls-border);
  border-radius: 12px;
  background: var(--ls-panel-soft, var(--ls-input-bg));
  padding: 8px 12px;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.6;
}

.sp-stage {
  display: flex;
  justify-content: center;
  padding-bottom: 24px;
}

.sp-frame {
  width: 100%;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: var(--ls-surface);
  padding: 16px;
  display: grid;
  gap: 14px;
  align-content: start;
}

.sp-student-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 12px;
  background: var(--ls-primary-soft);
  padding: 8px 12px;
}

.sp-student-chrome__brand {
  color: var(--ls-primary);
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.sp-student-chrome__note {
  color: var(--ls-muted);
  font-size: 11px;
  font-weight: 600;
}

.sp-hero {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--ls-card, var(--ls-surface));
  border: 1px solid var(--ls-border);
}

.sp-hero__eyebrow {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.sp-hero__title {
  margin: 0;
  color: var(--ls-ink);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.25;
}

.sp-hero__meta {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.6;
}

.sp-tabs {
  min-width: 0;
}

.sp-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sp-tab-label__title {
  color: var(--ls-ink);
  font-weight: 700;
}

.sp-tab-label__flag {
  border-radius: 999px;
  background: var(--ls-chip-bg);
  color: var(--ls-muted);
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
}
</style>
