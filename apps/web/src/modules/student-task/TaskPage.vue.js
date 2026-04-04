/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiGetBlob, apiPut, apiUpload } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import { useAuthStore } from '@/stores/auth';
import { normalizeRichTextHtml } from '@/utils/richText';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const taskDetail = ref(null);
const submissionNote = ref('');
const selectedFiles = ref([]);
const fileInputRef = ref(null);
const isLoading = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const downloadLoadingFileId = ref(null);
const isGroupDraftSaving = ref(false);
const isRefreshingTask = ref(false);
const currentSubmission = computed(() => taskDetail.value?.current_submission || null);
const currentGroupDraft = computed(() => taskDetail.value?.group_draft || null);
const displayedCurrentFiles = computed(() => {
    if (selectedFiles.value.length) {
        return [];
    }
    return currentSubmission.value?.files || [];
});
const submissionStatusLabel = computed(() => {
    if (!currentSubmission.value) {
        return '未提交';
    }
    return currentSubmission.value.status === 'reviewed' ? '已评价' : '待教师评价';
});
const submissionStatusNote = computed(() => {
    if (!currentSubmission.value) {
        return taskDetail.value?.submission_scope === 'group' ? '你的小组还没有提交这项任务。' : '你还没有提交这项任务。';
    }
    if (currentSubmission.value.status === 'reviewed') {
        return currentSubmission.value.submission_scope === 'group'
            ? '教师已经完成本组评价，本次提交入口会关闭。'
            : '教师已经完成评价，本次提交入口会关闭。';
    }
    return currentSubmission.value.submission_scope === 'group'
        ? '当前是小组共同提交作品，组内成员都可以再次提交覆盖。'
        : '当前作品还未评价，你可以再次提交覆盖。';
});
const submitButtonText = computed(() => {
    if (!taskDetail.value)
        return '提交作品';
    if (taskDetail.value.submission_scope === 'group') {
        return currentSubmission.value ? '再次提交小组作品' : '提交小组作品';
    }
    return currentSubmission.value ? '再次提交作品' : '提交作品';
});
const groupDraftSummary = computed(() => {
    if (!taskDetail.value?.group_collaboration) {
        return '当前任务不是小组协作任务。';
    }
    if (!currentGroupDraft.value) {
        return '组内还没有共享草稿，可以先同步作品说明再继续讨论附件分工。';
    }
    return currentGroupDraft.value.submission_note
        ? '当前编辑器可以恢复到最近一次共享草稿内容。'
        : '当前共享草稿中还没有作品说明内容。';
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
function pickInitialSubmissionNote(payload) {
    const submissionText = payload.current_submission?.submission_note || '';
    const draftText = payload.group_draft?.submission_note || '';
    if (!payload.group_collaboration || !payload.group_draft) {
        return submissionText;
    }
    if (!payload.current_submission) {
        return draftText || submissionText;
    }
    const draftTime = Date.parse(payload.group_draft.updated_at || '');
    const submissionTime = Date.parse(payload.current_submission.updated_at || '');
    if (!Number.isNaN(draftTime) && (Number.isNaN(submissionTime) || draftTime >= submissionTime)) {
        return draftText || submissionText;
    }
    return submissionText || draftText;
}
function hydrateTaskDetail(payload) {
    taskDetail.value = payload;
    submissionNote.value = pickInitialSubmissionNote(payload);
    selectedFiles.value = [];
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}
function taskTypeLabel(taskType) {
    if (taskType === 'upload_image') {
        return '上传作品';
    }
    if (taskType === 'reading') {
        return '阅读任务';
    }
    return taskType;
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
function formatDate(value) {
    return value.split('-').join('.');
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
function getDownloadFileName(contentDisposition, fallbackName) {
    if (!contentDisposition) {
        return fallbackName;
    }
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
        return decodeURIComponent(utf8Match[1]);
    }
    const basicMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
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
        hydrateTaskDetail(payload);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载任务详情失败';
    }
    finally {
        isLoading.value = false;
    }
}
function applyGroupDraft() {
    if (!currentGroupDraft.value) {
        return;
    }
    submissionNote.value = currentGroupDraft.value.submission_note || '';
    ElMessage.success('已恢复到小组共享草稿');
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
        const payload = await apiPut(`/tasks/${taskDetail.value.id}/group-draft`, { submission_note: normalizeRichTextHtml(submissionNote.value), source_code: '' }, authStore.token);
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
    const hadSubmission = Boolean(currentSubmission.value);
    const formData = new FormData();
    formData.append('submission_note', normalizeRichTextHtml(submissionNote.value));
    selectedFiles.value.forEach((file) => {
        formData.append('files', file);
    });
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiUpload(`/tasks/${taskDetail.value.id}/submit`, formData, authStore.token);
        hydrateTaskDetail(payload);
        ElMessage.success(taskDetail.value.submission_scope === 'group'
            ? hadSubmission
                ? '小组作品已更新提交'
                : '小组作品提交成功'
            : hadSubmission
                ? '作品已更新提交'
                : '作品提交成功');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '提交作品失败';
    }
    finally {
        isSubmitting.value = false;
    }
}
async function goToCourse() {
    const courseId = taskDetail.value?.course.id || route.params.courseId;
    await router.push(`/student/courses/${courseId}`);
}
async function goToWorkDetail() {
    if (!currentSubmission.value) {
        return;
    }
    await router.push(`/student/work/${currentSubmission.value.id}`);
}
async function goToPeerReview() {
    await router.push(`/student/reviews/${route.params.taskId}`);
}
onMounted(loadTask);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['description-block']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
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
(__VLS_ctx.taskDetail?.title || `任务 ${__VLS_ctx.route.params.taskId}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
(__VLS_ctx.taskDetail?.course.title || '正在加载课次信息');
if (__VLS_ctx.taskDetail) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
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
    onClick: (__VLS_ctx.goToPeerReview)
};
__VLS_11.slots.default;
var __VLS_11;
if (__VLS_ctx.currentSubmission) {
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
        onClick: (__VLS_ctx.goToWorkDetail)
    };
    __VLS_19.slots.default;
    var __VLS_19;
}
if (__VLS_ctx.errorMessage) {
    const __VLS_24 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_26 = __VLS_25({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.currentSubmission?.files.length || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.selectedFiles.length ? '本次选中的附件将替换当前附件。' : '不重新选附件时，会保留当前附件。');
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
}
const __VLS_28 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_30 = __VLS_29({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_31.slots;
    const __VLS_32 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        ...{ class: "soft-card" },
    }));
    const __VLS_34 = __VLS_33({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        rows: (10),
    }));
    const __VLS_38 = __VLS_37({
        rows: (10),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    var __VLS_35;
}
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    if (__VLS_ctx.taskDetail) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack" },
        });
        const __VLS_40 = {}.ElRow;
        /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            gutter: (16),
        }));
        const __VLS_42 = __VLS_41({
            gutter: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        const __VLS_44 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            lg: (15),
            sm: (24),
        }));
        const __VLS_46 = __VLS_45({
            lg: (15),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        const __VLS_48 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            ...{ class: "soft-card" },
        }));
        const __VLS_50 = __VLS_49({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_51.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_52 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                round: true,
            }));
            const __VLS_54 = __VLS_53({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            __VLS_55.slots.default;
            (__VLS_ctx.taskTypeLabel(__VLS_ctx.taskDetail.task_type));
            var __VLS_55;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "description-block" },
        });
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_56 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.taskDetail.description),
            emptyText: "当前任务还没有补充说明。",
        }));
        const __VLS_57 = __VLS_56({
            html: (__VLS_ctx.taskDetail.description),
            emptyText: "当前任务还没有补充说明。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_56));
        const __VLS_59 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({}));
        const __VLS_61 = __VLS_60({}, ...__VLS_functionalComponentArgsRest(__VLS_60));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "submission-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "submission-editor" },
        });
        /** @type {[typeof RichTextEditor, ]} */ ;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent(RichTextEditor, new RichTextEditor({
            modelValue: (__VLS_ctx.submissionNote),
            minHeight: (260),
            placeholder: "写下你的设计思路、步骤说明、图片说明或补充内容。支持标题、列表、加粗、链接和图片。",
        }));
        const __VLS_64 = __VLS_63({
            modelValue: (__VLS_ctx.submissionNote),
            minHeight: (260),
            placeholder: "写下你的设计思路、步骤说明、图片说明或补充内容。支持标题、列表、加粗、链接和图片。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head section-head--compact" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (__VLS_ctx.handleFileChange) },
            ref: "fileInputRef",
            ...{ class: "file-input" },
            multiple: true,
            type: "file",
        });
        /** @type {typeof __VLS_ctx.fileInputRef} */ ;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-group" },
        });
        const __VLS_66 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            plain: true,
        }));
        const __VLS_68 = __VLS_67({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_67));
        let __VLS_70;
        let __VLS_71;
        let __VLS_72;
        const __VLS_73 = {
            onClick: (__VLS_ctx.openFilePicker)
        };
        __VLS_69.slots.default;
        var __VLS_69;
        if (__VLS_ctx.selectedFiles.length) {
            const __VLS_74 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
                ...{ 'onClick': {} },
                disabled: (__VLS_ctx.isSubmitting),
                plain: true,
            }));
            const __VLS_76 = __VLS_75({
                ...{ 'onClick': {} },
                disabled: (__VLS_ctx.isSubmitting),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_75));
            let __VLS_78;
            let __VLS_79;
            let __VLS_80;
            const __VLS_81 = {
                onClick: (__VLS_ctx.clearSelectedFiles)
            };
            __VLS_77.slots.default;
            var __VLS_77;
        }
        if (!__VLS_ctx.taskDetail.can_submit) {
            const __VLS_82 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
                closable: (false),
                title: "这份作业已经完成教师评价，不能再次提交。",
                type: "warning",
            }));
            const __VLS_84 = __VLS_83({
                closable: (false),
                title: "这份作业已经完成教师评价，不能再次提交。",
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_83));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stack-list" },
        });
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
            const __VLS_86 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_87 = __VLS_asFunctionalComponent(__VLS_86, new __VLS_86({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_88 = __VLS_87({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_87));
            let __VLS_90;
            let __VLS_91;
            let __VLS_92;
            const __VLS_93 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskDetail))
                        return;
                    __VLS_ctx.removeSelectedFile(file.name);
                }
            };
            __VLS_89.slots.default;
            var __VLS_89;
        }
        for (const [file] of __VLS_getVForSourceType((__VLS_ctx.displayedCurrentFiles))) {
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
            const __VLS_94 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({
                round: true,
                type: "info",
            }));
            const __VLS_96 = __VLS_95({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_95));
            __VLS_97.slots.default;
            (file.role);
            var __VLS_97;
            const __VLS_98 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                link: true,
                type: "primary",
            }));
            const __VLS_100 = __VLS_99({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_99));
            let __VLS_102;
            let __VLS_103;
            let __VLS_104;
            const __VLS_105 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskDetail))
                        return;
                    __VLS_ctx.downloadSavedFile(file);
                }
            };
            __VLS_101.slots.default;
            var __VLS_101;
        }
        if (!__VLS_ctx.selectedFiles.length && !__VLS_ctx.displayedCurrentFiles.length) {
            const __VLS_106 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_107 = __VLS_asFunctionalComponent(__VLS_106, new __VLS_106({
                description: "还没有上传附件",
            }));
            const __VLS_108 = __VLS_107({
                description: "还没有上传附件",
            }, ...__VLS_functionalComponentArgsRest(__VLS_107));
        }
        var __VLS_51;
        var __VLS_47;
        const __VLS_110 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_111 = __VLS_asFunctionalComponent(__VLS_110, new __VLS_110({
            lg: (9),
            sm: (24),
        }));
        const __VLS_112 = __VLS_111({
            lg: (9),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_111));
        __VLS_113.slots.default;
        const __VLS_114 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_115 = __VLS_asFunctionalComponent(__VLS_114, new __VLS_114({
            ...{ class: "soft-card" },
        }));
        const __VLS_116 = __VLS_115({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_115));
        __VLS_117.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_117.slots;
        }
        const __VLS_118 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_119 = __VLS_asFunctionalComponent(__VLS_118, new __VLS_118({
            column: (1),
            border: true,
        }));
        const __VLS_120 = __VLS_119({
            column: (1),
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_119));
        __VLS_121.slots.default;
        const __VLS_122 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_123 = __VLS_asFunctionalComponent(__VLS_122, new __VLS_122({
            label: "课程",
        }));
        const __VLS_124 = __VLS_123({
            label: "课程",
        }, ...__VLS_functionalComponentArgsRest(__VLS_123));
        __VLS_125.slots.default;
        (__VLS_ctx.taskDetail.course.title);
        var __VLS_125;
        const __VLS_126 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_127 = __VLS_asFunctionalComponent(__VLS_126, new __VLS_126({
            label: "发布时间",
        }));
        const __VLS_128 = __VLS_127({
            label: "发布时间",
        }, ...__VLS_functionalComponentArgsRest(__VLS_127));
        __VLS_129.slots.default;
        (__VLS_ctx.formatDate(__VLS_ctx.taskDetail.course.assigned_date));
        var __VLS_129;
        const __VLS_130 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_131 = __VLS_asFunctionalComponent(__VLS_130, new __VLS_130({
            label: "最近提交",
        }));
        const __VLS_132 = __VLS_131({
            label: "最近提交",
        }, ...__VLS_functionalComponentArgsRest(__VLS_131));
        __VLS_133.slots.default;
        (__VLS_ctx.formatDateTime(__VLS_ctx.currentSubmission?.updated_at || null));
        var __VLS_133;
        const __VLS_134 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
            label: "提交方式",
        }));
        const __VLS_136 = __VLS_135({
            label: "提交方式",
        }, ...__VLS_functionalComponentArgsRest(__VLS_135));
        __VLS_137.slots.default;
        (__VLS_ctx.taskDetail.submission_scope === 'group' ? '小组共同提交' : '个人提交');
        var __VLS_137;
        if (__VLS_ctx.currentSubmission?.submission_scope === 'group') {
            const __VLS_138 = {}.ElDescriptionsItem;
            /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
            // @ts-ignore
            const __VLS_139 = __VLS_asFunctionalComponent(__VLS_138, new __VLS_138({
                label: "最近提交人",
            }));
            const __VLS_140 = __VLS_139({
                label: "最近提交人",
            }, ...__VLS_functionalComponentArgsRest(__VLS_139));
            __VLS_141.slots.default;
            (__VLS_ctx.currentSubmission?.submitted_by_name || '组内成员');
            var __VLS_141;
        }
        var __VLS_121;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tip-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "tip-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.taskDetail.submission_scope === 'group' ? '当前任务按小组共同提交，组内成员看到的是同一份作品。' : '当前任务按个人独立提交。');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        if (__VLS_ctx.taskDetail.submission_scope === 'group') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        }
        const __VLS_142 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            loading: (__VLS_ctx.isSubmitting),
            ...{ class: "submit-button" },
            type: "primary",
        }));
        const __VLS_144 = __VLS_143({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.taskDetail.can_submit),
            loading: (__VLS_ctx.isSubmitting),
            ...{ class: "submit-button" },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_143));
        let __VLS_146;
        let __VLS_147;
        let __VLS_148;
        const __VLS_149 = {
            onClick: (__VLS_ctx.submitTask)
        };
        __VLS_145.slots.default;
        (__VLS_ctx.submitButtonText);
        var __VLS_145;
        var __VLS_117;
        if (__VLS_ctx.taskDetail.group_collaboration) {
            const __VLS_150 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
                ...{ class: "soft-card" },
            }));
            const __VLS_152 = __VLS_151({
                ...{ class: "soft-card" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_151));
            __VLS_153.slots.default;
            {
                const { header: __VLS_thisSlot } = __VLS_153.slots;
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
            const __VLS_154 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
                round: true,
                type: "info",
            }));
            const __VLS_156 = __VLS_155({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_155));
            __VLS_157.slots.default;
            (__VLS_ctx.currentGroupDraft ? `版本 ${__VLS_ctx.currentGroupDraft.version_no}` : '未同步');
            var __VLS_157;
            if (__VLS_ctx.currentGroupDraft?.updated_by_name) {
                const __VLS_158 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
                    round: true,
                    type: "success",
                }));
                const __VLS_160 = __VLS_159({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_159));
                __VLS_161.slots.default;
                (__VLS_ctx.currentGroupDraft.updated_by_name);
                var __VLS_161;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "page-stack page-stack--compact" },
            });
            const __VLS_162 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.taskDetail.can_submit),
                loading: (__VLS_ctx.isGroupDraftSaving),
                plain: true,
                type: "primary",
            }));
            const __VLS_164 = __VLS_163({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.taskDetail.can_submit),
                loading: (__VLS_ctx.isGroupDraftSaving),
                plain: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_163));
            let __VLS_166;
            let __VLS_167;
            let __VLS_168;
            const __VLS_169 = {
                onClick: (__VLS_ctx.saveGroupDraft)
            };
            __VLS_165.slots.default;
            var __VLS_165;
            const __VLS_170 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.currentGroupDraft),
                plain: true,
            }));
            const __VLS_172 = __VLS_171({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.currentGroupDraft),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_171));
            let __VLS_174;
            let __VLS_175;
            let __VLS_176;
            const __VLS_177 = {
                onClick: (__VLS_ctx.applyGroupDraft)
            };
            __VLS_173.slots.default;
            var __VLS_173;
            const __VLS_178 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.isRefreshingTask),
                plain: true,
            }));
            const __VLS_180 = __VLS_179({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.isRefreshingTask),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_179));
            let __VLS_182;
            let __VLS_183;
            let __VLS_184;
            const __VLS_185 = {
                onClick: (__VLS_ctx.refreshTaskDetail)
            };
            __VLS_181.slots.default;
            var __VLS_181;
            var __VLS_153;
        }
        var __VLS_113;
        var __VLS_43;
        /** @type {[typeof RecommendedWorksShowcase, ]} */ ;
        // @ts-ignore
        const __VLS_186 = __VLS_asFunctionalComponent(RecommendedWorksShowcase, new RecommendedWorksShowcase({
            items: (__VLS_ctx.taskDetail.recommended_showcase.items),
            token: (__VLS_ctx.authStore.token || ''),
            description: "教师评分为 G 级的作品会自动进入这里，便于同学参考优秀完成方式。",
            emptyDescription: "当前课题还没有推荐作品",
            title: "当前课题推荐作品展示",
        }));
        const __VLS_187 = __VLS_186({
            items: (__VLS_ctx.taskDetail.recommended_showcase.items),
            token: (__VLS_ctx.authStore.token || ''),
            description: "教师评分为 G 级的作品会自动进入这里，便于同学参考优秀完成方式。",
            emptyDescription: "当前课题还没有推荐作品",
            title: "当前课题推荐作品展示",
        }, ...__VLS_functionalComponentArgsRest(__VLS_186));
    }
}
var __VLS_31;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
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
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['description-block']} */ ;
/** @type {__VLS_StyleScopedClasses['submission-form']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['submission-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['file-input']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-title']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-title']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack--compact']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RichTextContent: RichTextContent,
            RichTextEditor: RichTextEditor,
            RecommendedWorksShowcase: RecommendedWorksShowcase,
            route: route,
            authStore: authStore,
            taskDetail: taskDetail,
            submissionNote: submissionNote,
            selectedFiles: selectedFiles,
            fileInputRef: fileInputRef,
            isLoading: isLoading,
            isSubmitting: isSubmitting,
            errorMessage: errorMessage,
            downloadLoadingFileId: downloadLoadingFileId,
            isGroupDraftSaving: isGroupDraftSaving,
            isRefreshingTask: isRefreshingTask,
            currentSubmission: currentSubmission,
            currentGroupDraft: currentGroupDraft,
            displayedCurrentFiles: displayedCurrentFiles,
            submissionStatusLabel: submissionStatusLabel,
            submissionStatusNote: submissionStatusNote,
            submitButtonText: submitButtonText,
            groupDraftSummary: groupDraftSummary,
            groupDraftMeta: groupDraftMeta,
            taskTypeLabel: taskTypeLabel,
            groupRoleLabel: groupRoleLabel,
            formatDate: formatDate,
            formatDateTime: formatDateTime,
            formatFileSize: formatFileSize,
            selectedFileKey: selectedFileKey,
            openFilePicker: openFilePicker,
            handleFileChange: handleFileChange,
            removeSelectedFile: removeSelectedFile,
            clearSelectedFiles: clearSelectedFiles,
            downloadSavedFile: downloadSavedFile,
            applyGroupDraft: applyGroupDraft,
            refreshTaskDetail: refreshTaskDetail,
            saveGroupDraft: saveGroupDraft,
            submitTask: submitTask,
            goToCourse: goToCourse,
            goToWorkDetail: goToWorkDetail,
            goToPeerReview: goToPeerReview,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
