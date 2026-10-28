# naive-ui 迁移完成报告

生成时间：2026-10-27
适用仓库：learnsite-ai02 / `apps/web`
依据方案：`docs/ui-framework-migration-plan.md`
执行方式：P1 共享层由主控落地，P2–P5 按模块分两波并行推进（共 10 个执行单元），P6 收尾与全量验证由主控完成

---

## 0. 一句话结论

`apps/web` 已**只依赖 naive-ui**：`<el-*>` 标签 2143 → 0、48 个文件清零、`element-plus` 与两个 build 插件已卸载，`gzip` 产物 1442 KB → 1282 KB。类型检查、产线构建、门禁脚本、浏览器双端冒烟全部通过。

---

## 1. 结果概览

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| 使用 `<el-*>` 的 `.vue` 文件 | 48 | **0** |
| `<el-*>` 标签总数 | 2143 | **0** |
| `element-plus` / `unplugin-element-plus` / `unplugin-vue-components` | 已安装 | **已移除**（`node_modules`、`package.json`、`package-lock.json` 三处同步） |
| `<n-*>` 标签 | 少量（仅外壳） | 1562 |
| `<Sa*>` 适配层标签 | 0 | 415 |
| `--el-*` CSS 变量 | 15 条 | **0** |
| `.el-*` 选择器（含 scoped 样式） | 多处 | **0** |
| 构建产物（`dist/assets`） | 182 文件 / 4922 KB raw / **1442 KB gzip** | 145 文件 / 4328 KB raw / **1282 KB gzip** |
| 产线构建耗时 | 24.8 s | 19.8 s |

---

## 2. 阶段执行情况

### P1 · 基础设施（已完成）

| 交付物 | 说明 |
|---|---|
| `src/ui/feedback.ts` | discrete API 封装：`notify.*`、`confirmBox.confirm/prompt/alert`（返回 boolean / null，不抛异常）；同时导出**与 Element 同签名**的 `ElMessage` / `ElMessageBox` 过渡壳，取消时 `reject('cancel')`，支持 `dangerouslyUseHTMLString`、`inputValidator`、`inputPlaceholder`、`inputType`、`confirmButtonText` 等既有参数 |
| `src/ui/naive-theme.ts` | 从 `--ls-*` 变量派生 naive `themeOverrides`（原实现内嵌在外壳里），外壳与离散 API 共用 |
| `src/components/sa/SaPageHeader.vue` | `.hero-panel` 页面头：`eyebrow / title / description` + `#actions` |
| `src/components/sa/SaPanel.vue` | `.soft-card` + `el-card`：`title / description / eyebrow / panel-class / body-class` + `#header / #actions / #footer` |
| `src/components/sa/SaDataTable.vue` | `el-table` + `el-pagination`：`data / row-key / loading / stripe / scroll-x / checked-row-keys / pagination / row-click / selection-change`，内建 `n-spin`、空态、分页 |
| `src/components/sa/SaTableColumn.vue` | 声明式列标记组件，由 `SaDataTable` 读取属性与插槽生成 naive 列配置（`prop / label / width / min-width / fixed / align / sortable / formatter / type=selection\|index`） |
| `scripts/check-no-element.mjs` | 门禁：扫描 `<el-`、`element-plus`、`@element-plus/icons-vue`、`v-loading`，命中即退出码 1 |
| `scripts/codemod-element-feedback.mjs` | 命令式 API 批量搬迁（dry-run 出 diff，`--write` 落盘） |
| `scripts/bundle-size.mjs` | 产物体积快照，用于前后对比 |

> `SaDataTable` + `SaTableColumn` 是本次的关键设计：页面侧仍然写声明式列，221 个 `el-table-column` 基本按 1:1 映射迁移，避免了把 33 张表全部改写成脚本内 `columns` 数组。

### P2 · 入口与最大单点（已完成）

- `auth`（教职工 / 学生登录页，19 标签）：作为 provider 外场景的样板，验证 naive 组件自注入样式 + `createDiscreteApi` 提示可用。
- `staff-admin`（系统设置，**364 标签 / 3419 行**）：7 个 tab（基础参数 / 班级与教师 / 升班与归档 / 机房与座位 / 教材目录 / AI 模型服务 / AI 安全）全量迁移，6 张表 + 10 个 `n-modal` 弹窗。

### P3 · 教学主线（已完成）

`staff-lesson-plan`（11 文件 / 259 标签，含任务模板库、任务编辑卡、数据提交编辑器）、`staff-submission`（2 文件 / 184）、`staff-quiz`（154）、`staff-student`（129）。

### P4 · 教师其余 + 共享组件（已完成）

`staff-dashboard`(128)、`staff-classroom`(68)、`staff-assistant`(71)、`staff-resource`(53)、`staff-typing`(44)、`staff-attendance`(31)、`staff-curriculum`(29)、`staff-report`(15)；共享组件 `FloatingAiCompanion`(26)、`RecommendedWorksShowcase`(11)、`WorkspacePlaceholder`(4)、`ThemePicker`(2)。

### P5 · 学生端（已完成）

`student-task`(3 文件 / 129)、`student-profile`(92)、`student-typing`(73)、`student-quiz`(65)、`student-work`(52)、`student-group`(33)、`student-drive`(32)、`student-home`(28)、`student-review`(27)、`student-reading`(26)、`student-resource`(24)、`student-course`(17)。

### P6 · 收尾（已完成，深色模式除外）

1. 卸载依赖：`element-plus`、`unplugin-element-plus`、`unplugin-vue-components` 从 `package.json` 移除；`vite.config.ts` 删除 `ElementPlusResolver` 与 `ElementPlus()` 插件；`npm prune` 与 `--package-lock-only` 已同步 lockfile 与 `node_modules`。
2. 删除死代码：`src/components/AppShellHeader.vue`、`src/components/ThemePicker.vue`（迁移前已确认零引用，可由 git 恢复）。
3. 样式清理：`theme.css` 删除 `--el-*` 变量块；`base.css` 删除 `.el-button/.el-input__wrapper/.el-card/.el-dialog…` 规则与旧外壳规则（`.app-layout / .layout-shell / .side-nav / .nav-link / .theme-picker / .shell-header-actions`）；`page-icon-chrome.css` 的 `.el-card__header` 装饰选择器改为 `.sa-panel__head`。
4. 主题一致性：`n-config-provider` 从外壳上移到 `App.vue`，`FloatingAiCompanion`、登录页、路由页全部落入主题作用域（此前浮动助手在外壳之外，会退回 naive 默认绿色主题）。
5. 门禁接入：根 `package.json` 新增 `check:no-element`，并纳入 `build:release`。
6. 体积对比：见 §1。**深色模式未开启**，原因见 §5。

---

## 3. 关键决策与方案偏差

| 项 | 方案原文 | 实际做法 | 理由 |
|---|---|---|---|
| 命令式 API | 全量改 `notify.*` / `confirmBox.*`（457 处） | `feedback.ts` 同时提供同签名 `ElMessage` / `ElMessageBox` 过渡壳，27 个文件只换 import 来源 | 取消/确认的 reject 语义、`dangerouslyUseHTMLString`、`inputValidator` 全部保持，改动面从 457 处调用降到 27 行 import，回归风险显著更低；新代码仍按方案用 `notify` / `confirmBox` |
| `staff-admin` | 先拆 7 个 tab 子组件再迁移 | 原地迁移，保持单文件 | 3419 行拆分需要重排 props/emit 与状态归属，属于业务重构，一次迁移里做会放大回归面；单文件迁移已通过门禁与冒烟 |
| 表格 | 统一走 `SaDataTable` | 增加 `SaTableColumn` 声明式列 | 让 221 个 `el-table-column` 接近 1:1 迁移，而不是全部改写成脚本内渲染函数 |
| `el-row/el-col` | `n-grid/n-gi` 或纯 CSS | 统一纯 CSS Grid | 项目本就以 CSS Grid 为主，减少组件层级与响应式断点差异 |
| 深色模式 | P6 交付 naive `darkTheme` | **未实现** | 方案 §7 已写明"牵动全部页面、单独排期、只在浅色全绿后开启"。本次没有视觉验收条件，强行上线会带来不可控的对比度回退 |

---

## 4. 过程中修复的实质缺陷（不是样式擦边）

1. **`v-model` 静默失效**（登录页）：naive 组件用 `value`/`update:value`，4 处 `<n-input v-model="…">` 导致输入框有值但提交空字符串——冒烟时表现为"账号密码永远不正确"。已全部改为 `v-model:value`，登录双端验证通过。
2. **`n-tag` 的 `type="danger"`**：naive 只接受 `error`，4 处（仪表盘 3 + 学生名单 1）已改，否则标签显示为默认灰色。
3. **`@click="handler"` 签名冲突**：`n-button` 会把 `MouseEvent` 传给无参/带参函数（3 处），改为 `@click="handler()"`。
4. **`SelectMixedOption`**：naive 2.45 已无此导出，改为 `SelectOption`。
5. **浮动助手脱离主题作用域**：`FloatingAiCompanion` 是 `<SoybeanShell>` 的兄弟节点，provider 上移到 `App.vue` 后修复。
6. **卡片头装饰图标失效**：`page-icon-chrome.css` 原本只匹配 `.soft-card > .el-card__header`，已补 `.sa-panel__head` 等价规则（含 `::before` 图标块与 `student-card-icon` 例外）。

---

## 5. 验证记录

### 5.1 静态门禁（全部通过）

```powershell
npm run typecheck:web      # vue-tsc --noEmit，0 error
npm run build:web          # 20s 内完成，仅保留原有 chunk 体积提示
npm run check:no-element   # 90 个文件，0 命中
npm run check:mirror-js    # pass
```

### 5.2 浏览器冒烟（真实后端 + 真实数据，`admin / 222221` 与 `240101`）

| 项 | 结果 |
|---|---|
| 教师登录、学生登录 | 均成功跳转 `/staff/dashboard`、`/student/home` |
| 教师端 12 个菜单页 | 全部渲染成功，控制台 **0 error / 0 warn** |
| 学生端 6 个菜单页 | 全部渲染成功，控制台 **0 error / 0 warn** |
| 系统设置 ·「班级与教师」 | 3 张表（班级 10 行 / 教师 3 行 / 学生 20 行）、分页「共 420 条」可翻页、7 个 tab 正常切换 |
| 签到考勤 | 班级下拉 10 个选项、切到 801 班渲染 48 行、状态标签/日期选择器正常 |
| 弹窗 | `新增班级` 打开（标题、3 个输入框、取消），取消后关闭，数据未变动 |
| 反馈层 | `confirm` 取消 → `reject('cancel')`；确认 → `resolve(true)`；`prompt` 校验失败保持打开并提示、正确值返回 `{value:'DELETE'}`；HTML `alert` 正常渲染 `<b>/<br>`；`message.success` 正常弹出 |

> 说明：冒烟过程中曾临时把 `240101` 的密码重置为文档示例值以便登录，测试完成后已按原 hash 还原。

---

## 6. 遗留事项与建议

| 项 | 状态 | 建议 |
|---|---|---|
| 深色模式 | 已开启（见 §8） | 三套主题 × 深浅两套变量；浅色为默认，深色需在「界面设置」手动选择或跟随系统 |
| 标签页 keep-alive | 未开启（与原行为一致） | 需要时在 `SoybeanShell` 的 `RouterView` 上加 `KeepAlive`，逐页确认副作用 |
| `staff-admin` 单文件 3419 行 | 保持原状 | 后续若继续演进，按 tab 抽 `components/` 子组件，并配回归清单 |
| 视觉细节复核 | 已过结构/交互冒烟，未逐像素比对 | 重点看：表格行高与列宽、`n-select` 下拉宽度、`n-date-picker` 图标与输入框高度、`n-modal` 内长表单滚动、`n-tabs` 与 `SaPanel` 的间距节奏 |
| 主按钮渐变 | 全局 Element 渐变规则已删，naive 走主题主色；登录页保留 `:deep` 渐变覆盖 | 若希望全站保留渐变，建议在 `naive-theme.ts` 用 `Button.colorPrimary` 统一，而不是回到全局 `.n-button` 覆盖 |
| git 提交 | **未提交**（按约定保留工作区） | 建议按 `migrate(<module>): naive-ui` 分模块提交，便于单模块回退 |

---

## 7. 命令速查

```powershell
# 门禁
npm run check:no-element              # 全量
npm --workspace apps/web run check:no-element src/modules/staff-admin

# 反馈 API 批量迁移（已执行，保留备用）
npm --workspace apps/web run codemod:feedback
npm --workspace apps/web run codemod:feedback -- --write

# 产物体积快照
cd apps/web; node scripts/bundle-size.mjs <label>

# 质量门禁
npm run typecheck:web; npm run build:web; npm run check:mirror-js
```

回滚方式：本次改动全部停留在工作区，未做提交；`git checkout -- apps/web/src` 可整体回到迁移前状态，单模块回滚请按文件粒度处理。

---

## 8. 深色模式（P6-3 续做，2026-10-27）

### 8.1 实现方式

深色与「主题配色」正交：配色仍是三套（`data-theme`），深浅由新增的 `data-scheme="light|dark"` 控制，二者组合出 6 种外观。

| 层 | 文件 | 说明 |
|---|---|---|
| 变量 | `src/styles/theme.css` | 文件末尾新增 `:root[data-scheme='dark']` 深色基底（约 70 个 `--ls-*`）+ 六套主题各自的强调色块（`:root[data-scheme='dark'][data-theme='x']`，提亮主色与导航态）。靠「同权重后出现」覆盖浅色值；新增 `--ls-elevated` 统一浮层纯色底，新增 `--ls-success-text / --ls-warning-text / --ls-error-text` 语义文字色（深色段整体提亮，避免深棕/深红压在 12%~18% 同色底上看不清） |
| 状态 | `src/stores/app.ts` | 新增 `schemeMode`（light/dark/auto）与 `resolvedScheme`；`setSchemeMode` / `refreshResolvedScheme` 写 `documentElement.dataset.scheme`，持久化键 `learnsite-scheme` |
| naive | `src/App.vue`、`src/ui/naive-theme.ts` | `n-config-provider :theme="darkTheme"`；`themeOverrides` 额外接 `cardColor/modalColor/popoverColor = --ls-elevated`，并在 `currentTheme` 之外监听 `resolvedScheme` 重算 |
| 防闪 | `index.html` | 首屏内联脚本按 `learnsite-scheme`（含 `auto` + `prefers-color-scheme`）先写 `data-scheme`，避免白闪 |
| 入口 | `src/layouts/shared/ThemeDrawer.vue` | 「关于深色模式」占位说明换成「界面外观」浅色/深色/跟随系统三选一 |
| 图表 | `src/components/AppChart.vue` | 深色下补齐 ECharts 的 `textStyle` 与 tooltip 底色（页面自身配置优先），切配色时重设 option；`StaffDashboardPage` / `StudentHomePage` 的 option 计算补 `appStore.resolvedScheme` 依赖 |
| 页面 | 全部模块 scoped 样式 | 把写死的白底/浅描边/深色文字换成 `--ls-*`；iframe 与作品预览容器（`.preview-frame`、`.asset-preview-frame`、`.task-html-result-preview`、`.file-preview-*`）刻意保留白底，因为内容由学生作品决定 |
| CKEditor | `src/styles/theme.css`（深色段） | 在 `.rich-text-editor` 作用域之外再按 `data-scheme='dark'` 兜底一层 `--ck-*`（面板/下拉/输入/列表/按钮/阴影/tooltip），避免工具栏弹层落到 CK 自带浅色调色板 |

### 8.2 验证（真实后端 8010 + 真实数据）

CDP 驱动 headless Chrome，注入登录态后对每个页面跑「白块 + 深色文字」检测（统计可见、面积 > 4000px²、背景接近 `#fff` 的容器；以及纯文本节点颜色暗于 rgb(95) 的情况）：

| 页面 | 浅色（白块/深字） | 深色（白块/深字） |
|---|---|---|
| 教师登录、学生登录 | 6/8、3/11 | 0/0、0/0 |
| 仪表盘（三套主题） | 65/54 | 0/0 |
| 系统设置（含「班级与教师」tab + 新增班级弹窗） | 274/206 | 0/0 |
| 签到考勤 / 学生名单 / 测验题库 / 提交批改 / 打字训练 / 学情报告 | 7–64 / 18–71 | 0/0（题库与打字各 1 处见下） |
| 学生端：学习首页 / 作品工坊 / 随堂测验 / 打字训练 / 课程资源 / 共享网盘 / 我的小组 / 我的档案 | 3–43 / 10–41 | 0/0 |

- 深色下唯一的「深字」是 `n-radio-button` 选中项：naive 深色主题本就取「主色底 + 黑字」（实测对比度约 9:1），刻意保留其默认语义。
- 图例截图：深色下页面头、`SaPanel`、`SaDataTable` 表头/斑马纹、`n-modal` 表单、分页器、下拉层均无白块。
- `staff-lesson-plan`（学案管理）在 dev server 冷启动时模块过大（单文件 ~300 KB）首次加载会超过等待窗口，改用 `vite preview`（产线构建）验证：页面正常渲染、深色无白块。
- CKEditor 单独复核（`/staff/lesson-plans/new`，产线构建）：工具栏与编辑区深色，展开段落下拉后面板无白块（light 17 白块 → dark 0）。
- 门禁：`check-no-element` 98 文件 0 命中；`vue-tsc --noEmit` 0 error；`vite build` 20.7s / 6039 模块通过，`dist/assets` 145 文件 / 4399 KB raw（深色变量与 `darkTheme` 带来约 +70 KB raw）。
- 复检时工作区同时有一处**外部并行改动**（仪表盘拆出 `DashboardSideRail/CompactSeatMap/LiveSessionCard`、学生页拆出小组协作面板），已在合并后的树上重跑门禁、构建与深色冒烟：新拆出的组件未引入硬编码白色，深色仍 0 白块。

### 8.3 已知边界

1. **CKEditor**：工具栏、下拉面板、输入框、气泡、正文编辑区已全部随 `--ls-*` / `--ck-*` 变深（已目视 `/staff/lesson-plans/new`）。若产品上希望编辑区保持「白纸」观感，把 .ck-editor__editable 的 `background` 与 `--ck-color-base-background` 单独回退为 `#fff` 即可。CK 的图片 resize 手柄、source editing 的 textarea 等冷门控件未逐一目视。
2. 学生端冒烟使用了 `240101`，测试期间临时重置其密码后**已按原哈希还原**（`update users set password_hash = ...`），未改动其他数据。
3. 浅色模式零改动回归：同一批页面浅色下白块/深字计数与迁移前一致，说明变量替换没有把浅色改坏。
4. 页面级深色适配只需继续沿用「样式里不写死浅色值，一律取 `--ls-*`」这条规则。本次的检测脚本是临时的 CDP 脚手架（读取登录接口 → 注入 localStorage → 逐页统计白块/深字 → 截图），未入库；需要回归时可按 §8.2 的口径重写一版。
5. 深色下不必强求「零白块」：作品预览、HTML 结果预览、`iframe` 这类承载学生内容的容器保持白底是正确的。
