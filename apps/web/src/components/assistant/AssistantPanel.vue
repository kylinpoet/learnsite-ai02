<template>
  <section
    class="ju-panel"
    :class="{ closing }"
    :style="panelStyle"
    aria-label="AI 助手小榉AI帮"
  >
    <header class="ju-head">
      <img class="ju-avatar" :class="{ talking: busy }" :src="avatarUrl" alt="小榉AI帮" />
      <div class="ju-head-main">
        <div class="ju-name">
          {{ name }}
          <span class="ju-tag">{{ scopeTitle }}</span>
        </div>
        <div class="ju-sub">{{ providerSubtitle }}</div>
      </div>
      <div class="ju-head-actions">
        <button type="button" class="ju-icon-btn" title="新对话" @click="resetConversation">
          <MessageSquarePlus :size="17" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="ju-icon-btn"
          :class="{ on: settingsOpen }"
          title="会话设置"
          @click="settingsOpen = !settingsOpen"
        >
          <Settings2 :size="17" aria-hidden="true" />
        </button>
        <button type="button" class="ju-icon-btn" title="收起" @click="emit('close')">
          <X :size="17" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="settingsOpen" class="ju-settings-pop">
      <h4 class="ju-settings-title">会话设置</h4>
      <label class="ju-field">
        <span>模型服务</span>
        <select v-model="selectedProviderId" class="ju-native-select" :disabled="!providers.length">
          <option :value="null">跟随系统默认模型</option>
          <option v-for="item in providers" :key="item.id" :value="item.id">
            {{ item.name }} · {{ item.model_name }}
          </option>
        </select>
        <small v-if="!providers.length">当前未启用外部模型服务，将使用系统默认学伴。</small>
      </label>

      <div class="ju-field">
        <span>对话模式</span>
        <label class="ju-switch-row">
          <span class="ju-switch" :class="{ on: streamModeEnabled && streamCapable }" role="switch" :aria-checked="streamModeEnabled && streamCapable" @click="toggleStream">
            <i />
          </span>
          <span class="ju-switch-row__label">{{ streamModeEnabled && streamCapable ? '流式输出（逐段生成）' : '标准输出（一次返回）' }}</span>
        </label>
      </div>

      <div class="ju-field">
        <span>推理模式</span>
        <label class="ju-switch-row">
          <span class="ju-switch" :class="{ on: thinkingModeEnabled }" role="switch" :aria-checked="thinkingModeEnabled" @click="thinkingModeEnabled = !thinkingModeEnabled">
            <i />
          </span>
          <span class="ju-switch-row__label">{{ thinkingModeEnabled ? '开启（更慢、更严谨）' : '关闭（更快）' }}</span>
        </label>
      </div>

      <div class="ju-field">
        <span>知识库</span>
        <div class="ju-kb-chips">
          <button
            v-for="kb in visibleKnowledgeBases"
            :key="kb.id"
            type="button"
            class="ju-kb-chip"
            :class="{ on: activeKnowledgeBaseIds.includes(kb.id) }"
            :title="kb.description"
            @click="toggleKnowledgeBase(kb.id)"
          >
            {{ kb.name }}
          </button>
          <small v-if="!visibleKnowledgeBases.length">没有可用的知识库。</small>
        </div>
      </div>
    </div>

    <div class="ju-scopes">
      <button
        type="button"
        class="ju-scope"
        :class="{ on: activeScope === 'general' }"
        @click="switchScope('general')"
      >
        通用问答
      </button>
      <button
        type="button"
        class="ju-scope"
        :class="{ on: activeScope === 'lesson' }"
        :disabled="!lessonModeAvailable"
        @click="switchScope('lesson')"
      >
        当前学案
      </button>
    </div>

    <div ref="listRef" class="ju-body">
      <div v-if="!activeMessages.length" class="ju-welcome">
        <span class="ju-welcome-sprite" aria-hidden="true" />
        <p class="ju-hello">
          {{ welcomeMessage(activeScope) }}<br />
          可以直接问我，也可以把截图、文档、表格丢给我。
        </p>

        <div v-if="currentContext" class="ju-context">
          <p class="ju-context__kicker">{{ contextKindLabel(currentContext.kind) }}</p>
          <h4 class="ju-context__title">{{ currentContext.title }}</h4>
          <p class="ju-context__note">{{ currentContext.prompt_hint }}</p>
        </div>

        <div class="ju-prompts">
          <button
            v-for="question in activeStarterQuestions"
            :key="question"
            type="button"
            class="ju-prompt"
            @click="applyStarterQuestion(question)"
          >
            {{ question }}
          </button>
        </div>
      </div>

      <article
        v-for="(message, index) in activeMessages"
        :key="message.id"
        class="ju-msg"
        :class="message.role === 'assistant' ? 'assistant' : 'user'"
        :style="{ animationDelay: `${Math.min(index, 6) * 28}ms` }"
      >
        <img
          v-if="message.role === 'assistant'"
          class="ju-msg-avatar"
          :class="{ talking: message.streaming }"
          :src="avatarUrl"
          alt=""
          aria-hidden="true"
        />
        <div
          class="ju-bubble"
          :class="{ streaming: message.streaming && message.content !== '' }"
        >
          <div class="ju-bubble__meta">
            <span>{{ message.role === 'assistant' ? name : '我' }}</span>
            <small>{{ formatMessageTime(message.createdAt) }}</small>
          </div>

          <details
            v-if="message.role === 'assistant' && (message.reasoningContent || message.reasoningStreaming)"
            class="ju-reason"
          >
            <summary>
              <strong>模型推理过程</strong>
              <span>{{ message.reasoningStreaming ? '生成中…' : '点击展开' }}</span>
            </summary>
            <div class="ju-reason__body">
              <MarkdownContent :content="message.reasoningContent || ''" />
            </div>
          </details>

          <div v-if="message.attachments?.length" class="ju-msg-files">
            <span
              v-for="attachment in message.attachments"
              :key="attachment.id"
              class="ju-file-chip"
            >
              {{ attachment.name }}<em>{{ attachmentKindLabel(attachment.kind) }}</em>
            </span>
          </div>

          <MarkdownContent
            v-if="message.role === 'assistant' && message.content"
            :content="message.content"
          />
          <p v-else-if="message.role === 'user'" class="ju-plain">{{ message.content }}</p>

          <span v-if="message.streaming && !message.content" class="ju-typing" aria-label="正在思考">
            <i /><i /><i />
          </span>

          <div v-if="message.warning" class="ju-src-warn">{{ message.warning }}</div>

          <div v-if="message.role === 'assistant' && !message.streaming && message.content" class="ju-speech">
            <button
              type="button"
              class="ju-icon-btn"
              :disabled="speechLoadingMessageId !== null && speechLoadingMessageId !== message.id"
              :title="speechButtonLabel(message)"
              @click="toggleMessageSpeech(message)"
            >
              <VolumeX v-if="speechMessageId === message.id" :size="15" aria-hidden="true" />
              <Volume2 v-else :size="15" aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
    </div>

    <footer class="ju-foot">
      <div v-if="composerAttachments.length" class="ju-files">
        <span
          v-for="attachment in composerAttachments"
          :key="attachment.id"
          class="ju-file-chip removable"
        >
          {{ attachment.name }}<em>{{ attachmentKindLabel(attachment.kind) }}</em>
          <button type="button" title="移除" @click="removeComposerAttachment(attachment.id)">
            <X :size="12" aria-hidden="true" />
          </button>
        </span>
      </div>
      <div v-if="pageHint" class="ju-hint">{{ pageHint }}</div>
      <div class="ju-composer">
        <textarea
          v-model="draftMessage"
          class="ju-textarea"
          :rows="draftRows"
          :disabled="isSending"
          :placeholder="composerPlaceholder"
          @keydown.enter.exact.prevent="sendCurrentMessage"
        />
        <div class="ju-composer-actions">
          <button
            type="button"
            class="ju-icon-btn"
            :disabled="isSending"
            title="上传图片 / 文档 / 表格"
            @click="openAttachmentPicker"
          >
            <Paperclip :size="16" aria-hidden="true" />
          </button>
          <button
            v-if="canAbort"
            type="button"
            class="ju-send stop"
            title="停止生成"
            @click="abortCurrentRequest()"
          >
            <Square :size="14" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            class="ju-send"
            :disabled="sendDisabled"
            :title="isSending ? '生成中' : '发送'"
            @click="sendCurrentMessage"
          >
            <SendHorizontal :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>

      <input
        ref="attachmentInputRef"
        class="file-input"
        multiple
        type="file"
        @change="handleAttachmentChange"
      />
      <p class="ju-disclaimer">AI 生成内容仅供参考，重要信息请回到原始资料核对</p>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  MessageSquarePlus,
  Paperclip,
  SendHorizontal,
  Settings2,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next';

import { apiGet, apiPost, apiPostBlob } from '@/api/http';
import MarkdownContent from '@/components/MarkdownContent.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';
import { streamCompanionReply } from '@/utils/companionStream';
import type { ContextQuery } from '@/types/domain';

type Scope = 'general' | 'lesson';

type CompanionProvider = {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  model_name: string;
  is_default: boolean;
};

type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  scopes: Scope[];
};

type CompanionContext = {
  kind: 'course' | 'plan' | 'task' | 'session';
  route_key: string;
  title: string;
  subtitle: string;
  description: string;
  coach_mode: string;
  recommended_knowledge_base_ids: string[];
  suggested_questions: string[];
  identifiers: {
    course_id: number | null;
    task_id: number | null;
    plan_id: number | null;
    session_id: number | null;
    lesson_id: number | null;
  };
  lesson: { id: number; title: string; unit_title: string; book_title: string };
  classroom: { id: number; name: string; status: string; started_at: string } | null;
  tasks: Array<{ id: number; title: string; task_type: string; sort_order: number; is_required: boolean }>;
  prompt_hint: string;
};

type BootstrapPayload = {
  enabled: boolean;
  user: { role: string; display_name: string };
  providers: CompanionProvider[];
  active_provider: CompanionProvider | null;
  knowledge_bases: KnowledgeBase[];
  default_knowledge_base_ids: Record<Scope, string[]>;
  welcome_messages: Record<Scope, string>;
  starter_questions: Record<Scope, string[]>;
  capabilities: {
    multimodal: boolean;
    course_context: boolean;
    knowledge_base_select: boolean;
    streaming?: boolean;
    thinking?: boolean;
  };
};

type ReplyPayload = {
  reply: {
    role: 'assistant';
    content: string;
    created_at: string;
    provider_name: string;
    provider_mode: 'live' | 'preview';
    warning: string | null;
    reasoning_content: string | null;
  };
  active_provider: CompanionProvider | null;
  context: CompanionContext | null;
};

type ComposerAttachment = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeKb: number;
  kind: 'image' | 'text' | 'file';
  previewUrl: string | null;
  textContent: string | null;
  dataUrl: string | null;
};

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeKb: number;
  kind: ComposerAttachment['kind'];
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  providerName?: string;
  providerMode?: 'live' | 'preview';
  warning?: string | null;
  streaming?: boolean;
  reasoningContent?: string | null;
  reasoningStreaming?: boolean;
};

const props = withDefaults(
  defineProps<{
    contextQuery?: ContextQuery;
    pageHint?: string;
    name?: string;
    avatarUrl?: string;
    closing?: boolean;
    panelStyle?: Record<string, string> | null;
  }>(),
  {
    contextQuery: () => ({}),
    pageHint: '',
    name: '小榉AI帮',
    avatarUrl: '/assistant/xiaoju-128.png',
    closing: false,
    panelStyle: null,
  }
);

const emit = defineEmits<{ (e: 'close'): void }>();

const AI_PROVIDER_CONFIG_UPDATED_EVENT = 'learnsite:ai-provider-config-updated';
const ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT = 'learnsite:assistant-runtime-config-updated';
const IMAGE_INLINE_LIMIT = 1536 * 1024;
const TEXT_INLINE_LIMIT = 128 * 1024;
const MAX_ATTACHMENTS = 8;
const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm', 'css',
  'js', 'ts', 'py', 'java', 'cpp', 'c', 'sql', 'yaml', 'yml',
]);
const COMPANION_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const authStore = useAuthStore();
const bootstrap = ref<BootstrapPayload | null>(null);
const currentContext = ref<CompanionContext | null>(null);
const activeScope = ref<Scope>('general');
const generalMessages = ref<ChatMessage[]>([]);
const lessonMessages = ref<ChatMessage[]>([]);
const lessonRouteKey = ref('');
const draftMessage = ref('');
const composerAttachments = ref<ComposerAttachment[]>([]);
const attachmentInputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);
const isSending = ref(false);
const activeRequestController = ref<AbortController | null>(null);
const selectedKnowledgeBaseIds = reactive({ general: [] as string[], lesson: [] as string[] });
const selectedProviderId = ref<number | null>(null);
const streamModeEnabled = ref(true);
const thinkingModeEnabled = ref(false);
const settingsOpen = ref(false);
const speechMessageId = ref<string | null>(null);
const speechLoadingMessageId = ref<string | null>(null);
let speechAudio: HTMLAudioElement | null = null;
let speechObjectUrl: string | null = null;

const activeMessages = computed(() =>
  activeScope.value === 'lesson' ? lessonMessages.value : generalMessages.value
);
const lessonModeAvailable = computed(() => Boolean(currentContext.value));
const streamCapable = computed(() => bootstrap.value?.capabilities.streaming ?? true);
const providers = computed(() => bootstrap.value?.providers || []);

const scopeTitle = computed(() => {
  if (activeScope.value === 'lesson' && currentContext.value) {
    return contextKindLabel(currentContext.value.kind);
  }
  return '通用助手';
});

const selectedProvider = computed(() => {
  if (selectedProviderId.value === null) {
    return null;
  }
  return providers.value.find((item) => item.id === selectedProviderId.value) || null;
});

const providerSubtitle = computed(() => {
  const active = selectedProvider.value || bootstrap.value?.active_provider;
  if (!active) {
    return '尚未连接模型服务';
  }
  const mode = streamModeEnabled.value && streamCapable.value ? '流式' : '标准';
  return `${active.name} · ${active.model_name} · ${mode}`;
});

const visibleKnowledgeBases = computed(() =>
  (bootstrap.value?.knowledge_bases || []).filter((item) => item.scopes.includes(activeScope.value))
);

const activeKnowledgeBaseIds = computed<string[]>(() =>
  activeScope.value === 'lesson' ? selectedKnowledgeBaseIds.lesson : selectedKnowledgeBaseIds.general
);

const activeStarterQuestions = computed(() => {
  if (activeScope.value === 'lesson' && currentContext.value?.suggested_questions?.length) {
    return currentContext.value.suggested_questions;
  }
  return bootstrap.value?.starter_questions[activeScope.value] || [];
});

const busy = computed(() => isSending.value);
const canAbort = computed(() => isSending.value && activeRequestController.value !== null);
const sendDisabled = computed(
  () =>
    isSending.value ||
    (!draftMessage.value.trim() && composerAttachments.value.length === 0)
);
const composerPlaceholder = computed(() =>
  activeScope.value === 'lesson' ? '针对当前学案提问…（Enter 发送）' : '问点什么…（Enter 发送）'
);
const draftRows = computed(() => (draftMessage.value.includes('\n') ? 3 : 1));

function makeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function contextKindLabel(kind: CompanionContext['kind']) {
  if (kind === 'task') return '当前活动';
  if (kind === 'session') return '当前课堂';
  if (kind === 'plan') return '当前学案';
  return '当前课程';
}

function attachmentKindLabel(kind: ComposerAttachment['kind']) {
  if (kind === 'image') return '图片';
  if (kind === 'text') return '文本';
  return '文件';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ').slice(11, 16);
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function messagesRef(scope: Scope) {
  return scope === 'lesson' ? lessonMessages : generalMessages;
}

function scrollToBottom() {
  void nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight;
    }
  });
}

function updateMessageById(scope: Scope, id: string, updater: (message: ChatMessage) => ChatMessage) {
  const store = messagesRef(scope);
  store.value = store.value.map((message) => (message.id === id ? updater(message) : message));
  scrollToBottom();
}

function applyStarterQuestion(question: string) {
  draftMessage.value = question;
}

function switchScope(scope: Scope) {
  if (scope === 'lesson' && !lessonModeAvailable.value) {
    return;
  }
  activeScope.value = scope;
  settingsOpen.value = false;
  scrollToBottom();
}

function toggleStream() {
  if (!streamCapable.value) {
    return;
  }
  streamModeEnabled.value = !streamModeEnabled.value;
}

function normalizeKnowledgeBaseIds(value: string[], scope: Scope) {
  const availableIds = new Set(
    (bootstrap.value?.knowledge_bases || [])
      .filter((item) => item.scopes.includes(scope))
      .map((item) => item.id)
  );
  const filtered = value.filter(
    (item, index) => availableIds.has(item) && value.indexOf(item) === index
  );
  if (filtered.length) {
    return filtered;
  }
  return (bootstrap.value?.default_knowledge_base_ids[scope] || []).filter((item) =>
    availableIds.has(item)
  );
}

function toggleKnowledgeBase(id: string) {
  const scope = activeScope.value;
  const store = scope === 'lesson' ? selectedKnowledgeBaseIds.lesson : selectedKnowledgeBaseIds.general;
  const next = store.includes(id) ? store.filter((item) => item !== id) : [...store, id];
  if (scope === 'lesson') {
    selectedKnowledgeBaseIds.lesson = next;
  } else {
    selectedKnowledgeBaseIds.general = next;
  }
}

function welcomeMessage(scope: Scope) {
  const fallback =
    scope === 'lesson'
      ? '我是当前课程学案 AI 帮，会围绕当前课程、活动和课堂上下文来帮助你。'
      : '我是通用 AI 帮，可以帮助你处理平台使用、学习方法和课堂相关问题。';
  return bootstrap.value?.welcome_messages[scope]?.trim() || fallback;
}

/** 清空某作用域的消息：清空后展示欢迎页（吉祥物 + 建议问题），与技能一致 */
function resetScopeMessages(scope: Scope) {
  messagesRef(scope).value = [];
}

function applyBootstrap(payload: BootstrapPayload) {
  bootstrap.value = payload;
  if (payload.capabilities.streaming === false) {
    streamModeEnabled.value = false;
  }
  const providerIds = new Set(payload.providers.map((item) => item.id));
  if (selectedProviderId.value !== null && !providerIds.has(selectedProviderId.value)) {
    selectedProviderId.value = null;
  }
  selectedKnowledgeBaseIds.general = normalizeKnowledgeBaseIds(
    selectedKnowledgeBaseIds.general.length
      ? selectedKnowledgeBaseIds.general
      : payload.default_knowledge_base_ids.general,
    'general'
  );
  selectedKnowledgeBaseIds.lesson = normalizeKnowledgeBaseIds(
    selectedKnowledgeBaseIds.lesson.length
      ? selectedKnowledgeBaseIds.lesson
      : payload.default_knowledge_base_ids.lesson,
    'lesson'
  );
}

async function loadBootstrap() {
  if (!authStore.token) {
    return;
  }
  try {
    const payload = await apiGet<BootstrapPayload>('/assistants/companion/bootstrap', authStore.token);
    applyBootstrap(payload);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载 AI 帮配置失败');
  }
}

function applyContext(context: CompanionContext | null) {
  const previousKey = lessonRouteKey.value;
  currentContext.value = context;
  lessonRouteKey.value = context?.route_key || '';

  if (!context) {
    if (activeScope.value === 'lesson') {
      activeScope.value = 'general';
    }
    return;
  }
  if (bootstrap.value) {
    selectedKnowledgeBaseIds.lesson = normalizeKnowledgeBaseIds(
      context.recommended_knowledge_base_ids?.length
        ? context.recommended_knowledge_base_ids
        : bootstrap.value.default_knowledge_base_ids.lesson,
      'lesson'
    );
  }
  // 切到新的课程/学案上下文时清空学案会话，避免把上一份学案的问答带过来
  if (previousKey !== context.route_key) {
    resetScopeMessages('lesson');
  }
}

function contextQueryString(query: ContextQuery) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'number' && value > 0) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function loadContext() {
  if (!authStore.token) {
    applyContext(null);
    return;
  }
  const queryString = contextQueryString(props.contextQuery || {});
  if (!queryString) {
    applyContext(null);
    return;
  }
  try {
    const payload = await apiGet<{ context: CompanionContext | null }>(
      `/assistants/companion/context?${queryString}`,
      authStore.token
    );
    applyContext(payload.context);
  } catch {
    applyContext(null);
  }
}

function currentRequestContext(): ContextQuery {
  const identifiers = currentContext.value?.identifiers;
  if (!identifiers) {
    return props.contextQuery || {};
  }
  const query: ContextQuery = {};
  if (identifiers.course_id) query.course_id = identifiers.course_id;
  if (identifiers.task_id) query.task_id = identifiers.task_id;
  if (identifiers.plan_id) query.plan_id = identifiers.plan_id;
  if (identifiers.session_id) query.session_id = identifiers.session_id;
  return Object.keys(query).length ? query : props.contextQuery || {};
}

function abortCurrentRequest(showToast = true) {
  const controller = activeRequestController.value;
  if (!controller) {
    return;
  }
  activeRequestController.value = null;
  controller.abort();
  if (showToast) {
    ElMessage.info('已停止当前回复生成');
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

function fileExtension(name: string) {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

function isTextLikeFile(file: File) {
  if (file.type.startsWith('text/')) {
    return true;
  }
  return TEXT_FILE_EXTENSIONS.has(fileExtension(file.name));
}

function revokeAttachmentPreview(attachment: ComposerAttachment) {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

function clearAttachmentInput() {
  if (attachmentInputRef.value) {
    attachmentInputRef.value.value = '';
  }
}

function clearComposerAttachments() {
  for (const attachment of composerAttachments.value) {
    revokeAttachmentPreview(attachment);
  }
  composerAttachments.value = [];
  clearAttachmentInput();
}

function removeComposerAttachment(attachmentId: string) {
  const attachment = composerAttachments.value.find((item) => item.id === attachmentId);
  if (attachment) {
    revokeAttachmentPreview(attachment);
  }
  composerAttachments.value = composerAttachments.value.filter((item) => item.id !== attachmentId);
  clearAttachmentInput();
}

async function createComposerAttachment(file: File): Promise<ComposerAttachment> {
  const mimeType = file.type || 'application/octet-stream';
  const kind: ComposerAttachment['kind'] = mimeType.startsWith('image/')
    ? 'image'
    : isTextLikeFile(file)
      ? 'text'
      : 'file';

  const attachment: ComposerAttachment = {
    id: makeId('attachment'),
    file,
    name: file.name,
    mimeType,
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    kind,
    previewUrl: mimeType.startsWith('image/') ? URL.createObjectURL(file) : null,
    textContent: null,
    dataUrl: null,
  };

  if (attachment.kind === 'image' && file.size <= IMAGE_INLINE_LIMIT) {
    try {
      attachment.dataUrl = await readFileAsDataUrl(file);
    } catch {
      attachment.dataUrl = null;
    }
  }
  if (attachment.kind === 'text' && file.size <= TEXT_INLINE_LIMIT) {
    try {
      attachment.textContent = (await readFileAsText(file)).slice(0, 12000);
    } catch {
      attachment.textContent = null;
    }
  }
  return attachment;
}

async function handleAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const files = Array.from(input?.files || []);
  if (!files.length) {
    return;
  }
  const remainingSlots = Math.max(0, MAX_ATTACHMENTS - composerAttachments.value.length);
  if (!remainingSlots) {
    ElMessage.warning(`最多只能添加 ${MAX_ATTACHMENTS} 个附件`);
    clearAttachmentInput();
    return;
  }
  const acceptedFiles = files.slice(0, remainingSlots);
  if (acceptedFiles.length < files.length) {
    ElMessage.warning(`已超出附件上限，仅保留前 ${remainingSlots} 个新附件`);
  }
  const created = await Promise.all(acceptedFiles.map((file) => createComposerAttachment(file)));
  composerAttachments.value = [...composerAttachments.value, ...created];
  clearAttachmentInput();
}

function openAttachmentPicker() {
  attachmentInputRef.value?.click();
}

function chatAttachmentFromComposer(attachment: ComposerAttachment): ChatAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeKb: attachment.sizeKb,
    kind: attachment.kind,
  };
}

function payloadAttachmentFromComposer(attachment: ComposerAttachment) {
  return {
    name: attachment.name,
    mime_type: attachment.mimeType,
    size_kb: attachment.sizeKb,
    kind: attachment.kind,
    text_content: attachment.textContent,
    data_url: attachment.dataUrl,
  };
}

function buildRequestBody(
  scope: Scope,
  messageText: string,
  pendingAttachments: ComposerAttachment[],
  history: ChatMessage[]
) {
  return {
    scope,
    message: messageText,
    provider_id: selectedProviderId.value ?? undefined,
    thinking_enabled: thinkingModeEnabled.value,
    knowledge_base_ids: [...activeKnowledgeBaseIds.value],
    ...currentRequestContext(),
    attachments: pendingAttachments.map(payloadAttachmentFromComposer),
    conversation: history.map((item) => ({ role: item.role, content: item.content })),
  };
}

async function sendStream(
  scope: Scope,
  requestBody: ReturnType<typeof buildRequestBody>,
  signal: AbortSignal
) {
  if (!authStore.token) {
    throw new Error('请先登录后再使用小榉AI帮');
  }
  const assistantMessageId = makeId('message');
  messagesRef(scope).value = [
    ...messagesRef(scope).value,
    {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      providerName: selectedProvider.value?.name,
      providerMode: 'preview',
      streaming: true,
      reasoningContent: '',
      reasoningStreaming: thinkingModeEnabled.value,
    },
  ];
  scrollToBottom();

  try {
    const donePayload = await streamCompanionReply<ReplyPayload>(
      `${COMPANION_API_BASE_URL}/assistants/companion/respond/stream`,
      {
        body: { ...requestBody, stream: true },
        token: authStore.token,
        signal,
        onToken: (text) => {
          updateMessageById(scope, assistantMessageId, (message) => ({
            ...message,
            content: `${message.content}${text}`,
          }));
        },
        onReasoning: (text) => {
          updateMessageById(scope, assistantMessageId, (message) => ({
            ...message,
            reasoningContent: `${message.reasoningContent || ''}${text}`,
            reasoningStreaming: true,
          }));
        },
      }
    );

    if (bootstrap.value) {
      bootstrap.value.active_provider = donePayload.active_provider;
    }
    applyContext(donePayload.context);
    updateMessageById(scope, assistantMessageId, (message) => ({
      ...message,
      content: donePayload.reply.content || message.content,
      createdAt: donePayload.reply.created_at || message.createdAt,
      providerName: donePayload.reply.provider_name,
      providerMode: donePayload.reply.provider_mode,
      warning: donePayload.reply.warning,
      streaming: false,
      reasoningContent: donePayload.reply.reasoning_content || message.reasoningContent || null,
      reasoningStreaming: false,
    }));
  } catch (error) {
    if (isAbortError(error)) {
      const partial = messagesRef(scope).value.find((item) => item.id === assistantMessageId);
      if (partial?.content.trim() || partial?.reasoningContent?.trim()) {
        updateMessageById(scope, assistantMessageId, (message) => ({
          ...message,
          warning: '已停止生成',
          streaming: false,
          reasoningStreaming: false,
        }));
      } else {
        messagesRef(scope).value = messagesRef(scope).value.filter(
          (item) => item.id !== assistantMessageId
        );
      }
    } else {
      messagesRef(scope).value = messagesRef(scope).value.filter(
        (item) => item.id !== assistantMessageId
      );
    }
    throw error;
  }
}

async function sendCurrentMessage() {
  if (!authStore.token) {
    ElMessage.warning('请先登录后再使用小榉AI帮');
    return;
  }
  if (!bootstrap.value) {
    await loadBootstrap();
    if (!bootstrap.value) {
      return;
    }
  }
  if (activeScope.value === 'lesson' && !currentContext.value) {
    ElMessage.warning('当前页面还没有课程或学案上下文');
    return;
  }

  const messageText = draftMessage.value.trim();
  const pendingAttachments = [...composerAttachments.value];
  if (!messageText && !pendingAttachments.length) {
    return;
  }

  const scope = activeScope.value;
  const history = [...messagesRef(scope).value];
  messagesRef(scope).value = [
    ...history,
    {
      id: makeId('message'),
      role: 'user',
      content: messageText || '请结合附件一起分析。',
      createdAt: new Date().toISOString(),
      attachments: pendingAttachments.map(chatAttachmentFromComposer),
    },
  ];
  draftMessage.value = '';
  clearComposerAttachments();
  isSending.value = true;
  const controller = new AbortController();
  activeRequestController.value = controller;
  scrollToBottom();

  const requestBody = buildRequestBody(scope, messageText, pendingAttachments, history);
  const useStreaming = streamModeEnabled.value && streamCapable.value;

  try {
    if (useStreaming) {
      await sendStream(scope, requestBody, controller.signal);
    } else {
      const response = await apiPost<ReplyPayload>(
        '/assistants/companion/respond',
        requestBody,
        authStore.token,
        controller.signal
      );
      if (bootstrap.value) {
        bootstrap.value.active_provider = response.active_provider;
      }
      applyContext(response.context);
      messagesRef(scope).value = [
        ...messagesRef(scope).value,
        {
          id: makeId('message'),
          role: 'assistant',
          content: response.reply.content,
          createdAt: response.reply.created_at,
          providerName: response.reply.provider_name,
          providerMode: response.reply.provider_mode,
          warning: response.reply.warning,
          streaming: false,
          reasoningContent: response.reply.reasoning_content,
          reasoningStreaming: false,
        },
      ];
    }
  } catch (error) {
    if (isAbortError(error)) {
      if (!useStreaming) {
        messagesRef(scope).value = [
          ...messagesRef(scope).value,
          {
            id: makeId('message'),
            role: 'assistant',
            content: '本次回复已停止。',
            createdAt: new Date().toISOString(),
            warning: '已停止生成',
            streaming: false,
            reasoningContent: null,
            reasoningStreaming: false,
          },
        ];
      }
      return;
    }
    const message = error instanceof Error ? error.message : '发送失败，请稍后重试';
    messagesRef(scope).value = [
      ...messagesRef(scope).value,
      {
        id: makeId('message'),
        role: 'assistant',
        content: `发送失败：${message}`,
        createdAt: new Date().toISOString(),
        warning: message,
        streaming: false,
        reasoningContent: null,
        reasoningStreaming: false,
      },
    ];
    ElMessage.error(message);
  } finally {
    isSending.value = false;
    if (activeRequestController.value === controller) {
      activeRequestController.value = null;
    }
    scrollToBottom();
  }
}

function stopSpeechPlayback() {
  if (speechAudio) {
    speechAudio.onended = null;
    speechAudio.onerror = null;
    speechAudio.pause();
    speechAudio.src = '';
    speechAudio = null;
  }
  if (speechObjectUrl) {
    URL.revokeObjectURL(speechObjectUrl);
    speechObjectUrl = null;
  }
  speechMessageId.value = null;
  speechLoadingMessageId.value = null;
}

function markdownToSpeechText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, '（代码略）')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speechButtonLabel(message: ChatMessage) {
  if (speechLoadingMessageId.value === message.id) {
    return '合成中…';
  }
  return speechMessageId.value === message.id ? '停止朗读' : '朗读';
}

async function toggleMessageSpeech(message: ChatMessage) {
  if (speechLoadingMessageId.value === message.id) {
    return;
  }
  if (speechMessageId.value === message.id) {
    stopSpeechPlayback();
    return;
  }
  stopSpeechPlayback();

  const speechText = markdownToSpeechText(message.content || '');
  if (!speechText) {
    ElMessage.warning('当前回复没有可朗读的文本');
    return;
  }
  if (!authStore.token) {
    ElMessage.warning('请先登录后再使用朗读');
    return;
  }

  speechLoadingMessageId.value = message.id;
  try {
    const response = await apiPostBlob(
      '/assistants/companion/tts',
      { text: speechText },
      authStore.token
    );
    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('朗读服务未返回音频');
    }
    speechObjectUrl = URL.createObjectURL(blob);
    speechAudio = new Audio(speechObjectUrl);
    speechAudio.onended = () => stopSpeechPlayback();
    speechAudio.onerror = () => {
      ElMessage.error('朗读播放失败，请重试');
      stopSpeechPlayback();
    };
    speechMessageId.value = message.id;
    await speechAudio.play();
  } catch (error) {
    stopSpeechPlayback();
    ElMessage.error(error instanceof Error ? error.message : '朗读失败，请稍后重试');
  } finally {
    speechLoadingMessageId.value = null;
  }
}

function resetConversation() {
  abortCurrentRequest(false);
  stopSpeechPlayback();
  settingsOpen.value = false;
  resetScopeMessages(activeScope.value);
  scrollToBottom();
}

function handleConfigUpdated() {
  if (authStore.token) {
    void loadBootstrap();
  }
}

void loadBootstrap();
void loadContext();

watch(
  () => props.contextQuery,
  () => {
    abortCurrentRequest(false);
    void loadContext();
  },
  { deep: true }
);

window.addEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleConfigUpdated);
window.addEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleConfigUpdated);

onBeforeUnmount(() => {
  abortCurrentRequest(false);
  stopSpeechPlayback();
  window.removeEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleConfigUpdated);
  window.removeEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleConfigUpdated);
  clearComposerAttachments();
});
</script>

<style scoped>
.ju-native-select {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--ju-border);
  border-radius: var(--ju-radius-sm);
  background: var(--ju-surface);
  color: var(--ju-ink);
  font-family: var(--ls-font);
  font-size: 13px;
  outline: none;
}

.ju-native-select:focus {
  border-color: var(--ju-brand);
  box-shadow: var(--ls-focus-ring);
}

.ju-switch {
  display: inline-flex;
  align-items: center;
  width: 38px;
  height: 22px;
  padding: 2px;
  border-radius: 999px;
  background: var(--ju-border);
  cursor: pointer;
  transition: background 0.16s ease;
  flex: 0 0 auto;
}

.ju-switch.on { background: var(--ju-brand); }

.ju-switch i {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);
  transition: transform 0.16s ease;
}

.ju-switch.on i { transform: translateX(16px); }

.ju-kb-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.ju-kb-chip {
  padding: 5px 10px;
  border: 1px solid var(--ju-border);
  border-radius: 999px;
  background: var(--ju-surface);
  color: var(--ju-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.14s ease;
}

.ju-kb-chip:hover { border-color: var(--ju-brand); color: var(--ju-brand); }
.ju-kb-chip.on { background: var(--ju-brand-soft); border-color: var(--ju-brand); color: var(--ju-brand); }

.ju-textarea {
  flex: 1 1 auto;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  font-family: var(--ls-font);
  font-size: 13px;
  line-height: 1.6;
  max-height: 132px;
  padding: 6px 0;
  color: var(--ju-ink);
}

.file-input {
  display: none;
}
</style>
