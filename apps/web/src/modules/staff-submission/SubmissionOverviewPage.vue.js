/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
const __VLS_props = defineProps();
const router = useRouter();
const authStore = useAuthStore();
const overview = ref(null);
const onlyPendingTasks = ref(true);
const selectedCourse = ref('');
const selectedLesson = ref('');
const isLoading = ref(true);
const errorMessage = ref('');
const overviewItems = computed(() => overview.value?.items || []);
const courseOptions = computed(() => {
    const options = new Set();
    for (const item of overviewItems.value) {
        options.add(item.course_title);
    }
    return Array.from(options);
});
const lessonOptions = computed(() => {
    const options = new Map();
    for (const item of overviewItems.value) {
        if (selectedCourse.value && item.course_title !== selectedCourse.value) {
            continue;
        }
        const value = buildLessonFilterValue(item);
        options.set(value, value);
    }
    return Array.from(options, ([value, label]) => ({ value, label }));
});
const filteredItems = computed(() => {
    return overviewItems.value.filter((item) => {
        if (onlyPendingTasks.value && item.pending_count <= 0) {
            return false;
        }
        if (selectedCourse.value && item.course_title !== selectedCourse.value) {
            return false;
        }
        if (selectedLesson.value && buildLessonFilterValue(item) !== selectedLesson.value) {
            return false;
        }
        return true;
    });
});
function formatDateTime(value) {
    if (!value) {
        return '暂无记录';
    }
    return value.replace('T', ' ').slice(0, 16);
}
function buildLessonFilterValue(item) {
    return `${item.unit_title} / ${item.lesson_title}`;
}
function resetFilters() {
    onlyPendingTasks.value = true;
    selectedCourse.value = '';
    selectedLesson.value = '';
}
async function loadOverview() {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        overview.value = await apiGet('/submissions/teacher', authStore.token);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载作品总览失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function goToTask(taskId) {
    await router.push(`/staff/submissions/${taskId}`);
}
function handleRowClick(row) {
    void goToTask(row.task_id);
}
watch(courseOptions, (options) => {
    if (selectedCourse.value && !options.includes(selectedCourse.value)) {
        selectedCourse.value = '';
    }
});
watch(lessonOptions, (options) => {
    if (selectedLesson.value && !options.some((option) => option.value === selectedLesson.value)) {
        selectedLesson.value = '';
    }
});
onMounted(loadOverview);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-select-wide']} */ ;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
const __VLS_0 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    wrap: true,
}));
const __VLS_2 = __VLS_1({
    wrap: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isLoading),
    type: "primary",
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isLoading),
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (__VLS_ctx.loadOverview)
};
__VLS_7.slots.default;
var __VLS_7;
if (__VLS_ctx.filteredItems.length) {
    const __VLS_12 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.filteredItems.length))
                return;
            __VLS_ctx.goToTask(__VLS_ctx.filteredItems[0].task_id);
        }
    };
    __VLS_15.slots.default;
    var __VLS_15;
}
var __VLS_3;
if (__VLS_ctx.errorMessage) {
    const __VLS_20 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_22 = __VLS_21({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
const __VLS_24 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_26 = __VLS_25({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_27.slots;
    const __VLS_28 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ class: "soft-card" },
    }));
    const __VLS_30 = __VLS_29({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        rows: (8),
    }));
    const __VLS_34 = __VLS_33({
        rows: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    var __VLS_31;
}
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-stack" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "metric-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "metric-tile" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.overview?.summary.task_count || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "metric-tile" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.overview?.summary.submission_count || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "metric-tile" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.overview?.summary.reviewed_count || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "metric-tile" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-value" },
    });
    (__VLS_ctx.overview?.summary.pending_count || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
    const __VLS_36 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ class: "soft-card" },
    }));
    const __VLS_38 = __VLS_37({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_39.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "toolbar-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "info-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
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
        (__VLS_ctx.overview?.summary.average_score ?? '--');
        var __VLS_43;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "filter-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "filter-label" },
        });
        const __VLS_44 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            modelValue: (__VLS_ctx.onlyPendingTasks),
        }));
        const __VLS_46 = __VLS_45({
            modelValue: (__VLS_ctx.onlyPendingTasks),
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        const __VLS_48 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            modelValue: (__VLS_ctx.selectedCourse),
            ...{ class: "filter-select" },
            clearable: true,
            placeholder: "筛选课程",
        }));
        const __VLS_50 = __VLS_49({
            modelValue: (__VLS_ctx.selectedCourse),
            ...{ class: "filter-select" },
            clearable: true,
            placeholder: "筛选课程",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.courseOptions))) {
            const __VLS_52 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                key: (option),
                label: (option),
                value: (option),
            }));
            const __VLS_54 = __VLS_53({
                key: (option),
                label: (option),
                value: (option),
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        }
        var __VLS_51;
        const __VLS_56 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            modelValue: (__VLS_ctx.selectedLesson),
            ...{ class: "filter-select filter-select-wide" },
            clearable: true,
            placeholder: "筛选课次",
        }));
        const __VLS_58 = __VLS_57({
            modelValue: (__VLS_ctx.selectedLesson),
            ...{ class: "filter-select filter-select-wide" },
            clearable: true,
            placeholder: "筛选课次",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.lessonOptions))) {
            const __VLS_60 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                key: (option.value),
                label: (option.label),
                value: (option.value),
            }));
            const __VLS_62 = __VLS_61({
                key: (option.value),
                label: (option.label),
                value: (option.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        }
        var __VLS_59;
        if (__VLS_ctx.selectedCourse || __VLS_ctx.selectedLesson || !__VLS_ctx.onlyPendingTasks) {
            const __VLS_64 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
                ...{ 'onClick': {} },
                text: true,
            }));
            const __VLS_66 = __VLS_65({
                ...{ 'onClick': {} },
                text: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_65));
            let __VLS_68;
            let __VLS_69;
            let __VLS_70;
            const __VLS_71 = {
                onClick: (__VLS_ctx.resetFilters)
            };
            __VLS_67.slots.default;
            var __VLS_67;
        }
        const __VLS_72 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            round: true,
            type: "success",
        }));
        const __VLS_74 = __VLS_73({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        (__VLS_ctx.filteredItems.length);
        (__VLS_ctx.overview?.items.length || 0);
        var __VLS_75;
    }
    if (!__VLS_ctx.overview?.items.length) {
        const __VLS_76 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            description: "当前还没有学生提交的作品任务。",
        }));
        const __VLS_78 = __VLS_77({
            description: "当前还没有学生提交的作品任务。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    }
    else if (!__VLS_ctx.filteredItems.length) {
        const __VLS_80 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            description: "当前筛选条件下没有待处理任务。",
        }));
        const __VLS_82 = __VLS_81({
            description: "当前筛选条件下没有待处理任务。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    }
    else {
        const __VLS_84 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            ...{ 'onRowClick': {} },
            data: (__VLS_ctx.filteredItems),
            stripe: true,
        }));
        const __VLS_86 = __VLS_85({
            ...{ 'onRowClick': {} },
            data: (__VLS_ctx.filteredItems),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        let __VLS_88;
        let __VLS_89;
        let __VLS_90;
        const __VLS_91 = {
            onRowClick: (__VLS_ctx.handleRowClick)
        };
        __VLS_87.slots.default;
        const __VLS_92 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            label: "课程",
            minWidth: "220",
            prop: "course_title",
        }));
        const __VLS_94 = __VLS_93({
            label: "课程",
            minWidth: "220",
            prop: "course_title",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        const __VLS_96 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            label: "任务",
            minWidth: "220",
            prop: "task_title",
        }));
        const __VLS_98 = __VLS_97({
            label: "任务",
            minWidth: "220",
            prop: "task_title",
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        const __VLS_100 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            label: "所属课次",
            minWidth: "200",
        }));
        const __VLS_102 = __VLS_101({
            label: "所属课次",
            minWidth: "200",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_103.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (row.lesson_title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "table-note" },
            });
            (row.unit_title);
        }
        var __VLS_103;
        const __VLS_104 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            label: "提交数",
            minWidth: "88",
            prop: "submission_count",
        }));
        const __VLS_106 = __VLS_105({
            label: "提交数",
            minWidth: "88",
            prop: "submission_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        const __VLS_108 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            label: "已评阅",
            minWidth: "88",
            prop: "reviewed_count",
        }));
        const __VLS_110 = __VLS_109({
            label: "已评阅",
            minWidth: "88",
            prop: "reviewed_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        const __VLS_112 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            label: "待评阅",
            minWidth: "88",
            prop: "pending_count",
        }));
        const __VLS_114 = __VLS_113({
            label: "待评阅",
            minWidth: "88",
            prop: "pending_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        const __VLS_116 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            label: "平均分",
            minWidth: "100",
        }));
        const __VLS_118 = __VLS_117({
            label: "平均分",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_119.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.average_score ?? '--');
        }
        var __VLS_119;
        const __VLS_120 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            label: "最近提交",
            minWidth: "170",
        }));
        const __VLS_122 = __VLS_121({
            label: "最近提交",
            minWidth: "170",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        __VLS_123.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_123.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.formatDateTime(row.latest_submitted_at));
        }
        var __VLS_123;
        const __VLS_124 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            label: "操作",
            fixed: "right",
            minWidth: "120",
        }));
        const __VLS_126 = __VLS_125({
            label: "操作",
            fixed: "right",
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_127.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_128 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_130 = __VLS_129({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            let __VLS_132;
            let __VLS_133;
            let __VLS_134;
            const __VLS_135 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.overview?.items.length))
                        return;
                    if (!!(!__VLS_ctx.filteredItems.length))
                        return;
                    __VLS_ctx.goToTask(row.task_id);
                }
            };
            __VLS_131.slots.default;
            var __VLS_131;
        }
        var __VLS_127;
        var __VLS_87;
    }
    var __VLS_39;
}
var __VLS_27;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-select-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['table-note']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            overview: overview,
            onlyPendingTasks: onlyPendingTasks,
            selectedCourse: selectedCourse,
            selectedLesson: selectedLesson,
            isLoading: isLoading,
            errorMessage: errorMessage,
            courseOptions: courseOptions,
            lessonOptions: lessonOptions,
            filteredItems: filteredItems,
            formatDateTime: formatDateTime,
            resetFilters: resetFilters,
            loadOverview: loadOverview,
            goToTask: goToTask,
            handleRowClick: handleRowClick,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
