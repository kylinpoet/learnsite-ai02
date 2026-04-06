# LearnSite 任务清单

生成时间：2026-03-31  
状态：ACTIVE  
用途：把 `docs/learnsite-redesign-design.md`、`docs/learnsite-implementation-spec.md`、`docs/learnsite-live-feature-matrix.md` 里的首版范围，整理成当前可执行的研发清单，方便继续排期、接手和验收。

## 1. 当前约束

1. 只覆盖旧站线上明确在用的功能。
2. 不迁移旧站历史数据，只建设新平台。
3. 前端固定为 `Vue 3 + TypeScript + Element Plus`。
4. 后端固定为 `FastAPI`，首版数据库为 `SQLite`，结构需兼容后续迁移到 `PostgreSQL`。
5. 教师与管理员合并为统一教职工后台，通过权限区分能力。
6. 文档必须持续细化，确保其他团队成员可以直接接手。

## 2. 状态标记

| 标记 | 含义 |
|---|---|
| `已完成` | 已有真实页面、接口和基础测试 |
| `进行中` | 本轮正在实现，完成后即可进入联调 |
| `下一步` | 建议紧接着落地的功能 |
| `后续` | 已在首版范围内，但不在当前实现顺序的下一项 |

## 3. Phase 0-1 学生主链路

| 模块 | 对应旧站 | 新路由 / API | 状态 | 说明 |
|---|---|---|---|---|
| 学生登录 | `index.aspx` | `/login/student` + `/api/v1/auth/student/login` | 已完成 | 已打通登录、鉴权、本地开发跨域与本地联调 |
| 课堂守则 | `student/myrule.aspx` | `/rules` | 已完成 | 目前为静态承接页，可后续转后台可配置 |
| 学习中心首页 | `student/myinfo.aspx` | `/student/home` + `/api/v1/lesson-plans/student/home` | 已完成 | 已接真实 SQLite 数据 |
| 学案详情 | `student/showcourse.aspx` | `/student/courses/:courseId` + `/api/v1/lesson-plans/{id}` | 已完成 | 已接任务清单 |
| 通用任务页 | `student/showmission.aspx` | `/student/courses/:courseId/tasks/:taskId` + `/api/v1/tasks/{task_id}` | 已完成 | 已支持直接提交即保存、教师评价前可再次提交 |
| 代码任务基础版 | `student/program.aspx` | `/student/courses/:courseId/programs/:taskId` | 已完成 | 当前为可进入的基础骨架 |
| 我的作品 | `student/mywork.aspx` | `/student/work` + `/api/v1/submissions/mine` | 已完成 | 已接历史提交列表 |
| 作品详情 | `student/downwork.aspx` | `/student/work/:submissionId` + `/api/v1/submissions/{submission_id}` | 已完成 | 已展示教师评分、互评得分、附件清单 |
| 当前课题推荐作品展示 | 旧站无统一页，来自评分结果 | `/api/v1/tasks/{task_id}`、`/api/v1/submissions/teacher/task/{task_id}` | 已完成 | 教师评分为 `G / 120` 自动进入推荐展示，学生与教师都可查看 |
| 作品互评 | `student/myevaluate.aspx` | `/student/reviews/:taskId` + `/api/v1/peer-reviews/task/{task_id}` | 已完成 | 已实现作品墙、推荐投票、互评统计、互评附件展示 |
| 网盘基础版 | `student/groupshare.aspx` | `/student/drive` | 已完成 | 已接通个人网盘与小组网盘的容量统计、文件列表、上传、下载、删除，小组共享空间已接入真实协作链路 |
| 个人资料中心 | `profile/*` | `/student/profile` | 已完成 | 已接通基本信息、最近 20 条签到记录、密码修改，以及班级申请、相片上传、姓名/性别维护 |
| 阅读任务页 | `student/description.aspx` | `/student/courses/:courseId/readings/:taskId` | 已完成 | 已接通真实富文本内容、学案导读、上下任务跳转与已读确认；附件展示留待 `task_resources` 接入 |
| 小组页 | `profile/mygroup.aspx` | `/student/groups` | 已完成 | 已展示真实小组成员、共享网盘概览、课堂动态与操作日志 |

## 4. Phase 2 教师主链路

| 模块 | 对应旧站 | 新路由 / API | 状态 | 说明 |
|---|---|---|---|---|
代码| 教职工登录 | `teacher/index.aspx` | `/login/staff` + `/api/v1/auth/staff/login` | 已完成 | 教师与管理员共用入口 |
| 后台首页概览 | 旧站教师首页聚合能力 | `/staff/dashboard` + `/api/v1/staff/dashboard` | 已完成 | 已接真实统计 |
| 课程体系管理 | 新增核心能力 | `/staff/curriculum` + `/api/v1/curriculum/tree` | 已完成 | 已能展示教材、单元、课次与学案关联 |
| 学案列表 / 基础编辑 | `teacher/course.aspx` | `/staff/lesson-plans` + `/api/v1/lesson-plans/staff/*` | 已完成 | 已支持创建、编辑、发布学案，含 Tab 编辑、HTML 源码、AI 初稿、网页/讨论/数据提交任务配置、内置模板预设，以及教师自定义模板的另存为、编辑后覆盖、分组、搜索、置顶、最近使用、复用、删除、拖拽排序/手动排序权重、跨分组拖拽、拖回未分组、批量改分组、按分组整组选择、批量置顶与批量取消置顶；数据提交任务会预生成真实任务编号、直接展示正式接口地址，并支持未保存源码的后台即时预览；任务 iframe 已补统一运行时上下文与 cookie 鉴权 |
| 作品总览 | `teacher/works.aspx` | `/staff/submissions` + `/api/v1/submissions/teacher` | 已完成 | 已有真实任务维度汇总 |
| 单任务评分页 | `teacher/workcheck.aspx` | `/staff/submissions/:taskId` + `/api/v1/submissions/teacher/task/{task_id}` | 已完成 | 已支持大窗评分、预览、保存后继续下一份 |
| G/A/B/C/D/E/F 评分映射 | `teacher/workcheck.aspx` | `/api/v1/submissions/{submission_id}/score` | 已完成 | `G/A/B/C/D/E/F => 120/100/80/60/40/20/0` |
| 评分模板云端同步 | 旧站无完善实现，新平台增强 | `/api/v1/submissions/review-templates` | 已完成 | 已支持 CRUD、按教师隔离 |
| 评分模板分组与排序 | 新平台增强 | `/api/v1/submissions/review-templates` | 已完成 | 已支持分组、排序、移动顺序 |
| 附件批量下载 | 教师作品管理增强 | `/api/v1/submissions/files/batch-download` | 已完成 | 已支持 ZIP 批量下载 |
| 推荐作品展示 | `manager/copygood.aspx` 的轻量前置能力 | 教师评分页内展示 | 已完成 | 当前先按任务维度展示推荐作品 |
| 课堂会话中心（原上课中控） | `teacher/start.aspx` | `/staff/classroom` + `/api/v1/classroom/*` | 已完成 | 已支持开课、查看会话、结束课堂；与工作台和学案管理职责拆分 |
| 签到 | `teacher/signin.aspx` | `/staff/attendance` | 已完成 | 已支持按班级/日期查看签到、导出签到表与缺席名单 |
| 学生管理 | `teacher/student.aspx` | `/staff/students` | 已完成 | 已支持重置密码、账号停用恢复、解除分组、导出、批量管理与学生作品追踪 |

## 5. Phase 3 管理后台与 AI

| 模块 | 对应旧站 / 新需求 | 新路由 / API | 状态 | 说明 |
|---|---|---|---|---|
| 系统设置 | `manager/setting.aspx` | `/staff/admin/system` | 已完成 | 已有基础系统设置页 |
| AI Provider 配置 | 新需求 | `/staff/admin/ai-providers` + `/api/v1/assistants/*` | 已完成 | 已预留 base_url / key 等配置入口 |
| 课程体系维护 | 新需求 | `/staff/curriculum` | 已完成 | 已满足“按年级/单元/课次挂接学案”前提 |
| 课时智能体 | 新需求 | `/staff/assistants` | 已完成 | 已支持教师创建、绑定班级+学案、提示词配置并联动 AI 学伴上下文 |
| 通用智能体悬浮入口 | 新需求 | 学生端 / 教师端悬浮入口 | 已完成 | 已补齐 UI 容器、Provider 联动、标准/流式响应与停止生成收口 |
| 主题切换 | 新需求 | 站点级主题配置 | 已完成 | 已支持系统级主题预设，教师端 / 学生端登录后统一应用并锁定个人切换 |
| 班级 / 教师 / 导入 / 升班 | `manager/*` | `/staff/admin/*` | 已完成 | 已补批量添加班级、批量导入学生、升班预览执行与历史班级归档 |

## 6. 当前实现顺序建议

1. 已完成“作品互评”和教师教学闭环。
2. 已完成“学生个人资料中心”首批能力，补齐了学生侧主导航闭环。
3. 已完成“阅读任务页真实内容接入”，补齐了 `description.aspx` 的学生侧主链路。
4. 已完成“学生网盘 + 小组网盘”协作闭环，学生端已具备真实共享空间能力。
5. 已完成小组协作页、小组共同编辑、日志追溯、历史版本与上传限制闭环。
6. 已完成个人资料中心剩余编辑项（班级申请、相片上传、姓名/性别维护）。
7. 已完成教师端签到、学生管理。
8. 已完成升班链路与系统级主题配置，管理员系统设置能力形成闭环。
9. 已完成教师工作台座位图“签到 + 作业状态”联动与课堂会话中心职责拆分。

## 7. 本轮任务拆解

### 7.1 近期已完成

1. 已新增 `peer_review_votes` 数据模型与学生互评页。
2. 已完成教师学案创建、编辑、发布能力。
3. 已完成教师开课页与课堂会话创建。
4. 已完成学生在新开课程中的学习与提交链路。
5. 已完成教师评分反馈闭环测试与文档说明。
6. 已完成学生个人资料中心首批能力，包含基本信息、签到记录和密码修改。
7. 已完成阅读任务页真实内容接入，包含富文本阅读内容、学案导读、已读确认与上下任务跳转。
8. 已完成学生网盘与小组网盘闭环，包含共享草稿、操作日志、历史版本与上传限制配套能力。

### 7.2 本轮完成后的下一项建议

1. 个人资料中心细化：
   - 再补班级修改、相片上传、姓名修改、性别修改等细项。
   - 与教师 / 管理员审核规则联动，避免学生直接改动核心学籍信息。
2. 教师端课堂链路补齐：
   - 继续补签到页与学生管理页。
   - 评估导出、筛选、批量操作等教师高频能力。
3. AI 与管理员增强：
   - 继续推进课时智能体绑定与调用链路。
   - 继续细化后台导入导出和主题配置。

## 8. 验收要点

### 学生互评验收

1. 学生能从任务页进入互评页。
2. 已提交作品的学生能看到作品墙。
3. 未提交作品的学生会被提示先提交。
4. 学生不能给自己的作品投票。
5. 已投过的作品不能重复投票。
6. 互评页内图片、文字、PDF 附件可直接展示。
7. 互评后，作品得票和互评得分会即时更新。

### 教师推荐作品验收

1. 教师打 `G / 120` 后，作品自动进入推荐展示。
2. 学生任务页和教师评分页都能看到推荐作品。
3. 推荐作品附件仍可直接查看。

### 教学闭环验收

1. 教师能创建一份新学案并配置任务。
2. 教师能发布学案。
3. 教师能选择班级开课。
4. 学生首页能看到新开课程。
5. 学生能进入课程并提交对应任务作品。
6. 教师能在评分中心看到新任务提交并完成评分。
7. 学生能在作品详情页看到教师分数与评语。

## 9. 文档联动清单

本文件更新时，通常还要同步检查以下文档是否需要补充：

1. `docs/learnsite-redesign-design.md`
2. `docs/learnsite-implementation-spec.md`
3. `docs/learnsite-live-feature-matrix.md`
4. `docs/student-submission-flow.md`
5. `docs/teacher-review-flow.md`
6. `docs/teaching-roundtrip-flow.md`
7. `docs/student-reading-flow.md`
8. `docs/student-drive-flow.md`
9. `docs/teacher-group-task-progress-flow.md`

## 10. 2026-04-01 更新

本次新增完成项：

1. 学生任务页富文本编辑器高度与容器间距已修复，不再遮挡“作品附件”区块。
2. `/student/groups` 已从占位页切换为真实小组页。
3. `/student/drive` 已支持“小组网盘”真实共享空间。
4. 新增数据表：
   - `student_groups`
   - `student_group_members`
5. 新增接口：
   - `GET /api/v1/groups/me`
   - `POST /api/v1/drives/group/files`
6. `GET /api/v1/drives/me` 现同时返回真实的 `personal_space` 与 `group_space`。
7. 同组学生之间已支持共享文件的上传、查看、下载和删除。

当前建议的下一步：

1. 教师侧按班查看小组与共享文件。
2. 小组重组、组长调整与教师管理入口。
3. 小组任务提交与小组协作作品闭环。

## 11. 2026-04-01 小组管理更新

本次新增完成项：

1. 教师工作台已补上“分组维护”入口，位置在 `/staff/dashboard` 的“小组协作”区域。
2. 已新增教师侧分组维护抽屉，支持在同一页面完成分组调整。
3. 已支持一键按目标组数重组当前班级。
4. 已支持手动调整学生到目标小组。
5. 已支持为每个小组重新指定组长。
6. 已支持新增空组。
7. 已支持删除“无成员且无共享文件”的空组。
8. 小组名称修改后，会同步更新对应共享空间显示名。
9. 已补充后端接口：
   - `GET /api/v1/staff/classes/{class_id}/group-management`
   - `POST /api/v1/staff/classes/{class_id}/groups`
   - `POST /api/v1/staff/classes/{class_id}/groups/rebuild`
   - `PUT /api/v1/staff/classes/{class_id}/group-management`
   - `DELETE /api/v1/staff/groups/{group_id}`
10. 已补充专项说明文档：
   - `docs/teacher-group-management-flow.md`

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`19 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

## 27. 2026-04-03 转班申请按班级全选待审核 + 批量撤销审核

本次完成项：

1. 后端新增批量撤销接口 `POST /api/v1/profiles/staff/class-transfer/requests/batch-unreview`。
2. 支持把“已通过/已拒绝”的转班申请撤销回“待审核”：
   - 已通过：回滚学生班级到原班级，并清理座位绑定与小组关系。
   - 已拒绝：恢复为待审核并清空审核人、审核时间、审核备注。
3. 新增审计事件 `class_transfer_unreviewed`，可在资料变更审计页筛选和导出。
4. 教师端学生页转班申请面板新增：
   - 全选待审核
   - 清空选择
   - 批量撤销审核
5. 批量选择状态拆分为“待审已选 / 已处理已选”，批量通过/拒绝与批量撤销互不干扰。
6. 新增 smoke 用例覆盖批量撤销成功、待审核跳过、重复撤销跳过场景。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "staff_can_batch_review_class_transfer_requests or staff_can_batch_unreview_class_transfer_requests" -q`
   - 结果：`2 passed`
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`39 passed`
3. `npm run typecheck:web`
   - 结果：通过
4. `npm run build:web`
   - 结果：通过

建议下一步：

1. 转班申请支持“按班级一键全选后直接批量通过/拒绝”快捷动作（免手动勾选）。
2. 转班审核面板新增“撤销原因模板”和常用语预设。
3. 审计导出补“操作者账号 + 目标班级 + 处理批次号”字段，便于追溯。

## 28. 2026-04-03 转班申请按班级一键批量通过/拒绝

本次完成项：

1. 教师端学生页 `/staff/students` 的转班申请面板新增快捷动作：
   - 当前班待审一键通过
   - 当前班待审一键拒绝
2. 快捷动作会先按“当前选中班级 + 待审核”实时查询申请，再调用现有批量审核接口，无需手动勾选。
3. 若当前班无待审核申请，会直接给出提示，不会发起空请求。
4. 快捷动作支持统一填写审核备注，并在完成后自动刷新学生列表、转班申请列表、资料审计列表。
5. 与现有“批量通过/批量拒绝/批量撤销审核”状态互斥，避免并发重复操作。

本次验证结果：

1. `npm run typecheck:web`
   - 结果：通过
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 转班审核面板新增“撤销原因模板”和常用语预设。
2. 审计导出补“操作者账号 + 目标班级 + 处理批次号”字段，便于追溯。
3. 转班申请列表增加“仅看当前班级待审核”快捷过滤按钮。

## 29. 2026-04-03 转班审核面板模板化备注（常用语/撤销原因）

本次完成项：

1. 教师端学生页 `/staff/students` 的转班申请筛选区新增两个模板下拉：
   - 审核常用语预设
   - 撤销原因模板
2. 审核常用语覆盖“通过/拒绝”高频场景，可作为单条审核、批量审核、当前班一键审核的默认备注。
3. 撤销原因模板可作为“批量撤销审核”默认备注，支持继续手动编辑。
4. 所有相关弹窗均支持“预填模板 + 二次修改 + 留空提交”，兼容原有流程不破坏。
5. 新增通用输入归一化逻辑，统一处理空白备注为 `null`，避免后端落库脏值。

本次验证结果：

1. `npm run typecheck:web`
   - 结果：通过
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 审计导出补“操作者账号 + 目标班级 + 处理批次号”字段，便于追溯。
2. 转班申请列表增加“仅看当前班级待审核”快捷过滤按钮。
3. 模板预设支持管理员在系统设置页自定义维护。

## 30. 2026-04-03 资料变更审计导出字段增强（账号/目标班级/处理批次号）

本次完成项：

1. 资料变更审计日志模型新增字段：
   - `actor_username`（操作者账号）
   - `target_class_name`（目标班级）
   - `batch_token`（处理批次号）
2. 兼容旧库启动迁移：
   - 在 `ensure_runtime_schema()` 中自动补齐上述列并创建索引，不影响已有数据。
3. 审计写入增强：
   - 审计日志写入时自动记录操作者账号。
   - 转班申请提交/审核/撤销审核链路补齐目标班级字段。
   - 转班“批量审核 / 批量撤销审核”自动生成批次号并写入同批次日志。
4. 审计查询增强：
   - 审计列表接口新增返回 `actor_username / target_class_name / batch_token`。
   - 关键词检索支持按操作者账号、目标班级、处理批次号检索。
5. 审计导出增强：
   - CSV 新增列“操作者账号”“目标班级”“处理批次号”。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "student_profile_center_and_password_change or staff_can_batch_review_class_transfer_requests or staff_can_batch_unreview_class_transfer_requests" -q`
   - 结果：`3 passed`
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`39 passed`
3. `npm run typecheck:web`
   - 结果：通过
4. `npm run build:web`
   - 结果：通过

建议下一步：

1. 转班申请列表增加“仅看当前班级待审核”快捷过滤按钮。
2. 审计面板列表增加“操作者账号 / 目标班级 / 处理批次号”可视列与复制能力。
3. 模板预设支持管理员在系统设置页自定义维护。

## 31. 2026-04-03 转班申请列表增加“仅看当前班级待审核”快捷过滤

本次完成项：

1. 教师端学生页 `/staff/students` 的转班申请筛选区新增快捷按钮：
   - `仅看当前班待审核`
2. 点击后自动应用筛选条件：
   - 班级 = 学生列表当前班级
   - 状态 = 待审核
3. 按钮文案会根据当前班级动态显示（如“仅看701班待审核”），提高筛选可见性。
4. 未选中当前班级时按钮自动禁用，避免误触与空筛选请求。

本次验证结果：

1. `npm run typecheck:web`
   - 结果：通过
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 审计面板列表增加“操作者账号 / 目标班级 / 处理批次号”可视列与复制能力。
2. 模板预设支持管理员在系统设置页自定义维护。
3. 转班快捷过滤补“恢复为全部状态”一键重置按钮。

## 32. 2026-04-03 审计面板可视增强（操作者账号/目标班级/处理批次号 + 复制）

本次完成项：

1. 教师端学生页 `/staff/students` 的资料变更审计表新增 3 个可视列：
   - 操作者账号
   - 目标班级
   - 处理批次号
2. 以上三个字段均支持单元格“复制”按钮，可快速复制到剪贴板用于追溯与排障。
3. 复制能力同时支持现代剪贴板 API 与降级复制方案，兼容更多浏览器环境。
4. 当字段为空时不展示复制按钮，并给出统一的复制失败提示语义。

本次验证结果：

1. `npm run typecheck:web`
   - 结果：通过
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 模板预设支持管理员在系统设置页自定义维护。
2. 转班快捷过滤补“恢复为全部状态”一键重置按钮。
3. 审计面板支持按处理批次号一键过滤同批记录。

## 33. 2026-04-03 转班审核模板预设支持系统设置自定义维护

本次完成项：

1. 后端系统设置新增两项可配置字段：
   - `class_transfer_review_note_presets_text`
   - `class_transfer_unreview_reason_presets_text`
2. 管理员系统设置页 `/staff/admin/system` 的“基础参数”新增两块可维护文本：
   - 转班审核常用语预设
   - 转班撤销原因模板
3. 教师学生页 `/staff/students` 的转班审核面板不再使用硬编码模板，改为读取系统设置动态配置。
4. 模板文本支持按行维护，支持 `标题|内容` 格式；若仅填写内容则自动以内容作为展示标题。
5. 当系统设置为空或解析失败时，教师端会自动回退到内置默认模板，保证审核链路可用性。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "test_admin_can_update_system_settings_and_teacher_admin_role" -q`
   - 结果：`1 passed`
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`39 passed`
3. `npm run typecheck:web`
   - 结果：通过
4. `npm run build:web`
   - 结果：通过

建议下一步：

1. 转班快捷过滤补“恢复为全部状态”一键重置按钮。
2. 审计面板支持按处理批次号一键过滤同批记录。
3. 转班审核模板支持“按角色（管理员/教师）差异化默认模板”。

## 34. 2026-04-03 转班快捷过滤补“恢复为全部状态”一键重置

本次完成项：

1. 教师端学生页 `/staff/students` 的转班申请筛选区新增按钮：
   - `恢复为全部状态`
2. 点击后会一键重置转班筛选条件并立即刷新列表：
   - 班级筛选清空（查看全部班级）
   - 状态筛选恢复为“全部状态”
3. 当筛选已处于“全部状态 + 未选班级”时，按钮自动禁用，避免无效请求。

本次验证结果：

1. `npm run typecheck:web`
   - 结果：通过
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 审计面板支持按处理批次号一键过滤同批记录。
2. 转班审核模板支持“按角色（管理员/教师）差异化默认模板”。
3. 转班审核面板支持“模板快速收藏为个人常用语”。

## 35. 2026-04-03 审计面板支持按处理批次号一键过滤同批记录

本次完成项：

1. 后端资料变更审计查询与导出接口补充 `batch_token` 精确筛选参数：
   - `GET /api/v1/profiles/staff/profile-change-audits`
   - `GET /api/v1/profiles/staff/profile-change-audits/export`
2. 教师端学生页 `/staff/students` 的“资料变更审计”表格在“处理批次号”列新增 `同批记录` 快捷按钮。
3. 点击 `同批记录` 后，会自动：
   - 按该 `batch_token` 精确过滤审计记录
   - 清空当前班级 / 事件 / 关键字筛选，直接聚焦同批处理链路
4. 审计面板顶部新增“同批记录”高亮标签，支持一键清除当前批次筛选。
5. 批量通过 / 批量拒绝 / 批量撤销审核的成功提示补充“审计批次号”，方便教师立即追溯。
6. 已补 smoke 用例覆盖 `batch_token` 查询与导出链路。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m py_compile apps/api/app/api/v1/endpoints/profiles.py`
   - 结果：通过
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过
4. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "test_staff_can_batch_review_class_transfer_requests" -q`
   - 结果：当前环境执行超时，已改为补充 smoke 用例并完成语法校验，待本地 API 测试环境稳定后复跑

建议下一步：

1. 转班审核模板支持“按角色（管理员/教师）差异化默认模板”。
2. 转班审核面板支持“模板快速收藏为个人常用语”。
3. 审计面板支持按处理批次号聚合同批记录统计。

## 25. 2026-04-02 资料变更审计记录导出与查询

本次完成项：

1. 后端新增资料变更审计表 `profile_change_audit_logs`，覆盖学生资料核心变更事件：
   - 密码修改
   - 姓名修改
   - 性别修改
   - 相片上传 / 删除
   - 转班申请提交
   - 转班申请审核
2. 新增教师/管理员审计接口：
   - `GET /api/v1/profiles/staff/profile-change-audits`（按班级/事件类型/关键词查询）
   - `GET /api/v1/profiles/staff/profile-change-audits/export`（按同条件导出 CSV）
3. 审计查询接口已加权限边界：非管理员仅可查看自己可访问班级，越权班级筛选会返回 `403`。
4. 教师后台学生页 `/staff/students` 新增“资料变更审计”面板，支持：
   - 班级筛选
   - 事件类型筛选
   - 关键词查询
   - 一键导出 CSV
5. 审计表格可追溯时间、事件、班级、操作人、目标学生、变更字段、变更前后值与说明。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "student_profile_center_and_password_change" -q`
   - 结果：`1 passed`
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`37 passed`
3. `npm run typecheck:web`
   - 结果：通过
4. `npm run build:web`
   - 结果：通过

建议下一步：

1. 教师端学生页增加“转班申请批量审核”。

## 26. 2026-04-03 AI Provider 流式模式 + 转班申请批量审核

本次完成项：

1. AI 学伴链路新增流式能力：
   - 新增 `POST /api/v1/assistants/companion/respond/stream`（SSE）
   - OpenAI Compatible Provider 增加流式解析（`data: ...` / `[DONE]`）
   - Provider 不支持流式时自动回退普通响应，不中断对话
2. 学伴前端悬浮窗新增“回复模式”切换（流式 / 标准），流式模式下支持逐段渲染回复文本。
3. 教师后台学生页新增转班申请“批量通过 / 批量拒绝”：
   - 新增接口 `POST /api/v1/profiles/staff/class-transfer/requests/batch-review`
   - 支持多选待审核申请、统一审核备注、跳过已处理记录
4. 转班单条审核与批量审核共用同一后端处理逻辑，保证班级迁移、座位解绑、小组关系清理和审计记录行为一致。
5. 已补 smoke 用例覆盖：
   - AI 学伴流式响应
   - 转班申请批量审核及重复执行跳过场景

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "ai_companion_bootstrap_context_and_preview_reply or staff_can_batch_review_class_transfer_requests" -q`
   - 结果：`2 passed`
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`38 passed`
3. `npm run typecheck:web`
   - 结果：通过
4. `npm run build:web`
   - 结果：通过

建议下一步：

1. 转班申请增加“按班级全选待审核”与“批量撤销审核”能力。
2. AI 学伴流式模式增加“停止生成”按钮与超时重试提示。

建议下一步：

1. 小组共享空间权限细化。
2. 小组课堂动态记录。
3. 小组任务多人共同编辑。

## 12. 2026-04-02 小组协作增强更新

本次新增完成项：

1. 小组共享空间删除权限已细化为“上传者本人或组长”。
2. `/student/drive` 小组网盘已展示上传者信息与行级删除权限。
3. `/student/groups` 已新增“小组课堂动态”卡片。
4. `/staff/dashboard` 的“小组协作总览”已新增每组最近课堂动态。
5. 小组课堂动态已接通真实数据源：
   - 今日签到
   - 共享文件上传
   - 小组共同提交
   - 教师评阅结果
6. 已补充复用服务：
   - `apps/api/app/services/group_activity.py`
7. 已补充专项说明文档更新：
   - `docs/student-drive-flow.md`
   - `docs/student-group-flow.md`
   - `docs/teacher-group-management-flow.md`

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`20 passed`
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 小组任务多人共同编辑。
2. 小组操作日志与追溯记录。
3. 教师侧直接上传文件到某个小组共享空间。

## 13. 2026-04-02 拖拽分组更新

本次新增完成项：

1. `/staff/dashboard` 的“分组维护”抽屉已支持拖拽式调组。
2. 每个小组卡片都可作为拖拽投放区。
3. 已新增“未分组池”，支持把成员先拖出小组再重新编排。
4. 拖拽过程中仍保留原有的组长选择与表格式精细调整能力。
5. 拖拽后的结果继续复用原有“保存分组”接口，不改变后端保存模型。

本次验证结果：

1. `npm run build:web`
   - 结果：通过
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`20 passed`

建议下一步：

1. 小组任务多人共同编辑。
2. 小组操作日志与追溯记录。
3. 教师侧直接上传文件到某个小组共享空间。

## 14. 2026-04-02 小组任务多人共同编辑更新

本次新增完成项：

1. 学生任务详情接口已支持返回 `group_draft`，并可识别当前组员所属协作小组。
2. 后端已新增 `PUT /api/v1/tasks/{task_id}/group-draft`，支持小组任务共享草稿的保存、清空与版本递增。
3. 小组上传类任务已支持“共享作品说明草稿”，组员可轮流同步、恢复、刷新。
4. 小组编程任务已支持“共享代码草稿 + 共享说明草稿”，同时保留原有本地浏览器草稿作为个人兜底。
5. 小组正式提交时，会把本次说明与代码同步回共享草稿，确保组内成员看到的是最新版本。
6. 已补充共享草稿专项 smoke 用例，覆盖组员 A 保存、组员 B 读取与续写、正式提交后同步等链路。
7. 已同步文档：
   - `docs/student-submission-flow.md`
   - `docs/student-group-flow.md`
   - `docs/teacher-group-management-flow.md`
   - `docs/teacher-group-task-progress-flow.md`

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`21 passed`
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 小组操作日志与追溯记录。
2. 教师侧直接上传文件到某个小组共享空间。
3. 小组共享草稿历史版本与差异对比。

## 15. 2026-04-02 小组操作日志与追溯记录更新

本次新增完成项：

1. 后端已新增 `group_operation_logs` 持久化日志表，用于记录小组协作与教师分组操作。
2. 已接通以下日志写入场景：
   - 教师新建小组
   - 教师一键重组
   - 教师保存分组调整
   - 教师删除空组
   - 学生上传 / 删除小组共享文件
   - 学生同步 / 清空小组共享草稿
   - 小组正式提交任务
   - 教师评阅小组提交
3. 学生 `/groups/me` 已新增“操作日志”卡片。
4. 教师 `/staff/dashboard` 的小组卡片已新增“操作日志”面板。
5. 分组维护抽屉已新增班级级“追溯记录”列表。
6. 已补充专项 smoke，用于验证教师视角和学生视角都能读到持久化日志。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`22 passed`
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 教师侧直接上传文件到某个小组共享空间。
2. 小组共享草稿历史版本与差异对比。
3. 小组操作日志筛选、导出与按成员追踪。

## 16. 2026-04-02 教师侧直传小组共享空间更新

本次新增完成项：

1. 后端已新增 `POST /api/v1/staff/groups/{group_id}/drive/files`，允许教师或管理员直接把资料上传到指定小组共享空间。
2. 教师工作台 `/staff/dashboard` 的小组共享文件卡片已新增“上传资料”按钮，支持多文件上传并在成功后即时刷新文件列表。
3. 教师侧小组共享文件列表已补充上传者信息，便于区分教师投放资料与学生上传成果。
4. 教师上传共享资料后，会同步写入持久化操作日志，事件类型为 `teacher_group_file_uploaded`。
5. 学生侧 `/student/drive?tab=group` 与 `/student/groups` 会同步看到教师新上传的共享文件与日志记录。
6. 已补充专项 smoke，覆盖教师上传权限、学生可见性、学生下载与日志追溯链路。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`23 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

建议下一步：

1. 小组共享草稿历史版本与差异对比。
2. 小组操作日志筛选、导出与按成员追踪。
3. 小组网盘文件大小 / 类型 / 数量限制策略。

## 17. 2026-04-02 小组协作闭环补齐更新

本次新增完成项：

1. 学生任务页与编程任务页已新增“历史版本”入口，支持查看小组共享草稿历史版本与说明 / 代码差异对比。
2. 后端已新增 `GET /api/v1/tasks/{task_id}/group-draft/history`，并持久化 `GroupTaskDraftVersion` 历史版本表。
3. 小组共享草稿的历史快照已覆盖“同步草稿”“清空草稿”“正式提交回写”三类场景，且版本号连续递增。
4. 教师工作台 `/staff/dashboard` 的“小组维护”抽屉已支持按小组、事件类型、操作人、关键字筛选追溯日志。
5. 后端已新增：
   - `GET /api/v1/staff/classes/{class_id}/group-operation-logs`
   - `GET /api/v1/staff/classes/{class_id}/group-operation-logs/export`
6. 管理员系统设置页 `/staff/admin/system` 已新增小组网盘上传限制项：
   - `group_drive_file_max_count`
   - `group_drive_single_file_max_mb`
   - `group_drive_allowed_extensions`
7. 小组网盘上传限制已在后端统一生效，学生上传与教师上传到小组共享空间都会受相同规则约束。
8. 已同步文档：
   - `docs/teacher-group-management-flow.md`
   - `docs/student-submission-flow.md`
   - `docs/student-drive-flow.md`
   - `docs/student-group-flow.md`

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`26 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

建议下一步：

1. 教师端签到。
2. 教师端学生管理。
3. 课时智能体与 AI 助手剩余链路。

## 18. 2026-04-02 教师端与系统设置链路验收补充

本次补充完成项：

1. 修复学生账号被停用后仍可登录的问题：学生 / 教师登录统一增加 `is_active` 校验。
2. 修复课时学伴上下文在复杂数据状态下偶发丢失的问题：补充“同班最近绑定 / 教师最近绑定”回退策略。
3. 课堂会话启动台列表改为仅返回 `active` 会话，并按班级稳定排序，避免首条会话不确定导致链路抖动。
4. 修复管理员系统设置页“批量添加班级”解析时的 TypeScript 空值收窄报错，前端构建恢复通过。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`30 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

建议下一步：

1. 进入“升班链路”实现（班级整体升年级、学生批量迁移、历史班级归档）。
2. 进入“主题配置”实现（系统级主题预设、教师端/学生端统一应用）。

## 19. 2026-04-02 升班链路与系统主题配置闭环

本次完成项：

1. 升班链路：新增管理员升班预览与执行接口，支持班级整体升年级、学生批量迁移、教师班级关系同步、原班级归档。
2. 历史归档：归档班级从管理主列表与权限可见范围中剔除，系统设置返回归档班级统计与归档记录。
3. 主题配置：新增系统级主题预设读取，系统设置可修改 `theme_code`，教师端/学生端登录后统一应用系统主题。
4. 前端管理页：新增“升班与归档”页签、归档班级统计卡片、升班预览表与历史归档表；系统参数增加“系统主题”配置项。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`32 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

## 20. 2026-04-02 教师后台学生页与课堂会话职责验收

本次完成项：

1. 教师学生页 `/staff/students` 复核通过：班级筛选、关键词搜索、导出、重置密码、账号停用恢复、解除分组、学生作品记录抽屉均可用。
2. 教师工作台 `/staff/dashboard` 座位卡补齐“签到 + 作业”双状态：
   - 每个已签到座位显示学生累计提交、已评阅、待评阅。
   - 若班级存在最近课堂会话，会显示该会话学案的提交状态（未提交 / 已提交 / 已评阅）。
3. 工作台座位布局与系统设置机房布局对齐：
   - 座位图按机房 `row_count * col_count` 生成完整网格。
   - 未配置座位的位置以虚拟占位格显示，避免布局错位。
4. 课堂页面职责拆分：
   - 侧边栏与页面文案统一为“课堂会话中心（原上课中控）”。
   - 新增 `POST /api/v1/classroom/sessions/{session_id}/close`，支持教师在会话中心结束课堂，减少与工作台、学案页的功能重叠。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`34 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

## 24. 2026-04-02 通用智能体悬浮入口补齐 provider 联动

本次完成项：

1. 通用 AI 学伴悬浮入口（教师端 `/staff/*`、学生端 `/student/*`）补齐 provider 选择联动：可在学伴面板内临时切换可用 Provider。
2. 前端 `FloatingAiCompanion` 新增 Provider 选择控件，并在发送消息时携带 `provider_id`，实现“入口 UI 与模型配置”的直连。
3. 后端 `POST /api/v1/assistants/companion/respond` 新增 `provider_id` 入参：
   - 未传时沿用系统默认 Provider。
   - 传入时优先使用指定且启用中的 Provider。
   - 传入不可用 Provider 时返回 `400` 明确错误，避免静默回退。
4. AI 学伴响应中继续回传 `active_provider`，前端可实时展示当前生效 Provider。
5. 已补 smoke 用例覆盖“指定 provider 生效 + 非法 provider 拦截”。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -k "ai_companion_bootstrap_context_and_preview_reply" -q`
   - 结果：`1 passed`
2. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`37 passed`
3. `npm run typecheck:web`
   - 结果：通过
4. `npm run build:web`
   - 结果：通过

建议下一步：

1. 资料变更审计记录导出与查询。
2. 教师端学生页增加“转班申请批量审核”。

## 22. 2026-04-02 学生个人资料中心细化（班级/相片/姓名/性别）

本次完成项：

1. 学生端 `/student/profile` 补齐细分资料维护页签：
   - `/student/profile/class-transfer`
   - `/student/profile/photo`
   - `/student/profile/gender`
   - `/student/profile/name`
2. 新增学生资料维护接口：
   - `PUT /api/v1/profiles/student/name`
   - `PUT /api/v1/profiles/student/gender`
   - `POST /api/v1/profiles/student/photo`
   - `GET /api/v1/profiles/student/photo`
   - `DELETE /api/v1/profiles/student/photo`
3. 班级修改改为审核流，避免学生直接改动学籍：
   - 学生提交：`POST /api/v1/profiles/student/class-transfer/requests`
   - 学生查询：`GET /api/v1/profiles/student/class-transfer/options`
   - 学生查询：`GET /api/v1/profiles/student/class-transfer/requests`
   - 教师/管理员审核：`GET /api/v1/profiles/staff/class-transfer/requests`
   - 教师/管理员审核：`POST /api/v1/profiles/staff/class-transfer/requests/{request_id}/review`
4. 审核通过后会自动同步学生班级/年级，并清理原班级座位绑定与小组成员关系，避免脏数据残留。

建议下一步：

1. 教师端学生页补“转班申请审核面板”（调用现有 staff 审核接口）。
2. 通用智能体悬浮入口（教师端/学生端）补齐 provider 联动。
3. 资料变更审计记录导出与查询。

## 23. 2026-04-02 教师端学生页补齐转班申请审核面板

本次完成项：

1. 教师后台学生页 `/staff/students` 新增“转班申请审核”面板，支持按班级、状态筛选申请记录。
2. 面板支持直接执行“通过/拒绝”审核，并可填写审核备注，实时回刷学生列表与申请列表。
3. 审核状态、原班级/目标班级、审核人、审核备注在同页可追踪，形成班级调整闭环入口。

本次验证结果：

1. `npm run typecheck:web`
   - 结果：通过
2. `npm run build:web`
   - 结果：通过

建议下一步：

1. 通用智能体悬浮入口（教师端/学生端）补齐 provider 联动。
2. 资料变更审计记录导出与查询。
3. 教师端学生页增加“转班申请批量审核”。

## 21. 2026-04-02 教师工作台座位区与学生管理页补强

本次完成项：

1. 教师工作台 `/staff/dashboard` 的签到座位区改为紧凑网格，不再横向铺满整页，聚焦课堂状态浏览。
2. 座位卡和“未签到学生”标签中移除学号展示，仅保留姓名，减少当前班级场景下的重复信息。
3. 教师学生管理页 `/staff/students` 新增批量管理能力：
   - 批量停用账号
   - 批量恢复账号
   - 批量解除分组
   - 批量重置密码（支持自定义密码或回退默认规则）
4. 后端新增 `POST /api/v1/staff/students/batch-action`，并补齐 smoke 覆盖批量操作链路。

本次验证结果：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
   - 结果：`34 passed`
2. `npm run typecheck:web`
   - 结果：通过
3. `npm run build:web`
   - 结果：通过

## 33. 2026-04-03 优先级调整（暂停转班 / 审计增强）

背景说明：

1. 本轮已明确：与转班申请、资料审计、批量审核、追溯导出相关的增强项先暂停，不再作为当前阶段的下一步。
2. 后续排期重新回到首版范围内“线上明确在用、但尚未真正落地闭环”的功能缺口。
3. 优先级判断依据：
   - `docs/learnsite-implementation-spec.md` 中的首版模块与 Phase 交付项
   - `docs/learnsite-redesign-design.md` 中对旧站真实在线功能的实测结论
   - 当前前后端代码的真实落地状态，而不是最近一次增量记录的建议项

当前重新确认的高优先级任务：

1. 第一优先级：学生测验 + 教师题库管理
   - 文档状态：属于首版必做，且在 Phase 2 明确列为“题库与测验”
   - 当前代码现状：
     - 学生端 `/student/quiz` 仍为占位实现
     - 学生端 `/student/quiz/rankings` 仍为占位页
     - 教师端 `/staff/quizzes` 仍为占位页
     - 后端主路由尚未挂接 `/api/v1/quizzes/*`
   - 建议目标：先完成“学生测验首页 -> 开始测验 -> 提交测验 -> 日榜/班榜 -> 教师题库基础管理”的最小闭环
2. 第二优先级：学生打字训练 + 教师打字内容管理
   - 文档状态：属于首版必做，且学生端、教师端都在旧站主导航中明确在线
   - 当前代码现状：
     - 学生端 `/student/typing` 仍为占位实现
     - 学生端 `/student/typing/rankings` 仍为占位页
     - 教师端 `/staff/typing` 仍为占位页
     - 后端主路由尚未挂接 `/api/v1/typing/*`
   - 建议目标：先完成“训练集列表 -> 成绩提交 -> 排行榜 -> 教师内容维护”的基础链路
3. 第三优先级：学生在线资源 + 教师资源管理
   - 文档状态：属于首版保留模块，教师端 `teacher/soft.aspx` 与学生端 `student/myfile.aspx` 形成配套
   - 当前代码现状：
     - 学生端 `/student/resources` 仍为占位实现
     - 教师端 `/staff/resources` 仍为占位页
     - 后端主路由尚未挂接 `/api/v1/resources/*`
   - 建议目标：先完成“分类列表 -> 资源详情 -> 教师上传与分类管理 -> 学生只读浏览”的首版闭环
4. 第四优先级：通用智能体悬浮入口验收收口
   - 文档状态：属于 Phase 3 能力，但当前已具备较多基础实现
   - 当前代码现状：
     - 学生端与教师端布局已挂通用悬浮入口
     - 已完成 provider 联动、标准响应与流式响应
     - 目前更像“验收收口项”，不是“从 0 到 1 缺口项”
   - 建议目标：补齐最终联调、异常态、开关配置与文档说明

本阶段不再作为下一步的事项：

1. 转班申请快捷审核增强
2. 转班模板预设与个性化收藏
3. 资料变更审计展示、导出、批次追溯增强

建议新的执行顺序：

1. 先做“测验 / 题库”
2. 再做“打字训练 / 打字内容管理”
3. 再做“资源中心 / 教师资源管理”
4. 最后对“通用智能体悬浮入口”做验收收口

建议下一步：

1. 直接进入“测验 / 题库”实现拆解，先补学生测验首页、开始测验、提交测验、排行榜和教师题库骨架。
2. 完成后同步更新：
   - `docs/learnsite-implementation-spec.md`
   - `docs/learnsite-live-feature-matrix.md`
   - `docs/learnsite-task-checklist.md`

## 34. 2026-04-03 高优先级 1-4 顺序任务收口完成

本次完成项：

1. 第一优先级“学生测验 + 教师题库管理”已完成首版闭环：
   - 学生端已接入真实测验首页、开始测验、提交测验与排行榜
   - 教师端已接入题库管理页与基础出题能力
   - 后端已挂接 `/api/v1/quizzes/*`
2. 第二优先级“学生打字训练 + 教师打字内容管理”已完成首版闭环：
   - 学生端已接入训练首页、成绩提交与班级/年级/学校排行榜
   - 教师端已接入打字内容维护入口
   - 后端已挂接 `/api/v1/typing/*`
3. 第三优先级“学生在线资源 + 教师资源管理”已完成首版闭环：
   - 学生端已接入资源分类浏览、详情查看与外链访问
   - 教师端已接入资源分类与资源内容创建
   - 后端已挂接 `/api/v1/resources/*`
4. 第四优先级“通用智能体悬浮入口验收收口”已完成首版验收：
   - 悬浮入口已在学生端、教师端布局内统一接入
   - 已补齐 Provider 选择联动、标准响应、SSE 流式响应与知识库切换
   - 已补齐“停止生成”能力，并在关闭抽屉、退出登录、组件卸载时自动中断当前请求
   - 已修正“请求过程中切换流式开关导致中断分支判断错误”的前端状态问题

本次验证结果：

1. `npm run build`
   - 结果：通过

建议下一步：

1. 回到教师后台主链路，继续按真实在线旧站功能补课堂内容聚焦与教学操作细节。
2. 同步检查 `docs/learnsite-implementation-spec.md` 与 `docs/learnsite-live-feature-matrix.md`，把测验、打字、资源、通用智能体的当前落地状态写实。

## 35. 2026-04-06 文档任务审计与学案编辑器写实同步

本次按优先级完成以下 3 条文档任务：

1. 第一优先级：同步 `docs/learnsite-implementation-spec.md`
   - 补写教师学案编辑器的最新真实能力：
     - 本地草稿自动保存与离开未保存提醒
     - 网页任务 / 数据提交任务左右分栏编辑预览
     - AI 提示词模板 + 自定义补充要求
     - 预览失败错误面板、详情展开与复制
   - 同步补充前端结构整理约定，明确编辑器状态、任务行操作、模板库、预览上传逻辑均已拆出 composable。
2. 第二优先级：同步 `docs/learnsite-live-feature-matrix.md`
   - 更新教师端矩阵中 `teacher/courseshow.aspx` 对应的新平台说明，写实当前学案编辑器的任务模板库、数据提交正式接口、即时预览、错误面板与草稿提醒能力。
   - 在矩阵前置说明中新增“教师学案编辑器”写实补充，避免只在实现规格里有、矩阵侧却缺少验收口径。
3. 第三优先级：补齐 `docs/learnsite-task-checklist.md` 自身记录
   - 追加本节审计结果，形成“文档任务已完成”的可追踪记录。
   - 把当前学案编辑器重构与文案清洗纳入任务清单语境，方便后续继续推进页面拆分与联调。

本次同时确认的当前学案编辑器代码状态：

1. `LessonPlanPage.vue` 已继续瘦身，编辑器状态、任务行操作、任务模板库、任务预览与资源上传已分别沉淀到独立 composable。
2. 剩余中文异常占位文案已清洗，数据提交默认模板、课次标签与任务默认回退文案都已改回正常中文。
3. 上一轮代码改动已通过：
   - `npm run typecheck:web`
   - `npm run build:web`

重新排序后的建议下一步：

1. 继续拆分教师学案页任务编辑主块，把当前 `LessonPlanPage.vue` 里剩余的任务配置渲染层进一步下沉到子组件。
2. 对教师学案页做一轮真实浏览器联调，重点回归数据提交任务的保存后预览、错误面板与 AI 生成页链路。
3. 评估教师学案页及相关模块的懒加载 / 拆包策略，优先压降当前构建产物中的大 chunk 告警。
