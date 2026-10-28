<template>
  <section :class="['hero-panel', 'sa-page-header', { 'is-compact': compact }]">
    <div class="sa-page-header__main">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2 class="sa-page-header__title">
        <slot name="title">{{ title }}</slot>
      </h2>
      <p v-if="description" class="hero-copy" :title="compact ? description : undefined">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="sa-page-header__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: 'SaPageHeader' });

defineProps<{
  title?: string;
  description?: string;
  eyebrow?: string;
  /** 单行紧凑页头：eyebrow 与标题同行、说明收为一行省略号，供教师后台使用 */
  compact?: boolean;
}>();
</script>

<style scoped>
.sa-page-header {
  align-items: flex-start;
}

.sa-page-header__main {
  min-width: 0;
}

.sa-page-header__title {
  margin: 0;
  color: var(--ls-ink);
}

.sa-page-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 紧凑形态：把原来「eyebrow / 标题 / 两行说明」竖排压成「标题行 + 一行说明」 */
.sa-page-header.is-compact {
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--ls-radius-md, 14px);
}

.sa-page-header.is-compact .sa-page-header__main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  flex: 1;
}

.sa-page-header.is-compact .eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.06em;
}

.sa-page-header.is-compact .sa-page-header__title {
  font-size: 19px;
  line-height: 1.2;
}

.sa-page-header.is-compact .hero-copy {
  flex-basis: 100%;
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (max-width: 860px) {
  .sa-page-header__actions {
    justify-content: flex-start;
  }

  .sa-page-header.is-compact {
    align-items: flex-start;
  }

  .sa-page-header.is-compact .hero-copy {
    white-space: normal;
  }
}
</style>
