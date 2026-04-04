/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiGetBlob, apiPut, apiUpload } from '@/api/http';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';
import { normalizeRichTextHtml } from '@/utils/richText';
const CODE_FILE_EXTENSIONS = new Set(['py', 'txt', 'md', 'html', 'css', 'js', 'ts', 'json']);
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const taskDetail = ref(null);
const sourceCode = ref('');
const reflectionNote = ref('');
const submittedCode = ref('');
const sourceCodeFileId = ref(null);
const selectedFiles = ref([]);
const keptExistingFileIds = ref([]);
const fileInputRef = ref(null);
const isLoading = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const downloadLoadingFileId = ref(null);
const isGroupDraftSaving = ref(false);
const isRefreshingTask = ref(false);
const editorOrigin = ref('starter');
const localDraftUpdatedAt = ref(null);
let draftPersistTimer = null;
let isHydratingForm = false;
const currentSubmission = computed(() => taskDetail.value?.current_submission || null);
const currentGroupDraft = computed(() => taskDetail.value?.group_draft || null);
const generatedCodeDisplayName = computed(() => buildGeneratedCodeFileName(taskDetail.value?.id || Number(route.params.taskId)));
const codeLineCount = computed(() => (sourceCode.value ? sourceCode.value.split(/\r?\n/).length : 0));
const hasSubmittedCode = computed(() => Boolean(submittedCode.value.trim()));
const hasLocalDraft = computed(() => editorOrigin.value === 'local' && Boolean(localDraftUpdatedAt.value));
const submissionStatusLabel = computed(() => {
    if (!currentSubmission.value) {
        return '未提交';
    }
    return currentSubmission.value.status === 'reviewed' ? '已评价' : '待教师评价';
});
const submissionStatusNote = computed(() => {
    if (!currentSubmission.value) {
        return taskDetail.value?.submission_scope === 'group' ? '你的小组还没有提交这项代码任务。' : '你还没有提交这项代码任务。';
    }
    if (currentSubmission.value.status === 'reviewed') {
        return '教师已经完成评价，本次提交入口会关闭。';
    }
    return taskDetail.value?.submission_scope === 'group'
        ? '当前是小组共同作品，重新提交会覆盖本组当前保存内容。'
        : '当前作品尚未评价，可以继续修改后再次提交。';
});
const draftStatusLabel = computed(() => {
    if (editorOrigin.value === 'local') {
        return '本地草稿';
    }
    if (editorOrigin.value === 'submission') {
        return '最近提交';
    }
    if (editorOrigin.value === 'group') {
        return '小组草稿';
    }
    return '示例代码';
});
const draftFootnote = computed(() => {
    if (editorOrigin.value === 'local' && localDraftUpdatedAt.value) {
        return `本地草稿保存于 ${formatDateTime(localDraftUpdatedAt.value)}`;
    }
    if (editorOrigin.value === 'group' && localDraftUpdatedAt.value) {
        return `小组草稿同步于 ${formatDateTime(localDraftUpdatedAt.value)}`;
    }
    if (editorOrigin.value === 'submission') {
        return '已载入最近一次提交的代码与说明。';
    }
    return '示例代码仅作为起点，可直接覆盖修改。';
});
const submitButtonText = computed(() => {
    if (!taskDetail.value) {
        return '提交代码作品';
    }
    if (taskDetail.value.submission_scope === 'group') {
        return currentSubmission.value ? '再次提交小组代码作品' : '提交小组代码作品';
    }
    return currentSubmission.value ? '再次提交代码作品' : '提交代码作品';
});
const groupDraftSummary = computed(() => {
    if (!taskDetail.value?.group_collaboration) {
        return '当前任务不是小组共同编辑任务。';
    }
    if (!currentGroupDraft.value) {
        return '组内还没有共享草稿，可以先同步代码和实现说明，再由组员继续补充。';
    }
    return currentGroupDraft.value.source_code
        ? '当前可以恢复到组内最近一次共享的代码与说明。'
        : '当前共享草稿中还没有同步代码内容。';
});
const groupDraftMeta = computed(() => {
    if (!currentGroupDraft.value) {
        return '刷新页面后会读取组内最近一次同步的共享草稿。';
    }
    return [
        currentGroupDraft.value.updated_by_name ? `最近同步人 ${currentGroupDraft.value.updated_by_name}` : '组内成员',
        currentGroupDraft.value.updated_at ? `同步时间 ${formatDateTime(currentGroupDraft.value.updated_at)}` : '暂无时间',
    ].join(' · ');
});
function buildDraftStorageKey() {
    return `learnsite-code-draft:${authStore.user?.id || 'student'}:${route.params.taskId}`;
}
function buildGeneratedCodeFileName(taskId) {
    return `learnsite-task-${taskId}.py`;
}
function buildStarterCode(payload) {
    return [
        `# ${payload.title}`,
        '# 在这里编写你的 Python 代码',
        '# 提交时会自动生成 .py 附件',
        '',
        'def main():',
        '    print("Hello LearnSite")',
        '',
        '',
        'if __name__ == "__main__":',
        '    main()',
    ].join('\n');
}
function formatDateTime(value) {
    if (!value) {
        return '暂无记录';
    }
    return value.replace('T', ' ').slice(0, 16);
}
function formatFileSize(size) {
    const sizeKb = Math.max(1, Math.ceil(size / 1024));
    return `${sizeKb} KB`;
}
function selectedFileKey(file) {
    return `${file.name}-${file.size}-${file.lastModified}`;
}
function groupRoleLabel(role) {
    if (role === 'leader') {
        return '组长';
    }
    if (role === 'member') {
        return '组员';
    }
    return '未分组成员';
}
function buildTaskRoute(task) {
    const courseId = taskDetail.value?.course.id || route.params.courseId;
    if (task.task_type === 'reading') {
        return `/student/courses/${courseId}/readings/${task.id}`;
    }
    if (task.task_type === 'programming') {
        return `/student/courses/${courseId}/programs/${task.id}`;
    }
    return `/student/courses/${courseId}/tasks/${task.id}`;
}
function loadLocalDraft() {
    if (typeof window === 'undefined') {
        return null;
    }
    const raw = window.localStorage.getItem(buildDraftStorageKey());
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        return {
            code: typeof parsed.code === 'string' ? parsed.code : '',
            note: typeof parsed.note === 'string' ? parsed.note : '',
            updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : '',
        };
    }
    catch {
        return null;
    }
}
function clearDraftStorage() {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(buildDraftStorageKey());
    localDraftUpdatedAt.value = null;
}
function persistLocalDraftNow() {
    if (typeof window === 'undefined' || !taskDetail.value?.can_submit) {
        return;
    }
    const normalizedCode = sourceCode.value.replace(/\r\n/g, '\n');
    const normalizedNote = normalizeRichTextHtml(reflectionNote.value);
    if (!normalizedCode.trim() && !normalizedNote) {
        clearDraftStorage();
        return;
    }
    const draft = {
        code: normalizedCode,
        note: normalizedNote,
        updated_at: new Date().toISOString(),
    };
    window.localStorage.setItem(buildDraftStorageKey(), JSON.stringify(draft));
    editorOrigin.value = 'local';
    localDraftUpdatedAt.value = draft.updated_at;
}
function scheduleLocalDraftPersist() {
    if (draftPersistTimer !== null) {
        window.clearTimeout(draftPersistTimer);
    }
    draftPersistTimer = window.setTimeout(() => {
        persistLocalDraftNow();
        draftPersistTimer = null;
    }, 400);
}
function applyEditorState(code, note, origin, updatedAt = null) {
    isHydratingForm = true;
    sourceCode.value = code;
    reflectionNote.value = note;
    editorOrigin.value = origin;
    localDraftUpdatedAt.value = updatedAt;
    isHydratingForm = false;
}
function restoreStarterCode() {
    if (!taskDetail.value) {
        return;
    }
    clearDraftStorage();
    applyEditorState(buildStarterCode(taskDetail.value), reflectionNote.value, 'starter');
    ElMessage.success('已恢复为示例代码');
}
function restoreSubmittedWork() {
    if (!taskDetail.value) {
        return;
    }
    clearDraftStorage();
    applyEditorState(submittedCode.value || (taskDetail.value.can_submit ? buildStarterCode(taskDetail.value) : ''), currentSubmission.value?.submission_note || '', 'submission');
    ElMessage.success('已恢复最近一次提交内容');
}
function restoreGroupDraft() {
    if (!taskDetail.value || !currentGroupDraft.value) {
        return;
    }
    clearDraftStorage();
    applyEditorState(currentGroupDraft.value.source_code || submittedCode.value || (taskDetail.value.can_submit ? buildStarterCode(taskDetail.value) : ''), currentGroupDraft.value.submission_note || currentSubmission.value?.submission_note || '', 'group', currentGroupDraft.value.updated_at || null);
    ElMessage.success('已恢复到小组共享草稿');
}
function clearLocalDraftManually() {
    clearDraftStorage();
    if (currentSubmission.value) {
        restoreSubmittedWork();
        return;
    }
    restoreStarterCode();
}
function pickSourceCodeFile(files, taskId) {
    const generatedName = buildGeneratedCodeFileName(taskId);
    const exactMatch = files.find((file) => file.name === generatedName);
    if (exactMatch) {
        return exactMatch;
    }
    return files.find((file) => CODE_FILE_EXTENSIONS.has(file.ext.toLowerCase())) || null;
}
async function loadSubmittedCode(payload) {
    const files = payload.current_submission?.files || [];
    const codeFile = pickSourceCodeFile(files, payload.id);
    if (!codeFile || !authStore.token) {
        return { code: '', fileId: null };
    }
    try {
        const response = await apiGetBlob(`/submissions/files/${codeFile.id}?disposition=inline`, authStore.token);
        return {
            code: await response.text(),
            fileId: codeFile.id,
        };
    }
    catch {
        ElMessage.warning('任务详情已加载，但未能读取最近提交的代码文件。');
        return { code: '', fileId: null };
    }
}
async function hydrateTaskDetail(payload) {
    taskDetail.value = payload;
    selectedFiles.value = [];
    submittedCode.value = '';
    sourceCodeFileId.value = null;
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
    const draft = loadLocalDraft();
    const submittedWork = await loadSubmittedCode(payload);
    submittedCode.value = submittedWork.code;
    sourceCodeFileId.value = submittedWork.fileId;
    keptExistingFileIds.value = (payload.current_submission?.files || [])
        .filter((file) => file.id !== submittedWork.fileId)
        .map((file) => file.id);
    const fallbackCode = payload.can_submit ? buildStarterCode(payload) : '';
    if (draft && (draft.code || draft.note)) {
        applyEditorState(draft.code || submittedWork.code || fallbackCode, draft.note || payload.current_submission?.submission_note || '', 'local', draft.updated_at || null);
        return;
    }
    if (payload.group_draft && (payload.group_draft.source_code || payload.group_draft.submission_note)) {
        applyEditorState(payload.group_draft.source_code || submittedWork.code || fallbackCode, payload.group_draft.submission_note || payload.current_submission?.submission_note || '', 'group', payload.group_draft.updated_at || null);
        return;
    }
    if (submittedWork.code || payload.current_submission?.submission_note) {
        applyEditorState(submittedWork.code || fallbackCode, payload.current_submission?.submission_note || '', 'submission');
        return;
    }
    applyEditorState(fallbackCode, '', 'starter');
}
function openFilePicker() {
    fileInputRef.value?.click();
}
function handleFileChange(event) {
    const input = event.target;
    selectedFiles.value = Array.from(input.files || []);
}
function removeSelectedFile(fileName) {
    selectedFiles.value = selectedFiles.value.filter((file) => file.name !== fileName);
    if (!selectedFiles.value.length && fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}
function clearSelectedFiles() {
    selectedFiles.value = [];
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}
function toggleRetainedFile(fileId) {
    if (keptExistingFileIds.value.includes(fileId)) {
        keptExistingFileIds.value = keptExistingFileIds.value.filter((id) => id !== fileId);
        return;
    }
    keptExistingFileIds.value = [...keptExistingFileIds.value, fileId];
}
function getDownloadFileName(contentDisposition, fallbackName) {
    if (!contentDisposition) {
        return fallbackName;
    }
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
        return decodeURIComponent(utf8Match[1]);
    }
    const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return basicMatch?.[1] || fallbackName;
}
function triggerBrowserDownload(blob, fileName) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}
async function downloadSavedFile(file) {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        return;
    }
    downloadLoadingFileId.value = file.id;
    try {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '下载附件失败');
    }
    finally {
        downloadLoadingFileId.value = null;
    }
}
async function buildPreservedFiles() {
    if (!currentSubmission.value || !authStore.token) {
        return [];
    }
    const retainedFiles = currentSubmission.value.files.filter((file) => keptExistingFileIds.value.includes(file.id));
    return Promise.all(retainedFiles.map(async (file) => {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
        const blob = await response.blob();
        return new File([blob], file.name, {
            type: blob.type || file.mime_type || 'application/octet-stream',
        });
    }));
}
async function buildUploadFiles() {
    if (!taskDetail.value) {
        return [];
    }
    const codeFile = new File([sourceCode.value.replace(/\r\n/g, '\n')], buildGeneratedCodeFileName(taskDetail.value.id), { type: 'text/x-python' });
    const preservedFiles = await buildPreservedFiles();
    return [codeFile, ...preservedFiles, ...selectedFiles.value];
}
async function loadTask() {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiGet(`/tasks/${route.params.taskId}`, authStore.token);
        if (payload.task_type !== 'programming') {
            await router.replace(buildTaskRoute({ id: payload.id, title: payload.title, task_type: payload.task_type }));
            return;
        }
        await hydrateTaskDetail(payload);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载代码任务失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function refreshTaskDetail() {
    isRefreshingTask.value = true;
    try {
        await loadTask();
        ElMessage.success('已刷新协作内容');
    }
    finally {
        isRefreshingTask.value = false;
    }
}
async function saveGroupDraft() {
    if (!taskDetail.value?.group_collaboration || !authStore.token) {
        return;
    }
    isGroupDraftSaving.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiPut(`/tasks/${taskDetail.value.id}/group-draft`, {
            submission_note: normalizeRichTextHtml(reflectionNote.value),
            source_code: sourceCode.value.replace(/\r\n/g, '\n'),
        }, authStore.token);
        if (taskDetail.value) {
            taskDetail.value.group_draft = payload;
        }
        ElMessage.success(payload ? '已同步到小组共享草稿' : '已清空小组共享草稿');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '同步小组草稿失败';
    }
    finally {
        isGroupDraftSaving.value = false;
    }
}
async function submitTask() {
    if (!taskDetail.value || !authStore.token) {
        return;
    }
    if (!sourceCode.value.trim()) {
        errorMessage.value = '请先编写代码后再提交';
        return;
    }
    const hadSubmission = Boolean(currentSubmission.value);
    const formData = new FormData();
    formData.append('submission_note', normalizeRichTextHtml(reflectionNote.value));
    formData.append('draft_source_code', sourceCode.value.replace(/\r\n/g, '\n'));
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
        const files = await buildUploadFiles();
        files.forEach((file) => {
            formData.append('files', file);
        });
        const payload = await apiUpload(`/tasks/${taskDetail.value.id}/submit`, formData, authStore.token);
        clearDraftStorage();
        await hydrateTaskDetail(payload);
        ElMessage.success(taskDetail.value.submission_scope === 'group'
            ? hadSubmission
                ? '小组代码作品已更新提交'
                : '小组代码作品提交成功'
            : hadSubmission
                ? '代码作品已更新提交'
                : '代码作品提交成功');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '提交代码作品失败';
    }
    finally {
        isSubmitting.value = false;
    }
}
async function openNavigationTask(task) {
    await router.push(buildTaskRoute(task));
}
async function goToCourse() {
    const courseId = taskDetail.value?.course.id || route.params.courseId;
    await router.push(`/student/courses/${courseId}`);
}
async function goToPeerReview() {
    await router.push(`/student/reviews/${route.params.taskId}`);
}
async function goToWorkDetail() {
    if (!currentSubmission.value) {
        return;
    }
    await router.push(`/student/work/${currentSubmission.value.id}`);
}
watch([sourceCode, reflectionNote], () => {
    if (isHydratingForm || !taskDetail.value?.can_submit) {
        return;
    }
    scheduleLocalDraftPersist();
});
watch(() => route.params.taskId, () => {
    void loadTask();
}, { immediate: true });
onBeforeUnmount(() => {
    if (draftPersistTimer !== null) {
        window.clearTimeout(draftPersistTimer);
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['toolbar-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-note']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-footnote']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['code-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-footnote']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['code-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['code-block']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-stack" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "hero-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.taskDetail?.title || `代码任务 ${__VLS_ctx.route.params.taskId}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
(__VLS_ctx.taskDetail?.course.title || '正在加载课次信息');
if (__VLS_ctx.taskDetail) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.taskDetail.course.book_title);
    (__VLS_ctx.taskDetail.course.unit_title);
    (__VLS_ctx.taskDetail.course.lesson_title);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "action-group" },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.goToCourse)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.taskDetail?.task_navigation.previous_task) {
    const __VLS_8 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.taskDetail?.task_navigation.previous_task))
                return;
            __VLS_ctx.openNavigationTask(__VLS_ctx.taskDetail.task_navigation.previous_task);
        }
    };
    __VLS_11.slots.default;
    var __VLS_11;
}
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.goToPeerReview)
};
__VLS_19.slots.default;
var __VLS_19;
if (__VLS_ctx.currentSubmission) {
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (__VLS_ctx.goToWorkDetail)
    };
    __VLS_27.slots.default;
    var __VLS_27;
}
if (__VLS_ctx.taskDetail?.task_navigation.next_task) {
    const __VLS_32 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        ...{ 'onClick': {} },
        plain: true,
        type: "primary",
    }));
    const __VLS_34 = __VLS_33({
        ...{ 'onClick': {} },
        plain: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    let __VLS_36;
    let __VLS_37;
    let __VLS_38;
    const __VLS_39 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.taskDetail?.task_navigation.next_task))
                return;
            __VLS_ctx.openNavigationTask(__VLS_ctx.taskDetail.task_navigation.next_task);
        }
    };
    __VLS_35.slots.default;
    var __VLS_35;
}
if (__VLS_ctx.errorMessage) {
    const __VLS_40 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_42 = __VLS_41({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
if (__VLS_ctx.taskDetail) {
    const __VLS_44 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        closable: (false),
        ...{ class: "mode-alert" },
        title: "当前为代码任务基础版：支持真实任务加载、本地草稿、代码文件提交和推荐作品展示；在线运行沙箱后续接入。",
        type: "info",
    }));
    const __VLS_46 = __VLS_45({
        closable: (false),
        ...{ class: "mode-alert" },
        title: "当前为代码任务基础版：支持真实任务加载、本地草稿、代码文件提交和推荐作品展示；在线运行沙箱后续接入。",
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
}
if (__VLS_ctx.taskDetail) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "metric-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value metric-value--small" },
    });
    (__VLS_ctx.submissionStatusLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.submissionStatusNote);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value metric-value--small" },
    });
    (__VLS_ctx.draftStatusLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.draftFootnote);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.codeLineCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.sourceCode.length);
    if (__VLS_ctx.taskDetail.group_collaboration) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.taskDetail.group_collaboration.group_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.taskDetail.group_collaboration.member_count);
        (__VLS_ctx.groupRoleLabel(__VLS_ctx.taskDetail.group_collaboration.my_role));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.taskDetail.submission_scope === 'group' ? '小组提交' : '个人提交');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
    }
}
const __VLS_48 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_50 = __VLS_49({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_51.slots;
    const __VLS_52 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ class: "soft-card" },
    }));
    const __VLS_54 = __VLS_53({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        rows: (10),
    }));
    const __VLS_58 = __VLS_57({
        rows: (10),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    var __VLS_55;
}
{
    const { default: __VLS_thisSlot } = __VLS_51.slots;
    if (__VLS_ctx.taskDetail) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack" },
        });
        const __VLS_60 = {}.ElRow;
        /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            gutter: (16),
        }));
        const __VLS_62 = __VLS_61({
            gutter: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        __VLS_63.slots.default;
        const __VLS_64 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            lg: (15),
            sm: (24),
        }));
        const __VLS_66 = __VLS_65({
            lg: (15),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        const __VLS_68 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ class: "soft-card" },
        }));
        const __VLS_70 = __VLS_69({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        __VLS_71.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_71.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-tag-row" },
            });
            const __VLS_72 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                round: true,
                type: "warning",
            }));
            const __VLS_74 = __VLS_73({
                round: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            __VLS_75.slots.default;
            var __VLS_75;
            const __VLS_76 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                round: true,
                type: "success",
            }));
            const __VLS_78 = __VLS_77({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
            __VLS_79.slots.default;
            (__VLS_ctx.draftStatusLabel);
            var __VLS_79;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "code-toolbar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "toolbar-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "toolbar-note" },
        });
        (__VLS_ctx.generatedCodeDisplayName);
        if (__VLS_ctx.taskDetail.can_submit) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "action-group" },
            });
            const __VLS_80 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                ...{ 'onClick': {} },
                plain: true,
            }));
            const __VLS_82 = __VLS_81({
                ...{ 'onClick': {} },
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            let __VLS_84;
            let __VLS_85;
            let __VLS_86;
            const __VLS_87 = {
                onClick: (__VLS_ctx.restoreStarterCode)
            };
            __VLS_83.slots.default;
            var __VLS_83;
            if (__VLS_ctx.hasSubmittedCode) {
                const __VLS_88 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                    ...{ 'onClick': {} },
                    plain: true,
                }));
                const __VLS_90 = __VLS_89({
                    ...{ 'onClick': {} },
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_89));
                let __VLS_92;
                let __VLS_93;
                let __VLS_94;
                const __VLS_95 = {
                    onClick: (__VLS_ctx.restoreSubmittedWork)
                };
                __VLS_91.slots.default;
                var __VLS_91;
            }
            if (__VLS_ctx.hasLocalDraft) {
                const __VLS_96 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                    ...{ 'onClick': {} },
                    plain: true,
                }));
                const __VLS_98 = __VLS_97({
                    ...{ 'onClick': {} },
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_97));
                let __VLS_100;
                let __VLS_101;
                let __VLS_102;
                const __VLS_103 = {
                    onClick: (__VLS_ctx.clearLocalDraftManually)
                };
                __VLS_99.slots.default;
                var __VLS_99;
            }
        }
        if (__VLS_ctx.taskDetail.can_submit) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "code-editor-shell" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
                value: (__VLS_ctx.sourceCode),
                ...{ class: "code-textarea" },
                spellcheck: "false",
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                ...{ class: "code-block" },
            });
            (__VLS_ctx.sourceCode || '最近提交中没有检测到代码文件。');
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "editor-footnote" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.codeLineCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.sourceCode.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.draftFootnote);
        var __VLS_71;
        const __VLS_104 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            ...{ class: "soft-card" },
        }));
        const __VLS_106 = __VLS_105({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        __VLS_107.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_107.slots;
        }
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_108 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.taskDetail.description),
            emptyText: "当前代码任务还没有补充说明。",
        }));
        const __VLS_109 = __VLS_108({
            html: (__VLS_ctx.taskDetail.description),
            emptyText: "当前代码任务还没有补充说明。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_108));
        var __VLS_107;
        const __VLS_111 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
            ...{ class: "soft-card" },
        }));
        const __VLS_113 = __VLS_112({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_112));
        __VLS_114.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_114.slots;
        }
        if (__VLS_ctx.taskDetail.can_submit) {
            /** @type {[typeof RichTextEditor, ]} */ ;
            // @ts-ignore
            const __VLS_115 = __VLS_asFunctionalComponent(RichTextEditor, new RichTextEditor({
                modelValue: (__VLS_ctx.reflectionNote),
                minHeight: (220),
                placeholder: "补充你的解题思路、关键步骤、运行结果说明或需要老师关注的地方。",
            }));
            const __VLS_116 = __VLS_115({
                modelValue: (__VLS_ctx.reflectionNote),
                minHeight: (220),
                placeholder: "补充你的解题思路、关键步骤、运行结果说明或需要老师关注的地方。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_115));
        }
        else {
            /** @type {[typeof RichTextContent, ]} */ ;
            // @ts-ignore
            const __VLS_118 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
                html: (__VLS_ctx.reflectionNote),
                emptyText: "这次提交没有填写额外说明。",
            }));
            const __VLS_119 = __VLS_118({
                html: (__VLS_ctx.reflectionNote),
                emptyText: "这次提交没有填写额外说明。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_118));
        }
        var __VLS_114;
        var __VLS_67;
        const __VLS_121 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
            lg: (9),
            sm: (24),
        }));
        const __VLS_123 = __VLS_122({
            lg: (9),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_122));
        __VLS_124.slots.default;
        const __VLS_125 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
            ...{ class: "soft-card" },
        }));
        const __VLS_127 = __VLS_126({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
        __VLS_128.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_128.slots;
        }
        const __VLS_129 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
            column: (1),
            border: true,
        }));
        const __VLS_131 = __VLS_130({
            column: (1),
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_130));
        __VLS_132.slots.default;
        const __VLS_133 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
            label: "课程",
        }));
        const __VLS_135 = __VLS_134({
            label: "课程",
        }, ...__VLS_functionalComponentArgsRest(__VLS_134));
        __VLS_136.slots.default;
        (__VLS_ctx.taskDetail.course.title);
        var __VLS_136;
        const __VLS_137 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
            label: "课次",
        }));
        const __VLS_139 = __VLS_138({
            label: "课次",
        }, ...__VLS_functionalComponentArgsRest(__VLS_138));
        __VLS_140.slots.default;
        (__VLS_ctx.taskDetail.course.lesson_title);
        var __VLS_140;
        const __VLS_141 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
            label: "当前状态",
        }));
        const __VLS_143 = __VLS_142({
            label: "当前状态",
        }, ...__VLS_functionalComponentArgsRest(__VLS_142));
        __VLS_144.slots.default;
        (__VLS_ctx.submissionStatusLabel);
        var __VLS_144;
        const __VLS_145 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
            label: "最近提交",
        }));
        const __VLS_147 = __VLS_146({
            label: "最近提交",
        }, ...__VLS_functionalComponentArgsRest(__VLS_146));
        __VLS_148.slots.default;
        (__VLS_ctx.formatDateTime(__VLS_ctx.currentSubmission?.updated_at || null));
        var __VLS_148;
        const __VLS_149 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
            label: "提交范围",
        }));
        const __VLS_151 = __VLS_150({
            label: "提交范围",
        }, ...__VLS_functionalComponentArgsRest(__VLS_150));
        __VLS_152.slots.default;
        (__VLS_ctx.taskDetail.submission_scope === 'group' ? '小组作品' : '个人作品');
        var __VLS_152;
        if (__VLS_ctx.currentSubmission?.submission_scope === 'group') {
            const __VLS_153 = {}.ElDescriptionsItem;
            /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
            // @ts-ignore
            const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
                label: "最近提交人",
            }));
            const __VLS_155 = __VLS_154({
                label: "最近提交人",
            }, ...__VLS_functionalComponentArgsRest(__VLS_154));
            __VLS_156.slots.default;
            (__VLS_ctx.currentSubmission?.submitted_by_name || '组内成员');
            var __VLS_156;
        }
        var __VLS_132;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tip-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "tip-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.taskDetail.submission_scope === 'group' ? '当前任务按小组共同提交，组内成员看到的是同一份作品。' : '当前任务按个人独立提交。');
        if (__VLS_ctx.taskDetail.submission_scope === 'group') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (__VLS_ctx.handleFileChange) },
            ref: "fileInputRef",
            ...{ class: "file-input" },
            multiple: true,
            type: "file",
        });
        /** @type {typeof __VLS_ctx.fileInputRef} */ ;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack page-stack--compact" },
        });
        const __VLS_157 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            plain: true,
        }));
        const __VLS_159 = __VLS_158({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_158));
        let __VLS_161;
        let __VLS_162;
        let __VLS_163;
        const __VLS_164 = {
            onClick: (__VLS_ctx.openFilePicker)
        };
        __VLS_160.slots.default;
        var __VLS_160;
        if (__VLS_ctx.selectedFiles.length) {
            const __VLS_165 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
                ...{ 'onClick': {} },
                disabled: (__VLS_ctx.isSubmitting),
                plain: true,
            }));
            const __VLS_167 = __VLS_166({
                ...{ 'onClick': {} },
                disabled: (__VLS_ctx.isSubmitting),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_166));
            let __VLS_169;
            let __VLS_170;
            let __VLS_171;
            const __VLS_172 = {
                onClick: (__VLS_ctx.clearSelectedFiles)
            };
            __VLS_168.slots.default;
            var __VLS_168;
        }
        const __VLS_173 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            loading: (__VLS_ctx.isSubmitting),
            ...{ class: "full-width" },
            type: "primary",
        }));
        const __VLS_175 = __VLS_174({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            loading: (__VLS_ctx.isSubmitting),
            ...{ class: "full-width" },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_174));
        let __VLS_177;
        let __VLS_178;
        let __VLS_179;
        const __VLS_180 = {
            onClick: (__VLS_ctx.submitTask)
        };
        __VLS_176.slots.default;
        (__VLS_ctx.submitButtonText);
        var __VLS_176;
        var __VLS_128;
        if (__VLS_ctx.taskDetail.group_collaboration) {
            const __VLS_181 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
                ...{ class: "soft-card" },
            }));
            const __VLS_183 = __VLS_182({
                ...{ class: "soft-card" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_182));
            __VLS_184.slots.default;
            {
                const { header: __VLS_thisSlot } = __VLS_184.slots;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tip-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "tip-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.groupDraftSummary);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.groupDraftMeta);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-actions" },
            });
            const __VLS_185 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
                round: true,
                type: "info",
            }));
            const __VLS_187 = __VLS_186({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_186));
            __VLS_188.slots.default;
            (__VLS_ctx.currentGroupDraft ? `版本 ${__VLS_ctx.currentGroupDraft.version_no}` : '未同步');
            var __VLS_188;
            if (__VLS_ctx.currentGroupDraft?.updated_by_name) {
                const __VLS_189 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
                    round: true,
                    type: "success",
                }));
                const __VLS_191 = __VLS_190({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_190));
                __VLS_192.slots.default;
                (__VLS_ctx.currentGroupDraft.updated_by_name);
                var __VLS_192;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "page-stack page-stack--compact" },
            });
            const __VLS_193 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.taskDetail.can_submit),
                loading: (__VLS_ctx.isGroupDraftSaving),
                plain: true,
                type: "primary",
            }));
            const __VLS_195 = __VLS_194({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.taskDetail.can_submit),
                loading: (__VLS_ctx.isGroupDraftSaving),
                plain: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_194));
            let __VLS_197;
            let __VLS_198;
            let __VLS_199;
            const __VLS_200 = {
                onClick: (__VLS_ctx.saveGroupDraft)
            };
            __VLS_196.slots.default;
            var __VLS_196;
            const __VLS_201 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.currentGroupDraft),
                plain: true,
            }));
            const __VLS_203 = __VLS_202({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.currentGroupDraft),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_202));
            let __VLS_205;
            let __VLS_206;
            let __VLS_207;
            const __VLS_208 = {
                onClick: (__VLS_ctx.restoreGroupDraft)
            };
            __VLS_204.slots.default;
            var __VLS_204;
            const __VLS_209 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.isRefreshingTask),
                plain: true,
            }));
            const __VLS_211 = __VLS_210({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.isRefreshingTask),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_210));
            let __VLS_213;
            let __VLS_214;
            let __VLS_215;
            const __VLS_216 = {
                onClick: (__VLS_ctx.refreshTaskDetail)
            };
            __VLS_212.slots.default;
            var __VLS_212;
            var __VLS_184;
        }
        const __VLS_217 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
            ...{ class: "soft-card" },
        }));
        const __VLS_219 = __VLS_218({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_218));
        __VLS_220.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_220.slots;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stack-list" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "file-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "file-name" },
        });
        (__VLS_ctx.generatedCodeDisplayName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "file-meta" },
        });
        const __VLS_221 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
            round: true,
            type: "warning",
        }));
        const __VLS_223 = __VLS_222({
            round: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_222));
        __VLS_224.slots.default;
        var __VLS_224;
        for (const [file] of __VLS_getVForSourceType((__VLS_ctx.selectedFiles))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (__VLS_ctx.selectedFileKey(file)),
                ...{ class: "file-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-name" },
            });
            (file.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-meta" },
            });
            (__VLS_ctx.formatFileSize(file.size));
            const __VLS_225 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_227 = __VLS_226({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_226));
            let __VLS_229;
            let __VLS_230;
            let __VLS_231;
            const __VLS_232 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskDetail))
                        return;
                    __VLS_ctx.removeSelectedFile(file.name);
                }
            };
            __VLS_228.slots.default;
            var __VLS_228;
        }
        for (const [file] of __VLS_getVForSourceType((__VLS_ctx.currentSubmission?.files || []))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (`saved-${file.id}`),
                ...{ class: "file-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-name" },
            });
            (file.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "file-meta" },
            });
            (file.ext.toUpperCase());
            (file.size_kb);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-actions" },
            });
            if (file.id === __VLS_ctx.sourceCodeFileId) {
                const __VLS_233 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
                    round: true,
                    type: "warning",
                }));
                const __VLS_235 = __VLS_234({
                    round: true,
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_234));
                __VLS_236.slots.default;
                var __VLS_236;
            }
            else if (__VLS_ctx.keptExistingFileIds.includes(file.id)) {
                const __VLS_237 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
                    round: true,
                    type: "success",
                }));
                const __VLS_239 = __VLS_238({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_238));
                __VLS_240.slots.default;
                var __VLS_240;
            }
            else {
                const __VLS_241 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
                    round: true,
                    type: "info",
                }));
                const __VLS_243 = __VLS_242({
                    round: true,
                    type: "info",
                }, ...__VLS_functionalComponentArgsRest(__VLS_242));
                __VLS_244.slots.default;
                var __VLS_244;
            }
            if (file.id !== __VLS_ctx.sourceCodeFileId && __VLS_ctx.taskDetail.can_submit) {
                const __VLS_245 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }));
                const __VLS_247 = __VLS_246({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_246));
                let __VLS_249;
                let __VLS_250;
                let __VLS_251;
                const __VLS_252 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskDetail))
                            return;
                        if (!(file.id !== __VLS_ctx.sourceCodeFileId && __VLS_ctx.taskDetail.can_submit))
                            return;
                        __VLS_ctx.toggleRetainedFile(file.id);
                    }
                };
                __VLS_248.slots.default;
                (__VLS_ctx.keptExistingFileIds.includes(file.id) ? '本次不保留' : '恢复保留');
                var __VLS_248;
            }
            const __VLS_253 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                link: true,
            }));
            const __VLS_255 = __VLS_254({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_254));
            let __VLS_257;
            let __VLS_258;
            let __VLS_259;
            const __VLS_260 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskDetail))
                        return;
                    __VLS_ctx.downloadSavedFile(file);
                }
            };
            __VLS_256.slots.default;
            var __VLS_256;
        }
        if (!__VLS_ctx.selectedFiles.length && !__VLS_ctx.currentSubmission?.files.length) {
            const __VLS_261 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
                description: "暂时还没有提交附件。",
            }));
            const __VLS_263 = __VLS_262({
                description: "暂时还没有提交附件。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_262));
        }
        var __VLS_220;
        const __VLS_265 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
            ...{ class: "soft-card" },
        }));
        const __VLS_267 = __VLS_266({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_266));
        __VLS_268.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_268.slots;
        }
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_269 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.taskDetail.course.content),
            emptyText: "当前学案还没有补充导读内容。",
        }));
        const __VLS_270 = __VLS_269({
            html: (__VLS_ctx.taskDetail.course.content),
            emptyText: "当前学案还没有补充导读内容。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_269));
        var __VLS_268;
        var __VLS_124;
        var __VLS_63;
        /** @type {[typeof RecommendedWorksShowcase, ]} */ ;
        // @ts-ignore
        const __VLS_272 = __VLS_asFunctionalComponent(RecommendedWorksShowcase, new RecommendedWorksShowcase({
            items: (__VLS_ctx.taskDetail.recommended_showcase.items),
            token: (__VLS_ctx.authStore.token || ''),
            description: "优秀代码作品会在这里集中展示，方便同学参考结构、说明方式和附件组织。",
            emptyDescription: "当前代码任务还没有推荐作品。",
            title: "推荐代码作品",
        }));
        const __VLS_273 = __VLS_272({
            items: (__VLS_ctx.taskDetail.recommended_showcase.items),
            token: (__VLS_ctx.authStore.token || ''),
            description: "优秀代码作品会在这里集中展示，方便同学参考结构、说明方式和附件组织。",
            emptyDescription: "当前代码任务还没有推荐作品。",
            title: "推荐代码作品",
        }, ...__VLS_functionalComponentArgsRest(__VLS_272));
    }
}
var __VLS_51;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-tag-row']} */ ;
/** @type {__VLS_StyleScopedClasses['code-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-note']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['code-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['code-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['code-block']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-footnote']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-title']} */ ;
/** @type {__VLS_StyleScopedClasses['file-input']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-title']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RecommendedWorksShowcase: RecommendedWorksShowcase,
            RichTextContent: RichTextContent,
            RichTextEditor: RichTextEditor,
            route: route,
            authStore: authStore,
            taskDetail: taskDetail,
            sourceCode: sourceCode,
            reflectionNote: reflectionNote,
            sourceCodeFileId: sourceCodeFileId,
            selectedFiles: selectedFiles,
            keptExistingFileIds: keptExistingFileIds,
            fileInputRef: fileInputRef,
            isLoading: isLoading,
            isSubmitting: isSubmitting,
            errorMessage: errorMessage,
            downloadLoadingFileId: downloadLoadingFileId,
            isGroupDraftSaving: isGroupDraftSaving,
            isRefreshingTask: isRefreshingTask,
            currentSubmission: currentSubmission,
            currentGroupDraft: currentGroupDraft,
            generatedCodeDisplayName: generatedCodeDisplayName,
            codeLineCount: codeLineCount,
            hasSubmittedCode: hasSubmittedCode,
            hasLocalDraft: hasLocalDraft,
            submissionStatusLabel: submissionStatusLabel,
            submissionStatusNote: submissionStatusNote,
            draftStatusLabel: draftStatusLabel,
            draftFootnote: draftFootnote,
            submitButtonText: submitButtonText,
            groupDraftSummary: groupDraftSummary,
            groupDraftMeta: groupDraftMeta,
            formatDateTime: formatDateTime,
            formatFileSize: formatFileSize,
            selectedFileKey: selectedFileKey,
            groupRoleLabel: groupRoleLabel,
            restoreStarterCode: restoreStarterCode,
            restoreSubmittedWork: restoreSubmittedWork,
            restoreGroupDraft: restoreGroupDraft,
            clearLocalDraftManually: clearLocalDraftManually,
            openFilePicker: openFilePicker,
            handleFileChange: handleFileChange,
            removeSelectedFile: removeSelectedFile,
            clearSelectedFiles: clearSelectedFiles,
            toggleRetainedFile: toggleRetainedFile,
            downloadSavedFile: downloadSavedFile,
            refreshTaskDetail: refreshTaskDetail,
            saveGroupDraft: saveGroupDraft,
            submitTask: submitTask,
            openNavigationTask: openNavigationTask,
            goToCourse: goToCourse,
            goToPeerReview: goToPeerReview,
            goToWorkDetail: goToWorkDetail,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
