/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { apiGetBlob } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { richTextToExcerpt } from '@/utils/richText';
const props = withDefaults(defineProps(), {
    token: '',
    title: '推荐作品展示',
    description: '教师评为 G 级的作品会自动进入这里，便于同学和教师快速查看优秀示例。',
    emptyDescription: '当前还没有推荐作品',
});
const selectedSubmissionId = ref(null);
const selectedFileId = ref(null);
const previewKind = ref('unsupported');
const previewUrl = ref('');
const previewText = ref('');
const isPreviewLoading = ref(false);
const downloadLoadingFileId = ref(null);
const errorMessage = ref('');
const selectedSubmission = computed(() => {
    if (selectedSubmissionId.value === null) {
        return null;
    }
    return props.items.find((item) => item.submission_id === selectedSubmissionId.value) || null;
});
const selectedFile = computed(() => {
    if (!selectedSubmission.value || selectedFileId.value === null) {
        return null;
    }
    return selectedSubmission.value.files.find((file) => file.id === selectedFileId.value) || null;
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
function formatScoreText(score) {
    if (score === null) {
        return '--';
    }
    const gradeMap = new Map([
        [120, 'G'],
        [100, 'A'],
        [80, 'B'],
        [60, 'C'],
        [40, 'D'],
        [20, 'E'],
        [0, 'F'],
    ]);
    const grade = gradeMap.get(score);
    return grade ? `${grade} · ${score}` : `${score}`;
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
function pickDefaultPreviewFile(item) {
    if (!item?.files.length) {
        return null;
    }
    return item.files.find((file) => file.previewable) || item.files[0];
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
async function loadPreview(file) {
    resetPreviewState();
    if (!file) {
        return;
    }
    selectedFileId.value = file.id;
    if (!file.previewable) {
        return;
    }
    if (!props.token) {
        errorMessage.value = '请先登录后查看推荐作品附件';
        return;
    }
    isPreviewLoading.value = true;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, props.token);
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
        errorMessage.value = error instanceof Error ? error.message : '加载推荐作品预览失败';
    }
    finally {
        isPreviewLoading.value = false;
    }
}
async function syncSelectionAndPreview() {
    const nextSubmission = props.items.find((item) => item.submission_id === selectedSubmissionId.value) || props.items[0] || null;
    selectedSubmissionId.value = nextSubmission?.submission_id || null;
    const nextFile = nextSubmission?.files.find((file) => file.id === selectedFileId.value) || pickDefaultPreviewFile(nextSubmission);
    selectedFileId.value = nextFile?.id || null;
    await nextTick();
    await loadPreview(nextFile || null);
}
function selectSubmission(submissionId) {
    selectedSubmissionId.value = submissionId;
    selectedFileId.value = null;
    void syncSelectionAndPreview();
}
function selectFile(fileId) {
    const file = selectedSubmission.value?.files.find((item) => item.id === fileId) || null;
    if (!file) {
        return;
    }
    void loadPreview(file);
}
async function downloadFile(file) {
    if (!props.token) {
        errorMessage.value = '请先登录后下载推荐作品附件';
        return;
    }
    downloadLoadingFileId.value = file.id;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, props.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '下载推荐作品附件失败';
    }
    finally {
        downloadLoadingFileId.value = null;
    }
}
watch(() => props.items, () => {
    void syncSelectionAndPreview();
}, { deep: true, immediate: true });
onBeforeUnmount(() => {
    resetPreviewState();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    token: '',
    title: '推荐作品展示',
    description: '教师评为 G 级的作品会自动进入这里，便于同学和教师快速查看优秀示例。',
    emptyDescription: '当前还没有推荐作品',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['showcase-content']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-description']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-snippet']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-content']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-files-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-header']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-files-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-file-list']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "soft-card showcase-card" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "soft-card showcase-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "showcase-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "showcase-description" },
    });
    (__VLS_ctx.description);
    const __VLS_5 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        round: true,
        type: "success",
    }));
    const __VLS_7 = __VLS_6({
        round: true,
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_8.slots.default;
    (__VLS_ctx.items.length);
    var __VLS_8;
}
if (__VLS_ctx.errorMessage) {
    const __VLS_9 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_11 = __VLS_10({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
}
if (!__VLS_ctx.items.length) {
    const __VLS_13 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        description: (__VLS_ctx.emptyDescription),
    }));
    const __VLS_15 = __VLS_14({
        description: (__VLS_ctx.emptyDescription),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "showcase-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "showcase-list" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.items.length))
                        return;
                    __VLS_ctx.selectSubmission(item.submission_id);
                } },
            key: (item.submission_id),
            ...{ class: (['showcase-list-item', { 'showcase-list-item--active': item.submission_id === __VLS_ctx.selectedSubmissionId }]) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "showcase-item-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.student_name);
        const __VLS_17 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
            round: true,
            type: "success",
        }));
        const __VLS_19 = __VLS_18({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        __VLS_20.slots.default;
        (__VLS_ctx.formatScoreText(item.score));
        var __VLS_20;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "showcase-meta" },
        });
        (item.student_no);
        (item.class_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "showcase-snippet" },
        });
        (__VLS_ctx.richTextToExcerpt(item.submission_note, 90) || item.teacher_comment || '暂无作品说明');
    }
    if (__VLS_ctx.selectedSubmission) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "showcase-stage" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "showcase-info" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "showcase-item-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedSubmission.student_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "showcase-tag-row" },
        });
        const __VLS_21 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
            round: true,
            type: "success",
        }));
        const __VLS_23 = __VLS_22({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_22));
        __VLS_24.slots.default;
        (__VLS_ctx.formatScoreText(__VLS_ctx.selectedSubmission.score));
        var __VLS_24;
        const __VLS_25 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
            round: true,
            type: "info",
        }));
        const __VLS_27 = __VLS_26({
            round: true,
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        __VLS_28.slots.default;
        var __VLS_28;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "showcase-meta" },
        });
        (__VLS_ctx.selectedSubmission.student_no);
        (__VLS_ctx.selectedSubmission.class_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "showcase-meta" },
        });
        (__VLS_ctx.formatDateTime(__VLS_ctx.selectedSubmission.updated_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "showcase-content" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.selectedSubmission.submission_note),
            emptyText: "该作品没有填写额外说明。",
        }));
        const __VLS_30 = __VLS_29({
            html: (__VLS_ctx.selectedSubmission.submission_note),
            emptyText: "该作品没有填写额外说明。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        if (__VLS_ctx.selectedSubmission.teacher_comment) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "showcase-content" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.selectedSubmission.teacher_comment);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "showcase-files-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_32 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            round: true,
            type: "success",
        }));
        const __VLS_34 = __VLS_33({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        (__VLS_ctx.selectedSubmission.files.length);
        var __VLS_35;
        if (!__VLS_ctx.selectedSubmission.files.length) {
            const __VLS_36 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                description: "暂无附件",
            }));
            const __VLS_38 = __VLS_37({
                description: "暂无附件",
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "showcase-file-list" },
            });
            for (const [file] of __VLS_getVForSourceType((__VLS_ctx.selectedSubmission.files))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.items.length))
                                return;
                            if (!(__VLS_ctx.selectedSubmission))
                                return;
                            if (!!(!__VLS_ctx.selectedSubmission.files.length))
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
                    title: "推荐作品预览",
                });
            }
            else if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'image' && __VLS_ctx.previewUrl) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                    src: (__VLS_ctx.previewUrl),
                    alt: "推荐作品预览",
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
                const __VLS_40 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
                    ...{ 'onClick': {} },
                    loading: (__VLS_ctx.downloadLoadingFileId === __VLS_ctx.selectedFile.id),
                    type: "success",
                }));
                const __VLS_42 = __VLS_41({
                    ...{ 'onClick': {} },
                    loading: (__VLS_ctx.downloadLoadingFileId === __VLS_ctx.selectedFile.id),
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_41));
                let __VLS_44;
                let __VLS_45;
                let __VLS_46;
                const __VLS_47 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.items.length))
                            return;
                        if (!(__VLS_ctx.selectedSubmission))
                            return;
                        if (!!(!__VLS_ctx.selectedSubmission.files.length))
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
                __VLS_43.slots.default;
                var __VLS_43;
            }
            else {
                const __VLS_48 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                    description: "请选择一个附件进行查看",
                }));
                const __VLS_50 = __VLS_49({
                    description: "请选择一个附件进行查看",
                }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            }
        }
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-header']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-description']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-list']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-snippet']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-info']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-tag-row']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-content']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-content']} */ ;
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
            selectedSubmissionId: selectedSubmissionId,
            selectedFileId: selectedFileId,
            previewKind: previewKind,
            previewUrl: previewUrl,
            previewText: previewText,
            isPreviewLoading: isPreviewLoading,
            downloadLoadingFileId: downloadLoadingFileId,
            errorMessage: errorMessage,
            selectedSubmission: selectedSubmission,
            selectedFile: selectedFile,
            formatDateTime: formatDateTime,
            formatScoreText: formatScoreText,
            selectSubmission: selectSubmission,
            selectFile: selectFile,
            downloadFile: downloadFile,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
