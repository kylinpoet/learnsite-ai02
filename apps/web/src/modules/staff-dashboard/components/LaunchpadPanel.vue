<template>
  <section class="launchpad">
    <header class="launchpad__head">
      <div class="launchpad__titles">
        <p class="launchpad__title">开课台</p>
        <p class="launchpad__sub">核对班级与课程，点右侧按钮开始这节课</p>
      </div>
      <span :class="['launchpad__state', `is-${phase}`]">{{ stateText }}</span>
    </header>

    <div class="launchpad__grid">
      <div class="launch-field">
        <span class="launch-field__label">上课班级</span>
        <n-select
          aria-label="上课班级"
          :consistent-menu-width="false"
          :menu-props="{ style: 'min-width: 300px' }"
          :options="classOptions"
          :value="classId ?? undefined"
          placeholder="选择班级"
          size="large"
          @update:value="(value: number) => emit('update:classId', value)"
        />
        <div class="launch-field__meta">
          <template v-if="selectedClass">
            <span class="class-code">
              班级码<b>{{ selectedClass.class_code || '未生成' }}</b>
            </span>
            <button class="meta-action" type="button" @click="emit('copy-code')">复制</button>
            <button class="meta-action" type="button" @click="emit('regenerate-code')">换一个</button>
            <span class="meta-text">
              {{ selectedClass.student_count }} 人 · 今日已签到 {{ selectedClass.checked_in_count }} 人
            </span>
          </template>
          <span v-else class="meta-text">当前账号还没有任课班级</span>
        </div>
      </div>

      <div class="launch-field">
        <span class="launch-field__label">上课课程</span>
        <n-select
          aria-label="上课课程"
          :consistent-menu-width="false"
          :menu-props="{ style: 'min-width: 340px' }"
          :options="planOptions"
          :value="planId ?? undefined"
          placeholder="选择学案"
          size="large"
          @update:value="(value: number) => emit('update:planId', value)"
        />
        <div class="launch-field__meta">
          <span v-if="selectedPlan" class="meta-text">{{ planMeta }}</span>
          <span v-else class="meta-text">还没有已发布的学案，请先在「学案管理」中发布</span>
        </div>
      </div>

      <div class="launchpad__action">
        <n-button
          class="launchpad__go"
          :disabled="!ready"
          :loading="launching"
          size="large"
          type="primary"
          @click="emit('launch')"
        >
          <template #icon>
            <AppIcon :icon="Play" :size="18" />
          </template>
          一键开课
        </n-button>
        <span class="launchpad__hint">{{ hint }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Play } from 'lucide-vue-next';
import { NButton, NSelect } from 'naive-ui';
import { computed } from 'vue';

import AppIcon from '@/components/AppIcon.vue';
import type { LaunchpadClass, LaunchpadPlan } from './dashboardTypes';

const props = defineProps<{
  phase: 'live' | 'last' | 'idle';
  classes: LaunchpadClass[];
  plans: LaunchpadPlan[];
  classId: number | null;
  planId: number | null;
  launching: boolean;
}>();

const emit = defineEmits<{
  launch: [];
  'update:classId': [value: number];
  'update:planId': [value: number];
  'copy-code': [];
  'regenerate-code': [];
}>();

const selectedClass = computed(() => props.classes.find((item) => item.id === props.classId) ?? null);
const selectedPlan = computed(() => props.plans.find((item) => item.id === props.planId) ?? null);

const classOptions = computed(() =>
  props.classes.map((item) => ({
    label: `${item.class_label} · ${item.student_count} 人`,
    value: item.id,
  })),
);

const planOptions = computed(() =>
  props.plans.map((item) => ({
    label: item.title,
    value: item.id,
  })),
);

const planMeta = computed(() => {
  const plan = selectedPlan.value;
  if (!plan) return '';
  const parts = [
    plan.book_name,
    plan.unit_title,
    `${plan.task_count} 个活动`,
    plan.pending_count ? `待完成 ${plan.pending_count} 人` : null,
  ];
  return parts.filter((item): item is string => Boolean(item)).join(' · ');
});

const stateText = computed(() =>
  props.phase === 'last' ? '上次课堂已结束，可开新一节' : '准备开课',
);

const ready = computed(() => Boolean(props.classId && props.planId) && !props.launching);

const hint = computed(() => {
  if (!props.classes.length) return '账号下还没有任课班级';
  if (!props.plans.length) return '没有已发布的学案，先去「学案管理」发布';
  if (!props.classId) return '请先选择上课班级';
  if (!props.planId) return '请先选择上课课程';
  return '开课后学生端自动进入课堂';
});
</script>

<style scoped>
.launchpad {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
  border: 1px solid var(--ls-primary);
  border-radius: var(--ls-radius-md);
  background: var(--ls-panel-strong, var(--ls-card));
  box-shadow: none;
}

.launchpad__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

.launchpad__titles {
  min-width: 0;
}

.launchpad__title {
  margin: 0;
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.launchpad__sub {
  margin: 1px 0 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.3;
}

.launchpad__state {
  flex: 0 0 auto;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
}

.launchpad__state.is-idle {
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
}

.launchpad__state.is-last {
  background: var(--ls-chip-bg);
  color: var(--ls-warning, #d48a1f);
}

.launchpad__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.3fr) 220px;
  gap: 12px;
  align-items: stretch;
}

.launch-field {
  display: grid;
  gap: 4px;
  align-content: start;
  min-width: 0;
}

.launch-field__label {
  color: var(--ls-text);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.launch-field__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 18px;
  min-width: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

.class-code {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--ls-chip-bg);
  color: var(--ls-muted);
  font-size: 11px;
  font-weight: 600;
}

.class-code b {
  color: var(--ls-primary);
  font-family: var(--ls-display-font);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.meta-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ls-primary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.meta-action:hover {
  text-decoration: underline;
}

.meta-text {
  min-width: 0;
}

.launchpad__action {
  display: grid;
  gap: 5px;
  align-content: center;
  min-width: 0;
}

.launchpad__go {
  height: 48px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.launchpad__hint {
  color: var(--ls-muted);
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
}

@media (max-width: 1180px) {
  .launchpad__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  }

  .launchpad__action {
    grid-column: 1 / -1;
  }

  .launchpad__go {
    height: 48px;
  }
}

@media (max-width: 760px) {
  .launchpad__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
