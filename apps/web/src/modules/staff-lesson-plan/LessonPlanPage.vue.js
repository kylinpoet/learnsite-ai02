/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiPost, apiPut } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';
import { normalizeRichTextHtml, richTextToExcerpt } from '@/utils/richText';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const plans = ref([]);
const curriculumBooks = ref([]);
const selectedPlanDetail = ref(null);
const isLoading = ref(true);
const isSavingPlan = ref(false);
const publishingPlanId = ref(null);
const errorMessage = ref('');
const editorVisible = ref(false);
const editingPlanId = ref(null);
const taskSeed = ref(1);
const planForm = ref({
    lesson_id: null,
    title: '',
    content: '',
    assigned_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    tasks: [],
});
const selectedPlanId = computed(() => {
    const routePlanId = Number(route.params.planId);
    if (Number.isFinite(routePlanId) && routePlanId > 0) {
        return routePlanId;
    }
    return plans.value[0]?.id || null;
});
const pageTitle = computed(() => selectedPlanDetail.value?.title || '教师学案管理');
const totalTaskCount = computed(() => plans.value.reduce((sum, item) => sum + item.task_count, 0));
const totalPendingCount = computed(() => plans.value.reduce((sum, item) => sum + item.progress.pending_count, 0));
const totalCompletedCount = computed(() => plans.value.reduce((sum, item) => sum + item.progress.completed_count, 0));
const lessonOptions = computed(() => curriculumBooks.value.flatMap((book) => book.units.map((unit) => ({
    label: `${book.name} · ${unit.title}`,
    lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        label: `第 ${lesson.lesson_no} 课 · ${lesson.title}`,
    })),
}))));
function createEmptyTask() {
    const currentSeed = taskSeed.value++;
    return {
        key: `task-${currentSeed}`,
        title: '',
        task_type: 'upload_image',
        submission_scope: 'individual',
        description: '',
        is_required: true,
    };
}
function resetPlanForm() {
    planForm.value = {
        lesson_id: null,
        title: '',
        content: '',
        assigned_date: new Date().toISOString().slice(0, 10),
        status: 'draft',
        tasks: [createEmptyTask()],
    };
}
function taskTypeLabel(taskType) {
    if (taskType === 'reading') {
        return '阅读任务';
    }
    if (taskType === 'programming') {
        return '编程任务';
    }
    return '上传作品';
}
function planStatusLabel(status) {
    if (status === 'draft') {
        return '草稿';
    }
    if (status === 'published') {
        return '已发布';
    }
    if (status === 'active') {
        return '上课中';
    }
    if (status === 'completed') {
        return '已完成';
    }
    return status;
}
function planStatusType(status) {
    if (status === 'draft') {
        return 'info';
    }
    if (status === 'published') {
        return 'success';
    }
    if (status === 'active') {
        return 'warning';
    }
    return 'info';
}
function canEditPlan(plan) {
    return (plan.status !== 'active' &&
        plan.status !== 'completed' &&
        plan.progress.pending_count === 0 &&
        plan.progress.completed_count === 0);
}
async function loadPlans() {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师或管理员账号';
        isLoading.value = false;
        return;
    }
    const [planPayload, curriculumPayload] = await Promise.all([
        apiGet('/lesson-plans/staff/list', authStore.token),
        apiGet('/curriculum/tree', authStore.token),
    ]);
    plans.value = planPayload.plans;
    curriculumBooks.value = curriculumPayload.books;
    if (!selectedPlanId.value && planPayload.plans[0]) {
        await router.replace(`/staff/lesson-plans/${planPayload.plans[0].id}`);
    }
}
async function loadPlanDetail(planId) {
    if (!planId || !authStore.token) {
        selectedPlanDetail.value = null;
        return;
    }
    const payload = await apiGet(`/lesson-plans/staff/${planId}`, authStore.token);
    selectedPlanDetail.value = payload.plan;
}
async function loadPage() {
    isLoading.value = true;
    errorMessage.value = '';
    try {
        await loadPlans();
        await loadPlanDetail(selectedPlanId.value);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载学案数据失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function selectPlan(planId) {
    if (!planId) {
        return;
    }
    await router.push(`/staff/lesson-plans/${planId}`);
}
function handleRowClick(row) {
    void selectPlan(row.id);
}
function openCreateDialog() {
    editingPlanId.value = null;
    resetPlanForm();
    editorVisible.value = true;
}
async function openEditDialog(planId) {
    try {
        let targetPlan = planId === selectedPlanDetail.value?.id ? selectedPlanDetail.value : null;
        if (!targetPlan) {
            await selectPlan(planId);
            await loadPlanDetail(planId);
            targetPlan = selectedPlanDetail.value;
        }
        if (!targetPlan) {
            errorMessage.value = '加载学案详情失败';
            return;
        }
        fillFormWithPlan(targetPlan);
        editingPlanId.value = targetPlan.id;
        editorVisible.value = true;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '打开编辑器失败';
    }
}
function fillFormWithPlan(plan) {
    planForm.value = {
        lesson_id: plan.lesson.id,
        title: plan.title,
        content: plan.content || '',
        assigned_date: plan.assigned_date,
        status: plan.status === 'draft' ? 'draft' : 'published',
        tasks: plan.tasks.map((task) => ({
            key: `task-${task.id}`,
            title: task.title,
            task_type: task.task_type,
            submission_scope: task.submission_scope || 'individual',
            description: task.description || '',
            is_required: task.is_required,
        })),
    };
}
function addTaskRow() {
    planForm.value.tasks.push(createEmptyTask());
}
function removeTaskRow(taskKey) {
    planForm.value.tasks = planForm.value.tasks.filter((task) => task.key !== taskKey);
}
function buildPayload() {
    if (!planForm.value.lesson_id) {
        throw new Error('请先选择绑定课次');
    }
    if (!planForm.value.title.trim()) {
        throw new Error('请先填写学案标题');
    }
    const tasks = planForm.value.tasks.map((task, index) => {
        if (!task.title.trim()) {
            throw new Error(`请填写任务 ${index + 1} 的标题`);
        }
        const submissionScope = task.task_type === 'reading' ? 'individual' : task.submission_scope;
        return {
            title: task.title.trim(),
            task_type: task.task_type,
            submission_scope: submissionScope,
            description: normalizeRichTextHtml(task.description) || null,
            sort_order: index + 1,
            is_required: task.is_required,
        };
    });
    return {
        lesson_id: planForm.value.lesson_id,
        title: planForm.value.title.trim(),
        content: normalizeRichTextHtml(planForm.value.content) || null,
        assigned_date: planForm.value.assigned_date,
        status: planForm.value.status,
        tasks,
    };
}
async function savePlan() {
    if (!authStore.token) {
        return;
    }
    isSavingPlan.value = true;
    errorMessage.value = '';
    try {
        const payload = buildPayload();
        const response = editingPlanId.value
            ? await apiPut(`/lesson-plans/staff/${editingPlanId.value}`, payload, authStore.token)
            : await apiPost('/lesson-plans/staff', payload, authStore.token);
        ElMessage.success(editingPlanId.value ? '学案已更新' : '学案已创建');
        editorVisible.value = false;
        await loadPlans();
        await selectPlan(response.plan.id);
        await loadPlanDetail(response.plan.id);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '保存学案失败';
    }
    finally {
        isSavingPlan.value = false;
    }
}
async function publishPlan(planId) {
    if (!authStore.token) {
        return;
    }
    publishingPlanId.value = planId;
    errorMessage.value = '';
    try {
        const response = await apiPost(`/lesson-plans/staff/${planId}/publish`, {}, authStore.token);
        ElMessage.success('学案已发布，可以去开课了');
        await loadPlans();
        await selectPlan(response.plan.id);
        await loadPlanDetail(response.plan.id);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '发布学案失败';
    }
    finally {
        publishingPlanId.value = null;
    }
}
async function goToClassroom(planId) {
    await router.push({ path: '/staff/classroom', query: { planId: String(planId) } });
}
watch(() => route.params.planId, () => {
    void loadPlanDetail(selectedPlanId.value);
});
onMounted(() => {
    resetPlanForm();
    void loadPage();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['dialog-task-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-task-head']} */ ;
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
    type: "primary",
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (__VLS_ctx.openCreateDialog)
};
__VLS_7.slots.default;
var __VLS_7;
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
        __VLS_ctx.router.push('/staff/curriculum');
    }
};
__VLS_15.slots.default;
var __VLS_15;
const __VLS_20 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onClick: (...[$event]) => {
        __VLS_ctx.selectPlan(__VLS_ctx.plans[0]?.id || null);
    }
};
__VLS_23.slots.default;
var __VLS_23;
var __VLS_3;
if (__VLS_ctx.errorMessage) {
    const __VLS_28 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_30 = __VLS_29({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
const __VLS_32 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_34 = __VLS_33({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_35.slots;
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
    const __VLS_40 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        rows: (8),
    }));
    const __VLS_42 = __VLS_41({
        rows: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    var __VLS_39;
}
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
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
    (__VLS_ctx.plans.length);
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
    (__VLS_ctx.totalTaskCount);
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
    (__VLS_ctx.totalPendingCount);
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
    (__VLS_ctx.totalCompletedCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "metric-note" },
    });
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
    if (!__VLS_ctx.plans.length) {
        const __VLS_48 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            description: "暂无学案数据",
        }));
        const __VLS_50 = __VLS_49({
            description: "暂无学案数据",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    }
    else {
        const __VLS_52 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ 'onRowClick': {} },
            data: (__VLS_ctx.plans),
            stripe: true,
        }));
        const __VLS_54 = __VLS_53({
            ...{ 'onRowClick': {} },
            data: (__VLS_ctx.plans),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        let __VLS_56;
        let __VLS_57;
        let __VLS_58;
        const __VLS_59 = {
            onRowClick: (__VLS_ctx.handleRowClick)
        };
        __VLS_55.slots.default;
        const __VLS_60 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            label: "学案标题",
            minWidth: "240",
            prop: "title",
        }));
        const __VLS_62 = __VLS_61({
            label: "学案标题",
            minWidth: "240",
            prop: "title",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        const __VLS_64 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            label: "状态",
            minWidth: "110",
        }));
        const __VLS_66 = __VLS_65({
            label: "状态",
            minWidth: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_67.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_68 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                round: true,
                type: (__VLS_ctx.planStatusType(row.status)),
            }));
            const __VLS_70 = __VLS_69({
                round: true,
                type: (__VLS_ctx.planStatusType(row.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            __VLS_71.slots.default;
            (__VLS_ctx.planStatusLabel(row.status));
            var __VLS_71;
        }
        var __VLS_67;
        const __VLS_72 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            label: "绑定课次",
            minWidth: "190",
        }));
        const __VLS_74 = __VLS_73({
            label: "绑定课次",
            minWidth: "190",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_75.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.lesson.title);
        }
        var __VLS_75;
        const __VLS_76 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            label: "所属单元",
            minWidth: "220",
        }));
        const __VLS_78 = __VLS_77({
            label: "所属单元",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_79.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.lesson.unit_title);
        }
        var __VLS_79;
        const __VLS_80 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            label: "发布时间",
            minWidth: "120",
            prop: "assigned_date",
        }));
        const __VLS_82 = __VLS_81({
            label: "发布时间",
            minWidth: "120",
            prop: "assigned_date",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        const __VLS_84 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            label: "任务数",
            minWidth: "88",
            prop: "task_count",
        }));
        const __VLS_86 = __VLS_85({
            label: "任务数",
            minWidth: "88",
            prop: "task_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        const __VLS_88 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            label: "待完成",
            minWidth: "88",
        }));
        const __VLS_90 = __VLS_89({
            label: "待完成",
            minWidth: "88",
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_91.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.progress.pending_count);
        }
        var __VLS_91;
        const __VLS_92 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            label: "操作",
            minWidth: "220",
        }));
        const __VLS_94 = __VLS_93({
            label: "操作",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_95.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_96 = {}.ElSpace;
            /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                wrap: true,
            }));
            const __VLS_98 = __VLS_97({
                wrap: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_97));
            __VLS_99.slots.default;
            const __VLS_100 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_102 = __VLS_101({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_101));
            let __VLS_104;
            let __VLS_105;
            let __VLS_106;
            const __VLS_107 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.plans.length))
                        return;
                    __VLS_ctx.selectPlan(row.id);
                }
            };
            __VLS_103.slots.default;
            var __VLS_103;
            if (__VLS_ctx.canEditPlan(row)) {
                const __VLS_108 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "warning",
                }));
                const __VLS_110 = __VLS_109({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_109));
                let __VLS_112;
                let __VLS_113;
                let __VLS_114;
                const __VLS_115 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.plans.length))
                            return;
                        if (!(__VLS_ctx.canEditPlan(row)))
                            return;
                        __VLS_ctx.openEditDialog(row.id);
                    }
                };
                __VLS_111.slots.default;
                var __VLS_111;
            }
            if (row.status === 'draft') {
                const __VLS_116 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "success",
                }));
                const __VLS_118 = __VLS_117({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_117));
                let __VLS_120;
                let __VLS_121;
                let __VLS_122;
                const __VLS_123 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.plans.length))
                            return;
                        if (!(row.status === 'draft'))
                            return;
                        __VLS_ctx.publishPlan(row.id);
                    }
                };
                __VLS_119.slots.default;
                var __VLS_119;
            }
            var __VLS_99;
        }
        var __VLS_95;
        var __VLS_55;
    }
    var __VLS_47;
    if (__VLS_ctx.selectedPlanDetail) {
        const __VLS_124 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            ...{ class: "soft-card" },
        }));
        const __VLS_126 = __VLS_125({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_127.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_128 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
                round: true,
                type: (__VLS_ctx.planStatusType(__VLS_ctx.selectedPlanDetail.status)),
            }));
            const __VLS_130 = __VLS_129({
                round: true,
                type: (__VLS_ctx.planStatusType(__VLS_ctx.selectedPlanDetail.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            __VLS_131.slots.default;
            (__VLS_ctx.planStatusLabel(__VLS_ctx.selectedPlanDetail.status));
            var __VLS_131;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stack-list" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "info-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedPlanDetail.title);
        const __VLS_132 = {}.ElSpace;
        /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            wrap: true,
        }));
        const __VLS_134 = __VLS_133({
            wrap: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        __VLS_135.slots.default;
        if (__VLS_ctx.canEditPlan(__VLS_ctx.selectedPlanDetail)) {
            const __VLS_136 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                ...{ 'onClick': {} },
                plain: true,
                type: "warning",
            }));
            const __VLS_138 = __VLS_137({
                ...{ 'onClick': {} },
                plain: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_137));
            let __VLS_140;
            let __VLS_141;
            let __VLS_142;
            const __VLS_143 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedPlanDetail))
                        return;
                    if (!(__VLS_ctx.canEditPlan(__VLS_ctx.selectedPlanDetail)))
                        return;
                    __VLS_ctx.openEditDialog(__VLS_ctx.selectedPlanDetail.id);
                }
            };
            __VLS_139.slots.default;
            var __VLS_139;
        }
        if (__VLS_ctx.selectedPlanDetail.status === 'draft') {
            const __VLS_144 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.publishingPlanId === __VLS_ctx.selectedPlanDetail.id),
                type: "success",
            }));
            const __VLS_146 = __VLS_145({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.publishingPlanId === __VLS_ctx.selectedPlanDetail.id),
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            let __VLS_148;
            let __VLS_149;
            let __VLS_150;
            const __VLS_151 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedPlanDetail))
                        return;
                    if (!(__VLS_ctx.selectedPlanDetail.status === 'draft'))
                        return;
                    __VLS_ctx.publishPlan(__VLS_ctx.selectedPlanDetail.id);
                }
            };
            __VLS_147.slots.default;
            var __VLS_147;
        }
        const __VLS_152 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.selectedPlanDetail.status === 'draft'),
            type: "primary",
        }));
        const __VLS_154 = __VLS_153({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.selectedPlanDetail.status === 'draft'),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        let __VLS_156;
        let __VLS_157;
        let __VLS_158;
        const __VLS_159 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedPlanDetail))
                    return;
                __VLS_ctx.goToClassroom(__VLS_ctx.selectedPlanDetail.id);
            }
        };
        __VLS_155.slots.default;
        var __VLS_155;
        var __VLS_135;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        (__VLS_ctx.selectedPlanDetail.lesson.book_name);
        (__VLS_ctx.selectedPlanDetail.lesson.unit_title);
        (__VLS_ctx.selectedPlanDetail.lesson.title);
        const __VLS_160 = {}.ElSpace;
        /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            wrap: true,
        }));
        const __VLS_162 = __VLS_161({
            wrap: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        __VLS_163.slots.default;
        const __VLS_164 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
            round: true,
        }));
        const __VLS_166 = __VLS_165({
            round: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        __VLS_167.slots.default;
        (__VLS_ctx.selectedPlanDetail.assigned_date);
        var __VLS_167;
        const __VLS_168 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            round: true,
            type: "success",
        }));
        const __VLS_170 = __VLS_169({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        __VLS_171.slots.default;
        (__VLS_ctx.selectedPlanDetail.tasks.length);
        var __VLS_171;
        const __VLS_172 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            round: true,
            type: "warning",
        }));
        const __VLS_174 = __VLS_173({
            round: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        __VLS_175.slots.default;
        (__VLS_ctx.selectedPlanDetail.progress.pending_count);
        var __VLS_175;
        const __VLS_176 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            round: true,
            type: "info",
        }));
        const __VLS_178 = __VLS_177({
            round: true,
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        __VLS_179.slots.default;
        (__VLS_ctx.selectedPlanDetail.progress.completed_count);
        var __VLS_179;
        var __VLS_163;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "content-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "info-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        const __VLS_180 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
            round: true,
            type: "info",
        }));
        const __VLS_182 = __VLS_181({
            round: true,
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        __VLS_183.slots.default;
        var __VLS_183;
        /** @type {[typeof RichTextContent, ]} */ ;
        // @ts-ignore
        const __VLS_184 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
            html: (__VLS_ctx.selectedPlanDetail.content),
            emptyText: "当前学案还没有正文说明。",
        }));
        const __VLS_185 = __VLS_184({
            html: (__VLS_ctx.selectedPlanDetail.content),
            emptyText: "当前学案还没有正文说明。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_184));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "task-editor-list" },
        });
        for (const [task] of __VLS_getVForSourceType((__VLS_ctx.selectedPlanDetail.tasks))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (task.id),
                ...{ class: "task-preview-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (task.sort_order);
            (task.title);
            const __VLS_187 = {}.ElSpace;
            /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
            // @ts-ignore
            const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
                wrap: true,
            }));
            const __VLS_189 = __VLS_188({
                wrap: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_188));
            __VLS_190.slots.default;
            const __VLS_191 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
                round: true,
                type: "info",
            }));
            const __VLS_193 = __VLS_192({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_192));
            __VLS_194.slots.default;
            (__VLS_ctx.taskTypeLabel(task.task_type));
            var __VLS_194;
            const __VLS_195 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                round: true,
                type: (task.submission_scope === 'group' ? 'warning' : 'success'),
            }));
            const __VLS_197 = __VLS_196({
                round: true,
                type: (task.submission_scope === 'group' ? 'warning' : 'success'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_196));
            __VLS_198.slots.default;
            (task.submission_scope === 'group' ? '小组共同提交' : '个人提交');
            var __VLS_198;
            const __VLS_199 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({
                round: true,
                type: (task.is_required ? 'success' : 'warning'),
            }));
            const __VLS_201 = __VLS_200({
                round: true,
                type: (task.is_required ? 'success' : 'warning'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_200));
            __VLS_202.slots.default;
            (task.is_required ? '必做' : '选做');
            var __VLS_202;
            var __VLS_190;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.richTextToExcerpt(task.description, 160) || '当前任务还没有补充说明。');
        }
        var __VLS_127;
    }
}
var __VLS_35;
const __VLS_203 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
    modelValue: (__VLS_ctx.editorVisible),
    closeOnClickModal: (false),
    title: (__VLS_ctx.editingPlanId ? '编辑学案' : '新建学案'),
    width: "960px",
}));
const __VLS_205 = __VLS_204({
    modelValue: (__VLS_ctx.editorVisible),
    closeOnClickModal: (false),
    title: (__VLS_ctx.editingPlanId ? '编辑学案' : '新建学案'),
    width: "960px",
}, ...__VLS_functionalComponentArgsRest(__VLS_204));
__VLS_206.slots.default;
const __VLS_207 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
    labelPosition: "top",
}));
const __VLS_209 = __VLS_208({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_208));
__VLS_210.slots.default;
const __VLS_211 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
    gutter: (16),
}));
const __VLS_213 = __VLS_212({
    gutter: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_212));
__VLS_214.slots.default;
const __VLS_215 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
    md: (12),
    sm: (24),
}));
const __VLS_217 = __VLS_216({
    md: (12),
    sm: (24),
}, ...__VLS_functionalComponentArgsRest(__VLS_216));
__VLS_218.slots.default;
const __VLS_219 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
    label: "学案标题",
}));
const __VLS_221 = __VLS_220({
    label: "学案标题",
}, ...__VLS_functionalComponentArgsRest(__VLS_220));
__VLS_222.slots.default;
const __VLS_223 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_224 = __VLS_asFunctionalComponent(__VLS_223, new __VLS_223({
    modelValue: (__VLS_ctx.planForm.title),
    maxlength: "120",
    placeholder: "例如：八下第一单元 第4课 智能感知体验",
}));
const __VLS_225 = __VLS_224({
    modelValue: (__VLS_ctx.planForm.title),
    maxlength: "120",
    placeholder: "例如：八下第一单元 第4课 智能感知体验",
}, ...__VLS_functionalComponentArgsRest(__VLS_224));
var __VLS_222;
var __VLS_218;
const __VLS_227 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
    md: (6),
    sm: (12),
}));
const __VLS_229 = __VLS_228({
    md: (6),
    sm: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_228));
__VLS_230.slots.default;
const __VLS_231 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
    label: "发布日期",
}));
const __VLS_233 = __VLS_232({
    label: "发布日期",
}, ...__VLS_functionalComponentArgsRest(__VLS_232));
__VLS_234.slots.default;
const __VLS_235 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
    modelValue: (__VLS_ctx.planForm.assigned_date),
    ...{ class: "full-width" },
    type: "date",
    valueFormat: "YYYY-MM-DD",
}));
const __VLS_237 = __VLS_236({
    modelValue: (__VLS_ctx.planForm.assigned_date),
    ...{ class: "full-width" },
    type: "date",
    valueFormat: "YYYY-MM-DD",
}, ...__VLS_functionalComponentArgsRest(__VLS_236));
var __VLS_234;
var __VLS_230;
const __VLS_239 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
    md: (6),
    sm: (12),
}));
const __VLS_241 = __VLS_240({
    md: (6),
    sm: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_240));
__VLS_242.slots.default;
const __VLS_243 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
    label: "保存状态",
}));
const __VLS_245 = __VLS_244({
    label: "保存状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_244));
__VLS_246.slots.default;
const __VLS_247 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
    modelValue: (__VLS_ctx.planForm.status),
    ...{ class: "full-width" },
}));
const __VLS_249 = __VLS_248({
    modelValue: (__VLS_ctx.planForm.status),
    ...{ class: "full-width" },
}, ...__VLS_functionalComponentArgsRest(__VLS_248));
__VLS_250.slots.default;
const __VLS_251 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
    label: "草稿",
    value: "draft",
}));
const __VLS_253 = __VLS_252({
    label: "草稿",
    value: "draft",
}, ...__VLS_functionalComponentArgsRest(__VLS_252));
const __VLS_255 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
    label: "已发布",
    value: "published",
}));
const __VLS_257 = __VLS_256({
    label: "已发布",
    value: "published",
}, ...__VLS_functionalComponentArgsRest(__VLS_256));
var __VLS_250;
var __VLS_246;
var __VLS_242;
var __VLS_214;
const __VLS_259 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
    label: "绑定课次",
}));
const __VLS_261 = __VLS_260({
    label: "绑定课次",
}, ...__VLS_functionalComponentArgsRest(__VLS_260));
__VLS_262.slots.default;
const __VLS_263 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
    modelValue: (__VLS_ctx.planForm.lesson_id),
    ...{ class: "full-width" },
    filterable: true,
    placeholder: "请选择课次",
}));
const __VLS_265 = __VLS_264({
    modelValue: (__VLS_ctx.planForm.lesson_id),
    ...{ class: "full-width" },
    filterable: true,
    placeholder: "请选择课次",
}, ...__VLS_functionalComponentArgsRest(__VLS_264));
__VLS_266.slots.default;
for (const [group] of __VLS_getVForSourceType((__VLS_ctx.lessonOptions))) {
    const __VLS_267 = {}.ElOptionGroup;
    /** @type {[typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, ]} */ ;
    // @ts-ignore
    const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
        key: (group.label),
        label: (group.label),
    }));
    const __VLS_269 = __VLS_268({
        key: (group.label),
        label: (group.label),
    }, ...__VLS_functionalComponentArgsRest(__VLS_268));
    __VLS_270.slots.default;
    for (const [lesson] of __VLS_getVForSourceType((group.lessons))) {
        const __VLS_271 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
            key: (lesson.id),
            label: (lesson.label),
            value: (lesson.id),
        }));
        const __VLS_273 = __VLS_272({
            key: (lesson.id),
            label: (lesson.label),
            value: (lesson.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_272));
    }
    var __VLS_270;
}
var __VLS_266;
var __VLS_262;
const __VLS_275 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
    label: "学案正文",
}));
const __VLS_277 = __VLS_276({
    label: "学案正文",
}, ...__VLS_functionalComponentArgsRest(__VLS_276));
__VLS_278.slots.default;
/** @type {[typeof RichTextEditor, ]} */ ;
// @ts-ignore
const __VLS_279 = __VLS_asFunctionalComponent(RichTextEditor, new RichTextEditor({
    modelValue: (__VLS_ctx.planForm.content),
    minHeight: (260),
    placeholder: "参考旧站 courseedit.aspx 的学案正文区域，可填写导读、步骤、图片、重点提示等。",
}));
const __VLS_280 = __VLS_279({
    modelValue: (__VLS_ctx.planForm.content),
    minHeight: (260),
    placeholder: "参考旧站 courseedit.aspx 的学案正文区域，可填写导读、步骤、图片、重点提示等。",
}, ...__VLS_functionalComponentArgsRest(__VLS_279));
var __VLS_278;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "dialog-task-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "section-note" },
});
const __VLS_282 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_284 = __VLS_283({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_283));
let __VLS_286;
let __VLS_287;
let __VLS_288;
const __VLS_289 = {
    onClick: (__VLS_ctx.addTaskRow)
};
__VLS_285.slots.default;
var __VLS_285;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-editor-list" },
});
for (const [task, index] of __VLS_getVForSourceType((__VLS_ctx.planForm.tasks))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (task.key),
        ...{ class: "task-editor-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "info-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (index + 1);
    const __VLS_290 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.planForm.tasks.length === 1),
        link: true,
        type: "danger",
    }));
    const __VLS_292 = __VLS_291({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.planForm.tasks.length === 1),
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_291));
    let __VLS_294;
    let __VLS_295;
    let __VLS_296;
    const __VLS_297 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeTaskRow(task.key);
        }
    };
    __VLS_293.slots.default;
    var __VLS_293;
    const __VLS_298 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
        gutter: (16),
    }));
    const __VLS_300 = __VLS_299({
        gutter: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_299));
    __VLS_301.slots.default;
    const __VLS_302 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
        md: (12),
        sm: (24),
    }));
    const __VLS_304 = __VLS_303({
        md: (12),
        sm: (24),
    }, ...__VLS_functionalComponentArgsRest(__VLS_303));
    __VLS_305.slots.default;
    const __VLS_306 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
        label: "任务标题",
    }));
    const __VLS_308 = __VLS_307({
        label: "任务标题",
    }, ...__VLS_functionalComponentArgsRest(__VLS_307));
    __VLS_309.slots.default;
    const __VLS_310 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
        modelValue: (task.title),
        maxlength: "120",
        placeholder: "例如：活动一、智能翻译体验",
    }));
    const __VLS_312 = __VLS_311({
        modelValue: (task.title),
        maxlength: "120",
        placeholder: "例如：活动一、智能翻译体验",
    }, ...__VLS_functionalComponentArgsRest(__VLS_311));
    var __VLS_309;
    var __VLS_305;
    const __VLS_314 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
        md: (6),
        sm: (12),
    }));
    const __VLS_316 = __VLS_315({
        md: (6),
        sm: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_315));
    __VLS_317.slots.default;
    const __VLS_318 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
        label: "任务类型",
    }));
    const __VLS_320 = __VLS_319({
        label: "任务类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_319));
    __VLS_321.slots.default;
    const __VLS_322 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
        modelValue: (task.task_type),
        ...{ class: "full-width" },
    }));
    const __VLS_324 = __VLS_323({
        modelValue: (task.task_type),
        ...{ class: "full-width" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_323));
    __VLS_325.slots.default;
    const __VLS_326 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
        label: "阅读任务",
        value: "reading",
    }));
    const __VLS_328 = __VLS_327({
        label: "阅读任务",
        value: "reading",
    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    const __VLS_330 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_331 = __VLS_asFunctionalComponent(__VLS_330, new __VLS_330({
        label: "上传作品",
        value: "upload_image",
    }));
    const __VLS_332 = __VLS_331({
        label: "上传作品",
        value: "upload_image",
    }, ...__VLS_functionalComponentArgsRest(__VLS_331));
    const __VLS_334 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
        label: "编程任务",
        value: "programming",
    }));
    const __VLS_336 = __VLS_335({
        label: "编程任务",
        value: "programming",
    }, ...__VLS_functionalComponentArgsRest(__VLS_335));
    var __VLS_325;
    var __VLS_321;
    var __VLS_317;
    const __VLS_338 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
        md: (6),
        sm: (12),
    }));
    const __VLS_340 = __VLS_339({
        md: (6),
        sm: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_339));
    __VLS_341.slots.default;
    const __VLS_342 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
        label: "任务要求",
    }));
    const __VLS_344 = __VLS_343({
        label: "任务要求",
    }, ...__VLS_functionalComponentArgsRest(__VLS_343));
    __VLS_345.slots.default;
    const __VLS_346 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
        modelValue: (task.is_required),
        activeText: "必做",
        inactiveText: "选做",
    }));
    const __VLS_348 = __VLS_347({
        modelValue: (task.is_required),
        activeText: "必做",
        inactiveText: "选做",
    }, ...__VLS_functionalComponentArgsRest(__VLS_347));
    var __VLS_345;
    var __VLS_341;
    var __VLS_301;
    const __VLS_350 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
        label: "提交方式",
    }));
    const __VLS_352 = __VLS_351({
        label: "提交方式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_351));
    __VLS_353.slots.default;
    const __VLS_354 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
        modelValue: (task.submission_scope),
        disabled: (task.task_type === 'reading'),
    }));
    const __VLS_356 = __VLS_355({
        modelValue: (task.submission_scope),
        disabled: (task.task_type === 'reading'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_355));
    __VLS_357.slots.default;
    const __VLS_358 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_359 = __VLS_asFunctionalComponent(__VLS_358, new __VLS_358({
        label: "individual",
    }));
    const __VLS_360 = __VLS_359({
        label: "individual",
    }, ...__VLS_functionalComponentArgsRest(__VLS_359));
    __VLS_361.slots.default;
    var __VLS_361;
    const __VLS_362 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
        label: "group",
    }));
    const __VLS_364 = __VLS_363({
        label: "group",
    }, ...__VLS_functionalComponentArgsRest(__VLS_363));
    __VLS_365.slots.default;
    var __VLS_365;
    var __VLS_357;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "section-note" },
    });
    (task.task_type === 'reading' ? '阅读任务固定为个人完成。' : '小组共同提交时，同组成员共享同一份提交结果。');
    var __VLS_353;
    const __VLS_366 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_367 = __VLS_asFunctionalComponent(__VLS_366, new __VLS_366({
        label: "任务说明",
    }));
    const __VLS_368 = __VLS_367({
        label: "任务说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_367));
    __VLS_369.slots.default;
    /** @type {[typeof RichTextEditor, ]} */ ;
    // @ts-ignore
    const __VLS_370 = __VLS_asFunctionalComponent(RichTextEditor, new RichTextEditor({
        modelValue: (task.description),
        minHeight: (220),
        placeholder: "参考旧站 missionadd.aspx 的活动说明区域，可写学习目标、步骤、图片、链接和提交要求。",
    }));
    const __VLS_371 = __VLS_370({
        modelValue: (task.description),
        minHeight: (220),
        placeholder: "参考旧站 missionadd.aspx 的活动说明区域，可写学习目标、步骤、图片、链接和提交要求。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_370));
    var __VLS_369;
}
var __VLS_210;
{
    const { footer: __VLS_thisSlot } = __VLS_206.slots;
    const __VLS_373 = {}.ElSpace;
    /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
    // @ts-ignore
    const __VLS_374 = __VLS_asFunctionalComponent(__VLS_373, new __VLS_373({
        wrap: true,
    }));
    const __VLS_375 = __VLS_374({
        wrap: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_374));
    __VLS_376.slots.default;
    const __VLS_377 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
        ...{ 'onClick': {} },
    }));
    const __VLS_379 = __VLS_378({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_378));
    let __VLS_381;
    let __VLS_382;
    let __VLS_383;
    const __VLS_384 = {
        onClick: (...[$event]) => {
            __VLS_ctx.editorVisible = false;
        }
    };
    __VLS_380.slots.default;
    var __VLS_380;
    const __VLS_385 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.isSavingPlan),
        type: "primary",
    }));
    const __VLS_387 = __VLS_386({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.isSavingPlan),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_386));
    let __VLS_389;
    let __VLS_390;
    let __VLS_391;
    const __VLS_392 = {
        onClick: (__VLS_ctx.savePlan)
    };
    __VLS_388.slots.default;
    (__VLS_ctx.editingPlanId ? '保存修改' : '创建学案');
    var __VLS_388;
    var __VLS_376;
}
var __VLS_206;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
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
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['task-editor-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-preview-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-task-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['task-editor-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-editor-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RichTextContent: RichTextContent,
            RichTextEditor: RichTextEditor,
            richTextToExcerpt: richTextToExcerpt,
            router: router,
            plans: plans,
            selectedPlanDetail: selectedPlanDetail,
            isLoading: isLoading,
            isSavingPlan: isSavingPlan,
            publishingPlanId: publishingPlanId,
            errorMessage: errorMessage,
            editorVisible: editorVisible,
            editingPlanId: editingPlanId,
            planForm: planForm,
            pageTitle: pageTitle,
            totalTaskCount: totalTaskCount,
            totalPendingCount: totalPendingCount,
            totalCompletedCount: totalCompletedCount,
            lessonOptions: lessonOptions,
            taskTypeLabel: taskTypeLabel,
            planStatusLabel: planStatusLabel,
            planStatusType: planStatusType,
            canEditPlan: canEditPlan,
            selectPlan: selectPlan,
            handleRowClick: handleRowClick,
            openCreateDialog: openCreateDialog,
            openEditDialog: openEditDialog,
            addTaskRow: addTaskRow,
            removeTaskRow: removeTaskRow,
            savePlan: savePlan,
            publishPlan: publishPlan,
            goToClassroom: goToClassroom,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
