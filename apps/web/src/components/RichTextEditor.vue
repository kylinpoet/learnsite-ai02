<template>
  <div class="rich-text-editor" :style="{ '--editor-min-height': `${minHeight}px` }">
    <QuillEditor
      :content="modelValue"
      :options="editorOptions"
      content-type="html"
      theme="snow"
      @update:content="handleUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { QuillEditor } from '@vueup/vue-quill';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    minHeight?: number;
    placeholder?: string;
  }>(),
  {
    modelValue: '',
    minHeight: 280,
    placeholder: '',
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const editorOptions = {
  placeholder: props.placeholder,
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['blockquote', 'code-block', 'link', 'image'],
      ['clean'],
    ],
  },
};

function handleUpdate(value: unknown) {
  emit('update:modelValue', typeof value === 'string' ? value : '');
}
</script>

<style scoped>
.rich-text-editor {
  display: block;
  overflow: hidden;
}

.rich-text-editor :deep(.quill) {
  display: flex;
  flex-direction: column;
}

.rich-text-editor :deep(.ql-toolbar.ql-snow) {
  border-radius: 16px 16px 0 0;
  border-color: var(--ls-border);
  background: var(--ls-card);
}

.rich-text-editor :deep(.ql-container.ql-snow) {
  border-radius: 0 0 16px 16px;
  border-color: var(--ls-border);
  background: var(--ls-panel-soft);
  min-height: calc(var(--editor-min-height) + 2px);
  height: auto;
}

.rich-text-editor :deep(.ql-editor) {
  min-height: var(--editor-min-height);
  font-size: 15px;
  line-height: 1.8;
}
</style>
