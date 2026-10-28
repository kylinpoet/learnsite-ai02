<template>
  <article :class="['ls-card', 'live-card', `is-${phase}`]">
    <!-- 左：这是哪节课 -->
    <section class="live-col live-col--identity">
      <div class="live-phase">
        <span :class="['live-phase__dot', `is-${phase}`]" />
        <span class="live-phase__text">{{ phaseText }}</span>
        <n-tag v-if="sessionId" round size="tiny" :type="phase === 'live' ? 'success' : 'default'">
          {{ phase === 'live' ? '进行中' : '最近一次' }}
        </n-tag>
      </div>

      <p class="live-class">
        <span class="live-class__name">{{ className || '未选择班级' }}</span>
        <n-tag v-if="roomLabel" round size="tiny">{{ roomLabel }}</n-tag>
      </p>
      <p class="live-lesson">{{ lessonTitle || '请选择要上的课' }}</p>
      <p class="live-plan">{{ planMeta || '选择班级与课次后即可一键开课' }}</p>

      <template v-if="phase !== 'live'">
        <div class="live-launch">
          <n-select
            :options="classOptions"
            :value="launchClassId"
            filterable
            placeholder="选择班级"
            size="small"
            @update:value="(value: number) => emit('update:launchClassId', value)"
          />
          <n-select
            :options="planOptions"
            :value="launchPlanId"
            filterable
            placeholder="选择学案"
            size="small"
            @update:value="(value: number) => emit('update:launchPlanId', value)"
          />
          <n-button
            :disabled="!launchClassId || !launchPlanId"
            :loading="launching"
            size="small"
            type="primary"
            @click="emit('launch')"
          >
            一键开课
          </n-button>
        </div>
      </template>
      <p v-else class="live-time">
        开课时间 {{ formatDateTime(startedAt) }} · 学案 {{ submission.taskCount }} 个任务
      </p>

      <div class="live-actions">
        <n-button v-if="sessionId" size="small" type="primary" @click="emit('open-classroom', sessionId)">
          进入课堂控制
        </n-button>
        <n-button
          v-if="sessionId && phase === 'live'"
          size="small"
          secondary
          type="error"
          @click="emit('close-session', sessionId)"
        >
          结束课堂
        </n-button>
        <n-button :loading="isRefreshing" size="small" secondary @click="emit('refresh')">刷新</n-button>
        <span class="live-updated">{{ updatedText }}</span>
      </div>
    </section>

    <!-- 中：来了几个人 -->
    <section class="live-col live-col--checkin">
      <div class="ring" :style="ringStyle">
        <div class="ring__inner">
          <span class="ls-num ls-num--xl">{{ checkin.checkedIn }}</span>
          <span class="ring__total">/ {{ checkin.total }}</span>
        </div>
      </div>
      <div class="checkin-meta">
        <p class="ls-label">已签到</p>
        <p class="ls-card__sub">未签到 {{ checkin.pending.length }} 人</p>
        <div class="pending-chips">
          <span
            v-for="student in checkin.pending.slice(0, 8)"
            :key="student.user_id"
            class="pending-chip"
            :title="`${student.student_no} · ${student.seat_label || '未绑定座位'}`"
          >
            {{ student.display_name }}
          </span>
          <span v-if="checkin.pending.length > 8" class="pending-chip pending-chip--more">
            +{{ checkin.pending.length - 8 }}
          </span>
          <span v-if="!checkin.pending.length" class="pending-empty">全部到齐</span>
        </div>
      </div>
    </section>

    <!-- 右：交到哪一步 -->
    <section class="live-col live-col--submission">
      <div class="submission-head">
        <p class="ls-label">任务提交</p>
        <p class="ls-card__sub">
          {{ submission.taskCount }} 个任务 · 待评阅 {{ submission.pendingReview }}
        </p>
      </div>

      <div class="submission-bar">
        <span class="seg seg--completed" :style="{ flexGrow: Math.max(submission.completed, 0.001) }" />
        <span class="seg seg--partial" :style="{ flexGrow: Math.max(submission.partial, 0.001) }" />
        <span class="seg seg--none" :style="{ flexGrow: Math.max(submission.none, 0.001) }" />
      </div>

      <div class="submission-legend">
        <span class="legend-item"><i class="ls-dot dot--completed" />完成 {{ submission.completed }}</span>
        <span class="legend-item"><i class="ls-dot dot--partial" />部分 {{ submission.partial }}</span>
        <span class="legend-item"><i class="ls-dot dot--none" />未交 {{ submission.none }}</span>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { NButton, NSelect, NTag } from 'naive-ui';
import { computed } from 'vue';

import type { LiveStudent } from './dashboardTypes';

const props = defineProps<{
  phase: 'live' | 'last' | 'idle';
  className: string;
  roomLabel?: string | null;
  /** 课次标题，例如「第6课 物联网」 */
  lessonTitle?: string | null;
  unitTitle?: string | null;
  bookName?: string | null;
  planTitle: string | null;
  startedAt: string | null;
  sessionId: number | null;
  checkin: { total: number; checkedIn: number; pending: LiveStudent[] };
  submission: { taskCount: number; completed: number; partial: number; none: number; pendingReview: number };
  updatedText: string;
  isRefreshing: boolean;
  classOptions: Array<{ label: string; value: number }>;
  planOptions: Array<{ label: string; value: number }>;
  launchClassId: number | null;
  launchPlanId: number | null;
  launching: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  launch: [];
  'open-classroom': [sessionId: number];
  'close-session': [sessionId: number];
  'update:launchClassId': [value: number];
  'update:launchPlanId': [value: number];
}>();

const phaseText = computed(() => {
  if (props.phase === 'live') return '此刻正在上的课';
  if (props.phase === 'last') return '上次课堂已结束，可准备新一节';
  return '准备开课';
});

const planMeta = computed(() => {
  const parts = [props.bookName, props.unitTitle].filter((item): item is string => Boolean(item));
  if (props.planTitle) parts.push(`学案：${props.planTitle}`);
  return parts.join(' · ');
});

const percent = computed(() => {
  if (!props.checkin.total) return 0;
  return Math.round((props.checkin.checkedIn / props.checkin.total) * 100);
});

const ringStyle = computed(() => ({
  background: `conic-gradient(var(--ls-primary) ${percent.value}%, var(--ls-border) ${percent.value}% 100%)`,
}));

function formatDateTime(value: string | null) {
  if (!value) return '暂无记录';
  return value.replace('T', ' ').slice(0, 16);
}
</script>

<style scoped>
.live-card {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr) minmax(0, 0.9fr);
  gap: 16px;
  align-items: stretch;
  padding: 16px;
  background: var(--ls-panel-strong, var(--ls-card));
}

.live-card.is-live {
  border-color: var(--ls-primary);
  box-shadow: var(--ls-shadow), inset 0 0 0 1px var(--ls-primary-soft);
}

.live-col {
  display: grid;
  gap: 8px;
  min-width: 0;
  align-content: start;
}

.live-col--checkin,
.live-col--submission {
  padding-left: 16px;
  border-left: 1px solid var(--ls-border);
}

.live-phase {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ls-muted);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.live-phase__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ls-muted);
}

.live-phase__dot.is-live {
  background: var(--ls-accent, var(--ls-primary));
  box-shadow: 0 0 0 4px var(--ls-primary-soft);
}

.live-phase__dot.is-last {
  background: var(--ls-warning, #d48a1f);
}

.live-phase__text {
  color: var(--ls-text);
}

.live-class {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.live-class__grade {
  color: var(--ls-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
}

.live-lesson {
  margin: 0;
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-plan {
  margin: 0;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-time {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
}

.live-launch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto;
  gap: 6px;
  align-items: center;
}

.live-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.live-updated {
  color: var(--ls-muted);
  font-size: 11px;
}

.ring {
  width: 92px;
  height: 92px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  transition: background 0.4s ease;
}

.ring__inner {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
  background: var(--ls-card, var(--ls-surface));
  box-shadow: var(--ls-surface-glow);
}

.ring__total {
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 600;
}

.checkin-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pending-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 54px;
  overflow: hidden;
}

.pending-chip {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
  font-size: 11px;
  font-weight: 600;
}

.pending-chip--more {
  background: var(--ls-chip-bg);
  color: var(--ls-muted);
}

.pending-empty {
  color: var(--ls-accent, var(--ls-primary));
  font-size: 11.5px;
  font-weight: 600;
}

.submission-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.submission-bar {
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--ls-border);
}

.seg {
  display: block;
  transition: flex-grow 0.4s ease;
}

.seg--completed {
  background: var(--ls-primary);
}

.seg--partial {
  background: var(--ls-accent, #d48a1f);
}

.seg--none {
  background: var(--ls-border);
}

.submission-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--ls-muted);
  font-size: 11.5px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dot--completed {
  background: var(--ls-primary);
}

.dot--partial {
  background: var(--ls-accent, #d48a1f);
}

.dot--none {
  background: var(--ls-border);
}

@media (max-width: 1280px) {
  .live-card {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .live-col--submission {
    grid-column: 1 / -1;
    padding-left: 0;
    border-left: none;
    border-top: 1px solid var(--ls-border);
    padding-top: 10px;
  }
}

@media (max-width: 860px) {
  .live-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .live-col--checkin,
  .live-col--submission {
    padding-left: 0;
    border-left: none;
    border-top: 1px solid var(--ls-border);
    padding-top: 10px;
  }

  .live-launch {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
