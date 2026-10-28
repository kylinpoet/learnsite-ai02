<template>
  <header class="sw-page-head">
    <div class="sw-page-head__main">
      <slot name="back" />
      <h1>
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="sub || $slots.sub" class="sw-page-head__sub">
        <slot name="sub">{{ sub }}</slot>
      </p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="sw-page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineOptions({ name: 'StudentPageHead' });

defineProps<{
  /** 页面唯一的 h1：一个名词，不是问候语 */
  title?: string;
  /** 标题下一行：一条今天的数据或结论，不写页面的功能介绍 */
  sub?: string;
}>();
</script>
