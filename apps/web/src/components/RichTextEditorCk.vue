<template>
  <div
    ref="editorContainerRef"
    class="rich-text-editor"
    :class="{ 'rich-text-editor--readonly': readonly }"
    :style="{ '--editor-min-height': `${minHeight}px` }"
  >
    <Ckeditor
      :editor="editorClass"
      :model-value="editorValue"
      :config="editorConfig"
      :disabled="readonly"
      @ready="handleReady"
      @update:model-value="handleUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Ckeditor } from '@ckeditor/ckeditor5-vue';
import {
  BlockQuote,
  Bold,
  ClassicEditor,
  Code,
  CodeBlock,
  Essentials,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  GeneralHtmlSupport,
  Heading,
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  Italic,
  Link,
  List,
  ListProperties,
  Paragraph,
  PasteFromOffice,
  SourceEditing,
  Strikethrough,
  Underline,
  type EditorConfig,
} from 'ckeditor5';
import { useAuthStore } from '@/stores/auth';
import {
  isTrustedIframeSrc,
  normalizeIframeSrc,
  patchImageLinkPolicyInHtml,
  resolveIframeSandbox,
  shouldBypassReferrerForExternalImage,
} from '@/utils/iframeTrust';
import 'ckeditor5/ckeditor5.css';

const props = withDefaults(
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

type CkUploadLoader = {
  file: Promise<File | null>;
};

type CkUploadAdapter = {
  upload: () => Promise<{ default: string }>;
  abort?: () => void;
};

type CkFileRepository = {
  createUploadAdapter?: (loader: CkUploadLoader) => CkUploadAdapter;
};

const editorClass = ClassicEditor;
const ckeditorLicenseKey = import.meta.env.VITE_CKEDITOR_LICENSE_KEY || 'GPL';
const editorValue = computed(() => patchImageLinkPolicyInHtml(props.modelValue || ''));
const authStore = useAuthStore();
const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
const richTextImageUploadPath = '/lesson-plans/staff/rich-text-images';
const editorContainerRef = ref<HTMLElement | null>(null);
let activeEditableElement: HTMLElement | null = null;
let iframeSandboxObserver: MutationObserver | null = null;
let editorContainerSandboxObserver: MutationObserver | null = null;
const iframeSandboxRefreshMarkAttr = 'data-ls-sandbox-refreshed';
const imageReferrerRefreshMarkAttr = 'data-ls-image-referrer-refreshed';

class StaffRichTextImageUploadAdapter implements CkUploadAdapter {
  private abortController: AbortController | null = null;

  constructor(
    private readonly loader: CkUploadLoader,
    private readonly resolveToken: () => string
  ) {}

  async upload(): Promise<{ default: string }> {
    const file = await this.loader.file;
    if (!file) {
      throw new Error('未读取到图片文件');
    }

    const formData = new FormData();
    formData.append('file', file, file.name || 'image');

    const headers = new Headers();
    headers.set('Accept', 'application/json');
    const token = this.resolveToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    this.abortController = new AbortController();
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${richTextImageUploadPath}`, {
        method: 'POST',
        headers,
        body: formData,
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Image upload canceled');
      }
      throw error instanceof Error ? error : new Error('Image upload failed');
    } finally {
      this.abortController = null;
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json().catch(() => null) : null;
    const fallbackText = !isJson ? (await response.text().catch(() => '')).trim() : '';

    if (!response.ok) {
      throw new Error(
        readUploadErrorDetail(payload) || fallbackText || `Image upload failed (${response.status})`
      );
    }
    const imageUrl = extractUploadedImageUrl(payload);
    if (!imageUrl) {
      throw new Error('Upload succeeded but no image URL returned');
    }
    return { default: imageUrl };
  }

  abort() {
    this.abortController?.abort();
    this.abortController = null;
  }
}

function extractUploadedImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rootPayload = payload as { url?: unknown; data?: unknown };
  if (typeof rootPayload.url === 'string' && rootPayload.url.trim()) {
    return rootPayload.url.trim();
  }

  if (rootPayload.data && typeof rootPayload.data === 'object') {
    const nestedUrl = (rootPayload.data as { url?: unknown }).url;
    if (typeof nestedUrl === 'string' && nestedUrl.trim()) {
      return nestedUrl.trim();
    }
  }

  return null;
}

function readUploadErrorDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  if ((payload as { data?: unknown }).data && typeof (payload as { data?: unknown }).data === 'object') {
    const nestedMessage = ((payload as { data?: { message?: unknown } }).data?.message);
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }

  return null;
}

function installStaffImageUploadAdapter(editor: unknown) {
  if (!editor || typeof editor !== 'object') {
    return;
  }

  const repositoryCandidate = (editor as { plugins?: { get?: (name: string) => unknown } }).plugins?.get?.(
    'FileRepository'
  );
  if (!repositoryCandidate || typeof repositoryCandidate !== 'object') {
    return;
  }

  const repository = repositoryCandidate as CkFileRepository;
  repository.createUploadAdapter = (loader: CkUploadLoader) =>
    new StaffRichTextImageUploadAdapter(loader, () => authStore.token || '');
}

const editorConfig = computed<EditorConfig>(() => ({
  licenseKey: ckeditorLicenseKey,
  placeholder: props.placeholder,
  extraPlugins: [installStaffImageUploadAdapter],
  plugins: [
    Essentials,
    Paragraph,
    Heading,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    BlockQuote,
    CodeBlock,
    Link,
    List,
    ListProperties,
    Indent,
    FontFamily,
    FontSize,
    FontColor,
    FontBackgroundColor,
    PasteFromOffice,
    Image,
    ImageUpload,
    ImageToolbar,
    ImageCaption,
    ImageStyle,
    ImageResize,
    GeneralHtmlSupport,
    SourceEditing,
  ],
  toolbar: {
    shouldNotGroupWhenFull: true,
    items: [
      'heading',
      '|',
      'fontFamily',
      'fontSize',
      'fontColor',
      'fontBackgroundColor',
      '|',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'code',
      '|',
      'numberedList',
      'bulletedList',
      'outdent',
      'indent',
      '|',
      'blockQuote',
      'codeBlock',
      'link',
      'insertImage',
      '|',
      'undo',
      'redo',
      '|',
      'sourceEditing',
    ],
  },
  link: {
    addTargetToExternalLinks: true,
    defaultProtocol: 'https://',
  },
  list: {
    properties: {
      styles: true,
      startIndex: true,
      reversed: true,
    },
  },
  fontSize: {
    options: [10, 12, 14, 'default', 16, 18, 20, 24, 28, 32],
    supportAllValues: true,
  },
  image: {
    toolbar: ['imageTextAlternative', '|', 'toggleImageCaption', 'imageStyle:inline', 'imageStyle:block', '|', 'resizeImage'],
    resizeUnit: '%' as const,
  },
  htmlSupport: {
    allow: [
      {
        name: /.*/,
        attributes: true as const,
        classes: [/.*/],
        styles: true as const,
      },
    ],
  },
}));

function handleUpdate(value: unknown) {
  emit('update:modelValue', typeof value === 'string' ? value : '');
  queueMicrotask(() => {
    patchSandboxForPreviewIframes(activeEditableElement);
    patchSandboxForPreviewIframes(editorContainerRef.value);
  });
}

function handleReady(editor: unknown) {
  const editable = resolveEditableElement(editor);
  activeEditableElement = editable;
  patchSandboxForPreviewIframes(editable);
  patchSandboxForPreviewIframes(editorContainerRef.value);

  iframeSandboxObserver?.disconnect();
  if (!editable) {
    iframeSandboxObserver = null;
  } else {
    iframeSandboxObserver = new MutationObserver(() => {
      patchSandboxForPreviewIframes(editable);
    });
    iframeSandboxObserver.observe(editable, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['sandbox', 'src'],
    });
  }

  editorContainerSandboxObserver?.disconnect();
  const containerElement = editorContainerRef.value;
  if (!containerElement) {
    editorContainerSandboxObserver = null;
    return;
  }
  editorContainerSandboxObserver = new MutationObserver(() => {
    patchSandboxForPreviewIframes(containerElement);
  });
  editorContainerSandboxObserver.observe(containerElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['sandbox', 'src'],
  });
}

function resolveEditableElement(editor: unknown): HTMLElement | null {
  if (!editor || typeof editor !== 'object') {
    return null;
  }

  const candidate = editor as {
    ui?: {
      getEditableElement?: () => Element | null;
    };
  };

  const editable = candidate.ui?.getEditableElement?.() ?? null;
  return editable instanceof HTMLElement ? editable : null;
}

function refreshIframeOnceAfterSandboxPatch(
  iframeElement: HTMLIFrameElement,
  normalizedSrc: string
) {
  if (!normalizedSrc) {
    return;
  }
  if (iframeElement.getAttribute(iframeSandboxRefreshMarkAttr) === '1') {
    return;
  }
  iframeElement.setAttribute(iframeSandboxRefreshMarkAttr, '1');
  try {
    iframeElement.setAttribute('src', 'about:blank');
    iframeElement.setAttribute('src', normalizedSrc);
  } catch {
    // Ignore refresh failures to keep editor interaction smooth.
  }
}

function refreshImageOnceAfterPolicyPatch(
  imageElement: HTMLImageElement,
  normalizedSrc: string
) {
  if (!normalizedSrc) {
    return;
  }
  if (imageElement.getAttribute(imageReferrerRefreshMarkAttr) === '1') {
    return;
  }
  imageElement.setAttribute(imageReferrerRefreshMarkAttr, '1');
  try {
    imageElement.setAttribute('src', '');
    imageElement.setAttribute('src', normalizedSrc);
  } catch {
    // Ignore refresh failures to keep editor interaction smooth.
  }
}

function patchImageLinksForPreview(root: HTMLElement) {
  const imageElements = root.querySelectorAll<HTMLImageElement>('img[src]');
  imageElements.forEach((imageElement) => {
    const rawSrc = imageElement.getAttribute('src') || '';
    const normalizedSrc = normalizeIframeSrc(rawSrc);
    if (normalizedSrc && normalizedSrc !== rawSrc.trim()) {
      imageElement.setAttribute('src', normalizedSrc);
    }

    if (!shouldBypassReferrerForExternalImage(normalizedSrc || rawSrc)) {
      return;
    }
    let shouldForceReload = false;
    const currentReferrerPolicy = (imageElement.getAttribute('referrerpolicy') || '').trim().toLowerCase();
    if (currentReferrerPolicy !== 'no-referrer') {
      imageElement.setAttribute('referrerpolicy', 'no-referrer');
      shouldForceReload = true;
    }
    if (shouldForceReload) {
      refreshImageOnceAfterPolicyPatch(imageElement, normalizedSrc || rawSrc);
    }
  });
}

function patchSandboxForPreviewIframes(root: HTMLElement | null) {
  if (!root) {
    return;
  }

  patchImageLinksForPreview(root);

  const iframeElements = root.querySelectorAll<HTMLIFrameElement>('iframe');
  iframeElements.forEach((iframeElement) => {
    const rawSrc = iframeElement.getAttribute('src');
    let normalizedSrc = '';
    if (rawSrc !== null) {
      normalizedSrc = normalizeIframeSrc(rawSrc);
      if (normalizedSrc && normalizedSrc !== rawSrc.trim()) {
        iframeElement.setAttribute('src', normalizedSrc);
      }
    }

    const srcForTrustCheck = normalizedSrc || rawSrc || '';
    const trustedSrc = isTrustedIframeSrc(srcForTrustCheck);

    if (!iframeElement.hasAttribute('sandbox')) {
      return;
    }

    if (!trustedSrc) {
      return;
    }

    const currentSandbox = String(iframeElement.getAttribute('sandbox') || '').trim();
    const nextSandbox = resolveIframeSandbox(srcForTrustCheck);
    if (nextSandbox !== currentSandbox) {
      iframeElement.setAttribute('sandbox', nextSandbox);
      refreshIframeOnceAfterSandboxPatch(iframeElement, normalizeIframeSrc(srcForTrustCheck));
    }
  });
}

onBeforeUnmount(() => {
  iframeSandboxObserver?.disconnect();
  iframeSandboxObserver = null;
  editorContainerSandboxObserver?.disconnect();
  editorContainerSandboxObserver = null;
  activeEditableElement = null;
});
</script>

<style scoped>
.rich-text-editor {
  display: block;
  overflow: hidden;
}

.rich-text-editor :deep(.ck.ck-editor) {
  display: flex;
  flex-direction: column;
}

.rich-text-editor :deep(.ck.ck-editor__top .ck-sticky-panel .ck-toolbar) {
  border-radius: 16px 16px 0 0;
  border-color: var(--ls-border);
  background: var(--ls-card);
}

.rich-text-editor :deep(.ck.ck-editor__main > .ck-editor__editable) {
  border-radius: 0 0 16px 16px;
  border-color: var(--ls-border);
  background: var(--ls-panel-soft);
  min-height: calc(var(--editor-min-height) + 2px);
  height: auto;
}

.rich-text-editor :deep(.ck-editor__editable) {
  min-height: var(--editor-min-height);
  font-size: 15px;
  line-height: 1.8;
}

.rich-text-editor :deep(.ck-content [data-html-embed-label]),
.rich-text-editor :deep(.ck-content [data-html-object-embed-label]),
.rich-text-editor :deep(.ck-content .ck-widget.raw-html-embed),
.rich-text-editor :deep(.ck-content .ck-widget.html-object-embed) {
  width: 100%;
  max-width: 100%;
  min-width: 100% !important;
  margin: 14px 0;
}

.rich-text-editor :deep(.ck-content .ck-widget.raw-html-embed .raw-html-embed__content-wrapper) {
  padding: 10px 12px;
}

.rich-text-editor :deep(.ck-content .ck-widget.html-object-embed) {
  display: block;
  padding: 10px 12px;
}

.rich-text-editor :deep(.ck-content .ck-widget.raw-html-embed .raw-html-embed__preview) {
  width: 100% !important;
  display: block;
  overflow: visible !important;
}

.rich-text-editor :deep(.ck-content .ck-widget.html-object-embed .html-object-embed__content) {
  width: 100%;
  max-width: 100%;
  overflow: visible;
  pointer-events: auto !important;
}

.rich-text-editor
  :deep(.ck.ck-editor__editable:not(.ck-read-only) .ck-widget.raw-html-embed .raw-html-embed__preview) {
  pointer-events: auto !important;
}

.rich-text-editor
  :deep(.ck.ck-editor__editable:not(.ck-read-only) .ck-widget.html-object-embed .html-object-embed__content) {
  pointer-events: auto !important;
}

.rich-text-editor :deep(.ck-content .ck-widget.raw-html-embed .raw-html-embed__preview-content) {
  display: block;
  width: 100%;
  margin: 0;
  border-spacing: 0;
  background: transparent;
}

.rich-text-editor :deep(.ck-content .ck-widget.raw-html-embed .raw-html-embed__preview-content > *) {
  margin: 0;
  max-width: 100%;
}

.rich-text-editor :deep(.ck-content .ck-widget.raw-html-embed iframe),
.rich-text-editor :deep(.ck-content .ck-widget.html-object-embed iframe),
.rich-text-editor :deep(.ck-content iframe) {
  display: block;
  width: 100%;
  max-width: 100%;
  min-height: 480px;
  border: 0;
  background: #fff;
}

.rich-text-editor--readonly :deep(.ck.ck-editor__top) {
  display: none;
}

.rich-text-editor--readonly :deep(.ck.ck-editor__main > .ck-editor__editable) {
  border-radius: 16px;
}
</style>

