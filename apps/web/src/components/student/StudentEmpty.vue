<template>
  <div :class="['sw-empty', { 'sw-empty--box': box }]">
    <slot>{{ text }}</slot>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'StudentEmpty' });

withDefaults(
  defineProps<{
    text?: string;
    /** 列表中间的空态用虚线框，页面级空态不加框 */
    box?: boolean;
  }>(),
  { text: '', box: false },
);
</script>
