<template>
  <div v-if="sanitizedHtml" class="rich-text-content" v-html="sanitizedHtml"></div>
  <p v-else class="rich-text-empty">{{ emptyText }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';

import { normalizeRichTextHtml } from '@/utils/richText';

const props = withDefaults(
  defineProps<{
    html?: string | null;
    emptyText?: string;
  }>(),
  {
    html: '',
    emptyText: '暂无内容',
  }
);

const sanitizedHtml = computed(() => {
  const html = normalizeRichTextHtml(props.html);
  if (!html) {
    return '';
  }

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
});
</script>

<style scoped>
.rich-text-content {
  color: var(--ls-ink);
  line-height: 1.8;
  word-break: break-word;
}

.rich-text-content :deep(p),
.rich-text-content :deep(ul),
.rich-text-content :deep(ol),
.rich-text-content :deep(blockquote),
.rich-text-content :deep(pre),
.rich-text-content :deep(h1),
.rich-text-content :deep(h2),
.rich-text-content :deep(h3) {
  margin: 0 0 12px;
}

.rich-text-content :deep(ul),
.rich-text-content :deep(ol) {
  padding-left: 20px;
}

.rich-text-content :deep(blockquote) {
  margin-left: 0;
  padding: 10px 14px;
  border-left: 4px solid rgba(67, 109, 185, 0.35);
  background: rgba(67, 109, 185, 0.08);
  border-radius: 12px;
}

.rich-text-content :deep(pre) {
  overflow-x: auto;
  padding: 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.06);
}

.rich-text-content :deep(img) {
  max-width: 100%;
  border-radius: 14px;
}

.rich-text-empty {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}
</style>
