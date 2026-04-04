/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import AppShellHeader from '@/components/AppShellHeader.vue';
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue';
import SessionActionMenu from '@/components/SessionActionMenu.vue';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const navGroups = computed(() => {
    const groups = [
        {
            title: '工作总览',
            items: [
                { label: '工作台', to: '/staff/dashboard' },
                { label: '上课中控', to: '/staff/classroom' },
            ],
        },
        {
            title: '教学内容',
            items: [
                { label: '学案管理', to: '/staff/lesson-plans' },
                { label: '课程体系', to: '/staff/curriculum' },
            ],
        },
        {
            title: '课堂反馈',
            items: [
                { label: '作品评分', to: '/staff/submissions' },
                { label: '签到', to: '/staff/attendance' },
                { label: '学生', to: '/staff/students' },
            ],
        },
    ];
    if (authStore.isAdmin) {
        groups.push({
            title: '系统配置',
            items: [{ label: '系统设置', to: '/staff/admin/system' }],
        });
    }
    return groups;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-layout" },
});
/** @type {[typeof AppShellHeader, typeof AppShellHeader, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AppShellHeader, new AppShellHeader({
    title: "教职工工作台",
    kicker: "Teacher & Admin Console",
}));
const __VLS_1 = __VLS_0({
    title: "教职工工作台",
    kicker: "Teacher & Admin Console",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    /** @type {[typeof SessionActionMenu, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(SessionActionMenu, new SessionActionMenu({}));
    const __VLS_4 = __VLS_3({}, ...__VLS_functionalComponentArgsRest(__VLS_3));
}
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "layout-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "side-nav grouped-nav" },
});
for (const [group] of __VLS_getVForSourceType((__VLS_ctx.navGroups))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        key: (group.title),
        ...{ class: "nav-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "nav-group-title" },
    });
    (group.title);
    for (const [item] of __VLS_getVForSourceType((group.items))) {
        const __VLS_6 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent(__VLS_6, new __VLS_6({
            key: (item.to),
            to: (item.to),
            ...{ class: "nav-link" },
        }));
        const __VLS_8 = __VLS_7({
            key: (item.to),
            to: (item.to),
            ...{ class: "nav-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        __VLS_9.slots.default;
        (item.label);
        var __VLS_9;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "page-content" },
});
const __VLS_10 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({}));
const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
/** @type {[typeof FloatingAiCompanion, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(FloatingAiCompanion, new FloatingAiCompanion({}));
const __VLS_15 = __VLS_14({}, ...__VLS_functionalComponentArgsRest(__VLS_14));
/** @type {__VLS_StyleScopedClasses['app-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['side-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group-title']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['page-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            RouterView: RouterView,
            AppShellHeader: AppShellHeader,
            FloatingAiCompanion: FloatingAiCompanion,
            SessionActionMenu: SessionActionMenu,
            navGroups: navGroups,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
