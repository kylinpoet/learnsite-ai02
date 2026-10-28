# 视觉验收基线（2026-10-27）：教师后台聚焦改造 + 3 套新配色

## 本轮改了什么

1. **密度与栅格词法层**：新增 `apps/web/src/styles/layout.css`，把「卡片多宽、留多少白」收回到一处（`--ls-gap-*` / `--ls-radius-*` / `--ls-card-h-sm` / `.ls-page` 12 列 / `.ls-main` 8 列 / `.ls-rail` 4 列 / `.ls-row`）。密度覆盖只在 `.staff-layout` 内生效，学生端与登录页不受影响。
2. **壳层收紧**：侧栏 236→200px（折叠 72→64）、顶栏 56→52px、标签栏 7→5px、内容区 `padding 16/20/32 → 12/16/24` 并加 `max-width: 1680px` 居中。
3. **仪表盘重做为课堂首页**：以「此刻正在上的那节课」为锚点——当前课堂卡（班级/学案/签到环/未签到可点名/提交三档进度/进入课堂控制/结束课堂）+ 紧凑座位图（主区），今天要处理的 / 快捷入口 / 最近课堂（右栏）。删除 2 张 ECharts 大图、页尾重复指标组、开课表单、小组协作、小组任务进度、分组维护抽屉。
4. **小组内容迁移**：小组协作 + 分组维护抽屉、小组任务进度 → 「学生名单」页的三个标签（本班学生 / 分组与协作 / 小组任务进度）。
5. **实时状态**：新增 `GET /staff/classroom/live?class_id=`（只查一个班 + 今天 + 最近一节课的学案），前端 `useVisibilityPolling` 在页面可见时 10s 一轮、切后台暂停、失败 20/40/60s 退避。
6. **6 套配色**：新增 `sage-lecture` 墨绿讲义、`indigo-slate` 靛青石板、`wisteria` 紫藤自习，各含浅色块与深色覆盖块；`SYSTEM_THEME_PRESETS` 同步扩到 6 项。
7. **其余教师页**：统一紧凑页头 + `.ls-row` 指标条；课堂控制改为主区 8 列 / 开课设置 4 列；任务评分页把推荐作品展示从主区顶部下移到底部。

## 截图产物

仪表盘 6 套配色（1600×1000 视口，`t1 / 222221`，701班进行中会话 10 人签到 7 人）：

- `dashboard-mango-splash.png`、`dashboard-berry-pop.png`、`dashboard-neon-pulse.png`
- `dashboard-sage-lecture.png`、`dashboard-indigo-slate.png`、`dashboard-wisteria.png`

关键页（默认芒果冲浪）：

- `dashboard.png`（与首张同源）、`students.png`、`classroom.png`、`submissions.png`、`lesson-plans.png`

## 实测指标（Chrome headless + CDP，1600×1000）

| 项 | 改造前 | 改造后 |
|---|---|---|
| 仪表盘页面总高 | 约 3000–4000px（hero + 4 指标 + 2×280px 图 + 开课 + 座位图 + 小组协作 + 小组任务进度 + 重复指标 + 最近课堂/学案） | **1000px（一屏无滚动）** |
| 主区 / 右栏宽度 | 单列铺满（无 max-width） | **908px / 448px（8:4）** |
| 学生名单页 | 单列表格 | 2103px（表格 10 行所致），三标签 |
| 课堂控制页 | 单列 + 私有两栏 | 1097px，主区 8 列 + 开课设置 4 列 |

6 套主题的 `--ls-primary` 实测值（用于确认新增主题真正生效）：

| 主题 | primary |
|---|---|
| mango-splash | `#f28a4c` |
| berry-pop | `#ef6f9f` |
| neon-pulse | `#4f8df2` |
| sage-lecture | `#2e7d6b` |
| indigo-slate | `#3d4e8c` |
| wisteria | `#6c5ce7` |

## 验收清单

### 仪表盘

- [x] 首屏第一块是「此刻正在上的课」，含班级、学案、开课时间。
- [x] 签到以环形进度呈现（实测 7/10），未签到学生以 chip 列出并在 hover 显示学号与座位。
- [x] 提交进度按 完成/部分/未交 三段显示，数值与图例一致。
- [x] 无进行中会话时退化为「上次这节课」并给出预选好班级/学案的一键开课。
- [x] 座位图紧凑可读（座位号 + 姓名 + 右下角色点），已签到格子有主色描边。
- [x] 右栏三块（今天要处理 / 快捷入口 / 最近课堂）均可点击跳转。
- [x] 整页在 1600×1000 下无滚动。

### 学生名单

- [x] 顶部保留班级选择器与 4 个指标。
- [x] 三个标签：本班学生 / 分组与协作 / 小组任务进度，切换不丢班级上下文。
- [x] 「分组与协作」内含分组维护抽屉（一键重组 / 小组配置拖拽 / 成员分配 / 追溯记录 + 导出 CSV）。

### 主题与深色

- [x] 6 套配色在界面设置里可选，色卡与生效值一致。
- [x] 深色模式与配色正交（`data-scheme` × `data-theme`），每套新主题都有深色覆盖块。
- [x] 系统主题只作为首次访问默认值，不再覆盖本机已选配色（`stores/app.ts:applySystemTheme`）。

## 自动化校验结果

- `npm run typecheck:web`：通过
- `npm run check:no-element`：通过（98 个文件无 Element Plus 残留）
- `npm run build:web`：通过（19.18s）
- `python -m pytest apps/api/tests -q`：**96 passed**

## 备注

- 截图由临时 CDP 脚本生成（Chrome `--headless=new --no-proxy-server`，视口 1600×1000）。本机 5173 端口被另一个 React 项目占用（且它绑在 127.0.0.1），本项目 dev server 需显式换端口启动（本轮用 `5181`）。
- 数据来自一次性演示库（`%TEMP%/ls-ui.db` + `seed_demo_data`），并预先开启 701班的一节课堂会话、登录 7 名学生以产生签到。
- 本轮未做 `group-task-progress`（需要学案有小组共同提交任务）与深色模式逐页截图，留待下一轮补充。
- 同目录 `theme-candidates/` 下的三张图是**本轮之前**的配色候选探索稿（蜜绿橄榄 / 靛蓝樱檀 / 墨松深绿），不是本轮实现产物；本轮实际落地的是 `sage-lecture` / `indigo-slate` / `wisteria` 三套，色值见上表。
