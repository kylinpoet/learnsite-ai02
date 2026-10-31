<template>
  <article class="ls-card recent-card">
    <p class="ls-card__title">最近课堂</p>
    <p v-if="!sessions.length" class="ls-empty">还没有课堂记录</p>
    <ul v-else class="recent-list">
      <li
        v-for="item in sessions"
        :key="item.session_id"
        class="recent-row"
        @click="emit('navigate', `/staff/classroom/${item.session_id}`)"
      >
        <span :class="['recent-row__dot', item.status === 'active' ? 'is-active' : '']" />
        <span class="recent-row__title">{{ item.plan.title }}</span>
        <span class="recent-row__meta">{{ item.class.name }} · {{ formatDateTime(item.started_at) }}</span>
        <span class="recent-row__stat">
          提交 {{ item.submission_count
          }}<span v-if="item.pending_review_count"> · 待评 {{ item.pending_review_count }}</span>
        </span>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { formatDateTime as formatDateTimeValue } from '@/utils/datetime';
import type { RecentSession } from './dashboardTypes';

defineProps<{ sessions: RecentSession[] }>();

const emit = defineEmits<{ navigate: [path: string] }>();

function formatDateTime(value: string) {
  return formatDateTimeValue(value, { fallback: '暂无记录', sliceStart: 5, sliceEnd: 16 });
}
</script>

<style scoped>
.recent-card {
  box-shadow: none;
}

.recent-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 整行一行读完：标题 / 班级·时间 / 提交数，右端对齐 */
.recent-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 8px;
  margin: 0 -8px;
  border-radius: var(--ls-radius-sm, 10px);
  cursor: pointer;
  transition: background 0.16s ease;
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
  align-self: center;
}

.recent-row__dot.is-active {
  background: var(--ls-accent, var(--ls-primary));
}

.recent-row__title {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-row__meta,
.recent-row__stat {
  flex: 0 0 auto;
  color: var(--ls-muted);
  font-size: 11.5px;
}

@media (max-width: 860px) {
  .recent-row {
    flex-wrap: wrap;
    gap: 2px 10px;
  }

  .recent-row__title {
    flex-basis: calc(100% - 18px);
  }

  .recent-row__meta {
    margin-left: 18px;
  }
}
</style>
