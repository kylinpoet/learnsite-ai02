/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiPost } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const launchpadData = ref(null);
const currentSession = ref(null);
const isLoading = ref(true);
const isLaunching = ref(false);
const errorMessage = ref('');
const launchForm = ref({
    class_id: null,
    plan_id: null,
});
const pageTitle = computed(() => {
    if (currentSession.value) {
        return `${currentSession.value.class.name} · ${currentSession.value.plan.title}`;
    }
    return '课堂开启与过程控制';
});
const totalStudentCount = computed(() => (launchpadData.value?.classes || []).reduce((sum, schoolClass) => sum + schoolClass.student_count, 0));
const launchPreviewText = computed(() => {
    if (!launchpadData.value) {
        return '请选择学案和班级。';
    }
    const selectedPlan = launchpadData.value.ready_plans.find((plan) => plan.id === launchForm.value.plan_id);
    const selectedClass = launchpadData.value.classes.find((schoolClass) => schoolClass.id === launchForm.value.class_id);
    if (!selectedPlan || !selectedClass) {
        return '请选择学案和班级。';
    }
    return `把“${selectedPlan.title}”推送到 ${selectedClass.class_name}，学生将能在首页看到这份课程。`;
});
function formatDateTime(value) {
    return value.replace('T', ' ').slice(0, 16);
}
function applyQueryPlan() {
    const planId = Number(route.query.planId);
    if (Number.isFinite(planId) && planId > 0) {
        launchForm.value.plan_id = planId;
    }
}
function applyDefaultSelections() {
    if (!launchpadData.value) {
        return;
    }
    if (!launchForm.value.class_id) {
        launchForm.value.class_id = launchpadData.value.classes[0]?.id || null;
    }
    if (!launchForm.value.plan_id) {
        launchForm.value.plan_id = launchpadData.value.ready_plans[0]?.id || null;
    }
    applyQueryPlan();
}
async function loadLaunchpad() {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师或管理员账号';
        return;
    }
    const payload = await apiGet('/classroom/launchpad', authStore.token);
    launchpadData.value = payload;
    applyDefaultSelections();
}
async function loadSessionDetail() {
    if (!authStore.token) {
        currentSession.value = null;
        return;
    }
    const sessionId = Number(route.params.sessionId);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
        currentSession.value = null;
        return;
    }
    currentSession.value = await apiGet(`/classroom/sessions/${sessionId}`, authStore.token);
}
async function loadPage() {
    isLoading.value = true;
    errorMessage.value = '';
    try {
        await loadLaunchpad();
        await loadSessionDetail();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载课堂中控失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function startClassroom() {
    if (!authStore.token || !launchForm.value.class_id || !launchForm.value.plan_id) {
        return;
    }
    isLaunching.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiPost('/classroom/sessions', {
            class_id: launchForm.value.class_id,
            plan_id: launchForm.value.plan_id,
        }, authStore.token);
        ElMessage.success(`课堂已开启，已推送给 ${payload.progress_created_count} 位学生`);
        await router.push(`/staff/classroom/${payload.session.session_id}`);
        await loadPage();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '开课失败';
    }
    finally {
        isLaunching.value = false;
    }
}
async function openSession(sessionId) {
    await router.push(`/staff/classroom/${sessionId}`);
}
watch(() => [route.params.sessionId, route.query.planId], () => {
    void loadPage();
});
onMounted(() => {
    void loadPage();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['launch-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['launch-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['launch-toolbar']} */ ;
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
(__VLS_ctx.pageTitle);
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
    plain: true,
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/staff/lesson-plans');
    }
};
__VLS_7.slots.default;
var __VLS_7;
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClick: (__VLS_ctx.loadPage)
};
__VLS_15.slots.default;
var __VLS_15;
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
    if (__VLS_ctx.launchpadData) {
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
        (__VLS_ctx.launchpadData.ready_plans.length);
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
        (__VLS_ctx.launchpadData.classes.length);
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
        (__VLS_ctx.launchpadData.active_sessions.length);
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
        (__VLS_ctx.totalStudentCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        const __VLS_36 = {}.ElRow;
        /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            gutter: (16),
        }));
        const __VLS_38 = __VLS_37({
            gutter: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        __VLS_39.slots.default;
        const __VLS_40 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            lg: (10),
            sm: (24),
        }));
        const __VLS_42 = __VLS_41({
            lg: (10),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        const __VLS_44 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            ...{ class: "soft-card" },
        }));
        const __VLS_46 = __VLS_45({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_47.slots;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "launch-toolbar" },
        });
        const __VLS_48 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            modelValue: (__VLS_ctx.launchForm.class_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择班级",
        }));
        const __VLS_50 = __VLS_49({
            modelValue: (__VLS_ctx.launchForm.class_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择班级",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        for (const [schoolClass] of __VLS_getVForSourceType((__VLS_ctx.launchpadData.classes))) {
            const __VLS_52 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                key: (schoolClass.id),
                label: (`${schoolClass.class_name} · ${schoolClass.student_count} 人`),
                value: (schoolClass.id),
            }));
            const __VLS_54 = __VLS_53({
                key: (schoolClass.id),
                label: (`${schoolClass.class_name} · ${schoolClass.student_count} 人`),
                value: (schoolClass.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        }
        var __VLS_51;
        const __VLS_56 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            modelValue: (__VLS_ctx.launchForm.plan_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择已发布学案",
        }));
        const __VLS_58 = __VLS_57({
            modelValue: (__VLS_ctx.launchForm.plan_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择已发布学案",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        for (const [plan] of __VLS_getVForSourceType((__VLS_ctx.launchpadData.ready_plans))) {
            const __VLS_60 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                key: (plan.id),
                label: (`${plan.title} · ${plan.lesson.unit_title}`),
                value: (plan.id),
            }));
            const __VLS_62 = __VLS_61({
                key: (plan.id),
                label: (`${plan.title} · ${plan.lesson.unit_title}`),
                value: (plan.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        }
        var __VLS_59;
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.launchForm.plan_id || !__VLS_ctx.launchForm.class_id),
            loading: (__VLS_ctx.isLaunching),
            type: "primary",
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.launchForm.plan_id || !__VLS_ctx.launchForm.class_id),
            loading: (__VLS_ctx.isLaunching),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (__VLS_ctx.startClassroom)
        };
        __VLS_67.slots.default;
        var __VLS_67;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "launch-preview" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.launchPreviewText);
        var __VLS_47;
        var __VLS_43;
        const __VLS_72 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            lg: (14),
            sm: (24),
        }));
        const __VLS_74 = __VLS_73({
            lg: (14),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        if (__VLS_ctx.currentSession) {
            const __VLS_76 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                ...{ class: "soft-card" },
            }));
            const __VLS_78 = __VLS_77({
                ...{ class: "soft-card" },
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
                    type: "warning",
                }));
                const __VLS_82 = __VLS_81({
                    round: true,
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_81));
                __VLS_83.slots.default;
                (__VLS_ctx.currentSession.status);
                var __VLS_83;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stack-list" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.currentSession.plan.title);
            const __VLS_84 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                round: true,
                type: "success",
            }));
            const __VLS_86 = __VLS_85({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            __VLS_87.slots.default;
            (__VLS_ctx.currentSession.class.name);
            var __VLS_87;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.currentSession.plan.unit_title);
            (__VLS_ctx.currentSession.plan.lesson_title);
            const __VLS_88 = {}.ElSpace;
            /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                wrap: true,
            }));
            const __VLS_90 = __VLS_89({
                wrap: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            __VLS_91.slots.default;
            const __VLS_92 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                round: true,
            }));
            const __VLS_94 = __VLS_93({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_93));
            __VLS_95.slots.default;
            (__VLS_ctx.formatDateTime(__VLS_ctx.currentSession.started_at));
            var __VLS_95;
            const __VLS_96 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                round: true,
                type: "success",
            }));
            const __VLS_98 = __VLS_97({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_97));
            __VLS_99.slots.default;
            (__VLS_ctx.currentSession.task_count);
            var __VLS_99;
            const __VLS_100 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                round: true,
                type: "info",
            }));
            const __VLS_102 = __VLS_101({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_101));
            __VLS_103.slots.default;
            (__VLS_ctx.currentSession.attendance_ready ? '是' : '否');
            var __VLS_103;
            var __VLS_91;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "session-actions" },
            });
            const __VLS_104 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                ...{ 'onClick': {} },
                type: "primary",
            }));
            const __VLS_106 = __VLS_105({
                ...{ 'onClick': {} },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
            let __VLS_108;
            let __VLS_109;
            let __VLS_110;
            const __VLS_111 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.launchpadData))
                        return;
                    if (!(__VLS_ctx.currentSession))
                        return;
                    __VLS_ctx.router.push(`/staff/lesson-plans/${__VLS_ctx.currentSession.plan.id}`);
                }
            };
            __VLS_107.slots.default;
            var __VLS_107;
            const __VLS_112 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                ...{ 'onClick': {} },
                plain: true,
            }));
            const __VLS_114 = __VLS_113({
                ...{ 'onClick': {} },
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
            let __VLS_116;
            let __VLS_117;
            let __VLS_118;
            const __VLS_119 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.launchpadData))
                        return;
                    if (!(__VLS_ctx.currentSession))
                        return;
                    __VLS_ctx.router.push('/staff/submissions');
                }
            };
            __VLS_115.slots.default;
            var __VLS_115;
            var __VLS_79;
        }
        const __VLS_120 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ class: "soft-card" },
        }));
        const __VLS_122 = __VLS_121({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        __VLS_123.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_123.slots;
        }
        if (!__VLS_ctx.launchpadData.ready_plans.length) {
            const __VLS_124 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                description: "请先到学案管理发布一份学案",
            }));
            const __VLS_126 = __VLS_125({
                description: "请先到学案管理发布一份学案",
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        }
        else {
            const __VLS_128 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
                data: (__VLS_ctx.launchpadData.ready_plans),
                stripe: true,
            }));
            const __VLS_130 = __VLS_129({
                data: (__VLS_ctx.launchpadData.ready_plans),
                stripe: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            __VLS_131.slots.default;
            const __VLS_132 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                label: "学案标题",
                minWidth: "240",
                prop: "title",
            }));
            const __VLS_134 = __VLS_133({
                label: "学案标题",
                minWidth: "240",
                prop: "title",
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            const __VLS_136 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                label: "状态",
                minWidth: "100",
            }));
            const __VLS_138 = __VLS_137({
                label: "状态",
                minWidth: "100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_137));
            __VLS_139.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_139.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_140 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                    round: true,
                    type: (row.status === 'active' ? 'warning' : 'success'),
                }));
                const __VLS_142 = __VLS_141({
                    round: true,
                    type: (row.status === 'active' ? 'warning' : 'success'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_141));
                __VLS_143.slots.default;
                (row.status === 'active' ? '上课中' : '已发布');
                var __VLS_143;
            }
            var __VLS_139;
            const __VLS_144 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                label: "课次",
                minWidth: "220",
            }));
            const __VLS_146 = __VLS_145({
                label: "课次",
                minWidth: "220",
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            __VLS_147.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_147.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.lesson.unit_title);
                (row.lesson.title);
            }
            var __VLS_147;
            const __VLS_148 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                label: "任务数",
                minWidth: "90",
                prop: "task_count",
            }));
            const __VLS_150 = __VLS_149({
                label: "任务数",
                minWidth: "90",
                prop: "task_count",
            }, ...__VLS_functionalComponentArgsRest(__VLS_149));
            const __VLS_152 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                label: "操作",
                minWidth: "120",
            }));
            const __VLS_154 = __VLS_153({
                label: "操作",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_153));
            __VLS_155.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_155.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_156 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }));
                const __VLS_158 = __VLS_157({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_157));
                let __VLS_160;
                let __VLS_161;
                let __VLS_162;
                const __VLS_163 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.launchpadData))
                            return;
                        if (!!(!__VLS_ctx.launchpadData.ready_plans.length))
                            return;
                        __VLS_ctx.launchForm.plan_id = row.id;
                    }
                };
                __VLS_159.slots.default;
                var __VLS_159;
            }
            var __VLS_155;
            var __VLS_131;
        }
        var __VLS_123;
        var __VLS_75;
        var __VLS_39;
        const __VLS_164 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
            ...{ class: "soft-card" },
        }));
        const __VLS_166 = __VLS_165({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        __VLS_167.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_167.slots;
        }
        if (!__VLS_ctx.launchpadData.active_sessions.length) {
            const __VLS_168 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                description: "还没有开启过课堂",
            }));
            const __VLS_170 = __VLS_169({
                description: "还没有开启过课堂",
            }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        }
        else {
            const __VLS_172 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                data: (__VLS_ctx.launchpadData.active_sessions),
                stripe: true,
            }));
            const __VLS_174 = __VLS_173({
                data: (__VLS_ctx.launchpadData.active_sessions),
                stripe: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            __VLS_175.slots.default;
            const __VLS_176 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                label: "会话 ID",
                minWidth: "100",
                prop: "session_id",
            }));
            const __VLS_178 = __VLS_177({
                label: "会话 ID",
                minWidth: "100",
                prop: "session_id",
            }, ...__VLS_functionalComponentArgsRest(__VLS_177));
            const __VLS_180 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                label: "学案",
                minWidth: "260",
            }));
            const __VLS_182 = __VLS_181({
                label: "学案",
                minWidth: "260",
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
            __VLS_183.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_183.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.plan.title);
            }
            var __VLS_183;
            const __VLS_184 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                label: "班级",
                minWidth: "120",
            }));
            const __VLS_186 = __VLS_185({
                label: "班级",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_185));
            __VLS_187.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_187.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.class.name);
            }
            var __VLS_187;
            const __VLS_188 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                label: "开课时间",
                minWidth: "170",
            }));
            const __VLS_190 = __VLS_189({
                label: "开课时间",
                minWidth: "170",
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
            __VLS_191.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_191.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (__VLS_ctx.formatDateTime(row.started_at));
            }
            var __VLS_191;
            const __VLS_192 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                label: "操作",
                minWidth: "140",
            }));
            const __VLS_194 = __VLS_193({
                label: "操作",
                minWidth: "140",
            }, ...__VLS_functionalComponentArgsRest(__VLS_193));
            __VLS_195.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_195.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_196 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }));
                const __VLS_198 = __VLS_197({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_197));
                let __VLS_200;
                let __VLS_201;
                let __VLS_202;
                const __VLS_203 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.launchpadData))
                            return;
                        if (!!(!__VLS_ctx.launchpadData.active_sessions.length))
                            return;
                        __VLS_ctx.openSession(row.session_id);
                    }
                };
                __VLS_199.slots.default;
                var __VLS_199;
            }
            var __VLS_195;
            var __VLS_175;
        }
        var __VLS_167;
    }
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
/** @type {__VLS_StyleScopedClasses['launch-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['launch-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['session-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            router: router,
            launchpadData: launchpadData,
            currentSession: currentSession,
            isLoading: isLoading,
            isLaunching: isLaunching,
            errorMessage: errorMessage,
            launchForm: launchForm,
            pageTitle: pageTitle,
            totalStudentCount: totalStudentCount,
            launchPreviewText: launchPreviewText,
            formatDateTime: formatDateTime,
            loadPage: loadPage,
            startClassroom: startClassroom,
            openSession: openSession,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
