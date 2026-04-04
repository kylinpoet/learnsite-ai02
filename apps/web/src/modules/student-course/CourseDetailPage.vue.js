/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import { richTextToExcerpt } from '@/utils/richText';
const route = useRoute();
const router = useRouter();
const planDetail = ref(null);
const isLoading = ref(true);
const errorMessage = ref('');
function taskTypeLabel(taskType) {
    if (taskType === 'upload_image') {
        return '上传作品';
    }
    if (taskType === 'reading') {
        return '阅读任务';
    }
    return taskType;
}
async function loadPlan() {
    try {
        planDetail.value = await apiGet(`/lesson-plans/${route.params.courseId}`);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载课程详情失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function openTask(task) {
    if (task.task_type === 'reading') {
        await router.push(`/student/courses/${route.params.courseId}/readings/${task.id}`);
        return;
    }
    if (task.task_type === 'programming') {
        await router.push(`/student/courses/${route.params.courseId}/programs/${task.id}`);
        return;
    }
    await router.push(`/student/courses/${route.params.courseId}/tasks/${task.id}`);
}
onMounted(loadPlan);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['task-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-order']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type']} */ ;
/** @type {__VLS_StyleScopedClasses['task-card']} */ ;
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
(__VLS_ctx.planDetail?.title || `课程 ${__VLS_ctx.route.params.courseId}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
const __VLS_0 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    round: true,
}));
const __VLS_2 = __VLS_1({
    round: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.errorMessage) {
    const __VLS_4 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_6 = __VLS_5({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "soft-card" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "soft-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_11.slots;
}
const __VLS_12 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_14 = __VLS_13({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_15.slots;
    const __VLS_16 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        rows: (4),
    }));
    const __VLS_18 = __VLS_17({
        rows: (4),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
{
    const { default: __VLS_thisSlot } = __VLS_15.slots;
    /** @type {[typeof RichTextContent, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
        html: (__VLS_ctx.planDetail?.content),
        emptyText: "当前课程还没有补充学案导读。",
    }));
    const __VLS_21 = __VLS_20({
        html: (__VLS_ctx.planDetail?.content),
        emptyText: "当前课程还没有补充学案导读。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
}
var __VLS_15;
var __VLS_11;
const __VLS_23 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    ...{ class: "soft-card" },
}));
const __VLS_25 = __VLS_24({
    ...{ class: "soft-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_26.slots;
}
const __VLS_27 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_29 = __VLS_28({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_30.slots;
    const __VLS_31 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        rows: (5),
    }));
    const __VLS_33 = __VLS_32({
        rows: (5),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
}
{
    const { default: __VLS_thisSlot } = __VLS_30.slots;
    if (!__VLS_ctx.planDetail?.tasks.length) {
        const __VLS_35 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
            description: "当前课次还没有任务",
        }));
        const __VLS_37 = __VLS_36({
            description: "当前课次还没有任务",
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "task-list" },
        });
        for (const [task] of __VLS_getVForSourceType((__VLS_ctx.planDetail.tasks))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (task.id),
                ...{ class: "task-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "task-main" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "task-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "task-order" },
            });
            (task.sort_order);
            const __VLS_39 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
                round: true,
                type: (task.is_required ? 'success' : 'warning'),
            }));
            const __VLS_41 = __VLS_40({
                round: true,
                type: (task.is_required ? 'success' : 'warning'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_40));
            __VLS_42.slots.default;
            (task.is_required ? '必做' : '选做');
            var __VLS_42;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            (task.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "task-type" },
            });
            (__VLS_ctx.taskTypeLabel(task.task_type));
            if (__VLS_ctx.richTextToExcerpt(task.description, 90)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "task-desc" },
                });
                (__VLS_ctx.richTextToExcerpt(task.description, 90));
            }
            const __VLS_43 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
                ...{ 'onClick': {} },
                type: "primary",
            }));
            const __VLS_45 = __VLS_44({
                ...{ 'onClick': {} },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_44));
            let __VLS_47;
            let __VLS_48;
            let __VLS_49;
            const __VLS_50 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.planDetail?.tasks.length))
                        return;
                    __VLS_ctx.openTask(task);
                }
            };
            __VLS_46.slots.default;
            var __VLS_46;
        }
    }
}
var __VLS_30;
var __VLS_26;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-card']} */ ;
/** @type {__VLS_StyleScopedClasses['task-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-head']} */ ;
/** @type {__VLS_StyleScopedClasses['task-order']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type']} */ ;
/** @type {__VLS_StyleScopedClasses['task-desc']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RichTextContent: RichTextContent,
            richTextToExcerpt: richTextToExcerpt,
            route: route,
            planDetail: planDetail,
            isLoading: isLoading,
            errorMessage: errorMessage,
            taskTypeLabel: taskTypeLabel,
            openTask: openTask,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
