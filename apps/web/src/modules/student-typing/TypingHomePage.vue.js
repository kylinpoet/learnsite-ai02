/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import WorkspacePlaceholder from '@/components/WorkspacePlaceholder.vue';
const highlights = [
    { title: '训练词库', text: '支持英文、中文、拼音等训练集。' },
    { title: '成绩记录', text: '记录速度、准确率、练习时长。' },
    { title: '排行榜', text: '提供全校、年级、班级三种排行维度。' },
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof WorkspacePlaceholder, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(WorkspacePlaceholder, new WorkspacePlaceholder({
    eyebrow: "打字训练",
    title: "打字训练骨架",
    description: "对应旧站 `student/myfinger.aspx` 与 `allfinger.aspx`。后续会接入词库、成绩记录和排行榜。",
    highlights: (__VLS_ctx.highlights),
}));
const __VLS_1 = __VLS_0({
    eyebrow: "打字训练",
    title: "打字训练骨架",
    description: "对应旧站 `student/myfinger.aspx` 与 `allfinger.aspx`。后续会接入词库、成绩记录和排行榜。",
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
