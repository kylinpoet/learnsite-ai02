/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { QuillEditor } from '@vueup/vue-quill';
const props = withDefaults(defineProps(), {
    modelValue: '',
    minHeight: 280,
    placeholder: '',
});
const emit = defineEmits();
const editorOptions = {
    placeholder: props.placeholder,
    modules: {
        toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ indent: '-1' }, { indent: '+1' }],
            [{ align: [] }],
            ['blockquote', 'code-block', 'link', 'image'],
            ['clean'],
        ],
    },
};
function handleUpdate(value) {
    emit('update:modelValue', typeof value === 'string' ? value : '');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    modelValue: '',
    minHeight: 280,
    placeholder: '',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['rich-text-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ql-snow']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-text-editor']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rich-text-editor" },
    ...{ style: ({ '--editor-min-height': `${__VLS_ctx.minHeight}px` }) },
});
const __VLS_0 = {}.QuillEditor;
/** @type {[typeof __VLS_components.QuillEditor, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:content': {} },
    content: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.editorOptions),
    contentType: "html",
    theme: "snow",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:content': {} },
    content: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.editorOptions),
    contentType: "html",
    theme: "snow",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:content': (__VLS_ctx.handleUpdate)
};
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['rich-text-editor']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            QuillEditor: QuillEditor,
            editorOptions: editorOptions,
            handleUpdate: handleUpdate,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
