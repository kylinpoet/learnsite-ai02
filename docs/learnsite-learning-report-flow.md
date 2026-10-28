# AI 学情报告（教师端）功能说明

## 功能概述

教师在自己的班级范围内选择一个班级，由 AI 基于该班学生的真实学习数据（任务提交、教师评分、同伴互评、课堂签到、学案进度）生成一份结构化 Markdown 学情分析报告，报告持久化入库，可随时在历史列表中切换查看。

- 面向对象：教师（含管理员，管理员可见全部班级）
- 数据源：本班学生的任务提交（submissions）、教师评分（score，等级制 G/A/B/C/D/E/F 映射 120/100/80/60/40/20/0）、同伴互评（peer_review_votes 与 submissions.peer_review_score）、课堂签到（attendance_records）、学案完成进度（student_lesson_plan_progress）
- AI 调用：复用现有 Provider 体系（`ai_providers` 表 + `app/services/ai_provider_client.py` 的 `chat_completion`，openai SDK 封装），沿用系统设置里的 `remote_proxy_url` 与助手运行参数（temperature）

## API

均挂在教师路由下（`/api/v1/staff/...`），依赖 `require_staff`，且通过 `staff_access.get_accessible_class_ids` / `staff_can_access_class` 校验班级权限：教师只能操作自己被分配的班级，管理员可见全部（沿用 `TeacherClassAssignment` + 归档班级扣除逻辑）。响应统一走 `ApiResponse` 包装（`code` / `message` / `data`）。

### 1. 生成报告

```
POST /api/v1/staff/learning-reports/generate
Authorization: Bearer <staff token>

{
  "class_id": 1,
  "lesson_plan_id": 24   // 可选；传入则统计范围限定为该学案的任务/互评/签到
}
```

行为：

1. 校验班级权限（403）与班级存在（404）；若带 `lesson_plan_id` 同时校验学案存在（404）。
2. 取默认启用的 AI Provider；若无可用 Provider 或仍是内置 demo 配置（example.com / demo-key），返回 409，提示先在系统设置接入真实模型。
3. SQL 聚合班级学情统计（见下），组装 system + user prompt，要求输出含「总体概况 / 班级优势 / 薄弱点与风险 / 教学建议」四节的 Markdown 报告。
4. 同步调用 AI（超时 60s）。成功：写入 `learning_reports`（status=completed）并返回报告全文；失败：写入一条 status=failed 的留痕记录并返回 502，`detail` 形如 `AI 生成学情报告失败：<原因>`。

成功响应 `data.report` 字段：`id`、`class_id`、`class_name`、`lesson_plan_id`、`lesson_plan_title`、`teacher_id`、`teacher_name`、`title`、`status`（completed/failed）、`error_message`、`created_at`、`content_md`（Markdown 全文）。

### 2. 历史列表

```
GET /api/v1/staff/learning-reports?class_id=<id>&page=1&page_size=10
```

按 `created_at` 倒序分页返回当前教师可访问班级的报告摘要（不含 `content_md`）。`class_id` 必须在权限范围内，否则 403；不传则返回可访问全部班级的报告。

### 3. 报告详情

```
GET /api/v1/staff/learning-reports/{id}
```

返回单条报告全文（含 `content_md`）；报告所属班级不在权限范围内时 403，不存在时 404。

## 数据表

`learning_reports`（新增，随 `Base.metadata.create_all` 自动建表；模型定义在 `apps/api/app/models/entities.py` 的 `LearningReport`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK 自增 | |
| class_id | FK school_classes.id，索引 | 报告针对的班级 |
| teacher_id | FK users.id，索引 | 生成报告的教师 |
| lesson_plan_id | FK lesson_plans.id，可空，索引 | 传入则报告限定该学案范围 |
| title | VARCHAR(160) | 展示标题（含班级名与范围后缀） |
| content_md | TEXT | Markdown 报告正文 |
| status | VARCHAR(20)，索引 | completed / failed |
| error_message | TEXT，可空 | AI 失败原因留痕 |
| created_at / updated_at | DATETIME | TimestampMixin |

无需手写迁移：新库由 `init_db()` / `demo_seed()` 的 `create_all` 建表；存量库在下次启动时同样由 `create_all` 补建（`ensure_runtime_schema` 的 ALTER TABLE 仅用于给已存在的表加列，不适用于整表新增）。

## 学情统计口径（prompt 输入）

服务层 `apps/api/app/services/learning_reports.py` 的 `build_class_learning_overview`：

- 提交：总提交数、已评分/待评分数、教师推荐数、提交时间范围
- 评分：平均分与等级分布（G/A/B/C/D/E/F；非标准分值原样显示为「N分」）
- 互评：投票数、参与学生数与参与率、被评作品平均互评分
- 签到：全量模式下统计该班全部签到记录（覆盖人数/日期数/覆盖率）；指定学案模式下按学案 `assigned_date` 过滤当天签到
- 学案进度：全量模式下统计每名学生的完成学案数（指定学案模式下该维度无意义，跳过）
- 学生明细：每生一行的提交/评分/平均分/互评/签到/完成学案数（prompt 中最多 60 行）

AI 输出要求：只依据数据说话、四节结构（总体概况 / 班级优势 / 薄弱点与风险 / 教学建议含分层建议）、约 600 字、直接输出 Markdown 正文。

## 前端

- 页面：`apps/web/src/modules/staff-report/StaffLearningReportPage.vue`
  - 选班级（复用 `GET /staff/attendance/bootstrap` 的班级列表）→ 点「生成学情报告」（loading 态提示「AI 分析中」）→ Markdown 渲染（复用 `components/MarkdownContent.vue`，marked + DOMPurify）→ 左侧历史报告列表切换查看
  - 生成是同步请求，前端以 loading 态兜底；失败时展示后端 `detail` 错误信息
- 路由：`/staff/learning-reports`，懒加载注册在 `apps/web/src/router/index.ts`，挂在 StaffLayout 下（复用 `/staff/*` 的登录教师守卫）
- 侧边导航：`apps/web/src/layouts/staff/StaffLayout.vue`「反馈」分组新增「学情报告」入口（Sparkles 图标），同步补了 header 的当前页标识

## 设计假设（本功能无既有规格，以下为首版约定）

1. 生成接口是同步调用（首版不做异步任务队列），AI 超时 60s，前端用 loading 态等待；失败重试由教师手动再次点击完成。
2. 报告不做删除/编辑（首版只读保留全部历史）。
3. 指定学案范围时，签到统计按学案布置日期过滤；全量模式统计全部历史。
4. 无可用真实 Provider 时明确拒绝生成（409），不降级为假报告；AI 失败写 failed 留痕记录便于排查，但历史列表默认可见。
5. `apps/web/openapi.json` / `src/api/schema.d.ts` 为手动导出的快照，本功能页面使用本地 TS 类型，不依赖该快照；如需同步 OpenAPI 类型，可由 FastAPI `/openapi.json` 重新导出后运行 `npm --workspace apps/web run generate:api-types`。

## 测试

`apps/api/tests/test_smoke.py` 末尾新增两个用例（mock `staff` 端点模块上的 `call_provider_for_learning_report`，遵循现有 `monkeypatch.setattr(端点模块, ...)` 惯例；为绕过 demo Provider 的 409 拦截，用例内把默认 Provider 的 base_url/api_key 改写为真实形态）：

1. `test_staff_can_generate_and_list_learning_reports`：t1 为 701 班生成报告（200、入库、Markdown 以「## 一、总体概况」开头）、列表、详情；t2（未授权教师）对同一班级的生成/列表/详情均 403。
2. `test_staff_learning_report_generate_returns_error_when_ai_fails`：AI 返回错误时接口 502、`detail` 含「AI 生成学情报告失败」，且落库一条 status=failed、error_message 留痕的记录。

复跑方式：仓库根执行 `apps\api\.venv\Scripts\python.exe -m pytest apps/api/tests -q`（全量约 2 分钟）。
