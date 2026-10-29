<template>
  <article class="portrait-sheet" :class="{ 'portrait-sheet--compact': compact }">
    <aside class="portrait-sheet__spine">
      <p class="portrait-sheet__eyebrow">学生画像</p>
      <h2 class="portrait-sheet__name">{{ portrait.student.name }}</h2>
      <dl class="portrait-sheet__meta">
        <div>
          <dt>班级</dt>
          <dd>{{ portrait.student.class_name || '未分班' }}</dd>
        </div>
        <div>
          <dt>学号</dt>
          <dd>{{ portrait.student.student_no || '—' }}</dd>
        </div>
      </dl>

      <div class="portrait-sheet__overall">
        <span class="portrait-sheet__overall-num">{{ portrait.overall_score ?? '—' }}</span>
        <span class="portrait-sheet__overall-label">综合分</span>
      </div>

      <ul class="portrait-sheet__counts">
        <li><span>优秀</span><strong>{{ portrait.rating_counts.excellent }}</strong></li>
        <li><span>达标</span><strong>{{ portrait.rating_counts.pass }}</strong></li>
        <li><span>待提升</span><strong>{{ portrait.rating_counts.need_improve }}</strong></li>
      </ul>

      <p class="portrait-sheet__stamp">
        {{ portrait.template.name }}
        <span>{{ formattedGeneratedAt }}</span>
      </p>
    </aside>

    <div class="portrait-sheet__pages">
      <section
        v-for="dimension in visibleDimensions"
        :key="dimension.key"
        class="portrait-page"
        :data-rating="dimension.rating || 'empty'"
      >
        <header class="portrait-page__head">
          <h3>{{ dimension.label }}</h3>
          <span class="portrait-page__rating">{{ dimension.rating_label || '暂无数据' }}</span>
        </header>

        <div class="portrait-page__scale" role="img" :aria-label="`${dimension.label}得分 ${dimension.score ?? '暂无'} 分`">
          <span
            class="portrait-page__fill"
            :style="{ width: dimension.score === null ? '0%' : `${Math.max(2, dimension.score)}%` }"
          />
          <i class="portrait-page__marker portrait-page__marker--pass" :style="{ left: `${dimension.pass}%` }" />
          <i
            class="portrait-page__marker portrait-page__marker--excellent"
            :style="{ left: `${dimension.excellent}%` }"
          />
        </div>

        <p class="portrait-page__score">
          <strong>{{ dimension.score ?? '—' }}</strong>
          <span>/ 100</span>
          <em>{{ dimension.description }}</em>
        </p>

        <dl class="portrait-page__metrics">
          <div v-for="metric in dimension.metrics" :key="metric.label">
            <dt>{{ metric.label }}</dt>
            <dd>{{ metric.value }}</dd>
          </div>
        </dl>
      </section>

      <p v-if="!visibleDimensions.length" class="portrait-sheet__empty">
        当前模板还没有启用任何维度，请在画像模板里勾选要展示的栏目。
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type PortraitMetric = { label: string; value: string };

export type PortraitDimension = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  score: number | null;
  rating: 'excellent' | 'pass' | 'need_improve' | null;
  rating_label: string | null;
  excellent: number;
  pass: number;
  metrics: PortraitMetric[];
};

export type PortraitPayload = {
  student: {
    user_id: number;
    name: string;
    student_no: string | null;
    class_id: number | null;
    class_name: string | null;
    grade_no: number | null;
    gender: string;
  };
  template: { id: number; name: string };
  generated_at: string;
  overall_score: number | null;
  rating_counts: { excellent: number; pass: number; need_improve: number };
  dimensions: PortraitDimension[];
};

const props = defineProps<{
  portrait: PortraitPayload;
  /** 抽屉里用紧凑密度 */
  compact?: boolean;
}>();

const visibleDimensions = computed(() => props.portrait.dimensions.filter((item) => item.enabled));

const formattedGeneratedAt = computed(() => {
  const raw = props.portrait.generated_at;
  if (!raw) {
    return '';
  }
  return raw.replace('T', ' ').slice(0, 16);
});
</script>

<style scoped>
.portrait-sheet {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 480px;
  border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-lg, 18px);
  background: var(--ls-card);
  box-shadow: var(--ls-soft-shadow);
  overflow: hidden;
}

/* 档案脊：左侧固定，像一册成长档案的书脊 */
.portrait-sheet__spine {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 20px;
  background: linear-gradient(180deg, var(--ls-primary-soft) 0%, transparent 62%);
  border-right: 1px solid var(--ls-border);
}

.portrait-sheet__eyebrow {
  margin: 0;
  color: var(--ls-muted);
  font-size: 12px;
  letter-spacing: 0.18em;
}

.portrait-sheet__name {
  margin: 0;
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}

.portrait-sheet__meta {
  display: grid;
  gap: 8px;
  margin: 0;
}

.portrait-sheet__meta div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--ls-border);
}

.portrait-sheet__meta dt {
  color: var(--ls-muted);
  font-size: 12px;
}

.portrait-sheet__meta dd {
  margin: 0;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 500;
}

.portrait-sheet__overall {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 12px 0;
  border-top: 1px solid var(--ls-border);
}

.portrait-sheet__overall-num {
  color: var(--ls-primary);
  font-family: var(--ls-display-font);
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
}

.portrait-sheet__overall-label {
  color: var(--ls-muted);
  font-size: 12px;
}

.portrait-sheet__counts {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.portrait-sheet__counts li {
  display: flex;
  justify-content: space-between;
  color: var(--ls-muted);
  font-size: 12px;
}

.portrait-sheet__counts strong {
  color: var(--ls-text);
  font-size: 13px;
}

.portrait-sheet__stamp {
  margin: auto 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--ls-border);
  color: var(--ls-muted);
  font-size: 11px;
  line-height: 1.6;
}

.portrait-sheet__stamp span {
  display: block;
  opacity: 0.75;
}

/* 右侧「页」：纵向排布，靠细分隔线区隔，不用卡片网格 */
.portrait-sheet__pages {
  padding: 8px 26px 22px;
}

.portrait-page {
  padding: 20px 0;
  border-bottom: 1px solid var(--ls-border);
}

.portrait-page:last-child {
  border-bottom: none;
}

.portrait-page__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.portrait-page__head h3 {
  margin: 0;
  color: var(--ls-ink);
  font-size: 15px;
  font-weight: 600;
}

.portrait-page__rating {
  flex: none;
  padding: 1px 9px;
  border-radius: 4px;
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
  font-size: 12px;
}

.portrait-page[data-rating='need_improve'] .portrait-page__rating {
  background: rgba(196, 90, 60, 0.12);
  color: #a8452c;
}

.portrait-page[data-rating='empty'] .portrait-page__rating {
  background: rgba(0, 0, 0, 0.05);
  color: var(--ls-muted);
}

.portrait-page__scale {
  position: relative;
  height: 6px;
  margin: 12px 0 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.07);
}

.portrait-page__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ls-button-gradient, linear-gradient(135deg, #3f9678, #1e7a57));
  transition: width 0.5s ease;
}

.portrait-page[data-rating='need_improve'] .portrait-page__fill {
  background: linear-gradient(135deg, #d08a6a, #b65b3c);
}

.portrait-page__marker {
  position: absolute;
  top: -3px;
  width: 1px;
  height: 12px;
  background: var(--ls-border);
}

.portrait-page__marker--excellent {
  background: var(--ls-accent);
}

.portrait-page__score {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 10px;
}

.portrait-page__score strong {
  color: var(--ls-ink);
  font-family: var(--ls-display-font);
  font-size: 20px;
  font-weight: 600;
}

.portrait-page__score span {
  color: var(--ls-muted);
  font-size: 12px;
}

.portrait-page__score em {
  margin-left: auto;
  color: var(--ls-muted);
  font-size: 12px;
  font-style: normal;
}

.portrait-page__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 22px;
  margin: 0;
}

.portrait-page__metrics div {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.portrait-page__metrics dt {
  color: var(--ls-muted);
  font-size: 12px;
}

.portrait-page__metrics dd {
  margin: 0;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 500;
}

.portrait-sheet__empty {
  padding: 40px 0;
  color: var(--ls-muted);
  text-align: center;
}

.portrait-sheet--compact {
  grid-template-columns: 180px minmax(0, 1fr);
  min-height: 0;
}

.portrait-sheet--compact .portrait-sheet__spine {
  padding: 16px 14px;
}

.portrait-sheet--compact .portrait-sheet__name {
  font-size: 20px;
}

.portrait-sheet--compact .portrait-sheet__overall-num {
  font-size: 30px;
}

.portrait-sheet--compact .portrait-sheet__pages {
  padding: 4px 16px 14px;
}

@media (prefers-reduced-motion: reduce) {
  .portrait-page__fill {
    transition: none;
  }
}

@media (max-width: 720px) {
  .portrait-sheet,
  .portrait-sheet--compact {
    grid-template-columns: 1fr;
  }

  .portrait-sheet__spine {
    border-right: none;
    border-bottom: 1px solid var(--ls-border);
  }
}
</style>
