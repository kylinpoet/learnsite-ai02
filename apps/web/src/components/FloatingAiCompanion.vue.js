/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute } from 'vue-router';
import { apiGet, apiPost } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
const FAB_STORAGE_KEY = 'learnsite-ai-companion-fab-position';
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
const route = useRoute();
const authStore = useAuthStore();
const fabRef = ref(null);
const drawerVisible = ref(false);
const bootstrap = ref(null);
const bootstrapLoading = ref(false);
const bootstrapError = ref('');
const currentContext = ref(null);
const activeScope = ref('general');
const generalMessages = ref([]);
const lessonMessages = ref([]);
const lessonRouteKey = ref('');
const draftMessage = ref('');
const composerAttachments = ref([]);
const attachmentInputRef = ref(null);
const messageListRef = ref(null);
const isSending = ref(false);
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth);
const viewportHeight = ref(typeof window === 'undefined' ? 720 : window.innerHeight);
const selectedKnowledgeBaseIds = reactive({
    general: [],
    lesson: [],
});
const fabPosition = ref(null);
const dragState = reactive({
    active: false,
    moved: false,
    pointerId: null,
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
const activeMessages = computed(() => activeScope.value === 'lesson' ? lessonMessages.value : generalMessages.value);
const activeProviderLabel = computed(() => {
    const lastAssistant = [...activeMessages.value]
        .reverse()
        .find((message) => message.role === 'assistant' && message.providerName);
    if (lastAssistant?.providerName) {
        return lastAssistant.providerMode === 'preview'
            ? `${lastAssistant.providerName} · 预览`
            : lastAssistant.providerName;
    }
    if (bootstrap.value?.active_provider?.name) {
        return bootstrap.value.active_provider.name;
    }
    return '内置预览学伴';
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
const activeKnowledgeBaseIds = computed({
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
const visibleKnowledgeBases = computed(() => (bootstrap.value?.knowledge_bases || []).filter((item) => item.scopes.includes(activeScope.value)));
const activeStarterQuestions = computed(() => {
    if (activeScope.value === 'lesson' && currentContext.value?.suggested_questions?.length) {
        return currentContext.value.suggested_questions;
    }
    return bootstrap.value?.starter_questions[activeScope.value] || [];
});
const sendDisabled = computed(() => isSending.value ||
    bootstrapLoading.value ||
    (!draftMessage.value.trim() && composerAttachments.value.length === 0));
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
function asPositiveInt(value) {
    const candidate = Array.isArray(value) ? value[0] : value;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return undefined;
}
function contextQueryFromRoute() {
    const query = {};
    const courseId = asPositiveInt(route.params.courseId) ?? asPositiveInt(route.query.courseId);
    const taskId = asPositiveInt(route.params.taskId) ?? asPositiveInt(route.query.taskId);
    const planId = asPositiveInt(route.params.planId) ?? asPositiveInt(route.query.planId);
    const sessionId = asPositiveInt(route.params.sessionId) ?? asPositiveInt(route.query.sessionId);
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
function hasContextQuery(query) {
    return Object.values(query).some((value) => typeof value === 'number' && value > 0);
}
function buildContextQueryString(query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (typeof value === 'number' && value > 0) {
            search.set(key, String(value));
        }
    }
    return search.toString();
}
function currentRequestContext() {
    const identifiers = currentContext.value?.identifiers;
    if (!identifiers) {
        return contextQueryFromRoute();
    }
    const query = {};
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
function contextKindLabel(kind) {
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
function attachmentKindLabel(kind) {
    if (kind === 'image') {
        return '图片';
    }
    if (kind === 'text') {
        return '文本';
    }
    return '文件';
}
function formatMessageTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value.replace('T', ' ').slice(11, 16);
    }
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function assistantFootnote(message) {
    const parts = [];
    if (message.providerName) {
        parts.push(message.providerMode === 'preview'
            ? `${message.providerName} · 预览模式`
            : message.providerName);
    }
    if (message.warning) {
        parts.push(message.warning);
    }
    return parts.join(' | ');
}
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read file as data URL'));
        reader.readAsDataURL(file);
    });
}
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read file as text'));
        reader.readAsText(file);
    });
}
function fileExtension(name) {
    const index = name.lastIndexOf('.');
    if (index < 0) {
        return '';
    }
    return name.slice(index + 1).toLowerCase();
}
function isTextLikeFile(file) {
    if (file.type.startsWith('text/')) {
        return true;
    }
    return TEXT_FILE_EXTENSIONS.has(fileExtension(file.name));
}
function revokeAttachmentPreview(attachment) {
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
function removeComposerAttachment(attachmentId) {
    const attachment = composerAttachments.value.find((item) => item.id === attachmentId);
    if (attachment) {
        revokeAttachmentPreview(attachment);
    }
    composerAttachments.value = composerAttachments.value.filter((item) => item.id !== attachmentId);
    clearAttachmentInput();
}
async function createComposerAttachment(file) {
    const mimeType = file.type || 'application/octet-stream';
    const kind = mimeType.startsWith('image/')
        ? 'image'
        : isTextLikeFile(file)
            ? 'text'
            : 'file';
    const attachment = {
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
        }
        catch {
            attachment.dataUrl = null;
        }
    }
    if (attachment.kind === 'text' && file.size <= TEXT_INLINE_LIMIT) {
        try {
            attachment.textContent = (await readFileAsText(file)).slice(0, 12000);
        }
        catch {
            attachment.textContent = null;
        }
    }
    return attachment;
}
async function handleAttachmentChange(event) {
    const input = event.target;
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
    const createdAttachments = await Promise.all(acceptedFiles.map((file) => createComposerAttachment(file)));
    composerAttachments.value = [...composerAttachments.value, ...createdAttachments];
    clearAttachmentInput();
}
function openAttachmentPicker() {
    attachmentInputRef.value?.click();
}
function chatAttachmentFromComposer(attachment) {
    return {
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeKb: attachment.sizeKb,
        kind: attachment.kind,
    };
}
function payloadAttachmentFromComposer(attachment) {
    return {
        name: attachment.name,
        mime_type: attachment.mimeType,
        size_kb: attachment.sizeKb,
        kind: attachment.kind,
        text_content: attachment.textContent,
        data_url: attachment.dataUrl,
    };
}
function messagesRef(scope) {
    return scope === 'lesson' ? lessonMessages : generalMessages;
}
function normalizeKnowledgeBaseIds(value, scope) {
    const availableIds = new Set((bootstrap.value?.knowledge_bases || [])
        .filter((item) => item.scopes.includes(scope))
        .map((item) => item.id));
    const filtered = value.filter((item, index) => availableIds.has(item) && value.indexOf(item) === index);
    if (filtered.length) {
        return filtered;
    }
    return (bootstrap.value?.default_knowledge_base_ids[scope] || []).filter((item) => availableIds.has(item));
}
function welcomeMessage(scope) {
    const fallback = scope === 'lesson'
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
function ensureScopeMessages(scope, force = false) {
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
function applyStarterQuestion(question) {
    draftMessage.value = question;
}
async function scrollMessagesToBottom() {
    await nextTick();
    if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
}
function applyBootstrap(payload) {
    bootstrap.value = payload;
    selectedKnowledgeBaseIds.general = normalizeKnowledgeBaseIds(selectedKnowledgeBaseIds.general.length
        ? selectedKnowledgeBaseIds.general
        : payload.default_knowledge_base_ids.general, 'general');
    selectedKnowledgeBaseIds.lesson = normalizeKnowledgeBaseIds(selectedKnowledgeBaseIds.lesson.length
        ? selectedKnowledgeBaseIds.lesson
        : payload.default_knowledge_base_ids.lesson, 'lesson');
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
        const payload = await apiGet('/assistants/companion/bootstrap', authStore.token);
        applyBootstrap(payload);
        if (!payload.enabled) {
            drawerVisible.value = false;
        }
    }
    catch (error) {
        bootstrapError.value = error instanceof Error ? error.message : '加载 AI 学伴配置失败';
    }
    finally {
        bootstrapLoading.value = false;
    }
}
function applyContext(context) {
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
        selectedKnowledgeBaseIds.lesson = normalizeKnowledgeBaseIds(context.recommended_knowledge_base_ids?.length
            ? context.recommended_knowledge_base_ids
            : bootstrap.value.default_knowledge_base_ids.lesson, 'lesson');
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
        const payload = await apiGet(`/assistants/companion/context?${queryString}`, authStore.token);
        applyContext(payload.context);
    }
    catch {
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
    const userMessage = {
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
    await scrollMessagesToBottom();
    try {
        const response = await apiPost('/assistants/companion/respond', {
            scope,
            message: messageText,
            knowledge_base_ids: [...activeKnowledgeBaseIds.value],
            ...currentRequestContext(),
            attachments: pendingAttachments.map(payloadAttachmentFromComposer),
            conversation: history.map((item) => ({
                role: item.role,
                content: item.content,
            })),
        }, authStore.token);
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
            },
        ];
    }
    catch (error) {
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
    }
    finally {
        isSending.value = false;
        await scrollMessagesToBottom();
    }
}
function fabSize() {
    return {
        width: fabRef.value?.offsetWidth || 132,
        height: fabRef.value?.offsetHeight || 68,
    };
}
function clampFabPosition(position) {
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
        const parsed = JSON.parse(raw);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return clampFabPosition({ x: parsed.x, y: parsed.y });
        }
    }
    catch {
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
function handleFabPointerDown(event) {
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
function handleWindowPointerMove(event) {
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
function handleWindowPointerUp(event) {
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
    if (authStore.token) {
        await loadBootstrap();
        await loadContextForCurrentRoute();
    }
});
watch(() => route.fullPath, () => {
    void loadContextForCurrentRoute();
});
watch(() => authStore.token, (token) => {
    if (!token) {
        drawerVisible.value = false;
        bootstrap.value = null;
        currentContext.value = null;
        return;
    }
    void loadBootstrap();
    void loadContextForCurrentRoute();
});
watch(drawerVisible, (visible) => {
    if (!visible) {
        return;
    }
    if (!bootstrap.value && !bootstrapLoading.value) {
        void loadBootstrap();
    }
    void loadContextForCurrentRoute();
    void scrollMessagesToBottom();
});
watch(() => activeScope.value, () => {
    if (activeScope.value === 'lesson' && !currentContext.value) {
        activeScope.value = 'general';
        return;
    }
    void scrollMessagesToBottom();
});
onBeforeUnmount(() => {
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    window.removeEventListener('pointercancel', handleWindowPointerUp);
    clearComposerAttachments();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ai-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__hero']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-starter-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-starter-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-settings-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card__subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-knowledge-option']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['is-user']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__hero']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-settings-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.shouldRender) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ai-companion-root" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onKeydown: (...[$event]) => {
                if (!(__VLS_ctx.shouldRender))
                    return;
                __VLS_ctx.drawerVisible = true;
            } },
        ...{ onKeydown: (...[$event]) => {
                if (!(__VLS_ctx.shouldRender))
                    return;
                __VLS_ctx.drawerVisible = true;
            } },
        ...{ onPointerdown: (__VLS_ctx.handleFabPointerDown) },
        ref: "fabRef",
        ...{ class: "ai-fab" },
        ...{ class: ({ 'is-dragging': __VLS_ctx.dragState.active }) },
        ...{ style: (__VLS_ctx.fabStyle) },
        type: "button",
    });
    /** @type {typeof __VLS_ctx.fabRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ai-fab__halo" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ai-fab__icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ai-fab__copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.lessonModeAvailable ? '通用 + 当前学案' : '通用模式');
    const __VLS_0 = {}.ElDrawer;
    /** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        modelValue: (__VLS_ctx.drawerVisible),
        size: (__VLS_ctx.drawerSize),
        withHeader: (false),
        appendToBody: true,
        direction: "rtl",
    }));
    const __VLS_2 = __VLS_1({
        modelValue: (__VLS_ctx.drawerVisible),
        size: (__VLS_ctx.drawerSize),
        withHeader: (false),
        appendToBody: true,
        direction: "rtl",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ai-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "ai-panel__hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "ai-panel__eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "ai-panel__copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ai-panel__hero-tags" },
    });
    const __VLS_4 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        round: true,
    }));
    const __VLS_6 = __VLS_5({
        round: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    (__VLS_ctx.activeProviderLabel);
    var __VLS_7;
    if (__VLS_ctx.lessonModeAvailable) {
        const __VLS_8 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            round: true,
            type: "success",
        }));
        const __VLS_10 = __VLS_9({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        var __VLS_11;
    }
    if (__VLS_ctx.bootstrapError) {
        const __VLS_12 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            closable: (false),
            title: (__VLS_ctx.bootstrapError),
            type: "error",
        }));
        const __VLS_14 = __VLS_13({
            closable: (false),
            title: (__VLS_ctx.bootstrapError),
            type: "error",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    }
    if (__VLS_ctx.bootstrapLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "soft-card ai-loading-card" },
        });
        const __VLS_16 = {}.ElSkeleton;
        /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            animated: true,
        }));
        const __VLS_18 = __VLS_17({
            animated: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        {
            const { template: __VLS_thisSlot } = __VLS_19.slots;
            const __VLS_20 = {}.ElSkeleton;
            /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                rows: (10),
            }));
            const __VLS_22 = __VLS_21({
                rows: (10),
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        }
        var __VLS_19;
    }
    else if (__VLS_ctx.bootstrap) {
        const __VLS_24 = {}.ElTabs;
        /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            modelValue: (__VLS_ctx.activeScope),
            ...{ class: "ai-tabs" },
        }));
        const __VLS_26 = __VLS_25({
            modelValue: (__VLS_ctx.activeScope),
            ...{ class: "ai-tabs" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        const __VLS_28 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            label: "通用学伴",
            name: "general",
        }));
        const __VLS_30 = __VLS_29({
            label: "通用学伴",
            name: "general",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        const __VLS_32 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            disabled: (!__VLS_ctx.lessonModeAvailable),
            label: "当前课程学案学伴",
            name: "lesson",
        }));
        const __VLS_34 = __VLS_33({
            disabled: (!__VLS_ctx.lessonModeAvailable),
            label: "当前课程学案学伴",
            name: "lesson",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        var __VLS_27;
        if (__VLS_ctx.activeScope === 'lesson' && __VLS_ctx.currentContext) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "soft-card ai-context-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ai-context-card__head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "ai-context-card__kicker" },
            });
            (__VLS_ctx.contextKindLabel(__VLS_ctx.currentContext.kind));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
            (__VLS_ctx.currentContext.title);
            const __VLS_36 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                round: true,
                type: "warning",
            }));
            const __VLS_38 = __VLS_37({
                round: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            __VLS_39.slots.default;
            (__VLS_ctx.currentContext.lesson.unit_title);
            var __VLS_39;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "ai-context-card__subtitle" },
            });
            (__VLS_ctx.currentContext.subtitle);
            if (__VLS_ctx.currentContext.description) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                (__VLS_ctx.currentContext.description);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.currentContext.prompt_hint);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card ai-settings-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-settings-card__head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        const __VLS_40 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            round: true,
            type: "info",
        }));
        const __VLS_42 = __VLS_41({
            round: true,
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        (__VLS_ctx.activeScope === 'lesson' ? '学案模式' : '通用模式');
        var __VLS_43;
        const __VLS_44 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            modelValue: (__VLS_ctx.activeKnowledgeBaseIds),
            ...{ class: "full-width" },
            collapseTags: true,
            collapseTagsTooltip: true,
            multiple: true,
            placeholder: "请选择知识库",
        }));
        const __VLS_46 = __VLS_45({
            modelValue: (__VLS_ctx.activeKnowledgeBaseIds),
            ...{ class: "full-width" },
            collapseTags: true,
            collapseTagsTooltip: true,
            multiple: true,
            placeholder: "请选择知识库",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visibleKnowledgeBases))) {
            const __VLS_48 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                key: (item.id),
                label: (item.name),
                value: (item.id),
            }));
            const __VLS_50 = __VLS_49({
                key: (item.id),
                label: (item.name),
                value: (item.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            __VLS_51.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ai-knowledge-option" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.description);
            var __VLS_51;
        }
        var __VLS_47;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "ai-chat-shell" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ref: "messageListRef",
            ...{ class: "ai-chat-list" },
        });
        /** @type {typeof __VLS_ctx.messageListRef} */ ;
        if (__VLS_ctx.activeMessages.length) {
            for (const [message] of __VLS_getVForSourceType((__VLS_ctx.activeMessages))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (message.id),
                    ...{ class: "ai-chat-item" },
                    ...{ class: (message.role === 'assistant' ? 'is-assistant' : 'is-user') },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ai-chat-bubble" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ai-chat-bubble__meta" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (message.role === 'assistant' ? 'AI 学伴' : '我');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                (__VLS_ctx.formatMessageTime(message.createdAt));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "ai-chat-bubble__text" },
                });
                (message.content);
                if (message.attachments?.length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "ai-chat-attachments" },
                    });
                    for (const [attachment] of __VLS_getVForSourceType((message.attachments))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            key: (attachment.id),
                            ...{ class: "ai-chat-attachment" },
                        });
                        (attachment.name);
                        (__VLS_ctx.attachmentKindLabel(attachment.kind));
                    }
                }
                if (message.role === 'assistant' && (message.providerName || message.warning)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "ai-chat-bubble__footnote" },
                    });
                    (__VLS_ctx.assistantFootnote(message));
                }
            }
        }
        else if (__VLS_ctx.activeScope === 'lesson' && !__VLS_ctx.currentContext) {
            const __VLS_52 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                description: "当前页面还没有可绑定的课程或学案上下文",
            }));
            const __VLS_54 = __VLS_53({
                description: "当前页面还没有可绑定的课程或学案上下文",
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "soft-card ai-starter-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ai-starter-card__actions" },
            });
            for (const [question] of __VLS_getVForSourceType((__VLS_ctx.activeStarterQuestions))) {
                const __VLS_56 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                    ...{ 'onClick': {} },
                    key: (question),
                    plain: true,
                    round: true,
                    size: "small",
                }));
                const __VLS_58 = __VLS_57({
                    ...{ 'onClick': {} },
                    key: (question),
                    plain: true,
                    round: true,
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_57));
                let __VLS_60;
                let __VLS_61;
                let __VLS_62;
                const __VLS_63 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.shouldRender))
                            return;
                        if (!!(__VLS_ctx.bootstrapLoading))
                            return;
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!!(__VLS_ctx.activeMessages.length))
                            return;
                        if (!!(__VLS_ctx.activeScope === 'lesson' && !__VLS_ctx.currentContext))
                            return;
                        __VLS_ctx.applyStarterQuestion(question);
                    }
                };
                __VLS_59.slots.default;
                (question);
                var __VLS_59;
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card ai-composer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-composer__head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
        (__VLS_ctx.activeScope === 'lesson' ? '当前学案提问' : '通用提问');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            plain: true,
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (__VLS_ctx.openAttachmentPicker)
        };
        __VLS_67.slots.default;
        var __VLS_67;
        if (__VLS_ctx.composerAttachments.length) {
            const __VLS_72 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                ...{ 'onClick': {} },
                plain: true,
                type: "danger",
            }));
            const __VLS_74 = __VLS_73({
                ...{ 'onClick': {} },
                plain: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            let __VLS_76;
            let __VLS_77;
            let __VLS_78;
            const __VLS_79 = {
                onClick: (__VLS_ctx.clearComposerAttachments)
            };
            __VLS_75.slots.default;
            var __VLS_75;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (__VLS_ctx.handleAttachmentChange) },
            ref: "attachmentInputRef",
            ...{ class: "file-input" },
            multiple: true,
            type: "file",
        });
        /** @type {typeof __VLS_ctx.attachmentInputRef} */ ;
        if (__VLS_ctx.composerAttachments.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ai-composer__attachment-list" },
            });
            for (const [attachment] of __VLS_getVForSourceType((__VLS_ctx.composerAttachments))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (attachment.id),
                    ...{ class: "ai-composer__attachment" },
                });
                if (attachment.previewUrl) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                        alt: (attachment.name),
                        src: (attachment.previewUrl),
                        ...{ class: "ai-composer__attachment-preview" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ai-composer__attachment-meta" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (attachment.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.attachmentKindLabel(attachment.kind));
                (attachment.sizeKb);
                if (attachment.textContent) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                }
                else if (attachment.dataUrl) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                }
                const __VLS_80 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }));
                const __VLS_82 = __VLS_81({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_81));
                let __VLS_84;
                let __VLS_85;
                let __VLS_86;
                const __VLS_87 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.shouldRender))
                            return;
                        if (!!(__VLS_ctx.bootstrapLoading))
                            return;
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!(__VLS_ctx.composerAttachments.length))
                            return;
                        __VLS_ctx.removeComposerAttachment(attachment.id);
                    }
                };
                __VLS_83.slots.default;
                var __VLS_83;
            }
        }
        const __VLS_88 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            ...{ 'onKeydown': {} },
            ...{ 'onKeydown': {} },
            modelValue: (__VLS_ctx.draftMessage),
            autosize: ({ minRows: 4, maxRows: 8 }),
            resize: "none",
            type: "textarea",
        }));
        const __VLS_90 = __VLS_89({
            ...{ 'onKeydown': {} },
            ...{ 'onKeydown': {} },
            modelValue: (__VLS_ctx.draftMessage),
            autosize: ({ minRows: 4, maxRows: 8 }),
            resize: "none",
            type: "textarea",
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        let __VLS_92;
        let __VLS_93;
        let __VLS_94;
        const __VLS_95 = {
            onKeydown: (__VLS_ctx.sendCurrentMessage)
        };
        const __VLS_96 = {
            onKeydown: (__VLS_ctx.sendCurrentMessage)
        };
        var __VLS_91;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-composer__footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "section-note" },
        });
        const __VLS_97 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.sendDisabled),
            loading: (__VLS_ctx.isSending),
            type: "primary",
        }));
        const __VLS_99 = __VLS_98({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.sendDisabled),
            loading: (__VLS_ctx.isSending),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_98));
        let __VLS_101;
        let __VLS_102;
        let __VLS_103;
        const __VLS_104 = {
            onClick: (__VLS_ctx.sendCurrentMessage)
        };
        __VLS_100.slots.default;
        var __VLS_100;
    }
    var __VLS_3;
}
/** @type {__VLS_StyleScopedClasses['ai-companion-root']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__halo']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-fab__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__hero']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel__hero-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card__kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-context-card__subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-settings-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-knowledge-option']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-bubble__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-bubble__text']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-attachments']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-attachment']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat-bubble__footnote']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-starter-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-starter-card__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['file-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__attachment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-composer__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            fabRef: fabRef,
            drawerVisible: drawerVisible,
            bootstrap: bootstrap,
            bootstrapLoading: bootstrapLoading,
            bootstrapError: bootstrapError,
            currentContext: currentContext,
            activeScope: activeScope,
            draftMessage: draftMessage,
            composerAttachments: composerAttachments,
            attachmentInputRef: attachmentInputRef,
            messageListRef: messageListRef,
            isSending: isSending,
            dragState: dragState,
            shouldRender: shouldRender,
            lessonModeAvailable: lessonModeAvailable,
            activeMessages: activeMessages,
            activeProviderLabel: activeProviderLabel,
            drawerSize: drawerSize,
            activeKnowledgeBaseIds: activeKnowledgeBaseIds,
            visibleKnowledgeBases: visibleKnowledgeBases,
            activeStarterQuestions: activeStarterQuestions,
            sendDisabled: sendDisabled,
            fabStyle: fabStyle,
            contextKindLabel: contextKindLabel,
            attachmentKindLabel: attachmentKindLabel,
            formatMessageTime: formatMessageTime,
            assistantFootnote: assistantFootnote,
            clearComposerAttachments: clearComposerAttachments,
            removeComposerAttachment: removeComposerAttachment,
            handleAttachmentChange: handleAttachmentChange,
            openAttachmentPicker: openAttachmentPicker,
            applyStarterQuestion: applyStarterQuestion,
            sendCurrentMessage: sendCurrentMessage,
            handleFabPointerDown: handleFabPointerDown,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
