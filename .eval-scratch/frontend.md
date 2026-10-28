# 前端代码审计报告：apps/web（Vue 3）

- 审计日期：2026-10-27
- 范围：`apps/web`（Vue 3.5 + TS + Vite 6 + Element Plus + Pinia + Vue Router + ECharts + CKEditor5 + marked + dompurify）
- 边界遵守：全程只读分析（ls/find/grep/read 工具），唯一执行的命令为仓库根目录 `npm run typecheck:web`；未修改任何仓库文件；仅按任务要求新建本目录 `.eval-scratch/` 并写入本文件。
- 行数方法：基础设施文件与 lesson-plan 支撑 TS 为**精确值**（read 工具越界 offset 探测，报错信息返回文件总行数）；.vue 文件为末行 `</style>` 行号（用 6 个已探测文件验证：AdminSystemPage 3165→3166、LessonPlanPage 2714→2715、TaskPage 2314→2316、FloatingAiCompanion 2215→2216、SubmissionTaskPage 2901→2902、StaffDashboardPage 2875→2876，误差 +1~2 行）。下表 `</style>` 值已 +1 修匀。

## 1. src/ 目录结构与规模（82 个文件，约 44,900 行）

| 目录 | 文件数 | 行数（约） | 说明 |
|---|---|---|---|
| api/ | 1 | 130 | http.ts，唯一 API 封装 |
| components/ | 12 | 4,178 | 通用组件（最大 FloatingAiCompanion 2,216） |
| layouts/ | 3 | 457 | auth/student/staff 三布局 |
| modules/ | 51 | 38,297 | **本项目 的 "views"**：44 个 .vue 页面 ≈34,657 行 + 7 个 TS（类型/常量/工具/composables）≈3,640 行 |
| router/ | 1 | 183 | index.ts |
| stores/ | 3 | 289 | app 74 / auth 128 / authSession 87 |
| styles/ | 3 | 903 | theme 220 / base 537 / page-icon-chrome 146 |
| utils/ | 5 | 392 | 见轮子审计 |
| 根（main.ts/App.vue/env.d.ts） | 3 | 73 | |

modules/ 明细（行数≥400 的文件）：staff-admin/AdminSystemPage 3166、staff-submission/SubmissionTaskPage 2902、staff-dashboard/StaffDashboardPage 2876、staff-lesson-plan/LessonPlanPage 2715、student-task/TaskPage 2316、staff-quiz/StaffQuizPage 1947、student-task/ProgramTaskPage 1727、staff-student/StaffStudentPage 1652、staff-classroom/ClassroomPage 1195、useTaskTemplateLibrary.ts 1124、lessonPlanTask.utils.ts 670、TaskTemplateLibraryDialog 742、TaskHtmlPromptDialog 802、useTaskPreviewAssets.ts 788、student-profile/ProfilePage 982、student-home/StudentHomePage 896、student-review/PeerReviewPage 845、student-quiz/QuizHomePage 814、typing/TypingHomePage 747、student-drive/DrivePage 704、RecommendedWorksShowcase 592、RichTextEditorCk 606、staff-resource 529、student-group 536、useLessonPlanEditorState.ts 461、GroupDraftHistoryDialog 473、WorkDetailPage 436、ReadingTaskPage 432、StaffTypingPage 414、lessonPlan.types.ts 296、StaffAssistantPage 313、StaffAttendancePage 326、CourseDetailPage 330、ResourcePage 456、WorkListPage 291、StaffCurriculumPage 285、QuizRankings 230 等。

结构评价（事实）：模块按「角色-业务域」组织（student-*/staff-*），路由全部动态 import 懒加载（router/index.ts:10-46），命名一致（*Page.vue）。无 views/ 目录，pages 即 modules。

## 2. API 调用层

**做法：自写 fetch 封装，未用任何请求库（无 axios/ofetch），无服务端状态库（无 TanStack Query 等）。**

- `apps/web/src/api/http.ts`（130 行）：`apiGet/apiPost/apiPut/apiDelete/apiUpload` + `apiGetBlob/apiPostBlob`。核心 `apiRequest<T>` 统一解包信封：`payload.code && payload.code !== 'OK'` 抛错、返回 `payload.data as T`（http.ts:62-72）。
- **错误处理：统一。** `readApiError`：401 且本地有 token → `clearPersistedSession()+notifySessionExpired()`（CustomEvent，main.ts:22-34 监听并跳登录页）；JSON 错误取 `detail||message`，非 JSON 取文本（http.ts:49-60）。
- **base URL：有统一配置。** `import.meta.env.VITE_API_BASE_URL || '/api/v1'`（http.ts:6）；`apps/web/.env.development` 与根 `.env.example` 均为 `/api/v1`；开发态 Vite proxy `/api` → `VITE_DEV_PROXY_TARGET || http://127.0.0.1:8010`（vite.config.ts:34-40）。Token 由调用方显式传参（无拦截器机制）。
- **类型：无统一定义。** 泛型由调用方断言；模块内本地 `type/interface` 定义 >100 处（grep 上限截断），同一后端模型多处手工重定义：`LoginResponse` 同时定义于 StaffLoginPage.vue:75 与 StudentLoginPage.vue:70；`CurriculumBook` 完整重定义于 AdminSystemPage.vue:1204 与 StaffCurriculumPage.vue:147（LessonPlanPage.vue:2126 亦引用同名类型）。后端为 FastAPI（自带 OpenAPI），但未使用 openapi-typescript / orval / swagger-typescript-api 等生成工具。
- **覆盖面广**：`apiGet<...>` 等调用点 >100 处（grep 截断），遍布全部页面 —— 统一层是事实标准路径。
- **旁路（应用代码中 3 处裸 fetch）**：
  1. FloatingAiCompanion.vue:1069 —— SSE 流式对话（POST + `text/event-stream`），**手写 SSE 解析器 `parseSseBlock` + ReadableStream 循环**（约 1025-1110 行区间）；
  2. LessonPlanPage.vue:1626 —— 同一后端流式接口，**又一份手写 SSE 解析**（重复实现）；
  3. RichTextEditorCk.vue:135 —— CKEditor 图片上传适配器自带 fetch + 自写 `readUploadErrorDetail`（约 175-215 行，重复实现了 http.ts 的错误解析）。
  另 2 处 fetch 位于 lessonPlanTask.utils.ts:282/411 —— 是**生成给学生任务页的 HTML 模板字符串内嵌脚本**，非应用代码，不算旁路。
- 每个页面手写 `isLoading/errorMessage` ref + try/catch 样板（例：WorkListPage.vue:216-235），无共享 useQuery 型 composable。

## 3. 轮子审计（手写 vs 主流库）

| # | 手写代码 | 规模 | 主流替代 | 判定 |
|---|---|---|---|---|
| 1 | AppChart.vue：手写 echarts/core 动态 import、init/setOption/dispose、ResizeObserver+window.resize 自适应 | 103 行 | **vue-echarts**（官方 Vue 封装，含 autoresize、按需 use()） | 明确重复 |
| 2 | utils/debouncedAbortableRequest.ts：防抖 + AbortController 序列号竞态管理 | 101 行 | **@vueuse/core**（useDebounceFn/watchDebounced）；TanStack Query 的请求取消 | 明确重复 |
| 3 | 两份手写 SSE 解析（见上） | 各 ~60-80 行 | **eventsource-parser** / **@microsoft/fetch-event-source** / Vercel AI SDK | 明确重复 |
| 4 | localStorage 持久化三套：authSession.ts（token/user/过期时间，87 行）、stores/app.ts 主题（app.ts:31,60-63）、lesson-plan 草稿自动保存（useLessonPlanEditorState.ts:296-334，手写 setTimeout 防抖 + JSON 快照 diff） | 合计 ~150+ 行 | **pinia-plugin-persistedstate** / **VueUse useStorage** + watchDebounced | 明确重复 |
| 5 | 各页面手写 formatDateTime（`value.replace('T',' ').slice(0,16)`，如 WorkListPage.vue:192-197） | 每页 5-8 行、多页重复 | **dayjs / date-fns** | 明确重复 |
| 6 | CKEditor 上传适配器 StaffRichTextImageUploadAdapter（RichTextEditorCk.vue:118-216） | ~100 行 | CKEditor 官方 SimpleUploadAdapter/CKBox；自定义适配器本身是 CKEditor 文档化做法，但错误解析应复用 http.ts | 半合理 |
| 7 | utils/richText.ts：HTML→纯文本/摘要/空判断（DOMParser 手写） | 84 行 | 已依赖 DOMPurify，可基于其实现；或 html-to-text | 轻度重复 |
| 8 | utils/iframeTrust.ts：iframe 信任源/sandbox 令牌/referrer 策略 DOM 补丁 | 181 行 | 无直接主流库（应用安全策略）；但 TRUSTED_EXTERNAL_IFRAME_ORIGINS 硬编码内网 IP `http://10.230.39.247`（iframeTrust.ts:1-3），应入配置 | 应用特有，非轮子 |
| 9 | styles/theme.css 三套主题 CSS 变量 + data-theme 切换 + ThemePicker | 220+537 行 CSS | Element Plus 自带 CSS 变量主题体系；自写品牌主题可理解 | 半重复（品牌需求） |
| 10 | scripts/check-mirror-js.mjs | 98 行 | **守卫脚本，非功能轮子**：扫描 src 下与 .ts/.tsx/.mts 同基名的 .js/.jsx/.mjs 镜像文件，发现即 exit 1，防止误提交 JS 副本；由 .githooks/pre-commit 调用（pre-commit 仅此一项检查）。主流等价物是 lint 规则/CI 检查 | 流程自研 |

**没造轮子的部分（正确使用主流库）**：
- 表格/弹窗/表单/抽屉等直接用 Element Plus：`<el-table` 出现在 13+ 个文件、100+ 处（grep 截断）；el-dialog/el-form/el-skeleton/el-empty 等常规使用。
- Markdown 渲染：marked.parse + DOMPurify.sanitize（MarkdownContent.vue:46-52）——**这就是主流做法本身**，仅附加了裸图片 URL 行转 markdown、referrer-policy 补丁两个小自研；未配代码高亮（无 highlight.js/shiki）。
- 富文本：CKEditor5 官方 @ckeditor/ckeditor5-vue 组件（RichTextEditorCk.vue），RichTextEditor.vue 只是 Suspense 懒加载壳，非重复实现。
- 构建配置地道：unplugin-vue-components + ElementPlusResolver 按需引入（vite.config.ts:17-27）。
- 分页：`el-pagination` 全库仅 1 处（StaffQuizPage.vue:516，唯一做服务端分页 page/page_size 的页面），其余列表一次性全量拉取（grep `hasMore|loadMore|page_size` 全库仅命中 StaffQuizPage）——不是"造轮子"，是"没做"。

## 4. typecheck 实测

在仓库根目录 `D:\code\mycode-ai\learnsite-ai02` 运行 `npm run typecheck:web`（→ `npm --workspace apps/web run typecheck` → `vue-tsc --noEmit`）：

```
> learnsite-platform@0.1.0 typecheck:web
> npm --workspace apps/web run typecheck

> @learnsite/web@0.1.0 typecheck
> vue-tsc --noEmit
```

**结果：通过。exit code 0，stdout/stderr 无任何报错。** 另外 `build` script 也内嵌 `vue-tsc --noEmit && vite build`（apps/web/package.json:9），构建前会再跑一次。

## 5. 质量信号

- **TS 严格度**（apps/web/tsconfig.json）：`strict: true` ✓；`isolatedModules` ✓；但 `moduleResolution: "Node"`（旧式 Node10 解析，非 Bundler）；未开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`；`skipLibCheck: true`。
- **前端测试：零。** 无 vitest/jest/@vue-test-utils/cypress/playwright 依赖；src/ 无任何 *.spec/*.test 文件；无 test script。对比后端有 pytest（apps/api/tests）。
- **Lint/格式化：无。** 无 ESLint、Prettier 配置（根目录仅 .editorconfig）；.githooks/pre-commit 只跑 check:mirror-js。
- **组件规模：失控。** 44 个模块页平均约 790 行；**8 个页面 >1,500 行**（AdminSystemPage 3166、SubmissionTaskPage 2902、StaffDashboardPage 2876、LessonPlanPage 2715、TaskPage 2316、StaffQuizPage 1947、ProgramTaskPage 1727、StaffStudentPage 1652），组件里还有 2,216 行的 FloatingAiCompanion。模板+逻辑+样式全部单文件；仅 staff-lesson-plan 一个模块抽取了 composables（4 个）和子组件（11 个），其余模块零抽取。
- 正向信号：路由懒加载、按需引入、API 层统一、错误处理统一、严格 TS 且 typecheck 全绿。

## 附：环境事实

- 仓库根 `reference-src/` 是旧版 LearnSite ASP.NET 平台源码（index.aspx、Global.asax、web.config 等），本前端为重写迁移项目，这解释了镜像检查等自研守卫的存在（不属本次审计对象）。
- 根 package.json workspaces 仅含 apps/web（apps/api 为 Python，不入 npm workspaces）。
