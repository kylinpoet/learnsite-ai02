<script setup lang="ts">
/**
 * 声明式列定义占位组件。
 * 只作为 SaDataTable 默认插槽内的标记节点存在，由 SaDataTable 读取其属性与插槽生成 naive 列配置，
 * 自身不会被挂载。
 */
defineOptions({ name: 'SaTableColumn', inheritAttrs: false });
</script>

<template>
  <span hidden />
</template>
