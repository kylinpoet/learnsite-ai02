<template>
  <div v-if="sanitizedHtml" class="markdown-content" v-html="sanitizedHtml"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { patchImageLinkPolicyInHtml } from '@/utils/iframeTrust';

const props = withDefaults(
  defineProps<{
    content?: string | null;
  }>(),
  {
    content: '',
  }
);

const standaloneImageUrlPattern =
  /^https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s#]*)?(?:#[^\s]*)?$/i;

function normalizeMarkdownSource(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (standaloneImageUrlPattern.test(trimmed)) {
        return `![](${trimmed})`;
      }
      return line;
    })
    .join('\n');
}

const sanitizedHtml = computed(() => {
  const source = (props.content || '').trim();
  if (!source) {
    return '';
  }

  const rendered = marked.parse(normalizeMarkdownSource(source), {
    breaks: true,
    gfm: true,
  }) as string;
  const sanitized = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'class', 'referrerpolicy'],
  });
  const normalizedHtml = typeof sanitized === 'string' ? sanitized : String(sanitized || '');
  return patchImageLinkPolicyInHtml(normalizedHtml);
});
</script>

<style scoped>
.markdown-content {
  color: var(--ls-text);
  line-height: 1.75;
  word-break: break-word;
}

.markdown-content :deep(p),
.markdown-content :deep(ul),
.markdown-content :deep(ol),
.markdown-content :deep(blockquote),
.markdown-content :deep(pre),
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 0 0 12px;
}

.markdown-content :deep(p:last-child),
.markdown-content :deep(ul:last-child),
.markdown-content :deep(ol:last-child),
.markdown-content :deep(blockquote:last-child),
.markdown-content :deep(pre:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 20px;
}

.markdown-content :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 6px;
  background: rgba(32, 60, 112, 0.08);
  font-size: 0.92em;
}

.markdown-content :deep(pre) {
  overflow-x: auto;
  padding: 14px;
  border-radius: 12px;
  background: rgba(32, 60, 112, 0.06);
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-content :deep(blockquote) {
  padding: 10px 14px;
  border-left: 4px solid rgba(47, 135, 255, 0.35);
  border-radius: 12px;
  background: rgba(47, 135, 255, 0.08);
}

.markdown-content :deep(a) {
  color: var(--ls-primary);
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 8px 10px;
  border: 1px solid rgba(32, 60, 112, 0.12);
  text-align: left;
  vertical-align: top;
}
</style>
