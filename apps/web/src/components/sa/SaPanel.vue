<template>
  <section :class="['soft-card', 'sa-panel', { 'sa-panel--flat': flat, 'sa-panel--compact': compact }, panelClass]">
    <header v-if="hasHeader" class="sa-panel__head">
      <slot name="header">
        <div class="sa-panel__titles">
          <p v-if="eyebrow" class="sa-panel__eyebrow">{{ eyebrow }}</p>
          <h3 v-if="title" class="sa-panel__title">
            <slot name="title">{{ title }}</slot>
          </h3>
          <p v-if="description" class="sa-panel__desc">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="sa-panel__actions">
        <slot name="actions" />
      </div>
    </header>
    <div :class="['sa-panel__body', bodyClass]">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="sa-panel__foot">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';

defineOptions({ name: 'SaPanel' });

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    eyebrow?: string;
    bodyClass?: string;
    panelClass?: string;
    flat?: boolean;
    padded?: boolean;
    /** 紧凑密度：标题 14px、头部 10/12、主体 14，供教师后台使用 */
    compact?: boolean;
  }>(),
  { padded: true },
);

const slots = useSlots();

const hasHeader = computed(
  () => Boolean(props.title || props.description || props.eyebrow) || Boolean(slots.header) || Boolean(slots.actions),
);
</script>

<style scoped>
.sa-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sa-panel--flat {
  box-shadow: none;
}

.sa-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--ls-shell-divider, rgba(32, 60, 112, 0.1));
}

.sa-panel__eyebrow {
  margin: 0 0 4px;
  color: var(--ls-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.sa-panel__title {
  margin: 0;
  color: var(--ls-ink);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.sa-panel__desc {
  margin: 6px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.6;
}

.sa-panel__titles {
  min-width: 0;
}

.sa-panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.sa-panel__body {
  padding: 20px;
  min-width: 0;
}

.sa-panel__foot {
  padding: 14px 20px;
  border-top: 1px solid var(--ls-shell-divider, rgba(32, 60, 112, 0.1));
}

/* 紧凑形态 */
.sa-panel--compact .sa-panel__head {
  padding: 11px 14px 9px;
  gap: 10px;
  align-items: center;
}

.sa-panel--compact .sa-panel__title {
  font-size: 14px;
}

.sa-panel--compact .sa-panel__eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
}

.sa-panel--compact .sa-panel__desc {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
}

.sa-panel--compact .sa-panel__body {
  padding: 14px;
}

.sa-panel--compact .sa-panel__foot {
  padding: 10px 14px;
}

@media (max-width: 760px) {
  .sa-panel__head {
    flex-direction: column;
  }

  .sa-panel__body {
    padding: 16px;
  }
}
</style>
