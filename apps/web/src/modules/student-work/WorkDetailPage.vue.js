/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ElMessage } from 'element-plus';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiGetBlob } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { useAuthStore } from '@/stores/auth';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const detailData = ref(null);
const isLoading = ref(true);
const errorMessage = ref('');
const downloadLoadingFileId = ref(null);
function statusLabel(status) {
    return status === 'reviewed' ? '已评价' : '待教师评价';
}
function statusTagType(status) {
    return status === 'reviewed' ? 'success' : 'warning';
}
function submissionScopeLabel(scope) {
    return scope === 'group' ? '小组共同提交' : '个人提交';
}
function groupDisplayLabel(submission) {
    if (submission.group_name) {
        return submission.group_name;
    }
    if (submission.group_no !== null) {
        return `第 ${submission.group_no} 组`;
    }
    return '当前小组';
}
function taskTypeLabel(taskType) {
    if (taskType === 'programming') {
        return '编程任务';
    }
    if (taskType === 'upload_image') {
        return '上传作品';
    }
    if (taskType === 'reading') {
        return '阅读任务';
    }
    return taskType;
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
async function downloadFile(file) {
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
async function loadDetail() {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        detailData.value = await apiGet(`/submissions/${route.params.submissionId}`, authStore.token);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载作品详情失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function goBack() {
    await router.push('/student/work');
}
async function goToCourse(courseId) {
    await router.push(`/student/courses/${courseId}`);
}
async function goToTask(courseId, taskId) {
    const taskType = detailData.value?.task.task_type;
    const taskSegment = taskType === 'programming' ? 'programs' : taskType === 'reading' ? 'readings' : 'tasks';
    await router.push(`/student/courses/${courseId}/${taskSegment}/${taskId}`);
}
onMounted(loadDetail);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
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
(__VLS_ctx.detailData?.task.title || `作品 ${__VLS_ctx.route.params.submissionId}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
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
    onClick: (__VLS_ctx.goBack)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.detailData) {
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
            if (!(__VLS_ctx.detailData))
                return;
            __VLS_ctx.goToCourse(__VLS_ctx.detailData.course.id);
        }
    };
    __VLS_11.slots.default;
    var __VLS_11;
}
if (__VLS_ctx.detailData?.submission.can_resubmit) {
    const __VLS_16 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.detailData?.submission.can_resubmit))
                return;
            __VLS_ctx.goToTask(__VLS_ctx.detailData.course.id, __VLS_ctx.detailData.task.id);
        }
    };
    __VLS_19.slots.default;
    (__VLS_ctx.detailData?.submission.submission_scope === 'group' ? '再次提交小组作品' : '再次提交作品');
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
        rows: (8),
    }));
    const __VLS_38 = __VLS_37({
        rows: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    var __VLS_35;
}
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    if (__VLS_ctx.detailData) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack" },
        });
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
        (__VLS_ctx.statusLabel(__VLS_ctx.detailData.submission.status));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.detailData.submission.can_resubmit ? '教师尚未完成评价，还可以再次提交。' : '教师已经完成评价，本次提交已锁定。');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.detailData.submission.score ?? '--');
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
        (__VLS_ctx.detailData.submission.peer_review_score ?? '--');
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
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.submissionScopeLabel(__VLS_ctx.detailData.submission.submission_scope));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.detailData.submission.submission_scope === 'group'
            ? `${__VLS_ctx.groupDisplayLabel(__VLS_ctx.detailData.submission)} · 组内成员共享同一份最终提交。`
            : '当前作品按个人独立提交。');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.formatDateTime(__VLS_ctx.detailData.submission.updated_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.detailData.submission.submitted_by_name
            ? `最近保存 ${__VLS_ctx.detailData.submission.submitted_by_name}`
            : '这里显示最近一次提交保存时间。');
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
                type: (__VLS_ctx.statusTagType(__VLS_ctx.detailData.submission.status)),
                round: true,
            }));
            const __VLS_54 = __VLS_53({
                type: (__VLS_ctx.statusTagType(__VLS_ctx.detailData.submission.status)),
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            __VLS_55.slots.default;
            (__VLS_ctx.statusLabel(__VLS_ctx.detailData.submission.status));
            var __VLS_55;
        }
        const __VLS_56 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            column: (1),
            border: true,
        }));
        const __VLS_58 = __VLS_57({
            column: (1),
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        const __VLS_60 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            label: "课程",
        }));
        const __VLS_62 = __VLS_61({
            label: "课程",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        __VLS_63.slots.default;
        (__VLS_ctx.detailData.course.title);
        var __VLS_63;
        const __VLS_64 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            label: "任务",
        }));
        const __VLS_66 = __VLS_65({
            label: "任务",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        (__VLS_ctx.detailData.task.title);
        var __VLS_67;
        const __VLS_68 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            label: "任务类型",
        }));
        const __VLS_70 = __VLS_69({
            label: "任务类型",
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        __VLS_71.slots.default;
        (__VLS_ctx.taskTypeLabel(__VLS_ctx.detailData.task.task_type));
        var __VLS_71;
        const __VLS_72 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            label: "提交时间",
        }));
        const __VLS_74 = __VLS_73({
            label: "提交时间",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        (__VLS_ctx.formatDateTime(__VLS_ctx.detailData.submission.submitted_at));
        var __VLS_75;
        const __VLS_76 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            label: "最近更新",
        }));
        const __VLS_78 = __VLS_77({
            label: "最近更新",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        (__VLS_ctx.formatDateTime(__VLS_ctx.detailData.submission.updated_at));
        var __VLS_79;
        const __VLS_80 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            label: "提交方式",
        }));
        const __VLS_82 = __VLS_81({
            label: "提交方式",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_83.slots.default;
        (__VLS_ctx.submissionScopeLabel(__VLS_ctx.detailData.submission.submission_scope));
        var __VLS_83;
        if (__VLS_ctx.detailData.submission.submission_scope === 'group') {
            const __VLS_84 = {}.ElDescriptionsItem;
            /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                label: "协作小组",
            }));
            const __VLS_86 = __VLS_85({
                label: "协作小组",
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            __VLS_87.slots.default;
            (__VLS_ctx.groupDisplayLabel(__VLS_ctx.detailData.submission));
            var __VLS_87;
        }
        if (__VLS_ctx.detailData.submission.submitted_by_name) {
            const __VLS_88 = {}.ElDescriptionsItem;
            /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                label: "最近提交人",
            }));
            const __VLS_90 = __VLS_89({
                label: "最近提交人",
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            __VLS_91.slots.default;
            (__VLS_ctx.detailData.submission.submitted_by_name);
            var __VLS_91;
        }
        var __VLS_59;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "content-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_92 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.detailData.submission.submission_note),
            emptyText: "暂无作品说明",
        }));
        const __VLS_93 = __VLS_92({
            html: (__VLS_ctx.detailData.submission.submission_note),
            emptyText: "暂无作品说明",
        }, ...__VLS_functionalComponentArgsRest(__VLS_92));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "content-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.detailData.submission.teacher_comment || '教师暂时还没有留下评语。');
        var __VLS_51;
        var __VLS_47;
        const __VLS_95 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
            lg: (9),
            sm: (24),
        }));
        const __VLS_97 = __VLS_96({
            lg: (9),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_96));
        __VLS_98.slots.default;
        const __VLS_99 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
            ...{ class: "soft-card" },
        }));
        const __VLS_101 = __VLS_100({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_100));
        __VLS_102.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_102.slots;
        }
        if (!__VLS_ctx.detailData.files.length) {
            const __VLS_103 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
                description: "暂无附件",
            }));
            const __VLS_105 = __VLS_104({
                description: "暂无附件",
            }, ...__VLS_functionalComponentArgsRest(__VLS_104));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stack-list" },
            });
            for (const [file] of __VLS_getVForSourceType((__VLS_ctx.detailData.files))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (file.id),
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
                const __VLS_107 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
                    round: true,
                    type: "info",
                }));
                const __VLS_109 = __VLS_108({
                    round: true,
                    type: "info",
                }, ...__VLS_functionalComponentArgsRest(__VLS_108));
                __VLS_110.slots.default;
                (file.role);
                var __VLS_110;
                const __VLS_111 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
                    ...{ 'onClick': {} },
                    loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                    link: true,
                    type: "primary",
                }));
                const __VLS_113 = __VLS_112({
                    ...{ 'onClick': {} },
                    loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_112));
                let __VLS_115;
                let __VLS_116;
                let __VLS_117;
                const __VLS_118 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.detailData))
                            return;
                        if (!!(!__VLS_ctx.detailData.files.length))
                            return;
                        __VLS_ctx.downloadFile(file);
                    }
                };
                __VLS_114.slots.default;
                var __VLS_114;
            }
        }
        var __VLS_102;
        const __VLS_119 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
            ...{ class: "soft-card" },
        }));
        const __VLS_121 = __VLS_120({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_120));
        __VLS_122.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_122.slots;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stack-list" },
        });
        const __VLS_123 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.detailData.submission.can_resubmit),
            plain: true,
        }));
        const __VLS_125 = __VLS_124({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.detailData.submission.can_resubmit),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_124));
        let __VLS_127;
        let __VLS_128;
        let __VLS_129;
        const __VLS_130 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.detailData))
                    return;
                __VLS_ctx.goToTask(__VLS_ctx.detailData.course.id, __VLS_ctx.detailData.task.id);
            }
        };
        __VLS_126.slots.default;
        (__VLS_ctx.detailData.submission.submission_scope === 'group' ? '回到小组任务继续提交' : '回到任务页继续提交');
        var __VLS_126;
        const __VLS_131 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
            ...{ 'onClick': {} },
            plain: true,
        }));
        const __VLS_133 = __VLS_132({
            ...{ 'onClick': {} },
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_132));
        let __VLS_135;
        let __VLS_136;
        let __VLS_137;
        const __VLS_138 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.detailData))
                    return;
                __VLS_ctx.goToCourse(__VLS_ctx.detailData.course.id);
            }
        };
        __VLS_134.slots.default;
        var __VLS_134;
        var __VLS_122;
        var __VLS_98;
        var __VLS_43;
    }
}
var __VLS_31;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
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
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RichTextContent: RichTextContent,
            route: route,
            detailData: detailData,
            isLoading: isLoading,
            errorMessage: errorMessage,
            downloadLoadingFileId: downloadLoadingFileId,
            statusLabel: statusLabel,
            statusTagType: statusTagType,
            submissionScopeLabel: submissionScopeLabel,
            groupDisplayLabel: groupDisplayLabel,
            taskTypeLabel: taskTypeLabel,
            formatDateTime: formatDateTime,
            downloadFile: downloadFile,
            goBack: goBack,
            goToCourse: goToCourse,
            goToTask: goToTask,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
