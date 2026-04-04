/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import WorkspacePlaceholder from '@/components/WorkspacePlaceholder.vue';
const highlights = [
    { title: '分类浏览', text: '按教材、专题、教师推荐分类查看资源。' },
    { title: '附件下载', text: '支持文档、课件、素材和外链资源。' },
    { title: '教师运营', text: '与教师资源管理模块保持同一套数据来源。' },
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof WorkspacePlaceholder, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(WorkspacePlaceholder, new WorkspacePlaceholder({
    eyebrow: "在线资源",
    title: "资源中心骨架",
    description: "对应旧站 `student/myfile.aspx`。虽然当前线上内容空白，但首版仍保留完整模块位。",
    highlights: (__VLS_ctx.highlights),
}));
const __VLS_1 = __VLS_0({
    eyebrow: "在线资源",
    title: "资源中心骨架",
    description: "对应旧站 `student/myfile.aspx`。虽然当前线上内容空白，但首版仍保留完整模块位。",
    highlights: (__VLS_ctx.highlights),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
var __VLS_2;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            WorkspacePlaceholder: WorkspacePlaceholder,
            highlights: highlights,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
