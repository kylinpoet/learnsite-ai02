<template>
  <div v-if="shouldRender" class="ai-companion-root">
    <button
      ref="fabRef"
      class="ai-fab"
      :class="{ 'is-dragging': dragState.active }"
      :style="fabStyle"
      type="button"
      @keydown.enter.prevent="drawerVisible = true"
      @keydown.space.prevent="drawerVisible = true"
      @pointerdown="handleFabPointerDown"
    >
      <span class="ai-fab__halo"></span>
      <span class="ai-fab__icon">AI</span>
      <span class="ai-fab__copy">
        <strong>AI 学伴</strong>
        <small>{{ lessonModeAvailable ? '通用 + 当前学案' : '通用模式' }}</small>
      </span>
    </button>

    <el-drawer
      v-model="drawerVisible"
      :size="drawerSize"
      :with-header="false"
      append-to-body
      direction="rtl"
    >
      <div class="ai-panel">
        <header class="ai-panel__hero">
          <div>
            <p class="ai-panel__eyebrow">AI Learning Buddy</p>
            <h3>AI 学伴</h3>
            <p class="ai-panel__copy">
              支持通用问答、当前课程学案上下文、多模态附件，以及知识库切换。
            </p>
          </div>
          <div class="ai-panel__hero-tags">
            <el-tag round>{{ activeProviderLabel }}</el-tag>
            <el-tag v-if="lessonModeAvailable" round type="success">已识别当前学案</el-tag>
          </div>
        </header>

        <el-alert
          v-if="bootstrapError"
          :closable="false"
          :title="bootstrapError"
          type="error"
        />

        <template v-if="bootstrapLoading">
          <div class="soft-card ai-loading-card">
            <el-skeleton animated>
              <template #template>
                <el-skeleton :rows="10" />
              </template>
            </el-skeleton>
          </div>
        </template>

        <template v-else-if="bootstrap">
          <el-tabs v-model="activeScope" class="ai-tabs">
            <el-tab-pane label="通用学伴" name="general" />
            <el-tab-pane
              :disabled="!lessonModeAvailable"
              label="当前课程学案学伴"
              name="lesson"
            />
          </el-tabs>

          <section
            v-if="activeScope === 'lesson' && currentContext"
            class="soft-card ai-context-card"
          >
            <div class="ai-context-card__head">
              <div>
                <p class="ai-context-card__kicker">{{ contextKindLabel(currentContext.kind) }}</p>
                <h4>{{ currentContext.title }}</h4>
              </div>
              <el-tag round type="warning">{{ currentContext.lesson.unit_title }}</el-tag>
            </div>
            <p class="ai-context-card__subtitle">{{ currentContext.subtitle }}</p>
            <p v-if="currentContext.description" class="section-note">
              {{ currentContext.description }}
            </p>
            <p class="section-note">{{ currentContext.prompt_hint }}</p>
          </section>

          <section class="soft-card ai-settings-card">
            <div class="ai-settings-card__head">
              <div>
                <h4>知识库</h4>
                <p class="section-note">当前回复会优先参考你选择的知识库。</p>
              </div>
              <el-tag round type="info">
                {{ activeScope === 'lesson' ? '学案模式' : '通用模式' }}
              </el-tag>
            </div>
            <div class="ai-provider-field">
              <div class="ai-provider-field__head">
                <h4>模型服务</h4>
                <p class="section-note">默认跟随系统配置，也可临时切换当前会话使用的模型。</p>
              </div>
              <el-select
                v-model="selectedProviderId"
                class="full-width"
                clearable
                :disabled="!bootstrap.providers.length"
                :value-on-clear="null"
                placeholder="跟随系统默认模型服务"
              >
                <el-option
                  v-for="item in bootstrap.providers"
                  :key="item.id"
                  :label="`${item.name} · ${item.model_name}`"
                  :value="item.id"
                />
              </el-select>
              <p v-if="!bootstrap.providers.length" class="section-note">
                当前未启用外部模型服务，将使用系统默认学伴。
              </p>
            </div>
            <div class="ai-provider-field">
              <div class="ai-provider-field__head">
                <h4>回复模式</h4>
                <p class="section-note">可切换流式输出（逐段生成）或标准输出（一次返回）。</p>
              </div>
              <el-switch
                v-model="streamModeEnabled"
                :disabled="!streamCapabilityEnabled"
                active-text="流式"
                inactive-text="标准"
              />
            </div>
            <el-select
              v-model="activeKnowledgeBaseIds"
              class="full-width"
              collapse-tags
              collapse-tags-tooltip
              multiple
              placeholder="请选择知识库"
            >
              <el-option
                v-for="item in visibleKnowledgeBases"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              >
                <div class="ai-knowledge-option">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.description }}</span>
                </div>
              </el-option>
            </el-select>
          </section>

          <section class="ai-chat-shell">
            <div ref="messageListRef" class="ai-chat-list">
              <template v-if="activeMessages.length">
                <article
                  v-for="message in activeMessages"
                  :key="message.id"
                  class="ai-chat-item"
                  :class="message.role === 'assistant' ? 'is-assistant' : 'is-user'"
                >
                  <div class="ai-chat-bubble">
                    <div class="ai-chat-bubble__meta">
                      <span>{{ message.role === 'assistant' ? 'AI 学伴' : '我' }}</span>
                      <small>{{ formatMessageTime(message.createdAt) }}</small>
                    </div>
                    <p class="ai-chat-bubble__text">{{ message.content }}</p>
                    <div
                      v-if="message.attachments?.length"
                      class="ai-chat-attachments"
                    >
                      <span
                        v-for="attachment in message.attachments"
                        :key="attachment.id"
                        class="ai-chat-attachment"
                      >
                        {{ attachment.name }} · {{ attachmentKindLabel(attachment.kind) }}
                      </span>
                    </div>
                    <p
                      v-if="message.role === 'assistant' && (message.providerName || message.warning)"
                      class="ai-chat-bubble__footnote"
                    >
                      {{ assistantFootnote(message) }}
                    </p>
                  </div>
                </article>
              </template>

              <el-empty
                v-else-if="activeScope === 'lesson' && !currentContext"
                description="当前页面还没有可绑定的课程或学案上下文"
              />

              <div v-else class="soft-card ai-starter-card">
                <h4>你可以这样开始</h4>
                <div class="ai-starter-card__actions">
                  <el-button
                    v-for="question in activeStarterQuestions"
                    :key="question"
                    plain
                    round
                    size="small"
                    @click="applyStarterQuestion(question)"
                  >
                    {{ question }}
                  </el-button>
                </div>
              </div>
            </div>

            <section class="soft-card ai-composer">
              <div class="ai-composer__head">
                <div>
                  <h4>{{ activeScope === 'lesson' ? '当前学案提问' : '通用提问' }}</h4>
                  <p class="section-note">
                    支持图片、文本、文档等附件，图片会附带多模态预览。
                  </p>
                </div>
                <div class="chip-row">
                  <el-button plain @click="openAttachmentPicker">添加附件</el-button>
                  <el-button
                    v-if="composerAttachments.length"
                    plain
                    type="danger"
                    @click="clearComposerAttachments"
                  >
                    清空附件
                  </el-button>
                </div>
              </div>

              <input
                ref="attachmentInputRef"
                class="file-input"
                multiple
                type="file"
                @change="handleAttachmentChange"
              />

              <div
                v-if="composerAttachments.length"
                class="ai-composer__attachment-list"
              >
                <article
                  v-for="attachment in composerAttachments"
                  :key="attachment.id"
                  class="ai-composer__attachment"
                >
                  <img
                    v-if="attachment.previewUrl"
                    :alt="attachment.name"
                    :src="attachment.previewUrl"
                    class="ai-composer__attachment-preview"
                  />
                  <div class="ai-composer__attachment-meta">
                    <strong>{{ attachment.name }}</strong>
                    <span>
                      {{ attachmentKindLabel(attachment.kind) }} · {{ attachment.sizeKb }} KB
                    </span>
                    <small v-if="attachment.textContent">已提取文本片段</small>
                    <small v-else-if="attachment.dataUrl">已生成多模态图片内容</small>
                    <small v-else>将只发送文件元数据</small>
                  </div>
                  <el-button
                    link
                    type="danger"
                    @click="removeComposerAttachment(attachment.id)"
                  >
                    移除
                  </el-button>
                </article>
              </div>

              <el-input
                v-model="draftMessage"
                :autosize="{ minRows: 4, maxRows: 8 }"
                resize="none"
                type="textarea"
                @keydown.ctrl.enter.prevent="sendCurrentMessage"
                @keydown.meta.enter.prevent="sendCurrentMessage"
              />

              <div class="ai-composer__footer">
                <span class="section-note ai-composer__shortcut">`Ctrl/Cmd + Enter` 发送</span>
                <div class="ai-composer__actions">
                  <el-button
                    v-if="canAbort"
                    plain
                    type="danger"
                    @click="abortCurrentRequest"
                  >
                    停止生成
                  </el-button>
                  <el-button
                    :disabled="sendDisabled"
                    :loading="isSending"
                    type="primary"
                    @click="sendCurrentMessage"
                  >
                    发送
                  </el-button>
                </div>
              </div>
            </section>
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type Scope = 'general' | 'lesson';
type ContextQuery = Partial<Record<'course_id' | 'task_id' | 'plan_id' | 'session_id', number>>;
type FabPosition = { x: number; y: number };
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
  lesson: {
    id: number;
    title: string;
    unit_title: string;
    book_title: string;
  };
  classroom: {
    id: number;
    name: string;
    status: string;
    started_at: string;
  } | null;
  tasks: Array<{
    id: number;
    title: string;
    task_type: string;
    sort_order: number;
    is_required: boolean;
  }>;
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
  };
  active_provider: CompanionProvider | null;
  context: CompanionContext | null;
};

type StreamTokenPayload = {
  text?: string;
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
};

const FAB_STORAGE_KEY = 'learnsite-ai-companion-fab-position';
const AI_PROVIDER_CONFIG_UPDATED_EVENT = 'learnsite:ai-provider-config-updated';
const ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT = 'learnsite:assistant-runtime-config-updated';
const IMAGE_INLINE_LIMIT = 1536 * 1024;
const TEXT_INLINE_LIMIT = 128 * 1024;
const MAX_ATTACHMENTS = 8;
const DRAG_THRESHOLD = 6;
const FAB_PADDING = 16;
const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'tsv',
  'json',
  'html',
  'htm',
  'css',
  'js',
  'ts',
  'py',
  'java',
  'cpp',
  'c',
  'sql',
  'yaml',
  'yml',
]);
const COMPANION_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const route = useRoute();
const authStore = useAuthStore();
const fabRef = ref<HTMLButtonElement | null>(null);
const drawerVisible = ref(false);
const bootstrap = ref<BootstrapPayload | null>(null);
const bootstrapLoading = ref(false);
const bootstrapError = ref('');
const currentContext = ref<CompanionContext | null>(null);
const activeScope = ref<Scope>('general');
const generalMessages = ref<ChatMessage[]>([]);
const lessonMessages = ref<ChatMessage[]>([]);
const lessonRouteKey = ref('');
const draftMessage = ref('');
const composerAttachments = ref<ComposerAttachment[]>([]);
const attachmentInputRef = ref<HTMLInputElement | null>(null);
const messageListRef = ref<HTMLDivElement | null>(null);
const isSending = ref(false);
const activeRequestController = ref<AbortController | null>(null);
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth);
const viewportHeight = ref(typeof window === 'undefined' ? 720 : window.innerHeight);
const selectedKnowledgeBaseIds = reactive({
  general: [] as string[],
  lesson: [] as string[],
});
const selectedProviderId = ref<number | null>(null);
const streamModeEnabled = ref(true);
const fabPosition = ref<FabPosition | null>(null);
const dragState = reactive({
  active: false,
  moved: false,
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
});

const shouldRender = computed(() => {
  const inWorkspace = route.path.startsWith('/student') || route.path.startsWith('/staff');
  if (!inWorkspace || !authStore.token) {
    return false;
  }
  return bootstrap.value ? bootstrap.value.enabled : true;
});

const lessonModeAvailable = computed(() => Boolean(currentContext.value));

const activeMessages = computed(() =>
  activeScope.value === 'lesson' ? lessonMessages.value : generalMessages.value
);
const streamCapabilityEnabled = computed(() => bootstrap.value?.capabilities.streaming ?? true);

const selectedProvider = computed(() => {
  if (!bootstrap.value || selectedProviderId.value === null) {
    return null;
  }
  return bootstrap.value.providers.find((item) => item.id === selectedProviderId.value) || null;
});

const activeProviderLabel = computed(() => {
  if (selectedProvider.value?.name) {
    return selectedProvider.value.name;
  }
  if (bootstrap.value?.active_provider?.name) {
    return bootstrap.value.active_provider.name;
  }
  const lastAssistant = [...activeMessages.value]
    .reverse()
    .find((message) => message.role === 'assistant' && message.providerName);
  if (lastAssistant?.providerName) {
    return lastAssistant.providerMode === 'preview'
      ? `${lastAssistant.providerName} · 系统模式`
      : lastAssistant.providerName;
  }
  return '系统默认学伴';
});

const drawerSize = computed(() => {
  if (viewportWidth.value < 768) {
    return '100%';
  }
  if (viewportWidth.value < 1200) {
    return '640px';
  }
  return '720px';
});

const activeKnowledgeBaseIds = computed<string[]>({
  get() {
    return activeScope.value === 'lesson'
      ? selectedKnowledgeBaseIds.lesson
      : selectedKnowledgeBaseIds.general;
  },
  set(value) {
    const normalized = normalizeKnowledgeBaseIds(value, activeScope.value);
    if (activeScope.value === 'lesson') {
      selectedKnowledgeBaseIds.lesson = normalized;
      return;
    }
    selectedKnowledgeBaseIds.general = normalized;
  },
});

const visibleKnowledgeBases = computed(() =>
  (bootstrap.value?.knowledge_bases || []).filter((item) => item.scopes.includes(activeScope.value))
);

const activeStarterQuestions = computed(() => {
  if (activeScope.value === 'lesson' && currentContext.value?.suggested_questions?.length) {
    return currentContext.value.suggested_questions;
  }
  return bootstrap.value?.starter_questions[activeScope.value] || [];
});

const sendDisabled = computed(
  () =>
    isSending.value ||
    bootstrapLoading.value ||
    (!draftMessage.value.trim() && composerAttachments.value.length === 0)
);

const canAbort = computed(() => isSending.value && activeRequestController.value !== null);

const fabStyle = computed(() => {
  const position = fabPosition.value ?? defaultFabPosition();
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
  };
});

function makeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
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

function asPositiveInt(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return undefined;
}

function contextQueryFromRoute(): ContextQuery {
  const query: ContextQuery = {};
  const courseId = asPositiveInt(route.params.courseId) ?? asPositiveInt(route.query.courseId);
  const taskId = asPositiveInt(route.params.taskId) ?? asPositiveInt(route.query.taskId);
  const planId = asPositiveInt(route.params.planId) ?? asPositiveInt(route.query.planId);
  const sessionId =
    asPositiveInt(route.params.sessionId) ?? asPositiveInt(route.query.sessionId);

  if (courseId) {
    query.course_id = courseId;
  }
  if (taskId) {
    query.task_id = taskId;
  }
  if (planId) {
    query.plan_id = planId;
  }
  if (sessionId) {
    query.session_id = sessionId;
  }
  return query;
}

function hasContextQuery(query: ContextQuery) {
  return Object.values(query).some((value) => typeof value === 'number' && value > 0);
}

function buildContextQueryString(query: ContextQuery) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'number' && value > 0) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

function currentRequestContext(): ContextQuery {
  const identifiers = currentContext.value?.identifiers;
  if (!identifiers) {
    return contextQueryFromRoute();
  }

  const query: ContextQuery = {};
  if (identifiers.course_id) {
    query.course_id = identifiers.course_id;
  }
  if (identifiers.task_id) {
    query.task_id = identifiers.task_id;
  }
  if (identifiers.plan_id) {
    query.plan_id = identifiers.plan_id;
  }
  if (identifiers.session_id) {
    query.session_id = identifiers.session_id;
  }
  return hasContextQuery(query) ? query : contextQueryFromRoute();
}

function contextKindLabel(kind: CompanionContext['kind']) {
  if (kind === 'task') {
    return '当前任务';
  }
  if (kind === 'session') {
    return '当前课堂';
  }
  if (kind === 'plan') {
    return '当前学案';
  }
  return '当前课程';
}

function attachmentKindLabel(kind: ComposerAttachment['kind']) {
  if (kind === 'image') {
    return '图片';
  }
  if (kind === 'text') {
    return '文本';
  }
  return '文件';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ').slice(11, 16);
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
    2,
    '0'
  )}`;
}

function assistantFootnote(message: ChatMessage) {
  const parts: string[] = [];
  if (message.providerName) {
    parts.push(
      message.providerMode === 'preview'
        ? `${message.providerName} · 系统模式`
        : message.providerName
    );
  }
  if (message.warning) {
    parts.push(message.warning);
  }
  return parts.join(' | ');
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file as data URL'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file as text'));
    reader.readAsText(file);
  });
}

function fileExtension(name: string) {
  const index = name.lastIndexOf('.');
  if (index < 0) {
    return '';
  }
  return name.slice(index + 1).toLowerCase();
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

async function createComposerAttachment(file: File) {
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

  const createdAttachments = await Promise.all(
    acceptedFiles.map((file) => createComposerAttachment(file))
  );
  composerAttachments.value = [...composerAttachments.value, ...createdAttachments];
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

function messagesRef(scope: Scope) {
  return scope === 'lesson' ? lessonMessages : generalMessages;
}

function buildCompanionRequestBody(
  scope: Scope,
  messageText: string,
  pendingAttachments: ComposerAttachment[],
  history: ChatMessage[],
) {
  return {
    scope,
    message: messageText,
    provider_id: selectedProviderId.value ?? undefined,
    knowledge_base_ids: [...activeKnowledgeBaseIds.value],
    ...currentRequestContext(),
    attachments: pendingAttachments.map(payloadAttachmentFromComposer),
    conversation: history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
  };
}

async function readCompanionStreamError(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return payload.detail || payload.message || `请求失败：${response.status}`;
  }
  const text = await response.text();
  return text || `请求失败：${response.status}`;
}

function parseSseBlock(block: string) {
  const lines = block.replace(/\r/g, '').split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) {
    return null;
  }
  return {
    event: eventName,
    data: dataLines.join('\n'),
  };
}

function updateMessageById(scope: Scope, id: string, updater: (message: ChatMessage) => ChatMessage) {
  const store = messagesRef(scope);
  store.value = store.value.map((message) => (message.id === id ? updater(message) : message));
}

async function sendCompanionMessageStream(
  scope: Scope,
  requestBody: ReturnType<typeof buildCompanionRequestBody>,
  signal: AbortSignal,
) {
  if (!authStore.token) {
    throw new Error('请先登录后再使用 AI 学伴');
  }

  const assistantMessageId = makeId('message');
  const initialMessage: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    providerName: selectedProvider.value?.name,
    providerMode: 'preview',
  };
  messagesRef(scope).value = [...messagesRef(scope).value, initialMessage];
  await scrollMessagesToBottom();

  try {
    const response = await fetch(`${COMPANION_API_BASE_URL}/assistants/companion/respond/stream`, {
      method: 'POST',
      signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({
        ...requestBody,
        stream: true,
      }),
    });
    if (!response.ok) {
      const errorMessage = await readCompanionStreamError(response);
      throw new Error(errorMessage);
    }
    if (!response.body) {
      throw new Error('流式响应不可用，请稍后重试');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let donePayload: ReplyPayload | null = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawBlock = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseBlock(rawBlock);
        if (parsed) {
          if (parsed.event === 'token') {
            try {
              const tokenPayload = JSON.parse(parsed.data) as StreamTokenPayload;
              if (tokenPayload.text) {
                updateMessageById(scope, assistantMessageId, (message) => ({
                  ...message,
                  content: `${message.content}${tokenPayload.text}`,
                }));
              }
            } catch {
              // ignore malformed token event
            }
          }
          if (parsed.event === 'done') {
            try {
              donePayload = JSON.parse(parsed.data) as ReplyPayload;
            } catch {
              donePayload = null;
            }
          }
        }
        boundary = buffer.indexOf('\n\n');
      }

      if (done) {
        break;
      }
    }

    if (!donePayload) {
      throw new Error('流式响应中断，请稍后重试');
    }

    if (bootstrap.value) {
      bootstrap.value.active_provider = donePayload.active_provider;
      if (
        selectedProviderId.value !== null
        && donePayload.active_provider?.id !== selectedProviderId.value
      ) {
        selectedProviderId.value = donePayload.active_provider?.id ?? null;
      }
    }
    applyContext(donePayload.context);

    updateMessageById(scope, assistantMessageId, (message) => ({
      ...message,
      content: donePayload?.reply.content || message.content,
      createdAt: donePayload?.reply.created_at || message.createdAt,
      providerName: donePayload?.reply.provider_name,
      providerMode: donePayload?.reply.provider_mode,
      warning: donePayload?.reply.warning,
    }));
  } catch (error) {
    if (isAbortError(error)) {
      const partialMessage = messagesRef(scope).value.find((item) => item.id === assistantMessageId);
      if (partialMessage?.content.trim()) {
        updateMessageById(scope, assistantMessageId, (message) => ({
          ...message,
          warning: '已停止生成',
        }));
      } else {
        messagesRef(scope).value = messagesRef(scope).value.filter((item) => item.id !== assistantMessageId);
      }
    } else {
      messagesRef(scope).value = messagesRef(scope).value.filter((item) => item.id !== assistantMessageId);
    }
    throw error;
  }
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

function welcomeMessage(scope: Scope) {
  const fallback =
    scope === 'lesson'
      ? '我是当前课程学案 AI 学伴，会围绕当前课程、任务和课堂上下文来帮助你。'
      : '我是通用 AI 学伴，可以帮助你处理平台使用、学习方法和课堂相关问题。';
  const baseMessage = bootstrap.value?.welcome_messages[scope]?.trim() || fallback;

  if (scope === 'lesson') {
    if (currentContext.value) {
      return `${baseMessage}\n\n已识别当前上下文：${currentContext.value.title}\n${currentContext.value.prompt_hint}`;
    }
    return `${baseMessage}\n\n当前页面还没有可绑定的课程或学案上下文。`;
  }

  return baseMessage;
}

function ensureScopeMessages(scope: Scope, force = false) {
  const store = messagesRef(scope);
  if (store.value.length && !force) {
    return;
  }
  store.value = [
    {
      id: makeId('message'),
      role: 'assistant',
      content: welcomeMessage(scope),
      createdAt: new Date().toISOString(),
    },
  ];
}

function applyStarterQuestion(question: string) {
  draftMessage.value = question;
}

async function scrollMessagesToBottom() {
  await nextTick();
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  }
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
  ensureScopeMessages('general');
  ensureScopeMessages('lesson', Boolean(currentContext.value && lessonRouteKey.value));
}

async function loadBootstrap() {
  if (!authStore.token) {
    return;
  }

  bootstrapLoading.value = true;
  bootstrapError.value = '';

  try {
    const payload = await apiGet<BootstrapPayload>('/assistants/companion/bootstrap', authStore.token);
    applyBootstrap(payload);
    if (!payload.enabled) {
      drawerVisible.value = false;
    }
  } catch (error) {
    bootstrapError.value = error instanceof Error ? error.message : '加载 AI 学伴配置失败';
  } finally {
    bootstrapLoading.value = false;
  }
}

function handleProviderConfigUpdated() {
  if (!authStore.token) {
    return;
  }
  void loadBootstrap();
}

function applyContext(context: CompanionContext | null) {
  const previousKey = lessonRouteKey.value;
  currentContext.value = context;
  lessonRouteKey.value = context?.route_key || '';

  if (!context) {
    if (activeScope.value === 'lesson') {
      activeScope.value = 'general';
    }
    ensureScopeMessages('lesson', previousKey !== '');
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

  if (previousKey !== context.route_key) {
    ensureScopeMessages('lesson', true);
  }
}

async function loadContextForCurrentRoute() {
  if (!authStore.token) {
    applyContext(null);
    return;
  }

  const query = contextQueryFromRoute();
  if (!hasContextQuery(query)) {
    applyContext(null);
    return;
  }

  try {
    const queryString = buildContextQueryString(query);
    const payload = await apiGet<{ context: CompanionContext | null }>(
      `/assistants/companion/context?${queryString}`,
      authStore.token
    );
    applyContext(payload.context);
  } catch {
    applyContext(null);
  }
}

async function sendCurrentMessage() {
  if (!authStore.token) {
    ElMessage.warning('请先登录后再使用 AI 学伴');
    return;
  }

  if (!bootstrap.value) {
    await loadBootstrap();
    if (!bootstrap.value) {
      return;
    }
  }

  if (activeScope.value === 'lesson' && !currentContext.value) {
    ElMessage.warning('当前页面还没有课程或学案上下文，请先切换到相关页面');
    return;
  }

  const messageText = draftMessage.value.trim();
  const pendingAttachments = [...composerAttachments.value];
  if (!messageText && !pendingAttachments.length) {
    return;
  }

  const scope = activeScope.value;
  const history = [...messagesRef(scope).value];
  const userMessage: ChatMessage = {
    id: makeId('message'),
    role: 'user',
    content: messageText || '请结合附件一起分析。',
    createdAt: new Date().toISOString(),
    attachments: pendingAttachments.map(chatAttachmentFromComposer),
  };

  messagesRef(scope).value = [...history, userMessage];
  draftMessage.value = '';
  clearComposerAttachments();
  isSending.value = true;
  const controller = new AbortController();
  activeRequestController.value = controller;
  await scrollMessagesToBottom();
  const requestBody = buildCompanionRequestBody(scope, messageText, pendingAttachments, history);
  const useStreaming = streamModeEnabled.value && streamCapabilityEnabled.value;

  try {
    if (useStreaming) {
      await sendCompanionMessageStream(scope, requestBody, controller.signal);
    } else {
      const response = await apiPost<ReplyPayload>(
        '/assistants/companion/respond',
        requestBody,
        authStore.token,
        controller.signal
      );

      if (bootstrap.value) {
        bootstrap.value.active_provider = response.active_provider;
        if (
          selectedProviderId.value !== null
          && response.active_provider?.id !== selectedProviderId.value
        ) {
          selectedProviderId.value = response.active_provider?.id ?? null;
        }
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
      },
    ];
    ElMessage.error(message);
  } finally {
    isSending.value = false;
    if (activeRequestController.value === controller) {
      activeRequestController.value = null;
    }
    await scrollMessagesToBottom();
  }
}

function fabSize() {
  return {
    width: fabRef.value?.offsetWidth || 132,
    height: fabRef.value?.offsetHeight || 68,
  };
}

function clampFabPosition(position: FabPosition) {
  const { width, height } = fabSize();
  const maxX = Math.max(FAB_PADDING, viewportWidth.value - width - FAB_PADDING);
  const maxY = Math.max(FAB_PADDING, viewportHeight.value - height - FAB_PADDING);
  return {
    x: Math.min(Math.max(FAB_PADDING, position.x), maxX),
    y: Math.min(Math.max(FAB_PADDING, position.y), maxY),
  };
}

function defaultFabPosition() {
  const { width, height } = fabSize();
  return clampFabPosition({
    x: viewportWidth.value - width - 24,
    y: viewportHeight.value - height - 28,
  });
}

function readStoredFabPosition() {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(FAB_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return clampFabPosition({ x: parsed.x, y: parsed.y });
    }
  } catch {
    return null;
  }
  return null;
}

function persistFabPosition() {
  if (typeof window === 'undefined' || !fabPosition.value) {
    return;
  }
  window.localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(fabPosition.value));
}

function ensureFabPosition() {
  fabPosition.value = readStoredFabPosition() ?? defaultFabPosition();
}

function handleWindowResize() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
  fabPosition.value = clampFabPosition(fabPosition.value ?? defaultFabPosition());
  persistFabPosition();
}

function endDrag() {
  if (dragState.pointerId !== null && fabRef.value?.hasPointerCapture(dragState.pointerId)) {
    fabRef.value.releasePointerCapture(dragState.pointerId);
  }
  dragState.active = false;
  dragState.moved = false;
  dragState.pointerId = null;
}

function handleFabPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  if (!fabPosition.value) {
    ensureFabPosition();
  }

  const currentPosition = fabPosition.value ?? defaultFabPosition();
  dragState.active = true;
  dragState.moved = false;
  dragState.pointerId = event.pointerId;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.originX = currentPosition.x;
  dragState.originY = currentPosition.y;

  fabRef.value?.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleWindowPointerMove(event: PointerEvent) {
  if (!dragState.active || dragState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
    dragState.moved = true;
  }

  fabPosition.value = clampFabPosition({
    x: dragState.originX + deltaX,
    y: dragState.originY + deltaY,
  });
}

function handleWindowPointerUp(event: PointerEvent) {
  if (!dragState.active || dragState.pointerId !== event.pointerId) {
    return;
  }

  const shouldOpenDrawer = !dragState.moved;
  fabPosition.value = clampFabPosition(fabPosition.value ?? defaultFabPosition());
  persistFabPosition();
  endDrag();

  if (shouldOpenDrawer) {
    drawerVisible.value = true;
  }
}

onMounted(async () => {
  await nextTick();
  ensureFabPosition();

  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('pointermove', handleWindowPointerMove);
  window.addEventListener('pointerup', handleWindowPointerUp);
  window.addEventListener('pointercancel', handleWindowPointerUp);
  window.addEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleProviderConfigUpdated);
  window.addEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleProviderConfigUpdated);

  if (authStore.token) {
    await loadBootstrap();
    await loadContextForCurrentRoute();
  }
});

watch(
  () => route.fullPath,
  () => {
    void loadContextForCurrentRoute();
  }
);

watch(
  () => authStore.token,
  (token) => {
    if (!token) {
      abortCurrentRequest(false);
      drawerVisible.value = false;
      bootstrap.value = null;
      selectedProviderId.value = null;
      currentContext.value = null;
      return;
    }
    void loadBootstrap();
    void loadContextForCurrentRoute();
  }
);

watch(drawerVisible, (visible) => {
  if (!visible) {
    abortCurrentRequest(false);
    return;
  }
  void loadBootstrap();
  void loadContextForCurrentRoute();
  void scrollMessagesToBottom();
});

watch(
  () => activeScope.value,
  () => {
    if (activeScope.value === 'lesson' && !currentContext.value) {
      activeScope.value = 'general';
      return;
    }
    void scrollMessagesToBottom();
  }
);

onBeforeUnmount(() => {
  abortCurrentRequest(false);
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('pointermove', handleWindowPointerMove);
  window.removeEventListener('pointerup', handleWindowPointerUp);
  window.removeEventListener('pointercancel', handleWindowPointerUp);
  window.removeEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleProviderConfigUpdated);
  window.removeEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleProviderConfigUpdated);
  clearComposerAttachments();
});
</script>

<style scoped>
.ai-companion-root {
  position: relative;
  z-index: 2100;
}

.ai-fab {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 132px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  background:
    radial-gradient(circle at top right, rgba(255, 210, 111, 0.78), transparent 38%),
    linear-gradient(135deg, rgba(32, 85, 168, 0.96), rgba(46, 129, 255, 0.94));
  color: #fff;
  box-shadow: 0 20px 45px rgba(40, 82, 154, 0.32);
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.ai-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 24px 55px rgba(40, 82, 154, 0.38);
}

.ai-fab.is-dragging {
  cursor: grabbing;
  transform: scale(1.02);
}

.ai-fab__halo {
  position: absolute;
  inset: -6px;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent);
  opacity: 0.65;
  pointer-events: none;
}

.ai-fab__icon,
.ai-fab__copy {
  position: relative;
  z-index: 1;
}

.ai-fab__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.ai-fab__copy {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.ai-fab__copy strong {
  font-size: 15px;
}

.ai-fab__copy small {
  opacity: 0.88;
  font-size: 12px;
}

.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  padding: 20px;
  background:
    radial-gradient(circle at top right, rgba(255, 210, 111, 0.15), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.98));
}

.ai-panel__hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--ls-border);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: var(--ls-shadow);
}

.ai-panel__eyebrow {
  margin: 0 0 6px;
  color: var(--ls-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ai-panel__hero h3,
.ai-panel__copy,
.ai-context-card__head h4,
.ai-context-card__subtitle,
.ai-settings-card__head h4,
.ai-provider-field__head h4,
.ai-starter-card h4,
.ai-composer__head h4 {
  margin: 0;
}

.ai-panel__copy {
  margin-top: 8px;
  color: var(--ls-muted);
  line-height: 1.7;
}

.ai-panel__hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}

.ai-loading-card,
.ai-context-card,
.ai-settings-card,
.ai-starter-card,
.ai-composer {
  padding: 18px;
}

.ai-tabs {
  margin-top: -6px;
}

.ai-context-card,
.ai-settings-card,
.ai-composer,
.ai-starter-card {
  display: grid;
  gap: 12px;
}

.ai-context-card__head,
.ai-settings-card__head,
.ai-composer__head,
.ai-composer__footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.ai-context-card__kicker {
  margin: 0 0 4px;
  color: var(--ls-primary);
  font-size: 12px;
  font-weight: 700;
}

.ai-provider-field {
  display: grid;
  gap: 8px;
}

.ai-provider-field__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.ai-provider-field__head .section-note {
  margin: 0;
}

.ai-composer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  align-items: center;
}

.ai-composer__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.ai-composer__shortcut {
  flex: 1;
}

.ai-context-card__subtitle {
  color: var(--ls-text);
  font-weight: 600;
}

.ai-knowledge-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-knowledge-option span {
  color: var(--ls-muted);
  font-size: 12px;
  white-space: normal;
}

.ai-chat-shell {
  display: grid;
  gap: 16px;
  min-height: 0;
}

.ai-chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 220px;
  max-height: 44vh;
  padding-right: 2px;
  overflow: auto;
}

.ai-chat-item {
  display: flex;
}

.ai-chat-item.is-user {
  justify-content: flex-end;
}

.ai-chat-bubble {
  max-width: min(92%, 520px);
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 28px rgba(32, 60, 112, 0.08);
}

.ai-chat-item.is-user .ai-chat-bubble {
  border-bottom-right-radius: 6px;
  background: linear-gradient(135deg, rgba(47, 135, 255, 0.16), rgba(255, 255, 255, 0.92));
}

.ai-chat-item.is-assistant .ai-chat-bubble {
  border-bottom-left-radius: 6px;
}

.ai-chat-bubble__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--ls-muted);
  font-size: 12px;
}

.ai-chat-bubble__text {
  margin: 0;
  color: var(--ls-text);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-chat-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.ai-chat-attachment {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(47, 135, 255, 0.1);
  color: var(--ls-primary);
  font-size: 12px;
}

.ai-chat-bubble__footnote {
  margin: 10px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.6;
}

.ai-starter-card__actions,
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ai-composer__attachment-list {
  display: grid;
  gap: 10px;
}

.ai-composer__attachment {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px dashed var(--ls-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.ai-composer__attachment-preview {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 12px;
}

.ai-composer__attachment-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ai-composer__attachment-meta span,
.ai-composer__attachment-meta small {
  color: var(--ls-muted);
}

.ai-composer__attachment-meta strong,
.ai-composer__attachment-meta span,
.ai-composer__attachment-meta small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-composer__footer {
  align-items: center;
}

.file-input,
.full-width {
  width: 100%;
}

:deep(.el-drawer__body) {
  padding: 0;
}

@media (max-width: 768px) {
  .ai-panel {
    padding: 14px;
  }

  .ai-panel__hero,
  .ai-context-card__head,
  .ai-settings-card__head,
  .ai-provider-field__head,
  .ai-composer__head,
  .ai-composer__footer {
    flex-direction: column;
  }

  .ai-composer__actions {
    width: 100%;
    justify-content: stretch;
  }

  .ai-composer__actions :deep(.el-button) {
    flex: 1;
  }

  .ai-chat-list {
    max-height: 40vh;
  }

  .ai-composer__attachment {
    grid-template-columns: 60px minmax(0, 1fr);
  }

  .ai-composer__attachment :deep(.el-button) {
    grid-column: 1 / -1;
    justify-self: flex-start;
  }
}
</style>
