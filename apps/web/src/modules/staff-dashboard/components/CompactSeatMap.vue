<template>
  <article class="ls-card seat-card">
    <header class="seat-head">
      <div class="seat-head__copy">
        <p class="ls-card__title">
          {{ classLabel || '当前班级' }}
          <span v-if="roomLabel" class="seat-head__room"> · {{ roomLabel }}</span>
        </p>
        <p class="ls-card__sub">{{ summary }}</p>
      </div>
      <n-button v-if="cells.length" size="tiny" quaternary @click="expanded = !expanded">
        {{ expanded ? '收起座位图' : '展开座位图' }}
      </n-button>
    </header>

    <p v-if="!cells.length" class="ls-empty">当前班级还没有绑定机房座位表，请先在系统设置里维护座位。</p>

    <template v-else>
      <div v-show="expanded" class="seat-body">
        <div class="seat-legend">
          <span class="legend-item"><i class="ls-dot dot--completed" />完成 {{ counts.completed }}</span>
          <span class="legend-item"><i class="ls-dot dot--partial" />部分 {{ counts.partial }}</span>
          <span class="legend-item"><i class="ls-dot dot--none" />未交 {{ counts.none }}</span>
          <span class="legend-item"><i class="ls-dot dot--signed" />已签到 {{ counts.signedIn }}</span>
        </div>

        <div class="seat-grid" :style="gridStyle">
          <div
            v-for="cell in cells"
            :key="cell.key"
            :class="[
              'seat-cell',
              {
                'is-empty': !cell.displayName,
                'is-virtual': cell.virtual,
                'is-signed': cell.signedIn,
              },
            ]"
            :title="cellTitle(cell)"
          >
            <span class="seat-cell__label">{{ cell.label }}</span>
            <span class="seat-cell__name">{{ cell.displayName || (cell.virtual ? '未配置' : '空') }}</span>
            <span :class="['seat-cell__dot', `dot--${cell.stage}`]" />
          </div>
        </div>
      </div>

      <p v-if="updatedText" class="seat-foot">{{ updatedText }}</p>
    </template>
  </article>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui';
import { computed, ref, watch } from 'vue';

import type { SeatCell } from './dashboardTypes';

const props = defineProps<{
  cols: number;
  cells: SeatCell[];
  classLabel: string;
  roomLabel: string | null;
  updatedText: string;
}>();

/** 默认收起：座位图只在需要点名时才展开，首屏先给摘要 */
const expanded = ref(false);

watch(
  () => props.classLabel,
  () => {
    expanded.value = false;
  },
);

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(props.cols, 1)}, minmax(0, 1fr))`,
}));

const counts = computed(() => {
  const result = { completed: 0, partial: 0, none: 0, signedIn: 0 };
  for (const cell of props.cells) {
    if (!cell.displayName) continue;
    result[cell.stage] += 1;
    if (cell.signedIn) result.signedIn += 1;
  }
  return result;
});

const occupied = computed(() => props.cells.filter((cell) => Boolean(cell.displayName)).length);

const summary = computed(() => {
  if (!props.cells.length) return '还没有座位表';
  const rows = Math.max(...props.cells.map((cell) => cell.row));
  const parts = [
    `${rows} 行 × ${Math.max(props.cols, 1)} 列`,
    `${occupied.value} 人在座`,
    `已签到 ${counts.value.signedIn}`,
    `未交 ${counts.value.none}`,
  ];
  return parts.join(' · ');
});

function cellTitle(cell: SeatCell) {
  if (!cell.displayName) return `座位 ${cell.label} · ${cell.virtual ? '未配置' : '当前无人登录'}`;
  const signed = cell.signedIn ? '已签到' : '未签到';
  const stageText = cell.stage === 'completed' ? '已完成' : cell.stage === 'partial' ? '部分提交' : '未提交';
  return `座位 ${cell.label} · ${cell.displayName}（${cell.studentNo}）· ${signed} · ${stageText}`;
}
</script>

<style scoped>
.seat-card {
  gap: 10px;
  border-radius: var(--ls-radius-md);
  box-shadow: none;
}

.seat-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.seat-head__copy {
  min-width: 0;
}

.seat-head__room {
  color: var(--ls-muted);
  font-weight: 600;
}

.seat-body {
  display: grid;
  gap: 8px;
}

.seat-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: var(--ls-muted);
  font-size: 12px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend-item .ls-dot {
  width: 6px;
  height: 6px;
}

.seat-grid {
  display: grid;
  gap: 6px;
  max-height: 380px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  padding-right: 2px;
}

.seat-cell {
  position: relative;
  display: grid;
  gap: 1px;
  min-height: 50px;
  padding: 6px 8px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-sm, 10px);
  background: var(--ls-panel-soft, var(--ls-surface));
  transition: border-color 0.16s ease;
}

.seat-cell:hover {
  border-color: var(--ls-primary);
}

.seat-cell.is-signed {
  border-color: var(--ls-primary);
  box-shadow: inset 0 0 0 1px var(--ls-primary-soft);
}

.seat-cell.is-empty {
  background: transparent;
  border-style: dashed;
}

.seat-cell.is-virtual {
  opacity: 0.5;
}

.seat-cell__label {
  color: var(--ls-muted);
  font-size: 10.5px;
  font-weight: 600;
}

.seat-cell__name {
  color: var(--ls-ink);
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seat-cell.is-empty .seat-cell__name {
  color: var(--ls-muted);
  font-weight: 400;
}

.seat-cell__dot {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
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

.dot--signed {
  background: var(--ls-primary);
  box-shadow: 0 0 0 3px var(--ls-primary-soft);
}

.seat-foot {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
}

@media (max-width: 760px) {
  .seat-head {
    flex-direction: column;
  }
}
</style>
