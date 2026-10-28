# naive-ui（soybean-admin 形态）逐步迁移方案

生成时间：2026-10-27
适用仓库：learnsite-ai02 / `apps/web`
当前状态：**迁移已完成（P1–P6，含深色模式）**；执行结果与验证见 `docs/ui-migration-report.md`

---

## 0. 一句话结论

外壳（布局/导航/标签页/主题）已经是 naive-ui；剩下的是把 **43 种 Element 组件、2148 个标签、44 个模块文件**按"基础设施 → 入口 → 教师主线 → 教师其余 → 学生端 → 卸载 Element"六步迁完。
**预估：单人 30 人日（乐观 22 / 保守 38）；两人并行约 4 周。**

---

## 1. 现状基线（实测数据，2026-10-27）

| 指标 | 数值 |
|---|---|
| 使用 `<el-*>` 的 `.vue` 文件 | 49 个（模块 44 + 共享组件 4 + 登录页 2 等重叠计） |
| `<el-*>` 标签总数 | 2 148（模块内）+ 43（共享组件）= 2 191 |
| 模块代码行数 | 35 410 行（26 个模块目录） |
| 命令式 API | `ElMessage` 27 个文件 / `ElMessageBox` 10 个文件（confirm 27、prompt 8、alert 4） |
| 指令 | `v-loading` 12 处 |
| 表单实例类型 | `FormInstance` 0 处（无强校验 ref，迁移更简单） |
| 带分页表格 | 3 个文件（4 处 `el-pagination`） |
| 重复布局模式 | `.soft-card` 160 处、`.hero-panel` 32 处 |

**组件频次 Top 15**：`el-button` 446、`el-tag` 288、`el-table-column` 221、`el-form-item` 162、`el-card` 124、`el-option` 102、`el-input` 98、`el-empty` 97、`el-skeleton` 77、`el-select` 70、`el-space` 62、`el-alert` 56、`el-col` 47、`el-form` 40、`el-switch` 36。

> 结论：**按钮/标签/表格列/表单项**四类占 1117 个（52%）。把它们机械替换掉，进度就过半；因此"适配层 + 批量套路"比"逐页手工精修"更划算。

---

## 2. 目标与原则

### 2.1 最终形态

- 组件库：**仅 naive-ui**，卸载 `element-plus`、`unplugin-element-plus`
- 布局：`SoybeanShell`（已具备）——Sider + Header + Breadcrumb + TabBar + ThemeDrawer
- 主题：naive 主题变量由现有 `--ls-*` CSS 变量派生（已实现），P6 补齐深色模式
- 命令式反馈：统一走 `src/ui/feedback.ts`（naive discrete API 封装）

### 2.2 五条硬约束

1. **可交付性**：每个阶段结束时应用都能正常启动、构建、登录、浏览核心页面。
2. **双库共存**：迁移期间 Element 与 naive 并存，按模块切换，不做"停业改造"。
3. **禁止新增 Element**：新代码只准 `n-*`；旧代码在被改动时顺带迁移（Boy Scout 规则）。
4. **一个模块一次提交**：出问题可单独 revert，不影响其他模块。
5. **门禁可执行**：不靠自觉，靠脚本（见 §6）。

---

## 3. 迁移技术策略

### 3.1 顺序：外壳 → 基础设施 → 入口 → 主线 → 其余 → 卸载

理由：
- 外壳已完成，视觉框架已定，后续页面迁移有统一落点；
- 先做适配层，把 160 处 `soft-card`、33 处 `el-table` 的模式收敛，避免 44 次重复劳动；
- 入口（登录页）最小、最显眼，用作**样板与联调验证**（provider 外场景）；
- 大模块（staff-admin 364 标签 / 3382 行）先拆分再迁移，避免在 3000 行单文件上做大手术。

### 3.2 共享适配层（P1 交付，4 个文件）

| 组件 | 替代 | 覆盖量 | API 草案 |
|---|---|---|---|
| `SaPageHeader` | `.hero-panel` + `.eyebrow` | 32 处 | `title / description / eyebrow` + `#actions` 插槽 |
| `SaPanel` | `.soft-card` + `.panel-head` | 160 处 | `title / description` + `#actions` + 默认插槽，内建内边距与圆角 |
| `SaDataTable` | `el-table` + `el-table-column` + `el-pagination` | 33 表 / 221 列 / 4 分页 | `columns / data / loading / pagination / row-key / selection`，列定义支持 `render` 与具名插槽双形态 |
| `ui/feedback.ts` | `ElMessage` / `ElMessageBox` | 457 处调用 | `message.success/error/warning/info`、`confirm/prompt/alert`（签名对齐 Element，便于替换） |

关键设计：
- `SaDataTable` 内部用 `n-data-table`，把"列配置 → 渲染函数"的模板代码收敛到一处；页面侧继续写声明式列，减少认知负担。
- `feedback.ts` 用 `createDiscreteApi(['message','dialog'])`，**脱离 provider 也能用**（登录页、路由守卫、axios 拦截器都需要）。

```ts
// src/ui/feedback.ts（草案）
import { createDiscreteApi } from 'naive-ui';
const { message, dialog } = createDiscreteApi(['message', 'dialog']);

export const notify = {
  success: (text: string) => message.success(text),
  error: (text: string) => message.error(text),
  warning: (text: string) => message.warning(text),
  info: (text: string) => message.info(text),
};

export const confirmBox = {
  confirm: (text: string, title = '请确认') =>
    dialog.warning({ title, content: text, positiveText: '确定', negativeText: '取消' }),
  // prompt / alert 同理，返回 Promise<boolean> 语义与 ElMessageBox 对齐
};
```

### 3.3 组件映射表（43 种，按迁移优先级）

| Element | naive-ui | 关键差异（必看） |
|---|---|---|
| `el-button` | `n-button` | `plain`→`quaternary/secondary`；`link`→`text`；`loading` 同名 |
| `el-tag` | `n-tag` | `type` 取值一致；`round` 同名 |
| `el-table` / `el-table-column` | `n-data-table` | **槽位 → 渲染函数**；排序/筛选改函数式；建议统一经 `SaDataTable` |
| `el-form` / `el-form-item` | `n-form` / `n-form-item` | `label-position="top"`→`label-placement="top"`；校验用 `rules` + `formRef.validate()` |
| `el-card` | `n-card` 或 `SaPanel` | Element 的 `shadow` 语义不同 |
| `el-select` / `el-option` | `n-select` / `n-option` | 多选值仍是数组；`filterable`→`filterable`；空值 `null` 处理需显式 |
| `el-input` | `n-input` | `show-password`→`type="password" show-password-on="click"` |
| `el-input-number` | `n-input-number` | `:precision` 同名；`value-on-clear` 用 `null` 需显式 |
| `el-empty` | `n-empty` | `description` 同名 |
| `el-skeleton` | `n-skeleton` | `rows` 同名；`animated` 同名 |
| `el-space` | `n-space` | `wrap` 同名 |
| `el-alert` | `n-alert` | `type` 同名；`title` 用 `title` 插槽或 `title` 属性 |
| `el-row` / `el-col` | `n-grid` / `n-gi`（或纯 CSS Grid） | 项目已大量使用 CSS Grid，优先纯 CSS，减少组件 |
| `el-switch` | `n-switch` | `active-text`→`checked`/`unchecked` 插槽 |
| `el-tabs` / `el-tab-pane` | `n-tabs` / `n-tab-pane` | `name`→`name` 保留；`label`→`tab` |
| `el-descriptions` / `-item` | `n-descriptions` / `-item` | `column` 同名，`label` 同名 |
| `el-dialog` | `n-modal` | **`v-model`→`v-model:show`；默认点击遮罩不关闭**（Element 默认关闭），需显式 `mask-closable` |
| `el-drawer` | `n-drawer` + `n-drawer-content` | 同上，`v-model:show` |
| `el-radio-group` / `el-radio-button` | `n-radio-group` / `n-radio-button` | **`label` 语义变更：naive 用 `value`**（最易踩坑） |
| `el-checkbox` | `n-checkbox` | `label` 显示文案，`value` 为值 |
| `el-divider` | `n-divider` | `content-position`→`title-placement` |
| `el-pagination` | `n-pagination`（或 `SaDataTable` 内建） | 事件名不同：`current-change`→`update:page` |
| `el-collapse` / `-item` | `n-collapse` / `n-collapse-item` | `name` 同名 |
| `el-timeline` / `-item` | `n-timeline` / `n-timeline-item` | `timestamp`→`time` |
| `el-date-picker` | `n-date-picker` | 返回值类型：naive 为时间戳(number)，需转换 |
| `el-dropdown` / `-menu` / `-item` | `n-dropdown` | 菜单改为 `options` 数组驱动（已在 SessionActionMenu 验证） |
| `el-badge` | `n-badge` | `value` 同名 |
| `el-scrollbar` | `n-scrollbar` | 一般可直接删除，交给容器 overflow |
| `el-icon` | 直接用 `AppIcon`（lucide） | 项目本就以 lucide 为主，1 处可清 |
| `el-progress` | `n-progress` | `percentage` 同名，`type="circle"` 同名 |
| `el-option-group` | `n-option-group` | 字段 `label` 同名 |
| `el-skeleton-item` | `n-skeleton` 组合 | 视情况合并 |
| `v-loading` | `n-spin :show` 包裹 | 12 处，逐处改包裹层 |
| `ElMessage` | `notify.*`（`ui/feedback.ts`） | 457 处调用可由脚本批量替换 |
| `ElMessageBox` | `confirmBox.*` | confirm/prompt/alert 三类，签名对齐 |

### 3.4 批量替换脚本（P1 一并交付）

`ElMessage.success('x')` → `notify.success('x')` 这类替换用 `scripts/codemod-element-feedback.mjs` 做正则改写（**先 dry-run 输出 diff，人工确认后再写入**），把 457 处调用一次性搬走，比逐页手改省 2 人日。

---

## 4. 阶段计划

> 每个阶段结束都必须过 §6 门禁 + §5 冒烟清单。

### P0 · 外壳（已完成）

- 依赖：`naive-ui@2.45.3`
- 交付：`SoybeanShell`（折叠侧栏 / 面包屑 / 多标签 / 刷新 / 全屏 / 主题抽屉）、`ThemeDrawer`、`navTabs` store、naive 版 `SessionActionMenu`、双端布局接入
- 已验证：236/72 侧栏、56 顶栏、42 标签栏、13 项/7 项菜单、标签增删与回退、三主题联动、切端标签清理、420 人分页业务不受影响

### P1 · 基础设施（2 人日）

| 交付物 | 说明 |
|---|---|
| `src/ui/feedback.ts` | discrete API 兼容层（message/dialog） |
| `src/components/sa/SaPageHeader.vue` | 页面头（32 处复用） |
| `src/components/sa/SaPanel.vue` | 内容卡片（160 处复用） |
| `src/components/sa/SaDataTable.vue` | 数据表 + 分页 + 选择 + 空态（33 表） |
| `scripts/check-no-element.mjs` | 门禁脚本（§6） |
| `scripts/codemod-element-feedback.mjs` | 命令式 API 批量替换 |

**验收**：用新组件在 1 个页面（建议 staff-report，15 标签）做端到端试点，确认视觉与交互无回退。

### P2 · 入口与最大单点（4 人日）

| 模块 | 文件/标签/行数 | 说明 |
|---|---|---|
| `auth`（登录页 ×2） | 2 / 19 / 388 | 样板页；验证 provider 外 discrete API 可用 |
| `staff-admin`（系统设置） | 1 / **364** / 3382 | **先拆 7 个 tab 子组件**（基础参数 / 班级与教师 / 升班归档 / 机房座位 / 教材目录 / AI 服务 / AI 安全），再逐块迁移 |

**验收**：登录页双端可用；系统设置 7 个 tab 全部可用，班级 10 条 + 学生 420 条分页、批量操作、权限弹窗、座位拖拽、教材导入全部回归。

### P3 · 教学主线（6 人日）

| 模块 | 文件 / 标签 | 风险点 |
|---|---|---|
| `staff-lesson-plan` | 11 / 259 | 富文本编辑器（CKEditor 不受影响）+ 任务模板库 composables |
| `staff-submission` | 2 / 184 | 批阅弹窗、文件预览 |
| `staff-quiz` | 1 / 154 | 题目编辑器表单联动 |
| `staff-student` | 1 / 129 | 学生表 + 分组拖拽 |

### P4 · 教师其余（5 人日）

`staff-dashboard`(1/128)、`staff-classroom`(1/68，ECharts 不受影响)、`staff-assistant`(1/71)、`staff-resource`(1/53)、`staff-typing`(1/44)、`staff-attendance`(1/31)、`staff-curriculum`(1/29)、`staff-report`(1/15)
+ 共享组件：`FloatingAiCompanion`(26)、`RecommendedWorksShowcase`(11)、`WorkspacePlaceholder`(4)、`ThemePicker`(2，建议直接废弃并入 ThemeDrawer)

### P5 · 学生端（5 人日）

`student-task`(3/129)、`student-profile`(1/92)、`student-typing`(2/73)、`student-quiz`(2/65)、`student-work`(2/52)、`student-group`(1/33)、`student-drive`(1/32)、`student-home`(1/28)、`student-review`(1/27)、`student-reading`(1/26)、`student-resource`(1/24)、`student-course`(1/17)

### P6 · 收尾（3 人日）

1. 卸载 `element-plus`、`unplugin-element-plus`，移除 `ElementPlusResolver` 与 `--el-*` 变量块
2. 删除死代码：`AppShellHeader.vue`、`ThemePicker.vue`、`base.css` 旧外壳规则、`page-icon-chrome.css` 中 `.el-card__header` 选择器
3. 深色模式（已完成）：naive `darkTheme` + `--ls-*` 深色变量集（`data-scheme="dark"` 驱动，三套主题各一组强调色）
4. 标签页 keep-alive 缓存（可选，按需开启并逐页确认）
5. 体积对比：迁移前后 gzip 报告（预期回收 Element Plus 约 230–280 KB gzip）

---

## 5. 单模块验收清单（模板，30 分钟）

每个模块迁完按下表逐条打勾，缺项不入库：

- [ ] 列表：首屏加载、空态、错误提示（naive 样式）
- [ ] 分页：页码切换、每页条数、跳页（若有）
- [ ] 筛选/搜索：条件变化回到第 1 页（若有）
- [ ] 表单：新增/编辑校验、必填拦截、提交成功后刷新
- [ ] 弹窗：打开/关闭、遮罩行为、ESC、销毁后状态不残留
- [ ] 批量操作：勾选、跨页保留（若有）、确认弹窗、结果提示
- [ ] 危险操作：二次确认文案与按钮色（danger）
- [ ] 窄屏（≤960）：布局不破、表格可横向滚动
- [ ] 控制台无新增报错/警告

---

## 6. 质量门禁

### 6.1 门禁脚本

`scripts/check-no-element.mjs`：对指定目录（或全量）扫描 `<el-`、`from 'element-plus'`、`v-loading`，命中即退出码 1 并打印文件:行号。

```jsonc
// apps/web/package.json → scripts
"check:no-element": "node ./scripts/check-no-element.mjs",           // 全量
"check:no-element:staff": "node ./scripts/check-no-element.mjs src/modules/staff-admin",
```

### 6.2 每阶段必跑

```powershell
npm run typecheck:web      # 类型检查（P0 基线通过）
npm run build:web          # 产线构建（P0 基线 24s 通过）
npm run check:no-element   # 目标模块 0 命中
npm run check:mirror-js    # 既有校验，防新增 JS/TS 镜像缺失
```

### 6.3 合并规则

- 每阶段一个分支、每模块一个提交，提交信息带模块名（如 `migrate(staff-quiz): naive-ui`）
- 任一模块门禁失败 → 该模块单独回退，不回退整阶段
- 阶段末用 `learnsite-task-checklist.md` 的既有回归项补测一次核心链路

---

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 表格槽位 → 渲染函数改造量大 | P3/P4 最耗时 | `SaDataTable` 收敛；先迁只读表，再迁带选择/排序表 |
| `el-dialog` 默认点遮罩关闭，naive 默认不关闭 | 交互回退 | 迁移时显式 `mask-closable`；纳入冒烟清单 |
| `el-radio-button` 的 `label` 语义变为 `value` | 静默选错值 | 全局搜索 `el-radio-button` 逐处核对；门禁加规则提示 |
| 双库并存期样式互相污染 | 视觉错乱 | 类名前缀不同（`.el-` / `.n-`）实际隔离；`--el-*` 变量只影响 Element 组件，迁移完统一移除 |
| `createDiscreteApi` 在小程序/SSR 不适用 | 无 | 本项目纯 SPA，登录页已按此模式验证 |
| 迁移期新增代码又用 Element | 返工 | 门禁脚本 + Code Review 规则（§2.2 第 3 条） |
| 深色模式牵动全部页面 | P6 延期 | 单独排期，只在浅色全绿后开启；提供"深色 beta"开关 |
| 单文件过大（admin 3382 行） | 冲突与回归风险 | P2 先拆 tab 子组件，再迁移 |

---

## 8. 排期建议

| 阶段 | 单人 | 双人并行（教师/学生分线） |
|---|---|---|
| P1 基础设施 | 2d | 2d |
| P2 入口 + 系统设置 | 4d | 4d |
| P3 教学主线 | 6d | 3d（另一人做 P5 前三块） |
| P4 教师其余 | 5d | 3d |
| P5 学生端 | 5d | 3d |
| P6 收尾 | 3d | 2d |
| **合计** | **25d（乐观 22 / 保守 38）** | **约 17d ≈ 3.5 周** |

估算口径：按"每标签 0.7–1.2 分钟"折算，表格类取上限；已扣除适配层带来的复用收益。

---

## 9. 立即可执行的第一步

```powershell
git checkout -b feat/naive-migration
# 1) 落 P1 四个文件（SaPageHeader / SaPanel / SaDataTable / ui/feedback.ts）
# 2) 用 staff-report（15 标签、377 行）做试点页，一个提交验证整套模式
npm run typecheck:web; npm run build:web
```

试点通过即证明模式成立，后续按 P2→P5 机械推进。

---

## 附录 A · 模块迁移清单（建议顺序）

| 顺序 | 模块 | 文件 | 标签 | 行数 | 阶段 |
|---|---|---|---|---|---|
| 1 | auth | 2 | 19 | 388 | P2 |
| 2 | staff-admin | 1 | 364 | 3382 | P2 |
| 3 | staff-lesson-plan | 11 | 259 | 5641 | P3 |
| 4 | staff-submission | 2 | 184 | 3361 | P3 |
| 5 | staff-quiz | 1 | 154 | 1945 | P3 |
| 6 | staff-student | 1 | 129 | 1646 | P3 |
| 7 | staff-dashboard | 1 | 128 | 2862 | P4 |
| 8 | staff-classroom | 1 | 68 | 1188 | P4 |
| 9 | staff-assistant | 1 | 71 | 609 | P4 |
| 10 | staff-resource | 1 | 53 | 528 | P4 |
| 11 | staff-typing | 1 | 44 | 413 | P4 |
| 12 | staff-attendance | 1 | 31 | 324 | P4 |
| 13 | staff-curriculum | 1 | 29 | 282 | P4 |
| 14 | staff-report | 1 | 15 | 377 | P1 试点 / P4 |
| 15 | student-task | 3 | 129 | 4502 | P5 |
| 16 | student-profile | 1 | 92 | 980 | P5 |
| 17 | student-typing | 2 | 73 | 993 | P5 |
| 18 | student-quiz | 2 | 65 | 1041 | P5 |
| 19 | student-work | 2 | 52 | 727 | P5 |
| 20 | student-group | 1 | 33 | 534 | P5 |
| 21 | student-drive | 1 | 32 | 703 | P5 |
| 22 | student-home | 1 | 28 | 895 | P5 |
| 23 | student-review | 1 | 27 | 844 | P5 |
| 24 | student-reading | 1 | 26 | 431 | P5 |
| 25 | student-resource | 1 | 24 | 455 | P5 |
| 26 | student-course | 1 | 17 | 330 | P5 |
| 27 | public-pages | 1 | 2 | 29 | P6 |
| 28 | 共享组件（FloatingAiCompanion 26 / RecommendedWorksShowcase 11 / WorkspacePlaceholder 4 / ThemePicker 2） | 4 | 43 | — | P4 |

## 附录 B · P0 遗留问题登记

| 项 | 现状 | 处理节点 |
|---|---|---|
| 登录页仍为 Element | 可用 | P2 |
| 深色模式 | 已实现（`data-scheme`） | 已完成 |
| 标签页无 keep-alive 缓存 | 切换即重新挂载（与迁移前行为一致） | P6 可选 |
| `AppShellHeader.vue` / `ThemePicker.vue` 未删除 | 已成死代码 | P6（删除需确认） |
| `base.css` 旧外壳规则（`.app-layout` / `.side-nav` / `.nav-link` / `.theme-picker`） | 无引用 | P6 清理 |
| `SessionActionMenu` 内仍用 `ElMessage` | 功能正常 | P1 随 feedback 层替换 |
| ≤960 折叠按钮隐藏（该宽度强制图标栏） | 设计如此 | — |
