<template>
  <header class="sf-page-head">
    <div class="sf-page-head__main">
      <slot name="back" />
      <h1>
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="sub || $slots.sub" class="sf-page-head__sub">
        <slot name="sub">{{ sub }}</slot>
      </p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="sf-page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineOptions({ name: 'StaffPageHead' });

defineProps<{
  /** 页面唯一的 h1：一个名词，不是问候语 */
  title?: string;
  /** 标题下一行：一条今天的事实或结论，不写页面的功能介绍 */
  sub?: string;
}>();
</script>
