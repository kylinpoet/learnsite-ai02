<template>
  <div v-if="sanitizedHtml" class="rich-text-content" v-html="sanitizedHtml"></div>
  <p v-else class="rich-text-empty">{{ emptyText }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';

import { patchImageLinkPolicyInHtml, patchTrustedIframeSandboxInHtml } from '@/utils/iframeTrust';
import { normalizeRichTextHtml } from '@/utils/richText';

const props = withDefaults(
  defineProps<{
    html?: string | null;
    emptyText?: string;
    sanitizePreset?: 'default' | 'strict';
  }>(),
  {
    html: '',
    emptyText: '暂无内容',
    sanitizePreset: 'default',
  }
);

const sanitizedHtml = computed(() => {
  const html = normalizeRichTextHtml(props.html);
  if (!html) {
    return '';
  }

  const allowEmbeddedContent = props.sanitizePreset !== 'strict';
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: allowEmbeddedContent ? ['style', 'iframe', 'font'] : ['font'],
    ADD_ATTR: [
      'style',
      'class',
      'id',
      'name',
      'src',
      'target',
      'rel',
      'title',
      'width',
      'height',
      ...(allowEmbeddedContent
        ? ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'sandbox', 'referrerpolicy', 'srcdoc']
        : []),
    ],
  });

  const normalizedSanitizedHtml = typeof sanitized === 'string' ? sanitized : String(sanitized || '');
  const htmlWithImagePolicy = patchImageLinkPolicyInHtml(normalizedSanitizedHtml);
  if (!allowEmbeddedContent) {
    return htmlWithImagePolicy;
  }
  return patchTrustedIframeSandboxInHtml(htmlWithImagePolicy);
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
  border-left: 4px solid var(--ls-blockquote-border);
  background: var(--ls-blockquote-bg);
  border-radius: 12px;
}

.rich-text-content :deep(pre) {
  overflow-x: auto;
  padding: 14px;
  border-radius: 14px;
  background: var(--ls-panel-soft);
}

.rich-text-content :deep(figure) {
  margin: 0 0 12px;
}

.rich-text-content :deep(figure.image) {
  display: table;
  clear: both;
  max-width: 100%;
  min-width: 50px;
  margin: 0.9em auto;
  box-sizing: border-box;
}

.rich-text-content :deep(figure.image img),
.rich-text-content :deep(figure.image picture),
.rich-text-content :deep(figure.image picture img) {
  display: block;
  margin: 0 auto;
  max-width: 100%;
}

.rich-text-content :deep(figure.image img) {
  min-width: 100%;
  height: auto;
}

.rich-text-content :deep(figure.image.image_resized) {
  display: block;
}

.rich-text-content :deep(figure.image.image_resized img) {
  width: 100%;
}

.rich-text-content :deep(figure.image.image-style-align-left) {
  float: left;
  margin-right: 1.5em;
}

.rich-text-content :deep(figure.image.image-style-align-right) {
  float: right;
  margin-left: 1.5em;
}

.rich-text-content :deep(img) {
  max-width: 100%;
  height: auto !important;
  border-radius: 14px;
}

.rich-text-content :deep(iframe),
.rich-text-content :deep(.iframe-container) {
  display: block;
  width: 100% !important;
  max-width: 100%;
  min-height: 480px;
  border: 0;
}

.rich-text-empty {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}
</style>

