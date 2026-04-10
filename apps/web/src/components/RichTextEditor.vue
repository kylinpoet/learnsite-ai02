<template>
  <Suspense>
    <template #default>
      <AsyncRichTextEditor
        :model-value="modelValue"
        :min-height="minHeight"
        :placeholder="placeholder"
        :readonly="readonly"
        @update:model-value="handleUpdate"
      />
    </template>
    <template #fallback>
      <div class="rich-text-editor-fallback" :style="{ '--editor-min-height': `${minHeight}px` }">
        <div class="rich-text-editor-fallback__toolbar"></div>
        <div class="rich-text-editor-fallback__panel">
          <span>编辑器加载中...</span>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';

withDefaults(
  defineProps<{
    modelValue?: string;
    minHeight?: number;
    placeholder?: string;
    readonly?: boolean;
  }>(),
  {
    modelValue: '',
    minHeight: 280,
    placeholder: '',
    readonly: false,
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const AsyncRichTextEditor = defineAsyncComponent({
  loader: () => import('./RichTextEditorCk.vue'),
  delay: 120,
  timeout: 30000,
  suspensible: true,
});

function handleUpdate(value: string) {
  emit('update:modelValue', value);
}
</script>

<style scoped>
.rich-text-editor-fallback {
  display: grid;
  gap: 0;
}

.rich-text-editor-fallback__toolbar {
  height: 42px;
  border: 1px solid var(--ls-border);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  background: var(--ls-card);
}

.rich-text-editor-fallback__panel {
  min-height: calc(var(--editor-min-height) + 2px);
  border: 1px solid var(--ls-border);
  border-radius: 0 0 16px 16px;
  background: var(--ls-panel-soft);
  color: var(--ls-muted);
  line-height: 1.7;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
</style>
