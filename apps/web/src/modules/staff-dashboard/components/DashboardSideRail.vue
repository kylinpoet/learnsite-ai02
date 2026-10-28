<template>
  <div class="ls-stack ls-stack--md">
    <article class="ls-card">
      <div class="ls-card__head">
        <div>
          <p class="ls-card__title">今天要处理的</p>
          <p class="ls-card__sub">按“会影响课堂”的优先级排序</p>
        </div>
      </div>
      <button
        v-for="item in todoItems"
        :key="item.label"
        class="todo-row"
        type="button"
        @click="emit('navigate', item.to)"
      >
        <span class="todo-row__value ls-num" :class="{ 'is-zero': item.value === 0 }">{{ item.value }}</span>
        <span class="todo-row__copy">
          <span class="todo-row__label">{{ item.label }}</span>
          <span class="todo-row__note">{{ item.note }}</span>
        </span>
        <span class="todo-row__arrow">›</span>
      </button>
    </article>

    <article class="ls-card">
      <div class="ls-card__head">
        <p class="ls-card__title">快捷入口</p>
      </div>
      <div class="quick-grid">
        <button
          v-for="entry in quickEntries"
          :key="entry.to"
          class="quick-item"
          type="button"
          @click="emit('navigate', entry.to)"
        >
          <AppIcon :icon="entry.icon" :size="16" />
          <span>{{ entry.label }}</span>
        </button>
      </div>
    </article>

    <article class="ls-card">
      <div class="ls-card__head">
        <div>
          <p class="ls-card__title">最近课堂</p>
          <p class="ls-card__sub">本班最近一次上过的课会出现在这里</p>
        </div>
        <n-button size="tiny" text type="primary" @click="emit('navigate', '/staff/classroom')">全部</n-button>
      </div>
      <p v-if="!sessions.length" class="ls-empty">还没有课堂记录</p>
      <ul v-else class="recent-list">
        <li v-for="item in sessions" :key="item.session_id" class="recent-row" @click="emit('navigate', `/staff/classroom/${item.session_id}`)">
          <span :class="['recent-row__dot', item.status === 'active' ? 'is-active' : '']" />
          <span class="recent-row__copy">
            <span class="recent-row__title">{{ item.plan.title }}</span>
            <span class="recent-row__meta">{{ item.class.name }} · {{ formatDateTime(item.started_at) }}</span>
          </span>
          <span class="recent-row__stat">
            提交 {{ item.submission_count }}<span v-if="item.pending_review_count"> · 待评 {{ item.pending_review_count }}</span>
          </span>
        </li>
      </ul>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ClipboardCheck, MonitorPlay, NotebookPen, Sparkles, Users2 } from 'lucide-vue-next';
import { NButton } from 'naive-ui';
import { computed } from 'vue';

import AppIcon from '@/components/AppIcon.vue';

type RecentSession = {
  session_id: number;
  status: string;
  started_at: string;
  class: { name: string };
  plan: { title: string; lesson_title: string };
  submission_count: number;
  pending_review_count: number;
};

const props = defineProps<{
  overview: {
    checkedInToday: number;
    pendingSignin: number;
    pendingReview: number;
    recommended: number;
  };
  sessions: RecentSession[];
}>();

const emit = defineEmits<{ navigate: [path: string] }>();

const todoItems = computed(() => [
  {
    label: '待评阅作品',
    value: props.overview.pendingReview,
    note: props.overview.pendingReview ? '学生已提交，等你打分' : '当前没有待批改作品',
    to: '/staff/submissions',
  },
  {
    label: '今天未签到',
    value: props.overview.pendingSignin,
    note: props.overview.pendingSignin ? '可能有学生没进机房' : '全部到齐',
    to: '/staff/attendance',
  },
  {
    label: '推荐作品',
    value: props.overview.recommended,
    note: '可用于课堂展示与点评',
    to: '/staff/submissions',
  },
]);

const quickEntries = [
  { label: '学案管理', to: '/staff/lesson-plans', icon: NotebookPen },
  { label: '提交批改', to: '/staff/submissions', icon: ClipboardCheck },
  { label: '学生名单', to: '/staff/students', icon: Users2 },
  { label: '课堂控制', to: '/staff/classroom', icon: MonitorPlay },
  { label: '学情报告', to: '/staff/learning-reports', icon: Sparkles },
];

function formatDateTime(value: string) {
  if (!value) return '暂无记录';
  return value.replace('T', ' ').slice(5, 16);
}
</script>

<style scoped>
.todo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-sm, 10px);
  background: var(--ls-chip-bg);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.todo-row:hover {
  border-color: var(--ls-primary);
  background: var(--ls-primary-soft);
}

.todo-row__value {
  min-width: 34px;
  font-size: 22px;
  text-align: right;
}

.todo-row__value.is-zero {
  color: var(--ls-muted);
}

.todo-row__copy {
  display: grid;
  flex: 1;
  min-width: 0;
}

.todo-row__label {
  color: var(--ls-text);
  font-size: 12.5px;
  font-weight: 600;
}

.todo-row__note {
  color: var(--ls-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-row__arrow {
  color: var(--ls-muted);
  font-size: 16px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.quick-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-sm, 10px);
  background: transparent;
  color: var(--ls-text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}

.quick-item:hover {
  border-color: var(--ls-primary);
  color: var(--ls-primary);
}

.recent-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: var(--ls-radius-sm, 10px);
  cursor: pointer;
}

.recent-row:hover {
  background: var(--ls-primary-soft);
}

.recent-row__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ls-border);
  flex: 0 0 auto;
}

.recent-row__dot.is-active {
  background: var(--ls-accent, var(--ls-primary));
}

.recent-row__copy {
  display: grid;
  flex: 1;
  min-width: 0;
}

.recent-row__title {
  color: var(--ls-text);
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-row__meta,
.recent-row__stat {
  color: var(--ls-muted);
  font-size: 11px;
  flex: 0 0 auto;
}
</style>
