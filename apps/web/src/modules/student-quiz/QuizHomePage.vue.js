/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import WorkspacePlaceholder from '@/components/WorkspacePlaceholder.vue';
const highlights = [
    { title: '开始测验', text: '支持学生开始一次新的常识测验。' },
    { title: '成绩概况', text: '显示平均分、最近成绩和进步趋势。' },
    { title: '班级排行', text: '展示当日排行与未测验名单。' },
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof WorkspacePlaceholder, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(WorkspacePlaceholder, new WorkspacePlaceholder({
    eyebrow: "常识测验",
    title: "测验首页骨架",
    description: "对应旧站 `student/myquiz.aspx` 与 `quizrank.aspx`。后续会接入开始测验、平均成绩与排行榜。",
    highlights: (__VLS_ctx.highlights),
}));
const __VLS_1 = __VLS_0({
    eyebrow: "常识测验",
    title: "测验首页骨架",
    description: "对应旧站 `student/myquiz.aspx` 与 `quizrank.aspx`。后续会接入开始测验、平均成绩与排行榜。",
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
