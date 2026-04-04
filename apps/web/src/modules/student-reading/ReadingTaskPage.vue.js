/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { useAuthStore } from '@/stores/auth';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const taskDetail = ref(null);
const isLoading = ref(true);
const isMarkingRead = ref(false);
const errorMessage = ref('');
const readStatusLabel = computed(() => (taskDetail.value?.reading_progress?.is_read ? '已读' : '未读'));
const readStatusNote = computed(() => {
    if (taskDetail.value?.reading_progress?.is_read) {
        return '你已经完成这条阅读任务的已读确认。';
    }
    return '请先完整阅读本页内容，再点击已读确认。';
});
const readAtText = computed(() => formatDateTime(taskDetail.value?.reading_progress?.read_at || null));
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
function formatDateTime(value) {
    if (!value) {
        return '待确认';
    }
    return value.replace('T', ' ').slice(0, 16);
}
async function loadReadingTask() {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiGet(`/tasks/${route.params.taskId}`, authStore.token);
        if (payload.task_type !== 'reading') {
            await router.replace(buildTaskRoute({ id: payload.id, title: payload.title, task_type: payload.task_type }));
            return;
        }
        taskDetail.value = payload;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载阅读任务失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function markAsRead() {
    if (!taskDetail.value || !authStore.token || taskDetail.value.reading_progress?.is_read) {
        return;
    }
    isMarkingRead.value = true;
    try {
        taskDetail.value = await apiPost(`/tasks/${taskDetail.value.id}/mark-read`, {}, authStore.token);
        ElMessage.success('已记录阅读完成时间');
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '标记已读失败');
    }
    finally {
        isMarkingRead.value = false;
    }
}
async function openNavigationTask(task) {
    await router.push(buildTaskRoute(task));
}
async function goToCourse() {
    const courseId = taskDetail.value?.course.id || route.params.courseId;
    await router.push(`/student/courses/${courseId}`);
}
watch(() => route.params.taskId, () => {
    void loadReadingTask();
}, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
(__VLS_ctx.taskDetail?.title || `阅读任务 ${__VLS_ctx.route.params.taskId}`);
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
if (__VLS_ctx.taskDetail?.task_navigation.next_task) {
    const __VLS_16 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.taskDetail?.task_navigation.next_task))
                return;
            __VLS_ctx.openNavigationTask(__VLS_ctx.taskDetail.task_navigation.next_task);
        }
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
    (__VLS_ctx.readStatusLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.readStatusNote);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value metric-value--small" },
    });
    (__VLS_ctx.taskDetail.is_required ? '必读' : '选读');
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
    (__VLS_ctx.taskDetail.course.lesson_title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.taskDetail.course.unit_title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "mini-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value metric-value--small" },
    });
    (__VLS_ctx.readAtText);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    (__VLS_ctx.taskDetail.task_navigation.next_task ? `下一任务：${__VLS_ctx.taskDetail.task_navigation.next_task.title}` : '这是本课的最后一个任务。');
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
            lg: (16),
            sm: (24),
        }));
        const __VLS_46 = __VLS_45({
            lg: (16),
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
                type: "success",
            }));
            const __VLS_54 = __VLS_53({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            __VLS_55.slots.default;
            var __VLS_55;
        }
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_56 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.taskDetail.description),
            emptyText: "当前阅读任务还没有补充内容。",
        }));
        const __VLS_57 = __VLS_56({
            html: (__VLS_ctx.taskDetail.description),
            emptyText: "当前阅读任务还没有补充内容。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_56));
        var __VLS_51;
        const __VLS_59 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
            ...{ class: "soft-card" },
        }));
        const __VLS_61 = __VLS_60({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_60));
        __VLS_62.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_62.slots;
        }
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.taskDetail.course.content),
            emptyText: "当前学案还没有补充导读内容。",
        }));
        const __VLS_64 = __VLS_63({
            html: (__VLS_ctx.taskDetail.course.content),
            emptyText: "当前学案还没有补充导读内容。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        var __VLS_62;
        var __VLS_47;
        const __VLS_66 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
            lg: (8),
            sm: (24),
        }));
        const __VLS_68 = __VLS_67({
            lg: (8),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_67));
        __VLS_69.slots.default;
        const __VLS_70 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_71 = __VLS_asFunctionalComponent(__VLS_70, new __VLS_70({
            ...{ class: "soft-card" },
        }));
        const __VLS_72 = __VLS_71({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_71));
        __VLS_73.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_73.slots;
        }
        const __VLS_74 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
            column: (1),
            border: true,
        }));
        const __VLS_76 = __VLS_75({
            column: (1),
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_75));
        __VLS_77.slots.default;
        const __VLS_78 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({
            label: "课程",
        }));
        const __VLS_80 = __VLS_79({
            label: "课程",
        }, ...__VLS_functionalComponentArgsRest(__VLS_79));
        __VLS_81.slots.default;
        (__VLS_ctx.taskDetail.course.title);
        var __VLS_81;
        const __VLS_82 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
            label: "课次",
        }));
        const __VLS_84 = __VLS_83({
            label: "课次",
        }, ...__VLS_functionalComponentArgsRest(__VLS_83));
        __VLS_85.slots.default;
        (__VLS_ctx.taskDetail.course.lesson_title);
        var __VLS_85;
        const __VLS_86 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_87 = __VLS_asFunctionalComponent(__VLS_86, new __VLS_86({
            label: "阅读状态",
        }));
        const __VLS_88 = __VLS_87({
            label: "阅读状态",
        }, ...__VLS_functionalComponentArgsRest(__VLS_87));
        __VLS_89.slots.default;
        (__VLS_ctx.readStatusLabel);
        var __VLS_89;
        const __VLS_90 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({
            label: "已读时间",
        }));
        const __VLS_92 = __VLS_91({
            label: "已读时间",
        }, ...__VLS_functionalComponentArgsRest(__VLS_91));
        __VLS_93.slots.default;
        (__VLS_ctx.readAtText);
        var __VLS_93;
        var __VLS_77;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tip-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "tip-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack page-stack--compact" },
        });
        const __VLS_94 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({
            ...{ 'onClick': {} },
            disabled: (Boolean(__VLS_ctx.taskDetail.reading_progress?.is_read)),
            loading: (__VLS_ctx.isMarkingRead),
            ...{ class: "full-width" },
            type: "primary",
        }));
        const __VLS_96 = __VLS_95({
            ...{ 'onClick': {} },
            disabled: (Boolean(__VLS_ctx.taskDetail.reading_progress?.is_read)),
            loading: (__VLS_ctx.isMarkingRead),
            ...{ class: "full-width" },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_95));
        let __VLS_98;
        let __VLS_99;
        let __VLS_100;
        const __VLS_101 = {
            onClick: (__VLS_ctx.markAsRead)
        };
        __VLS_97.slots.default;
        (__VLS_ctx.taskDetail.reading_progress?.is_read ? '已完成已读确认' : '标记为已读');
        var __VLS_97;
        if (__VLS_ctx.taskDetail.task_navigation.next_task) {
            const __VLS_102 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_103 = __VLS_asFunctionalComponent(__VLS_102, new __VLS_102({
                ...{ 'onClick': {} },
                ...{ class: "full-width" },
                plain: true,
            }));
            const __VLS_104 = __VLS_103({
                ...{ 'onClick': {} },
                ...{ class: "full-width" },
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_103));
            let __VLS_106;
            let __VLS_107;
            let __VLS_108;
            const __VLS_109 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskDetail))
                        return;
                    if (!(__VLS_ctx.taskDetail.task_navigation.next_task))
                        return;
                    __VLS_ctx.openNavigationTask(__VLS_ctx.taskDetail.task_navigation.next_task);
                }
            };
            __VLS_105.slots.default;
            var __VLS_105;
        }
        var __VLS_73;
        var __VLS_69;
        var __VLS_43;
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
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RichTextContent: RichTextContent,
            route: route,
            taskDetail: taskDetail,
            isLoading: isLoading,
            isMarkingRead: isMarkingRead,
            errorMessage: errorMessage,
            readStatusLabel: readStatusLabel,
            readStatusNote: readStatusNote,
            readAtText: readAtText,
            markAsRead: markAsRead,
            openNavigationTask: openNavigationTask,
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
