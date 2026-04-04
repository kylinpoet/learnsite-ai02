/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import { normalizeRichTextHtml } from '@/utils/richText';
const props = withDefaults(defineProps(), {
    html: '',
    emptyText: '暂无内容',
});
const sanitizedHtml = computed(() => {
    const html = normalizeRichTextHtml(props.html);
    if (!html) {
        return '';
    }
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
    });
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    html: '',
    emptyText: '暂无内容',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.sanitizedHtml) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rich-text-content" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.sanitizedHtml) }, null, null);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "rich-text-empty" },
    });
    (__VLS_ctx.emptyText);
}
/** @type {__VLS_StyleScopedClasses['rich-text-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            sanitizedHtml: sanitizedHtml,
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
