# LearnSite 在线功能映射矩阵

生成时间：2026-03-30  
状态：DRAFT  
用途：把旧站在线明确在用的页面，映射到新平台中的模块、路由、API、数据表与交付阶段。  
适合人群：产品经理、项目经理、前端、后端、测试、实施团队
对应总设计文档：`docs/learnsite-redesign-design.md`  
对应实施规格文档：`docs/learnsite-implementation-spec.md`

## 1. 使用方法

这份矩阵不是“源码清单”，而是“首版必须覆盖的在线功能清单”。

每一行都回答 7 个问题：

1. 旧站哪个页面或入口在用。
2. 这个功能在新平台属于哪个模块。
3. 前端应该落到哪个路由。
4. 后端主要归属哪个 API 领域。
5. 主要依赖哪些数据表。
6. 建议在哪个阶段交付。
7. 有没有需要特别注意的历史问题。

## 2. 状态标记

| 标记 | 含义 |
|---|---|
| `已实测` | 已通过线上页面实际访问确认 |
| `在线可见但内容空白` | 导航仍存在，但页面当前基本无有效内容 |
| `应重构不复刻` | 旧页存在，但不建议按同页重建 |

## 3. 公共入口矩阵

| 旧页面 / 入口 | 状态 | 新模块 | 新路由 | API 领域 | 主表 | 阶段 | 备注 |
|---|---|---|---|---|---|---|---|
| `index.aspx` | 已实测 | 学生登录 | `/login/student` | `auth` | `users`, `student_profiles` | Phase 0 | 学生正式登录入口 |
| `teacher/index.aspx` | 已实测 | 教职工登录 | `/login/staff` | `auth` | `users`, `staff_profiles`, `user_roles` | Phase 0 | 教师与管理员统一登录 |
| `student/register.aspx` | 已实测 | 学生注册 / 账号申请 | `/register` | `auth`, `profiles` | `users`, `student_profiles` | Phase 1 | 是否开放由系统设置控制 |
| `student/mynum.aspx` | 已实测 | 账号找回 | `/account-recovery` | `auth`, `profiles` | `users`, `student_profiles` | Phase 1 | 必须改为安全找回机制，不得公开学号对照 |
| `student/myrule.aspx` | 已实测 | 课堂守则 | `/rules` | `settings` | `system_settings` | Phase 0 | 可做成后台可编辑内容页 |

## 4. 学生端矩阵

| 旧页面 | 状态 | 新模块 | 新路由 | API 领域 | 主表 | 阶段 | 备注 |
|---|---|---|---|---|---|---|---|
| `student/myinfo.aspx` | 已实测 | 学习中心首页 | `/student/home` | `lesson_plans`, `attendance`, `profiles` | `lesson_plans`, `tasks`, `attendance_records`, `student_profiles` | Phase 1 | 聚合未学/已学学案、签到同学、学生信息、组队入口 |
| `student/showcourse.aspx` | 已实测 | 学案详情 | `/student/courses/:courseId` | `lesson_plans`, `tasks`, `resources` | `lesson_plans`, `tasks`, `task_resources`, `resources` | Phase 1 | 包含任务列表、返回、学习目标、课件下载 |
| `student/description.aspx` | 已实测 | 阅读材料 / 说明页 | `/student/courses/:courseId/readings/:taskId` | `tasks`, `profiles` | `tasks`, `task_read_records`, `lesson_plans` | Phase 1 | 已接通富文本内容、学案导读、上下任务跳转与已读确认；附件展示待 `task_resources` 接入 |
| `student/showmission.aspx` | 已实测 | 通用任务页 | `/student/courses/:courseId/tasks/:taskId` | `tasks`, `submissions`, `peer_reviews`, `files` | `tasks`, `task_settings`, `submissions`, `submission_files` | Phase 1 | 首版学生任务主容器 |
| `student/program.aspx` | 已实测 | 代码任务页 | `/student/courses/:courseId/programs/:taskId` | `tasks`, `submissions`, `files` | `tasks`, `task_settings`, `submissions`, `submission_files` | Phase 1 | 已确认有真实 Python 任务 |
| `student/mywork.aspx` | 已实测 | 我的作品 | `/student/work` | `submissions` | `submissions`, `submission_files`, `tasks`, `lesson_plans` | Phase 1 | 历史作品中心，支持分页 |
| `student/downwork.aspx` | 已实测 | 作品下载 | `/student/work/:submissionId` | `submissions`, `files` | `submissions`, `submission_files`, `files` | Phase 1 | 可合并进作品详情页 |
| `student/myevaluate.aspx` | 已实测 | 作品互评 | `/student/reviews/:taskId` | `peer_reviews`, `submissions` | `peer_review_votes`, `submissions`, `student_profiles` | Phase 1 | 作品墙 + 推荐投票 |
| `student/myquiz.aspx` | 已实测 | 常识测验首页 | `/student/quiz` | `quizzes` | `quizzes`, `quiz_attempts`, `questions` | Phase 2 | 已接通平均分、开始测验、提交后即时反馈与最近记录 |
| `student/quizrank.aspx` | 已实测 | 测验排行榜 | `/student/quiz/rankings` | `quizzes` | `quiz_attempts`, `student_profiles`, `classes` | Phase 2 | 已接通当日班级排行榜与未测验名单 |
| `student/myfinger.aspx` | 已实测 | 打字训练首页 | `/student/typing` | `typing` | `typing_sets`, `typing_records` | Phase 2 | 已接通英文 / 中文 / 拼音练习、成绩保存与班级榜预览 |
| `student/allfinger.aspx` | 已实测 | 打字排行榜 | `/student/typing/rankings` | `typing` | `typing_records`, `student_profiles`, `classes` | Phase 2 | 已接通班级 / 年级 / 全校排行榜 |
| `student/myfile.aspx` | 在线可见但内容空白 | 资源中心学生侧 | `/student/resources` | `resources` | `resources`, `resource_categories`, `files` | Phase 2 | 旧站虽空白，但新平台已接通分类浏览、详情阅读与外链访问 |
| `student/groupshare.aspx` | 已实测 | 我的网盘 / 小组网盘 | `/student/drive` | `drives` | `drive_spaces`, `drive_files` | Phase 1 | 已接通个人 + 小组网盘文件流转；并与课堂开关 `drive/group_drive/ip_lock` 实时联动（含禁用提示与后端拦截） |
| `profile/mygroup.aspx` | 已实测 | 小组管理 | `/student/groups` | `classes`, `drives`, `profiles` | `class_memberships`, `student_profiles` | Phase 1 | 与网盘及协作能力相关 |
| `profile/mychange.aspx` | 已实测 | 学生基本信息 | `/student/profile` | `profiles` | `student_profiles`, `classes` | Phase 1 | 已落地为学生个人资料中心首页，展示姓名、学号、班级、年级、机房座位与签到摘要 |
| `profile/mysign.aspx` | 已实测 | 学生签到记录 | `/student/profile/attendance` | `attendance` | `attendance_records`, `attendance_sessions` | Phase 1 | 已并入同页标签，展示最近 20 条签到记录、签到来源与登录 IP |
| `profile/mypwd.aspx` | 已实测 | 修改密码 | `/student/profile/password` | `auth`, `profiles` | `users` | Phase 1 | 已并入同页标签，调用 `/api/v1/profiles/student/password`，包含旧密码校验与确认密码校验 |
| `profile/myclass.aspx` | 已实测 | 修改班级 | `/student/profile/class-transfer` | `profiles`, `classes` | `class_memberships`, `classes` | Phase 1 | 保留为个人资料中心下一阶段细化能力，首版暂不开放学生自助改班 |
| `profile/myphoto.aspx` | 已实测 | 相片上传 | `/student/profile/photo` | `profiles`, `files` | `student_profiles`, `files` | Phase 1 | 保留为下一阶段细化能力，届时需限制大小和类型 |
| `profile/mysex.aspx` | 已实测 | 修改性别 | `/student/profile/gender` | `profiles` | `student_profiles` | Phase 1 | 保留为下一阶段细化能力，可并入资料编辑表单 |
| `profile/myname.aspx` | 已实测 | 修改姓名 | `/student/profile/name` | `profiles` | `student_profiles` | Phase 1 | 保留为下一阶段细化能力，可并入资料编辑表单 |
| `teacher/studentwork.aspx?Snum=*` | 已实测但路径异常 | 学生个人作品档案 | `/student/work` 或 `/student/profile/portfolio` | `submissions` | `submissions`, `submission_files` | Phase 1 | 新平台不能再走教师路径展示学生个人页 |
| `showcourse.aspx?cid=22` 心理测评页 | 已实测 | 外链任务 / 特殊课程说明 | `/student/courses/:courseId` | `tasks`, `resources` | `tasks`, `task_settings`, `resources` | Phase 1 | 必须移除明文展示外部账号密码的做法 |

## 2026-04-01 状态校正

1. `student/groupshare.aspx` 对应的新平台能力已更新为：
   - 个人网盘真实可用
   - 小组网盘真实可用
   - 同组成员共享文件
2. `profile/mygroup.aspx` 对应的新平台能力已更新为：
   - 真实小组数据展示
   - 组长 / 组员 / 座位 / 今日签到状态展示
   - 小组共享网盘概览与跳转入口

## 2026-04-03 状态校正

1. `student/myquiz.aspx` 与 `student/quizrank.aspx` 对应的新平台能力已更新为：
   - 测验首页真实可用
   - 支持开始测验、提交测验、即时得分反馈
   - 支持当日班级排行榜与未测验名单
2. `student/myfinger.aspx` 与 `student/allfinger.aspx` 对应的新平台能力已更新为：
   - 学生可直接进入英文 / 中文 / 拼音练习
   - 成绩会实时写入排行榜
   - 排行榜支持班级 / 年级 / 全校三种范围
3. `student/myfile.aspx` 对应的新平台能力已更新为：
   - 虽然旧站页面内容空白，但新平台已落地真实资源中心
   - 支持分类浏览、详情阅读、同类资源推荐与外链跳转
4. AI Provider 配置对应的新平台能力已更新为：
   - 管理端已支持 Provider 配置维护
   - 学生端与教师端悬浮学伴已支持 Provider 切换、标准 / 流式响应与停止生成

5. 课堂内容聚焦与教学操作细节对应的新平台能力已更新为：
   - 课堂开关已扩展到 `drive`、`group_drive`、`group_discussion`、`programming_control`、`ip_lock`，并统一落地为会话级配置。
   - 随机点名已支持近期历史与短时去重策略，避免短时间重复点到同一学生。
   - 课堂任务聚焦卡已直接展示“未交 / 已交 / 已评”进度条，并提供“看未交 / 看待评 / 查看提交”快捷跳转。

## 5. 教师端矩阵

| 旧页面 | 状态 | 新模块 | 新路由 | API 领域 | 主表 | 阶段 | 备注 |
|---|---|---|---|---|---|---|---|
| `teacher/start.aspx` | 已实测 | 上课中控 | `/staff/classroom` / `/staff/classroom/:sessionId` | `classroom`, `attendance`, `lesson_plans` | `classroom_sessions`, `classroom_switches`, `attendance_sessions` | Phase 2 | 教师最高频页面；已覆盖课堂开关扩展、随机点名历史与去重、任务聚焦进度条 |
| `teacher/course.aspx` | 已实测 | 学案列表 | `/staff/lesson-plans` | `lesson_plans`, `curriculum` | `lesson_plans`, `curriculum_lessons` | Phase 2 | 学案管理入口 |
| `teacher/courseshow.aspx` | 已确认存在 | 学案编辑 | `/staff/lesson-plans/:planId` | `lesson_plans`, `tasks`, `resources` | `lesson_plans`, `tasks`, `task_resources` | Phase 2 | 任务排序、显隐、编辑 |
| `teacher/gauge.aspx` | 已实测 | 量规管理 | `/staff/rubrics` | `submissions`, `rubrics` | `rubrics`, `rubric_items` | Phase 2 | 和评分联动 |
| `teacher/works.aspx` | 已实测 | 作品总览 | `/staff/submissions` | `submissions` | `submissions`, `submission_files`, `student_profiles` | Phase 2 | 查看某学案作品汇总 |
| `teacher/workcheck.aspx` | 已确认存在 | 作品评分页 | `/staff/submissions/:taskId` | `submissions`, `rubrics` | `submissions`, `submission_rubric_scores` | Phase 2 | 单个任务评分、批量评分；已支持课堂任务卡 `focus=pending_submit|pending_review` 快捷跳转 |
| `teacher/signin.aspx` | 已实测 | 签到管理 | `/staff/attendance` | `attendance` | `attendance_sessions`, `attendance_records` | Phase 2 | 查看、导出签到 |
| `teacher/student.aspx` | 已实测 | 学生管理 | `/staff/students` | `classes`, `profiles`, `auth` | `student_profiles`, `class_memberships`, `users` | Phase 2 | 重置密码、分组、导出等 |
| `quiz/quiz.aspx` | 已实测 | 常识 / 题库管理 | `/staff/quizzes` | `quizzes`, `questions` | `question_banks`, `questions`, `quizzes` | Phase 2 | 已接通题库创建、题库/题目/测验编辑删除保护、按班发布测验；测验列表已改为服务端按更新时间/参与人数排序与分页，并记忆筛选/排序/分页偏好；列表筛选/分页刷新使用 `bootstrap_mode=quiz_list` 轻量响应，避免重复下发全量题库题目数据；“已发布测验”统计卡展示可见总量，列表 loading 限定在表格区 |
| `teacher/typer.aspx` | 已实测 | 中文打字内容管理 | `/staff/typing` | `typing` | `typing_sets`, `typing_records` | Phase 2 | 已统一收口到同页筛选，支持内容维护与成绩概览 |
| `teacher/typechinese.aspx` | 已实测 | 拼音打字内容管理 | `/staff/typing` | `typing` | `typing_sets`, `typing_records` | Phase 2 | 已统一收口到同页筛选，按模式查看即可 |
| `teacher/soft.aspx` | 已实测 | 资源管理 | `/staff/resources` | `resources`, `files` | `resources`, `resource_categories`, `files` | Phase 2 | 已接通分类维护、资源创建、发布控制与正文预览 |
| `teacher/infomation.aspx` | 已实测 | 信息发布 / 教学公告 | `/staff/help` 或 `/staff/dashboard` | `settings`, `resources` | `system_settings`, `resources` | Phase 3 | 可按实际内容再细拆 |
| `teacher/helper.aspx` | 已实测 | 帮助中心 | `/staff/help` | `settings` | `system_settings` | Phase 3 | 可做静态页 + 后台配置 |
| `teacher/systeminfo.aspx` | 应重构不复刻 | 系统运行状态 | `/staff/admin/maintenance` | `settings`, `audit` | `system_settings`, `classroom_events` | Phase 3 | 旧页报错，不做同页复刻 |

## 6. 管理权限矩阵

| 旧页面 | 状态 | 新模块 | 新路由 | API 领域 | 主表 | 阶段 | 备注 |
|---|---|---|---|---|---|---|---|
| `manager/setting.aspx` | 已实测 | 系统设置 | `/staff/admin/system` | `settings` | `system_settings`, `theme_settings` | Phase 3 | 包含学校配置、页脚、帮助等 |
| `manager/createroom.aspx` | 已实测 | 班级 / 机房设置 | `/staff/admin/classes` | `classes`, `seats` | `classes`, `seat_rooms` | Phase 3 | 班级与机房可拆成子页 |
| `manager/teacher.aspx` | 已实测 | 教师管理 | `/staff/admin/teachers` | `users`, `profiles` | `users`, `staff_profiles`, `user_roles` | Phase 3 | 教师账号与权限配置 |
| `manager/studentimport.aspx` | 已实测 | 新生导入 | `/staff/admin/students/import` | `imports`, `classes`, `profiles` | `student_profiles`, `class_memberships`, `import_jobs` | Phase 3 | 首版必须保留 |
| `manager/upgrade.aspx` | 已实测 | 升班 | `/staff/admin/promotions` | `classes`, `profiles` | `classes`, `class_memberships`, `school_terms` | Phase 3 | 学年变更核心能力 |
| `manager/divide.aspx` | 已实测 | 重新分班 | `/staff/admin/promotions?mode=redivide` | `classes`, `profiles` | `classes`, `class_memberships` | Phase 3 | 可并入升班模块 |
| `manager/backup.aspx` | 已实测 | 数据备份 | `/staff/admin/maintenance` | `settings`, `audit` | 无强业务表，偏运维 | Phase 4 | 建议以运维脚本和后台任务实现 |
| `manager/clearold.aspx` | 已实测 | 数据清理 | `/staff/admin/maintenance` | `settings`, `audit` | 无强业务表，偏运维 | Phase 4 | 必须加审计与确认机制 |
| `manager/seat/house.aspx` | 已实测 | 机房座位图 | `/staff/admin/seats` | `seats`, `classes`, `classroom` | `seat_rooms`, `seat_layouts` | Phase 3 | 与课堂点名和座位视图联动 |
| `manager/copygood.aspx` | 已实测 | 收藏推荐 / 优秀作品 | `/staff/admin/recommended` | `resources`, `submissions` | `resources`, `submissions` | Phase 4 | 若时间紧，可延后 |
| AI Provider 配置 | 新增要求 | 模型接入设置 | `/staff/admin/ai-providers` | `assistants`, `settings` | `ai_providers`, `system_settings` | Phase 3 | 已接通 Provider 配置维护，并驱动悬浮学伴的 Provider 切换 |

## 7. 首版不纳入的旧能力

以下能力虽然在源码中出现，但当前不纳入首版：

| 能力 | 原因 |
|---|---|
| 游戏中心独立模块 | 线上未作为核心菜单闭环明确交付 |
| 徽章 / 宠物 / 学分玩法扩展 | 更像长期运营增强能力 |
| 讨论 / 调查 / 聊天旧页面全量复刻 | 线上当前主链路未明确实测到入口 |
| 旧系统损坏页面原样重建 | 没有价值，只会复制历史技术债 |

## 8. 推荐使用顺序

如果团队开始排开发任务，建议直接按这个顺序引用本矩阵：

1. 先做公共入口与登录。
2. 再做学生端主链路。
3. 再做教师端备课、上课、评分闭环。
4. 然后补管理权限模块。
5. 最后补 AI、运维、增强能力。

## 9. 结论

这份矩阵的意义在于，把“模仿旧站全部在线功能”这件事，变成一张可以落地执行、可以追踪进度、可以逐项验收的交付表。
