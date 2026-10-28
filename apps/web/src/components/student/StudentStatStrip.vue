<template>
  <section class="sw-strip">
    <article v-for="item in items" :key="item.label" class="sw-strip__cell">
      <p class="sw-strip__label">{{ item.label }}</p>
      <p :class="['sw-strip__value', { 'is-missing': item.value === '--' }]">
        {{ item.value }}<small v-if="item.unit">{{ item.unit }}</small>
      </p>
      <p v-if="item.note" class="sw-strip__note">{{ item.note }}</p>
    </article>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: 'StudentStatStrip' });

export type StudentStatItem = {
  label: string;
  value: string | number;
  /** 单位或分母，用小字跟在数值后 */
  unit?: string;
  /** 一行补充事实，没有就留空 */
  note?: string;
};

defineProps<{
  items: StudentStatItem[];
}>();
</script>
