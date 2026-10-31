# 代码结构整改计划（Refactor Plan）

> 基于 2026-10-29 的结构审计。目标：消除「模块边界缺失」的系统性问题，让「一个文件 = 一个职责」。
> 基线（本次整改开始时已验证全绿）：`typecheck:web` ✓、`check:api` ✓、`check:no-element` ✓。
> 每一步完成后都必须重跑上述三项 + 相关 smoke test，绿了才进入下一步。

## 现状速览（证据）

| 区域 | 规模 | 问题 |
|---|---|---|
| `apps/web/src/modules/staff-admin/AdminSystemPage.vue` | 4145 行（template 1150 / script 2085 / style 908） | 一个 SFC 装 9 个后台 tab + 3 个 AI 子 tab，94 函数 / 50 ref |
| `apps/api/app/api/v1/endpoints/*.py` | 20,174 行 | endpoint 即业务层；`staff.py` 3623 行跨 7 领域 |
| `apps/api/app/services/*.py` | 3,559 行 | 大量薄壳，且被 endpoint 绕过/复写 |
| `apps/web/src/api/schema.d.ts` | 9,885 行 | openapi 生成物，**零引用** |
| 内联 `type` 声明 | 184 个散落各 `.vue` | `NavigationTask`×4、`TaskRuntime*`×3… |
| 重复工具函数 | `formatDateTime`×25、`triggerBrowserDownload`×8 | 复制粘贴传播 |
| `apps/api/tests/test_smoke.py` | 6,031 行 / 84 用例 | 94% 的 E2E 堆在一个文件 |

---

## Phase 0 — 安全网（已完成）

- [x] 确认工具链：Node 24 / Python 3.12 / node_modules 就绪
- [x] 跑通基线：web typecheck + api compile + no-element 全绿
- [x] 记录所有待迁移实现的实际差异（见下）

**关键差异记录（决定能否安全合并）：**
- `triggerBrowserDownload`：8 处**逐字相同** → 可安全抽 1 份。
- `formatDateTime`：25 处，全部 `slice(0,16)`，仅 1 处 `slice(5,16)`；fallback 有 4 种（`暂无记录` / `--` / `暂无` / `待确认`）→ 抽成带参数的实现，调用点保留各自 fallback。
- `taskTypeLabel`：5 处**语义不同**（`ClassroomPage` 用短标签「阅读」，其余用「阅读活动」）→ **不合并**，仅登记。
- `detectPreviewKind`：3 处结构相同 → 可抽，保留在各页的类型别名。

## Phase 1 — 抽取重复工具函数（低风险 / 立竿见影）✅ 已完成

- [x] 新建 `src/utils/download.ts`：`triggerBrowserDownload`（8 处 → 1 份，逐字相同）
- [x] 新建 `src/utils/datetime.ts`：`formatDateTime(value, { fallback, sliceStart, sliceEnd })`（25 处；默认版直接 import，变体保留薄 alias 包装）
- [x] 新建 `src/utils/filePreview.ts`：`detectPreviewKind`（3 处）+ `detectFilePreviewKind` + 扩展名集合（student-task 2 处）
- [x] 逐文件替换为 import，删除本地实现；`groupPanelShared.ts` 改为 re-export 保持对下游两个组件的 API 稳定
- [x] 验证：`typecheck:web` ✓ / `build:web` ✓ / `check:no-element`（123→126 文件）

## Phase 2 — 收敛类型定义（中风险）✅ 已完成

- [x] 新建 `src/types/domain.ts`：`NavigationTask`(×4)、`ContextQuery`(×2)、`GroupTaskDraft`(×2)
- [x] 新建 `src/types/taskRuntime.ts`：`TaskRuntimeRequestMessage`(×3，统一 `taskId: number|null`)、`TaskRuntimeResponseMessage`(×3)、`TaskRuntimeSessionPayload`(×2)
- [x] 新建 `src/types/submission.ts`：`TaskSubmissionFile`(×3，取可选并集)、`RecommendedSubmissionItem`(×3)
- [x] 模块内重复：`RecentSession` → `staff-dashboard/components/dashboardTypes.ts`；`TaskSubmission`/`TaskAssetManifestItem` → `student-task/taskTypes.ts`；`GuestResource` → `public-pages/guestTypes.ts`
- [x] 删除随之孤立的 `RecommendedSubmissionFile` 死别名（2 处）
- [x] **不合并**（语义/结构确实不同，仅登记）：`CurriculumBook`(3 种形状)、`BootstrapPayload`(admin 与 assistant 同名异物)、`ClassTransferRequestItem`(差 1 字段)、`PlanDetail`/`TaskConfigState`/`TaskDetailPayload`/`RankingPayload`/`GroupMember` 等
- [x] `schema.d.ts`：保留（生成物），登记为「未接线」；不改用它以避免大范围行为变更
- [x] 验证：`typecheck:web` ✓（捕获并修复了 `TaskSubmission.files` 漏字段）/ `build:web` ✓

## Phase 1/2 关键差异记录（决定能否安全合并）

## Phase 3 — 清理死代码与重复组件（低风险）

- [ ] 删除 `components/WorkspacePlaceholder.vue`（0 引用，已验证）
- [ ] `components/staff/StaffPageHead|StaffStatStrip` vs `components/student/Student*`：合并为带 variant 的单个组件（先 diff 确认仅前缀/类型名不同）
- [ ] 验证：`typecheck:web` 绿 + 页面视觉回归截图（staff/student 各一张）

## Phase 4 — 拆分 AdminSystemPage.vue — ✅ 已完成

结果：**4145 行 → 208 行**（-95%），拆成 15 个文件，最大文件 462 行。

- [x] 4.1 `composables/useAdminBootstrap.ts`：bootstrap / systemForm / aiProviders / promotion 计算与动作
- [x] 4.2 `modules/staff-admin/adminTypes.ts`：全部 21 个 `type` 定义
- [x] 4.3 抽出 9 个 pane 子组件（每个自带表单/弹窗/请求）：
  `SystemSettingsPane`、`ClassesPane`、`TeachersPane`、`StudentsPane`、
  `PromotionsPane`、`RoomsPane`、`CurriculumPane`、`AiProvidersPane`、`AiSafetyPane`
  - 另配 4 个 composable：`useAdminBootstrap` / `useAdminCurriculum` / `useAdminRooms` / `useAdminStudents`
- [x] 4.4 主 `.vue` 只剩：`navGroups` + `activeTab` + 路由同步 + 9 个 `v-if` 挂载（208 行）
- [x] 4.5 CSS 抽到全局 `styles/staff-admin.css`（`.settings-page` 前缀，作用域不变）
- [x] 验证：`typecheck:web` ✓ / `build:web` ✓ / 浏览器全 9 tab 点击回归、0 运行时错误；
  班级 10 / 教师 3 / 学生 420 / 机房 4 页签切换、升班预览（10 班级·420 人）均实测通过

## Phase 5 — 后端分层（高风险，分批进行）— 进行中

基线：`apps/api/.venv` 下 `pytest tests/` = **96 passed**（改动前后均复跑）。

- [x] 5.5a 合并 5 份 `build_content_disposition` → 新建 `app/core/downloads.py`；
  drives/staff/profiles/peer_reviews/submissions 改为调用共享实现，用 `fallback=` 保留各自原有 fallback 语义；
  已用逐字符等价性脚本验证（含中文/纯 ASCII/无扩展名/显式 fallback 等边界）。
- [x] 5.5b 删除孤儿 service `app/services/mock_payloads.py`（全仓 0 引用）。
- [x] 5.1a 拆分 `staff.py`：learning-reports 段（3 路由 + 6 schema + 2 helper）→ 新文件
  `app/api/v1/endpoints/learning_reports.py`，仍在 router.py 以 `/staff` 挂载，路径不变；
  同步修正 `test_smoke.py` 中 2 处 monkeypatch 目标（`staff` → `learning_reports`）。
- [ ] 5.1b 余下 staff.py 领域拆分（classes / groups / attendance / students / seats）
- [ ] 5.2 settings.py 拆分（system_settings / classes / teachers / students_import / rooms / promotions / ai_providers）
- [ ] 5.3 endpoint 内联的 81 个 `BaseModel` 迁到 `schemas/`
- [ ] 5.4 余下逻辑下沉（import 解析、promotions、dashboard 等）
- 每步均复跑 `pytest tests/`（96 passed 不得下降）

**审计修正（原审计的部分结论需要更正）**：
- `settings.py` 的 `read/write_system_settings` 并非「同名遮蔽」——service 函数是以**别名**导入的
  （`read_system_settings as load_system_settings_payload`），不存在名字冲突。
- `assistants.py` 的 AI 传输函数并非重复实现——`call_openai_compatible_provider(_stream)`
  已经委托给 `ai_provider_client.chat_completion(_stream)`，只是额外加了日志。

## Phase 6 — 拆分巨型测试（低风险）— 已完成关键切片

- [x] 提取 `tests/smoke_helpers.py`：8 个共享辅助函数（student_headers / staff_headers /
  find_class / find_roster / find_seat_by_student / find_lesson_id_by_title /
  create_published_plan_with_active_session / start_classroom_session_for_plan）从
  `test_smoke.py` 迁出并被 import 回来；`test_smoke.py` 6031 → 5940 行。
- [ ] （可选，未做）按领域把 84 个用例拆到多个 `test_*.py`：需要把 session 级 DB fixture
  与 env 初始化迁到 `tests/conftest.py`，而三个测试文件各自持有不同 setup，风险较高，
  收益（可维护性）有限，故本轮不做。
- [x] 验证：`pytest tests/` 仍 **96 passed**。

---

## 总结

| 阶段 | 结果 | 验证 |
|---|---|---|
| Phase 1 工具函数 | `formatDateTime`×25、`triggerBrowserDownload`×8、`detectPreviewKind`×3 → 各 1 份 | typecheck/build ✓ |
| Phase 2 类型 | 重复内联类型 → `src/types/*` + 模块内 types（共 9 组） | typecheck ✓（并捕获 `files` 漏字段） |
| Phase 3 死代码 | 删 `WorkspacePlaceholder.vue`；成对组件经查证 CSS 不同、不予合并 | typecheck ✓ |
| Phase 4 巨型 SFC | **AdminSystemPage.vue 4145 → 208 行**，拆 9 pane + 4 composable + types + CSS | typecheck/build/浏览器全 9 tab 回归、0 错误 |
| Phase 5 后端重复 | 5 份 `build_content_disposition` → 1；删孤儿 service；staff.py 拆出 learning_reports | 等价性脚本 + `pytest` 96 通过 |
| Phase 6 测试 | 抽 `tests/smoke_helpers.py` | `pytest` 96 通过 |


---

## 执行约定

- 每个 Phase 单独验证；**不改变运行时行为**（纯结构调整）。
- 只合并「逐字相同」的实现；语义不同的（如 `taskTypeLabel`）只登记不合并。
- 现有 55 个未提交改动原样保留，本计划只做增量重构，不掺入功能改动。
