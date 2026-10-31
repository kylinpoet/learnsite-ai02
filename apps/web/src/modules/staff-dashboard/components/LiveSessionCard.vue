<template>
  <article :class="['ls-card', 'lesson-hero', `is-${phase}`]">
    <header class="lesson-hero__head">
      <div class="lesson-hero__identity">
        <p class="lesson-hero__phase">
          <span :class="['phase-dot', `is-${phase}`]" />
          {{ phaseText }}
        </p>
        <h3 class="lesson-hero__class">
          {{ className || '未选择班级' }}
          <span v-if="roomLabel" class="lesson-hero__room">{{ roomLabel }}</span>
        </h3>
        <p class="lesson-hero__lesson">{{ lessonTitle || '请选择要上的课' }}</p>
        <p v-if="planMeta" class="lesson-hero__meta">{{ planMeta }}</p>
      </div>

      <div class="lesson-hero__actions">
        <n-button v-if="sessionId" size="small" type="primary" @click="emit('open-classroom', sessionId)">
          {{ phase === 'live' ? '进入实时课堂' : '查看上次课堂' }}
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
        <n-button :loading="isRefreshing" size="small" quaternary @click="emit('refresh')">刷新</n-button>
        <span class="lesson-hero__updated">{{ updatedText }}</span>
      </div>
    </header>

    <div class="lesson-hero__figures">
      <div class="figure">
        <p class="figure__value ls-num">
          {{ checkin.checkedIn }}<span class="figure__total">/ {{ checkin.total }}</span>
        </p>
        <p class="figure__label">已签到</p>
        <p class="figure__note" :title="checkinNote">{{ checkinNote }}</p>
      </div>

      <div class="figure">
        <p class="figure__value ls-num">
          {{ submission.completed }}<span class="figure__total">/ {{ submissionTotal }}</span>
        </p>
        <p class="figure__label">已完成提交</p>
        <p class="figure__note" :title="submissionNote">{{ submissionNote }}</p>
      </div>

      <div class="figure">
        <p class="figure__value ls-num">{{ submission.pendingReview }}</p>
        <p class="figure__label">待评阅</p>
        <p class="figure__note" :title="reviewNote">{{ reviewNote }}</p>
      </div>
    </div>

    <footer class="lesson-hero__foot">
      <span class="class-code">
        <span class="class-code__label">班级码</span>
        <b class="class-code__value">{{ classCode || '未生成' }}</b>
        <button class="link-action" type="button" @click="emit('copy-code')">复制</button>
        <button class="link-action" type="button" @click="emit('regenerate-code')">换一个</button>
      </span>
      <span v-if="startedAt" class="lesson-hero__since">开课于 {{ formatDateTime(startedAt) }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui';
import { computed } from 'vue';

import type { LiveStudent } from './dashboardTypes';
import { formatDateTime } from '@/utils/datetime';

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
  classCode?: string | null;
  checkin: { total: number; checkedIn: number; pending: LiveStudent[] };
  submission: { taskCount: number; completed: number; partial: number; none: number; pendingReview: number };
  updatedText: string;
  isRefreshing: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  'open-classroom': [sessionId: number];
  'close-session': [sessionId: number];
  'copy-code': [];
  'regenerate-code': [];
}>();

const phaseText = computed(() => {
  if (props.phase === 'live') return '此刻正在上的课';
  if (props.phase === 'last') return '上次课堂已结束';
  return '准备开课';
});

const planMeta = computed(() => {
  const parts = [props.bookName, props.unitTitle].filter((item): item is string => Boolean(item));
  if (props.planTitle) parts.push(`学案：${props.planTitle}`);
  return parts.join(' · ');
});

const submissionTotal = computed(
  () => props.submission.completed + props.submission.partial + props.submission.none,
);

const checkinNote = computed(() => {
  const pending = props.checkin.pending;
  if (!props.checkin.total) return '还没有签到数据';
  if (!pending.length) return '全部到齐';
  const names = pending.slice(0, 4).map((item) => item.display_name).join(' ');
  return `未到 ${pending.length} 人：${names}${pending.length > 4 ? ' …' : ''}`;
});

const submissionNote = computed(() => {
  const { partial, none, taskCount } = props.submission;
  return `部分 ${partial} · 未交 ${none} · 本节 ${taskCount} 个活动`;
});

const reviewNote = computed(() =>
  props.submission.pendingReview ? '学生已提交，等你打分' : '当前没有待批改作品',
);


</script>

<style scoped>
.lesson-hero {
  gap: 14px;
  padding: 16px;
  border-radius: var(--ls-radius-md);
  background: var(--ls-panel-strong, var(--ls-card));
  box-shadow: none;
}

.lesson-hero.is-live {
  border-color: var(--ls-primary);
}

.lesson-hero__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

.lesson-hero__identity {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.lesson-hero__phase {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 600;
}

.phase-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ls-muted);
  flex: 0 0 auto;
}

.phase-dot.is-live {
  background: var(--ls-primary);
}

.phase-dot.is-last {
  background: var(--ls-warning-text, #8a5a00);
}

.lesson-hero__class {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.lesson-hero__room {
  color: var(--ls-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
}

.lesson-hero__lesson {
  margin: 0;
  color: var(--ls-ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.lesson-hero__meta {
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.lesson-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.lesson-hero__updated {
  color: var(--ls-muted);
  font-size: 11.5px;
}

/* 三个数字用一条底分隔线串起来，不再各自成卡 */
.lesson-hero__figures {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--ls-border);
  padding-top: 12px;
}

.figure {
  position: relative;
  display: grid;
  gap: 1px;
  min-width: 0;
  padding: 0 16px;
}

.figure:first-child {
  padding-left: 0;
}

.figure + .figure::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 1px;
  background: var(--ls-border);
}

.figure__value {
  margin: 0;
  font-size: 32px;
  line-height: 1.05;
}

.figure__total {
  margin-left: 3px;
  color: var(--ls-muted);
  font-size: 14px;
  font-weight: 600;
}

.figure__label {
  margin: 2px 0 0;
  color: var(--ls-text);
  font-size: 12.5px;
  font-weight: 600;
}

.figure__note {
  margin: 1px 0 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lesson-hero__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  border-top: 1px solid var(--ls-border);
  padding-top: 10px;
}

.class-code {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.class-code__label {
  color: var(--ls-muted);
  font-size: 12px;
  font-weight: 600;
}

.class-code__value {
  color: var(--ls-primary);
  font-family: var(--ls-display-font);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.18em;
  line-height: 1.1;
}

.link-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ls-primary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.link-action:hover {
  text-decoration: underline;
}

.lesson-hero__since {
  color: var(--ls-muted);
  font-size: 11.5px;
}

@media (max-width: 760px) {
  .lesson-hero__figures {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .figure {
    padding: 0;
  }

  .figure + .figure::before {
    display: none;
  }

  .figure + .figure {
    border-top: 1px solid var(--ls-border);
    padding-top: 8px;
  }
}
</style>
