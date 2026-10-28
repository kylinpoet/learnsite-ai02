<template>
  <section class="sw-panel">
    <header v-if="title || $slots.head || $slots.actions" class="sw-panel__head">
      <slot name="head">
        <h2 class="sw-panel__title">
          {{ title }}
          <span v-if="count !== undefined && count !== null" class="sw-panel__count">{{ count }}</span>
        </h2>
      </slot>
      <slot name="actions" />
    </header>
    <div :class="['sw-panel__body', { 'sw-panel__body--flush': flush }]">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: 'StudentPanel' });

defineProps<{
  title?: string;
  /** 标题后的计数，例如「3 份」；只在数字本身有意义时传 */
  count?: string | number;
  /** 列表类内容去掉内边距，让 .sw-row 自己贴边 */
  flush?: boolean;
}>();
</script>
