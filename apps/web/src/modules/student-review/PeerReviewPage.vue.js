/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { useAuthStore } from '@/stores/auth';
import { richTextToExcerpt } from '@/utils/richText';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const pageData = ref(null);
const selectedSubmissionId = ref(null);
const selectedFileId = ref(null);
const previewKind = ref('unsupported');
const previewUrl = ref('');
const previewText = ref('');
const isLoading = ref(true);
const isVoting = ref(false);
const isPreviewLoading = ref(false);
const downloadLoadingFileId = ref(null);
const errorMessage = ref('');
const selectedItem = computed(() => {
    if (!pageData.value || selectedSubmissionId.value === null) {
        return null;
    }
    return pageData.value.items.find((item) => item.submission_id === selectedSubmissionId.value) || null;
});
const selectedFile = computed(() => {
    if (!selectedItem.value || selectedFileId.value === null) {
        return null;
    }
    return selectedItem.value.files.find((file) => file.id === selectedFileId.value) || null;
});
const voteDisabled = computed(() => {
    if (!pageData.value || !selectedItem.value) {
        return true;
    }
    if (selectedItem.value.is_mine || selectedItem.value.has_voted) {
        return true;
    }
    return pageData.value.summary.votes_remaining <= 0;
});
const voteStatusText = computed(() => {
    if (!pageData.value || !selectedItem.value) {
        return '请选择一份作品后再进行推荐。';
    }
    if (selectedItem.value.is_mine) {
        return '自己的作品不能给自己投票，但你可以在这里查看当前得票与附件内容。';
    }
    if (selectedItem.value.has_voted) {
        return '你已经推荐过这份作品了，可以继续查看其他同学的作品。';
    }
    if (pageData.value.summary.votes_remaining <= 0) {
        return '当前任务的推荐次数已经用完。';
    }
    return `你还可以推荐 ${pageData.value.summary.votes_remaining} 份作品。`;
});
function revokePreviewUrl() {
    if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = '';
    }
}
function resetPreviewState() {
    revokePreviewUrl();
    previewKind.value = 'unsupported';
    previewText.value = '';
}
function formatDateTime(value) {
    if (!value) {
        return '暂无记录';
    }
    return value.replace('T', ' ').slice(0, 16);
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
function detectPreviewKind(file, blob) {
    const ext = file.ext.toLowerCase();
    const mediaType = blob.type || file.mime_type || '';
    if (ext === 'pdf' || mediaType.includes('pdf')) {
        return 'pdf';
    }
    if (mediaType.startsWith('image/') || ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(ext)) {
        return 'image';
    }
    if (mediaType.startsWith('text/') || ['md', 'txt'].includes(ext)) {
        return 'text';
    }
    return 'unsupported';
}
function pickDefaultSubmission(items) {
    if (!items.length) {
        return null;
    }
    return items.find((item) => !item.is_mine && !item.has_voted) || items[0];
}
function pickDefaultFile(item) {
    if (!item?.files.length) {
        return null;
    }
    return item.files.find((file) => file.previewable) || item.files[0];
}
async function loadPreview(file) {
    resetPreviewState();
    if (!file) {
        selectedFileId.value = null;
        return;
    }
    selectedFileId.value = file.id;
    if (!file.previewable) {
        return;
    }
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        return;
    }
    isPreviewLoading.value = true;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/peer-reviews/files/${file.id}?disposition=inline`, authStore.token);
        const blob = await response.blob();
        const nextKind = detectPreviewKind(file, blob);
        previewKind.value = nextKind;
        if (nextKind === 'text') {
            previewText.value = await blob.text();
            return;
        }
        previewUrl.value = URL.createObjectURL(blob);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载作品预览失败';
    }
    finally {
        isPreviewLoading.value = false;
    }
}
async function syncSelection(preferredSubmissionId) {
    if (!pageData.value || pageData.value.gate.requires_submission || !pageData.value.items.length) {
        selectedSubmissionId.value = null;
        selectedFileId.value = null;
        resetPreviewState();
        return;
    }
    const nextSubmission = pageData.value.items.find((item) => item.submission_id === preferredSubmissionId) ||
        pickDefaultSubmission(pageData.value.items);
    selectedSubmissionId.value = nextSubmission?.submission_id || null;
    const nextFile = nextSubmission?.files.find((file) => file.id === selectedFileId.value) || pickDefaultFile(nextSubmission || null);
    selectedFileId.value = nextFile?.id || null;
    await nextTick();
    await loadPreview(nextFile || null);
}
async function loadPage(preferredSubmissionId) {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        pageData.value = await apiGet(`/peer-reviews/task/${route.params.taskId}`, authStore.token);
        await syncSelection(preferredSubmissionId);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载作品互评失败';
    }
    finally {
        isLoading.value = false;
    }
}
function selectSubmission(submissionId) {
    selectedSubmissionId.value = submissionId;
    selectedFileId.value = null;
    void syncSelection(submissionId);
}
function selectFile(fileId) {
    const file = selectedItem.value?.files.find((item) => item.id === fileId) || null;
    if (!file) {
        return;
    }
    void loadPreview(file);
}
async function voteForSelected() {
    if (!selectedItem.value || !authStore.token || voteDisabled.value) {
        return;
    }
    isVoting.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiPost(`/peer-reviews/task/${route.params.taskId}/vote`, {
            target_submission_id: selectedItem.value.submission_id,
            score: 1,
        }, authStore.token);
        pageData.value = payload;
        ElMessage.success('推荐已保存');
        await syncSelection(selectedItem.value.submission_id);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '保存推荐失败';
    }
    finally {
        isVoting.value = false;
    }
}
async function downloadFile(file) {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        return;
    }
    downloadLoadingFileId.value = file.id;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/peer-reviews/files/${file.id}?disposition=attachment`, authStore.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '下载附件失败';
    }
    finally {
        downloadLoadingFileId.value = null;
    }
}
async function goToTask() {
    const courseId = pageData.value?.task.course.id;
    if (!courseId) {
        return;
    }
    await router.push(`/student/courses/${courseId}/tasks/${route.params.taskId}`);
}
async function goToCourse() {
    const courseId = pageData.value?.task.course.id;
    if (!courseId) {
        return;
    }
    await router.push(`/student/courses/${courseId}`);
}
watch(() => route.params.taskId, () => {
    void loadPage();
});
onMounted(() => {
    void loadPage();
});
onBeforeUnmount(() => {
    resetPreviewState();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-item']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-item']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-card']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-note']} */ ;
/** @type {__VLS_StyleScopedClasses['el-card__body']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-score-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-score-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['vote-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-files-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['vote-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-list']} */ ;
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
(__VLS_ctx.pageData?.task.title || `任务 ${__VLS_ctx.route.params.taskId}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
(__VLS_ctx.pageData?.task.course.title || '正在加载课次信息');
if (__VLS_ctx.pageData) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.pageData.task.course.unit_title);
    (__VLS_ctx.pageData.task.course.lesson_title);
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
    onClick: (__VLS_ctx.goToTask)
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
    onClick: (__VLS_ctx.goToCourse)
};
__VLS_11.slots.default;
var __VLS_11;
if (__VLS_ctx.errorMessage) {
    const __VLS_16 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_18 = __VLS_17({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
if (__VLS_ctx.pageData) {
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
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.pageData.summary.total_works);
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
    (__VLS_ctx.pageData.summary.votes_remaining);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.pageData.summary.votes_used);
    (__VLS_ctx.pageData.summary.vote_limit);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.pageData.summary.my_received_votes);
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
    (__VLS_ctx.pageData.summary.my_peer_review_score ?? '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
}
const __VLS_20 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_22 = __VLS_21({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_23.slots;
    const __VLS_24 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ class: "soft-card" },
    }));
    const __VLS_26 = __VLS_25({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    const __VLS_28 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        rows: (10),
    }));
    const __VLS_30 = __VLS_29({
        rows: (10),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    var __VLS_27;
}
{
    const { default: __VLS_thisSlot } = __VLS_23.slots;
    if (__VLS_ctx.pageData) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack" },
        });
        if (__VLS_ctx.pageData.gate.requires_submission) {
            const __VLS_32 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                ...{ class: "soft-card gate-card" },
            }));
            const __VLS_34 = __VLS_33({
                ...{ class: "soft-card gate-card" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            __VLS_35.slots.default;
            {
                const { header: __VLS_thisSlot } = __VLS_35.slots;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "gate-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.pageData.gate.message);
            const __VLS_36 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                ...{ 'onClick': {} },
                type: "primary",
            }));
            const __VLS_38 = __VLS_37({
                ...{ 'onClick': {} },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            let __VLS_40;
            let __VLS_41;
            let __VLS_42;
            const __VLS_43 = {
                onClick: (__VLS_ctx.goToTask)
            };
            __VLS_39.slots.default;
            var __VLS_39;
            var __VLS_35;
        }
        else {
            const __VLS_44 = {}.ElRow;
            /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                gutter: (16),
            }));
            const __VLS_46 = __VLS_45({
                gutter: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            __VLS_47.slots.default;
            const __VLS_48 = {}.ElCol;
            /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                lg: (9),
                sm: (24),
            }));
            const __VLS_50 = __VLS_49({
                lg: (9),
                sm: (24),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            __VLS_51.slots.default;
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
            {
                const { header: __VLS_thisSlot } = __VLS_55.slots;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                const __VLS_56 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                    round: true,
                    type: "success",
                }));
                const __VLS_58 = __VLS_57({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_57));
                __VLS_59.slots.default;
                (__VLS_ctx.pageData.items.length);
                var __VLS_59;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wall-list" },
            });
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.pageData.items))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.pageData))
                                return;
                            if (!!(__VLS_ctx.pageData.gate.requires_submission))
                                return;
                            __VLS_ctx.selectSubmission(item.submission_id);
                        } },
                    key: (item.submission_id),
                    ...{ class: (['wall-item', { 'wall-item--active': item.submission_id === __VLS_ctx.selectedSubmissionId }]) },
                    type: "button",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wall-item-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (item.student_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wall-tags" },
                });
                if (item.is_mine) {
                    const __VLS_60 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                        round: true,
                        type: "info",
                    }));
                    const __VLS_62 = __VLS_61({
                        round: true,
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
                    __VLS_63.slots.default;
                    var __VLS_63;
                }
                else if (item.has_voted) {
                    const __VLS_64 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
                        round: true,
                        type: "success",
                    }));
                    const __VLS_66 = __VLS_65({
                        round: true,
                        type: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
                    __VLS_67.slots.default;
                    var __VLS_67;
                }
                if (item.is_teacher_recommended) {
                    const __VLS_68 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_70 = __VLS_69({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
                    __VLS_71.slots.default;
                    var __VLS_71;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "wall-meta" },
                });
                (item.student_no);
                (item.class_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "wall-note" },
                });
                (__VLS_ctx.richTextToExcerpt(item.submission_note, 90) || '这份作品还没有填写额外说明。');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wall-item-foot" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (item.vote_count);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (item.peer_review_score);
            }
            var __VLS_55;
            var __VLS_51;
            const __VLS_72 = {}.ElCol;
            /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                lg: (15),
                sm: (24),
            }));
            const __VLS_74 = __VLS_73({
                lg: (15),
                sm: (24),
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            __VLS_75.slots.default;
            const __VLS_76 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                ...{ class: "soft-card stage-card" },
            }));
            const __VLS_78 = __VLS_77({
                ...{ class: "soft-card stage-card" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
            __VLS_79.slots.default;
            {
                const { header: __VLS_thisSlot } = __VLS_79.slots;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                const __VLS_80 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                    round: true,
                    type: "info",
                }));
                const __VLS_82 = __VLS_81({
                    round: true,
                    type: "info",
                }, ...__VLS_functionalComponentArgsRest(__VLS_81));
                __VLS_83.slots.default;
                (__VLS_ctx.selectedItem ? __VLS_ctx.formatDateTime(__VLS_ctx.selectedItem.updated_at) : '请选择作品');
                var __VLS_83;
            }
            if (!__VLS_ctx.selectedItem) {
                const __VLS_84 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                    description: "请选择左侧的一份作品查看",
                }));
                const __VLS_86 = __VLS_85({
                    description: "请选择左侧的一份作品查看",
                }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "stage-stack" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "detail-hero" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wall-item-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.selectedItem.student_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wall-tags" },
                });
                if (__VLS_ctx.selectedItem.is_mine) {
                    const __VLS_88 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                        round: true,
                        type: "info",
                    }));
                    const __VLS_90 = __VLS_89({
                        round: true,
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
                    __VLS_91.slots.default;
                    var __VLS_91;
                }
                if (__VLS_ctx.selectedItem.has_voted) {
                    const __VLS_92 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                        round: true,
                        type: "success",
                    }));
                    const __VLS_94 = __VLS_93({
                        round: true,
                        type: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
                    __VLS_95.slots.default;
                    var __VLS_95;
                }
                if (__VLS_ctx.selectedItem.is_teacher_recommended) {
                    const __VLS_96 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_98 = __VLS_97({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
                    __VLS_99.slots.default;
                    var __VLS_99;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "wall-meta" },
                });
                (__VLS_ctx.selectedItem.student_no);
                (__VLS_ctx.selectedItem.class_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "detail-score-grid" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "detail-score-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.selectedItem.vote_count);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "detail-score-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.selectedItem.peer_review_score);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "content-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                /** @type {[typeof RichTextContent, ]} */ ;
                // @ts-ignore
                const __VLS_100 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
                    html: (__VLS_ctx.selectedItem.submission_note),
                    emptyText: "该作品没有填写额外说明。",
                }));
                const __VLS_101 = __VLS_100({
                    html: (__VLS_ctx.selectedItem.submission_note),
                    emptyText: "该作品没有填写额外说明。",
                }, ...__VLS_functionalComponentArgsRest(__VLS_100));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "vote-panel" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                (__VLS_ctx.voteStatusText);
                const __VLS_103 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.voteDisabled),
                    loading: (__VLS_ctx.isVoting),
                    type: "primary",
                }));
                const __VLS_105 = __VLS_104({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.voteDisabled),
                    loading: (__VLS_ctx.isVoting),
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_104));
                let __VLS_107;
                let __VLS_108;
                let __VLS_109;
                const __VLS_110 = {
                    onClick: (__VLS_ctx.voteForSelected)
                };
                __VLS_106.slots.default;
                var __VLS_106;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "showcase-files-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                const __VLS_111 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
                    round: true,
                    type: "success",
                }));
                const __VLS_113 = __VLS_112({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_112));
                __VLS_114.slots.default;
                (__VLS_ctx.selectedItem.files.length);
                var __VLS_114;
                if (!__VLS_ctx.selectedItem.files.length) {
                    const __VLS_115 = {}.ElEmpty;
                    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                    // @ts-ignore
                    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
                        description: "这份作品没有附件",
                    }));
                    const __VLS_117 = __VLS_116({
                        description: "这份作品没有附件",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "showcase-file-list" },
                    });
                    for (const [file] of __VLS_getVForSourceType((__VLS_ctx.selectedItem.files))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.pageData))
                                        return;
                                    if (!!(__VLS_ctx.pageData.gate.requires_submission))
                                        return;
                                    if (!!(!__VLS_ctx.selectedItem))
                                        return;
                                    if (!!(!__VLS_ctx.selectedItem.files.length))
                                        return;
                                    __VLS_ctx.selectFile(file.id);
                                } },
                            key: (file.id),
                            ...{ class: (['showcase-file-card', { 'showcase-file-card--active': file.id === __VLS_ctx.selectedFileId }]) },
                            type: "button",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "showcase-file-name" },
                        });
                        (file.name);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "showcase-file-meta" },
                        });
                        (file.ext.toUpperCase());
                        (file.size_kb);
                        (file.previewable ? ' · 可直接展示' : ' · 仅下载');
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "showcase-preview" },
                    });
                    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isPreviewLoading) }, null, null);
                    if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'pdf' && __VLS_ctx.previewUrl) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.iframe)({
                            src: (__VLS_ctx.previewUrl),
                            ...{ class: "preview-frame" },
                            title: "互评作品预览",
                        });
                    }
                    else if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'image' && __VLS_ctx.previewUrl) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                            src: (__VLS_ctx.previewUrl),
                            alt: "互评作品预览",
                            ...{ class: "preview-image" },
                        });
                    }
                    else if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'text') {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                            ...{ class: "preview-text" },
                        });
                        (__VLS_ctx.previewText);
                    }
                    else if (__VLS_ctx.selectedFile) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "preview-fallback" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                        const __VLS_119 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
                            ...{ 'onClick': {} },
                            loading: (__VLS_ctx.downloadLoadingFileId === __VLS_ctx.selectedFile.id),
                            type: "success",
                        }));
                        const __VLS_121 = __VLS_120({
                            ...{ 'onClick': {} },
                            loading: (__VLS_ctx.downloadLoadingFileId === __VLS_ctx.selectedFile.id),
                            type: "success",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_120));
                        let __VLS_123;
                        let __VLS_124;
                        let __VLS_125;
                        const __VLS_126 = {
                            onClick: (...[$event]) => {
                                if (!(__VLS_ctx.pageData))
                                    return;
                                if (!!(__VLS_ctx.pageData.gate.requires_submission))
                                    return;
                                if (!!(!__VLS_ctx.selectedItem))
                                    return;
                                if (!!(!__VLS_ctx.selectedItem.files.length))
                                    return;
                                if (!!(!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'pdf' && __VLS_ctx.previewUrl))
                                    return;
                                if (!!(!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'image' && __VLS_ctx.previewUrl))
                                    return;
                                if (!!(!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'text'))
                                    return;
                                if (!(__VLS_ctx.selectedFile))
                                    return;
                                __VLS_ctx.downloadFile(__VLS_ctx.selectedFile);
                            }
                        };
                        __VLS_122.slots.default;
                        var __VLS_122;
                    }
                    else {
                        const __VLS_127 = {}.ElEmpty;
                        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                        // @ts-ignore
                        const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
                            description: "请选择一个附件进行查看",
                        }));
                        const __VLS_129 = __VLS_128({
                            description: "请选择一个附件进行查看",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_128));
                    }
                }
            }
            var __VLS_79;
            var __VLS_75;
            var __VLS_47;
        }
    }
}
var __VLS_23;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gate-body']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-list']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-note']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-item-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['wall-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-score-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-score-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-score-label']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['vote-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-files-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-list']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-image']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-text']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-fallback']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RichTextContent: RichTextContent,
            richTextToExcerpt: richTextToExcerpt,
            route: route,
            pageData: pageData,
            selectedSubmissionId: selectedSubmissionId,
            selectedFileId: selectedFileId,
            previewKind: previewKind,
            previewUrl: previewUrl,
            previewText: previewText,
            isLoading: isLoading,
            isVoting: isVoting,
            isPreviewLoading: isPreviewLoading,
            downloadLoadingFileId: downloadLoadingFileId,
            errorMessage: errorMessage,
            selectedItem: selectedItem,
            selectedFile: selectedFile,
            voteDisabled: voteDisabled,
            voteStatusText: voteStatusText,
            formatDateTime: formatDateTime,
            selectSubmission: selectSubmission,
            selectFile: selectFile,
            voteForSelected: voteForSelected,
            downloadFile: downloadFile,
            goToTask: goToTask,
            goToCourse: goToCourse,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
