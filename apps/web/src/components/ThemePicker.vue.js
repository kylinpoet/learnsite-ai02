/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useAppStore } from '@/stores/app';
const appStore = useAppStore();
function onChange(value) {
    appStore.setTheme(value);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.appStore.currentTheme),
    ...{ class: "theme-picker" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.appStore.currentTheme),
    ...{ class: "theme-picker" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.onChange)
};
var __VLS_8 = {};
__VLS_3.slots.default;
for (const [theme] of __VLS_getVForSourceType((__VLS_ctx.appStore.themeOptions))) {
    const __VLS_9 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        key: (theme.code),
        label: (theme.name),
        value: (theme.code),
    }));
    const __VLS_11 = __VLS_10({
        key: (theme.code),
        label: (theme.name),
        value: (theme.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['theme-picker']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            appStore: appStore,
            onChange: onChange,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
