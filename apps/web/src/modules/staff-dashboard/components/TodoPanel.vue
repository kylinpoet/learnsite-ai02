<template>
  <article class="ls-card todo-card">
    <p class="ls-card__title">今天要处理的</p>
    <div :class="['todo-list', columns === 3 ? 'todo-list--strip' : '']">
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
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    overview: {
      checkedInToday: number;
      pendingSignin: number;
      pendingReview: number;
      recommended: number;
    };
    /** 1 = 竖排三行（右栏）；3 = 横排三格（整行） */
    columns?: 1 | 3;
  }>(),
  { columns: 1 },
);

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
</script>

<style scoped>
.todo-card {
  box-shadow: none;
}

.todo-list {
  display: grid;
  gap: 2px;
}

.todo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% + 16px);
  margin: 0 -8px;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--ls-radius-sm, 10px);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

.todo-row:hover {
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
  font-size: 13px;
  font-weight: 600;
}

.todo-row__note {
  color: var(--ls-muted);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-row__arrow {
  color: var(--ls-muted);
  font-size: 15px;
}

/* 横排：三格用 1px 分隔线串起来，整行只占一条 */
.todo-list--strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
}

.todo-list--strip .todo-row {
  position: relative;
  width: 100%;
  margin: 0;
  padding: 0 16px;
  align-items: baseline;
}

.todo-list--strip .todo-row:first-child {
  padding-left: 0;
}

.todo-list--strip .todo-row + .todo-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 1px;
  background: var(--ls-border);
}

.todo-list--strip .todo-row__value {
  min-width: 0;
  font-size: 26px;
}

.todo-list--strip .todo-row__arrow {
  margin-left: auto;
}

@media (max-width: 860px) {
  .todo-list--strip {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .todo-list--strip .todo-row {
    padding: 6px 8px;
  }

  .todo-list--strip .todo-row + .todo-row::before {
    display: none;
  }
}
</style>
