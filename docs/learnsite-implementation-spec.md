# LearnSite 新平台实施规格说明

生成时间：2026-03-30  
状态：DRAFT  
适用对象：产品、前端、后端、测试、实施运维、后续接手团队  
对应总设计文档：`docs/learnsite-redesign-design.md`
对应功能映射矩阵：`docs/learnsite-live-feature-matrix.md`

## 1. 文档目的

这份文档不是产品愿景说明，而是给开发团队直接落地使用的实施规格。

它解决 6 件事：

1. 首版到底做哪些模块。
2. 每个模块在新平台中应该放在哪一层。
3. 前端路由怎么规划。
4. 后端 API 怎么分组。
5. 数据库表应该围绕哪些实体来设计。
6. 实施顺序和里程碑怎么排，才能尽快替代旧站线上核心功能。

## 2. 已锁定约束

以下约束已经确认，不应在开发过程中反复摇摆：

1. 首版只覆盖线上明确在用的功能。
2. 不迁移旧系统历史数据，只做新平台。
3. 旧系统只作为业务参考源和验收对照物。
4. 学生入口以 `http://10.230.39.247/index.aspx` 为蓝本。
5. 教师入口和管理员入口都以 `http://10.230.39.247/teacher/index.aspx` 为蓝本。
6. 新前端技术栈为 `Vue 3 + TypeScript + Element Plus`。
7. 新后端技术栈为 `FastAPI`。
8. 首版数据库使用 `SQLite`，但表结构必须从第一天开始兼容 `PostgreSQL`。
9. 教师与管理员合并为统一后台，通过权限控制区分能力。
10. 系统必须预留两类智能体：课时智能体、通用悬浮智能体。
11. 页面风格必须适合初中生，支持主题切换。

## 3. 首版模块清单

## 3.1 学生端模块

| 模块 | 旧站在线证据 | 新平台是否首版必做 | 说明 |
|---|---|---|---|
| 学生登录 | `index.aspx` | 是 | 首版必须保留学生独立登录入口 |
| 学习中心 | `student/myinfo.aspx` | 是 | 首屏入口，承担课程总览与状态聚合 |
| 学案详情 | `student/showcourse.aspx` | 是 | 任务列表、课程说明、附件下载 |
| 阅读材料/说明页 | `student/description.aspx` | 是 | 已接通真实富文本阅读内容、学案导读与已读确认 |
| 通用任务页 | `student/showmission.aspx` | 是 | 首版学生任务执行主容器 |
| 代码任务页 | `student/program.aspx` | 是 | 已有真实在线 Python 活动，必须承接 |
| 作品中心 | `student/mywork.aspx` | 是 | 查看已提交作品、历史记录、下载 |
| 作品互评 | `student/myevaluate.aspx` | 是 | 旧站在线明确在用 |
| 常识测验 | `student/myquiz.aspx` / `quizrank.aspx` | 是 | 已接通真实测验首页、开始测验、提交结果与当日排行榜 |
| 打字训练 | `student/myfinger.aspx` / `allfinger.aspx` | 是 | 已接通英文 / 中文 / 拼音练习、成绩提交与班级 / 年级 / 全校排行榜 |
| 在线资源 | `student/myfile.aspx` | 是 | 已接通分类浏览、资源详情阅读与外链访问 |
| 网盘 | `student/groupshare.aspx` | 是 | 个人网盘基础版已落地，小组网盘保留为下一阶段协作能力 |
| 个人资料中心 | `profile/*` | 是 | 已落地基本信息、签到记录、密码修改，以及班级申请、相片上传、姓名/性别维护 |
| 小组 | `profile/mygroup.aspx` | 是 | 与网盘和课堂协作有关 |
| 游戏扩展 | `ztype` / `sokoban` 链接 | 否 | 首版不作为核心交付要求 |
| 聊天/AI 历史扩展 | 源码可见，线上未清晰实测 | 否 | 由新 AI 方案替代，不直接复刻旧页面 |

## 3.2 教师端模块

| 模块 | 旧站在线证据 | 新平台是否首版必做 | 说明 |
|---|---|---|---|
| 统一教职工登录 | `teacher/index.aspx` | 是 | 教师与管理员共用登录页 |
| 上课中控 | `teacher/start.aspx` | 是 | 教师高频核心页面 |
| 备课/学案管理 | `teacher/course.aspx` | 是 | 创建学案、编辑任务 |
| 作品查看与评分 | `teacher/works.aspx` | 是 | 首版必须闭环 |
| 量规 | `teacher/gauge.aspx` | 是 | 评分规则需要保留 |
| 签到 | `teacher/signin.aspx` | 是 | 旧站高频使用 |
| 学生管理 | `teacher/student.aspx` | 是 | 班级内学生维护 |
| 常识/题库 | `quiz/quiz.aspx` | 是 | 已接通题库创建、单选题维护与按班级发布测验 |
| 打字内容管理 | `teacher/typer.aspx` / `typechinese.aspx` | 是 | 已接通英文 / 中文 / 拼音内容维护与成绩概览 |
| 资源管理 | `teacher/soft.aspx` | 是 | 已接通分类维护、资源创建、发布控制与正文预览 |
| 信息/帮助 | `teacher/infomation.aspx` / `helper.aspx` | 是 | 可并入设置与帮助中心 |
| 状态页 | `teacher/systeminfo.aspx` | 否，改为新监控页 | 旧页已损坏，不做同页复刻 |

## 3.3 管理能力模块

注意：这里不是“独立管理员后台”，而是统一教职工后台中的管理员权限区。

| 模块 | 旧站在线证据 | 新平台是否首版必做 | 说明 |
|---|---|---|---|
| 学校系统设置 | `manager/setting.aspx` | 是 | 系统配置入口 |
| 班级设置 | `manager/createroom.aspx` | 是 | 班级与机房维度维护 |
| 教师管理 | `manager/teacher.aspx` | 是 | 教师账号维护 |
| 新生导入 | `manager/studentimport.aspx` | 是 | 首版必须保留 |
| 学年升班 | `manager/upgrade.aspx` | 是 | 首版必须保留 |
| 重新分班 | `manager/divide.aspx` | 是 | 可并入班级管理 |
| 备份与清理 | `manager/backup.aspx` / `clearold.aspx` | 是 | 需要转成新平台运维能力 |
| 机房座位 | `manager/seat/house.aspx` | 是 | 与课堂中控关联 |
| 收藏推荐 | `manager/copygood.aspx` | 可选首版末段 | 若时间紧可放入 Phase 2 尾部 |
| AI Provider 设置 | 用户新增要求 | 是 | 用于通用智能体和课时智能体接入 |

## 4. 推荐代码仓结构

推荐采用单仓库、前后端分目录的方式，降低后续团队接手成本。

```text
learnsite-platform/
  apps/
    web/
      src/
        api/
        assets/
        components/
        composables/
        layouts/
          auth/
          student/
          staff/
        modules/
          auth/
          public-pages/
          student-home/
          student-course/
          student-task/
          student-work/
          student-quiz/
          student-typing/
          student-resource/
          student-drive/
          student-profile/
          staff-dashboard/
          staff-classroom/
          staff-curriculum/
          staff-lesson-plan/
          staff-submission/
          staff-attendance/
          staff-student/
          staff-quiz/
          staff-resource/
          staff-typing/
          staff-admin/
          ai-center/
          settings/
        router/
        stores/
        styles/
        utils/
      public/
      index.html
      package.json
      vite.config.ts
    api/
      app/
        api/
          deps/
          v1/
            endpoints/
        core/
        db/
        domain/
          auth/
          users/
          schools/
          classes/
          curriculum/
          lesson_plans/
          classroom/
          tasks/
          submissions/
          peer_reviews/
          attendance/
          quizzes/
          typing/
          resources/
          drives/
          profiles/
          assistants/
          settings/
          imports/
        models/
        repositories/
        schemas/
        services/
        tasks/
        main.py
      alembic/
      tests/
      pyproject.toml
  docs/
  scripts/
  .env.example
  docker-compose.yml
  README.md
```

## 5. 前端实现规格

## 5.1 前端基础约定

1. 单一 Vue 应用，按角色切换布局。
2. 学生端使用更活泼的视觉语言，教师/管理员端优先效率与信息密度。
3. 所有业务页面按 `modules/` 拆分，不按“组件大杂烩”组织。
4. 数据请求统一走 `src/api/` 封装。
5. 状态管理统一用 `Pinia`。
6. 主题系统统一通过 CSS Variables 驱动。
7. 文件上传、富文本、图表、代码编辑器作为可替换基础设施，不写死在业务页中。

### 5.1.1 学案与任务富文本约定

本项已按旧站教师页的真实行为落地，参考页面如下：

1. 学案正文编辑：`teacher/courseedit.aspx?cid=*`
2. 学案任务添加入口：`teacher/courseshow.aspx?cid=*`
3. 学案活动正文编辑：`teacher/missionadd.aspx?mcid=*`

新平台统一约定：

1. 学案标题、任务标题继续使用纯文本字段，便于列表检索和排序。
2. 学案正文使用富文本 HTML 字段，字段名为 `lesson_plans.content`。
3. 任务说明使用富文本 HTML，继续存放在 `tasks.description` 中，不再把它当成纯文本 textarea 内容。
4. 教师端编辑器使用可复用富文本组件，不把编辑逻辑写死在学案页面中。
5. 教师详情页、学生学案详情页、学生任务页都必须按富文本渲染。
6. 展示端统一做 HTML 白名单清洗，防止把教师录入内容原样注入页面。
7. 富文本首版至少支持：标题、段落、加粗、列表、引用、代码块、链接、图片。
8. 学案正文为空时，允许保存；任务说明为空时也允许保存，但页面要给出“暂无补充说明”的占位文案。

## 5.2 前端路由清单

### 公共路由

| 路由 | 角色 | 说明 |
|---|---|---|
| `/login/student` | 学生 | 学生登录 |
| `/login/staff` | 教师/管理员 | 教职工登录 |
| `/register` | 学生 | 是否开放由系统设置决定 |
| `/account-recovery` | 学生 | 替代旧公开学号查询页 |
| `/rules` | 公共 | 课堂守则 |
| `/about/help` | 公共 | 帮助与平台说明 |

### 学生端路由

| 路由 | 说明 | 对应旧站 |
|---|---|---|
| `/student/home` | 学习中心首页 | `student/myinfo.aspx` |
| `/student/courses/:courseId` | 学案详情页 | `student/showcourse.aspx` |
| `/student/courses/:courseId/readings/:taskId` | 阅读材料 / 说明页 | `student/description.aspx` |
| `/student/courses/:courseId/tasks/:taskId` | 通用任务页 | `student/showmission.aspx` |
| `/student/courses/:courseId/programs/:taskId` | 代码任务页 | `student/program.aspx` |
| `/student/work` | 我的作品 | `student/mywork.aspx` |
| `/student/work/:submissionId` | 作品详情 | 下载、评分、教师评语 |
| `/student/reviews/:taskId` | 作品互评 | `student/myevaluate.aspx` |
| `/student/quiz` | 常识测验首页 | `student/myquiz.aspx` |
| `/student/quiz/rankings` | 测验排行榜 | `student/quizrank.aspx` |
| `/student/typing` | 打字训练首页 | `student/myfinger.aspx` |
| `/student/typing/rankings` | 打字排行榜 | `student/allfinger.aspx` |
| `/student/resources` | 在线资源 | `student/myfile.aspx` |
| `/student/drive` | 我的网盘 / 小组网盘 | `student/groupshare.aspx` |
| `/student/groups` | 我的分组 | `profile/mygroup.aspx` |
| `/student/profile` | 基本信息 | `profile/mychange.aspx` |
| `/student/profile/attendance` | 我的签到 | `profile/mysign.aspx` |
| `/student/profile/password` | 修改密码 | `profile/mypwd.aspx` |
| `/student/profile/class-transfer` | 修改班级 | `profile/myclass.aspx` |
| `/student/profile/photo` | 上传相片 | `profile/myphoto.aspx` |
| `/student/profile/gender` | 修改性别 | `profile/mysex.aspx` |
| `/student/profile/name` | 修改姓名 | `profile/myname.aspx` |

说明：

1. 当前已正式落地个人资料中心全量路由，含资料展示、签到、密码修改、姓名/性别维护、相片上传与转班申请。
2. `/student/profile/class-transfer` 采用“学生申请、教师/管理员审核”的链路，学生端不允许直接修改班级归属。

### 教职工端路由

| 路由 | 权限 | 说明 | 对应旧站 |
|---|---|---|---|
| `/staff/dashboard` | teacher | 工作台 | 新增聚合页 |
| `/staff/classroom` | teacher | 上课中控列表 | `teacher/start.aspx` |
| `/staff/classroom/:sessionId` | teacher | 课堂中控详情 | `teacher/start.aspx` |
| `/staff/curriculum` | teacher | 课程体系管理 | 新增核心能力 |
| `/staff/lesson-plans` | teacher | 学案列表 | `teacher/course.aspx` |
| `/staff/lesson-plans/new` | teacher | 新建学案 | `teacher/course.aspx` |
| `/staff/lesson-plans/:planId` | teacher | 学案编辑 | `teacher/courseshow.aspx` |
| `/staff/submissions` | teacher | 作品总览 | `teacher/works.aspx` |
| `/staff/submissions/:taskId` | teacher | 某任务作品评分 | `teacher/workcheck.aspx` |
| `/staff/rubrics` | teacher | 量规管理 | `teacher/gauge.aspx` |
| `/staff/attendance` | teacher | 签到管理 | `teacher/signin.aspx` |
| `/staff/students` | teacher | 学生管理 | `teacher/student.aspx` |
| `/staff/quizzes` | teacher | 常识 / 题库管理 | `quiz/quiz.aspx` |
| `/staff/typing` | teacher | 打字内容管理 | `teacher/typer.aspx` / `typechinese.aspx` |
| `/staff/resources` | teacher | 资源管理 | `teacher/soft.aspx` |
| `/staff/assistants` | teacher | AI 智能体管理 | 新增 |
| `/staff/help` | teacher | 帮助中心 | `teacher/helper.aspx` |

### 管理权限扩展路由

| 路由 | 权限 | 说明 | 对应旧站 |
|---|---|---|---|
| `/staff/admin/system` | admin | 系统设置 | `manager/setting.aspx` |
| `/staff/admin/classes` | admin | 班级管理 | `manager/createroom.aspx` |
| `/staff/admin/teachers` | admin | 教师管理 | `manager/teacher.aspx` |
| `/staff/admin/students/import` | admin | 新生导入 | `manager/studentimport.aspx` |
| `/staff/admin/promotions` | admin | 升班 / 分班 | `manager/upgrade.aspx` / `divide.aspx` |
| `/staff/admin/seats` | admin | 机房座位布局 | `manager/seat/house.aspx` |
| `/staff/admin/maintenance` | admin | 备份、清理、审计 | `backup.aspx` / `clearold.aspx` |
| `/staff/admin/ai-providers` | admin | LLM Provider 配置 | 新增 |
| `/staff/admin/theme` | admin | 学校主题配置 | 新增 |

## 6. 后端模块与 API 规格

## 6.1 API 风格约定

1. 全部使用 REST 风格 JSON API。
2. 上传类接口允许 `multipart/form-data`。
3. 下载类接口统一返回签名 URL 或文件流。
4. 不按页面命名接口，按领域命名。
5. API 统一前缀为 `/api/v1`。
6. 统一返回结构：

```json
{
  "code": "OK",
  "message": "success",
  "data": {}
}
```

## 6.2 API 分组总表

| 分组 | 主要职责 |
|---|---|
| `/api/v1/auth/*` | 登录、登出、刷新令牌、当前用户 |
| `/api/v1/users/*` | 用户基础信息 |
| `/api/v1/profiles/*` | 学生个人资料与自助修改 |
| `/api/v1/schools/*` | 学校级配置 |
| `/api/v1/classes/*` | 班级、分班、升班 |
| `/api/v1/curriculum/*` | 教材树、年级、单元、课次 |
| `/api/v1/lesson-plans/*` | 学案与课堂任务编排 |
| `/api/v1/classroom/*` | 上课中控、课堂开关、课堂状态 |
| `/api/v1/tasks/*` | 任务详情、阅读、说明、前置规则 |
| `/api/v1/submissions/*` | 作品提交、历史记录、评分 |
| `/api/v1/peer-reviews/*` | 互评投票、互评统计 |
| `/api/v1/attendance/*` | 签到会话与签到记录 |
| `/api/v1/quizzes/*` | 测验、题库、排行榜 |
| `/api/v1/typing/*` | 打字内容、成绩、排行榜 |
| `/api/v1/resources/*` | 资源中心 |
| `/api/v1/drives/*` | 个人 / 小组网盘 |
| `/api/v1/settings/*` | 系统配置、主题配置 |
| `/api/v1/assistants/*` | AI Provider、智能体、会话 |
| `/api/v1/imports/*` | 学生导入等后台任务 |
| `/api/v1/files/*` | 文件上传、下载、预览 |

## 6.3 核心接口建议

### 鉴权与当前用户

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/auth/student/login` | 学生登录 |
| `POST` | `/api/v1/auth/staff/login` | 教职工登录 |
| `POST` | `/api/v1/auth/logout` | 登出 |
| `POST` | `/api/v1/auth/refresh` | 刷新令牌 |
| `GET` | `/api/v1/auth/me` | 当前用户信息、角色、权限、主题 |

### 学生学习中心

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/lesson-plans/student/home` | 学生首页聚合数据 |
| `GET` | `/api/v1/lesson-plans/student/current` | 当前推荐学习任务 |
| `GET` | `/api/v1/lesson-plans/{plan_id}` | 学案详情 |
| `GET` | `/api/v1/tasks/{task_id}` | 任务详情 |
| `GET` | `/api/v1/tasks/{task_id}/prerequisites` | 前置任务检查 |
| `POST` | `/api/v1/tasks/{task_id}/mark-read` | 阅读任务标记已读 |

补充说明：

1. 当 `task_type = reading` 时，`GET /api/v1/tasks/{task_id}` 额外返回：
   - `course.content`：学案导读富文本
   - `task_navigation`：上一任务 / 下一任务
   - `reading_progress`：已读状态、已读时间、是否还能标记
2. 当前阅读页内容主要来自教师在任务说明中录入的富文本 HTML。
3. 附件展示将在 `task_resources` 接入后继续补齐。

### 个人资料中心

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/profiles/student/me` | 返回学生基本信息、机房座位、签到摘要与最近 20 条签到记录 |
| `POST` | `/api/v1/profiles/student/password` | 修改学生密码，校验旧密码、确认密码与重复密码 |

### 提交与互评

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/submissions/mine` | 我的作品列表 |
| `POST` | `/api/v1/tasks/{task_id}/submit` | 直接提交作品，提交即保存，教师评价前允许再次提交 |
| `PUT` | `/api/v1/tasks/{task_id}/group-draft` | 小组任务协作草稿（说明 / 代码）同步 |
| `GET` | `/api/v1/tasks/{task_id}/group-draft/history` | 小组协作草稿历史版本 |
| `GET` | `/api/v1/submissions/{submission_id}` | 作品详情 |
| `GET` | `/api/v1/peer-reviews/task/{task_id}` | 互评作品墙 |
| `POST` | `/api/v1/peer-reviews/task/{task_id}/vote` | 互评投票 |
| `GET` | `/api/v1/peer-reviews/task/{task_id}/summary` | 互评统计 |

补充说明：

1. 当前平台不再保留“保存草稿”接口。
2. 学生任务提交状态统一通过 `GET /api/v1/tasks/{task_id}` 返回。
3. 当前 `GET /api/v1/tasks/{task_id}` 已返回 `can_submit`、`submit_blocked_message` 与 `classroom_capabilities`，用于前端直接提示课堂开关拦截原因。
4. 当课堂关闭 `programming_control` 时，编程任务提交接口会返回 `409`；当课堂关闭 `group_discussion` 时，小组草稿同步与历史接口会返回 `409`。

### 测验与打字

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/quizzes/student/home` | 测验首页 |
| `POST` | `/api/v1/quizzes/start` | 开始测验 |
| `POST` | `/api/v1/quizzes/attempts/{attempt_id}/submit` | 提交测验 |
| `GET` | `/api/v1/quizzes/rankings/daily` | 当日排行榜 |
| `GET` | `/api/v1/quizzes/staff/bootstrap` | 教师端题库 / 测验页初始化 |
| `POST` | `/api/v1/quizzes/staff/banks` | 创建题库 |
| `POST` | `/api/v1/quizzes/staff/questions` | 创建题目（首版聚焦单选题） |
| `POST` | `/api/v1/quizzes/staff/quizzes` | 按班级发布测验 |
| `GET` | `/api/v1/typing/home` | 打字首页 |
| `POST` | `/api/v1/typing/sessions` | 记录打字成绩 |
| `GET` | `/api/v1/typing/rankings` | 打字排行榜 |
| `GET` | `/api/v1/typing/staff/bootstrap` | 教师端打字内容页初始化 |
| `POST` | `/api/v1/typing/staff/sets` | 创建打字练习内容 |

补充说明：

1. 当前测验首页已返回可开始测验、最近作答记录、班级榜预览与未测验名单。
2. 当前打字排行榜支持 `scope=class|grade|school` 三种范围。
3. 教师题库首版以“建题库 -> 维护单选题 -> 按班发布测验”为主闭环。
4. 教师端初始化接口 `/api/v1/quizzes/staff/bootstrap` 已支持 `quiz_keyword / quiz_class_id / quiz_status / quiz_sort_mode / quiz_page / quiz_page_size`，并返回 `quiz_list` 分页元信息。
5. 同一接口新增 `bootstrap_mode=quiz_list` 轻量模式：仅返回 `quizzes + quiz_list`，用于筛选/排序/翻页时避免反复下发全量题库题目数据。

### 网盘与资源

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/drives/me` | 我的网盘状态 |
| `POST` | `/api/v1/drives/me/files` | 上传到我的网盘 |
| `POST` | `/api/v1/drives/group/files` | 上传到小组共享网盘 |
| `GET` | `/api/v1/drives/files/{file_id}` | 下载个人网盘文件 |
| `DELETE` | `/api/v1/drives/files/{file_id}` | 删除个人网盘文件 |
| `GET` | `/api/v1/resources/student` | 学生资源列表 |
| `GET` | `/api/v1/resources/{resource_id}` | 资源详情 |
| `GET` | `/api/v1/resources/staff/bootstrap` | 教师端资源管理页初始化 |
| `POST` | `/api/v1/resources/staff/categories` | 创建资源分类 |
| `POST` | `/api/v1/resources/staff/items` | 创建资源内容 |

补充说明：

1. 当前 `GET /api/v1/drives/me` 会同时返回个人网盘与小组网盘摘要及文件列表。
2. 学生资源中心已支持分类浏览、正文阅读、同类资源推荐与外链跳转。
3. 教师资源中心已支持分类维护、资源创建、发布控制与预览。
4. 网盘接口会附带 `classroom_capabilities`，并按课堂开关实时控制 `drive` / `group_drive` 能力，返回可读的禁用原因文案。
5. 当课堂开启 `ip_lock` 且学生端请求 IP 不在白名单（含本机回环兼容）时，网盘上传 / 删除 / 下载会被拦截并返回 `403`。

### AI 学伴与 Provider

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/assistants/companion/bootstrap` | 悬浮学伴启动配置、可用 Provider、知识库与能力开关 |
| `GET` | `/api/v1/assistants/companion/context` | 按当前路由解析课程 / 学案 / 任务 / 会话上下文 |
| `POST` | `/api/v1/assistants/companion/respond` | 标准模式回复 |
| `POST` | `/api/v1/assistants/companion/respond/stream` | SSE 流式回复 |
| `GET` | `/api/v1/settings/ai-providers` | AI Provider 列表 |
| `POST` | `/api/v1/settings/ai-providers` | 新增 AI Provider |
| `PUT` | `/api/v1/settings/ai-providers/{provider_id}` | 更新 AI Provider |
| `DELETE` | `/api/v1/settings/ai-providers/{provider_id}` | 删除 AI Provider |

补充说明：

1. 通用智能体悬浮入口已统一挂载到学生端与教职工端布局。
2. 当前已支持 Provider 临时切换、知识库选择、标准 / 流式响应与“停止生成”。
3. 关闭抽屉、退出登录和组件卸载时会自动中断进行中的请求。

### 教师备课与课堂

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/curriculum/tree` | 课程体系树 |
| `POST` | `/api/v1/lesson-plans` | 创建学案 |
| `PATCH` | `/api/v1/lesson-plans/{plan_id}` | 编辑学案 |
| `POST` | `/api/v1/lesson-plans/{plan_id}/tasks` | 添加任务 |
| `PATCH` | `/api/v1/tasks/{task_id}` | 修改任务 |
| `POST` | `/api/v1/classroom/sessions` | 启动课堂 |
| `GET` | `/api/v1/classroom/sessions/{session_id}` | 课堂详情 |
| `PUT` | `/api/v1/classroom/sessions/{session_id}/switches` | 更新课堂开关 |
| `POST` | `/api/v1/classroom/sessions/{session_id}/roll-call` | 随机点名 |
| `POST` | `/api/v1/classroom/sessions/{session_id}/force-offline` | 全班下线 |

补充说明：

1. 课堂开关已统一配置并透出到会话详情，当前核心开关包括：`drive`、`group_drive`、`group_discussion`、`programming_control`、`ip_lock`。
2. 随机点名已包含近期历史（`recent_history`）与去重策略（`dedupe_window_minutes`、`dedupe_applied`），可避免短时间重复点到同一学生。
3. 学生端能力联动覆盖 `drives`、`groups`、`tasks` 三个领域，后端做强校验，前端做显式提示。

### 教师评分与学生管理

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/submissions/teacher` | 作品总览 |
| `GET` | `/api/v1/submissions/teacher/task/{task_id}` | 某任务作品列表 |
| `POST` | `/api/v1/submissions/{submission_id}/score` | 评分 |
| `POST` | `/api/v1/submissions/batch-score` | 批量评分 |
| `GET` | `/api/v1/classes/{class_id}/students` | 班级学生列表 |
| `PATCH` | `/api/v1/students/{student_id}/reset-password` | 重置学生密码 |
| `POST` | `/api/v1/classes/{class_id}/groups/rebuild` | 重新分组 |

### 管理后台

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/settings/system` | 系统设置 |
| `PATCH` | `/api/v1/settings/system` | 更新系统设置 |
| `GET` | `/api/v1/teachers` | 教师列表 |
| `POST` | `/api/v1/teachers` | 新增教师 |
| `POST` | `/api/v1/imports/students` | 导入学生 |
| `POST` | `/api/v1/classes/promotions` | 升班 |
| `GET` | `/api/v1/seats/rooms` | 机房列表 |
| `POST` | `/api/v1/seats/rooms` | 新建机房座位图 |
| `GET` | `/api/v1/settings/ai-providers` | AI Provider 列表 |
| `POST` | `/api/v1/settings/ai-providers` | 新增 AI Provider |

## 7. 数据模型与 ER 设计

## 7.1 建模原则

1. 以“领域实体”建模，不以旧页面建模。
2. SQLite 与 PostgreSQL 统一使用标准字段类型，避免数据库特有语法耦合。
3. 能结构化的字段尽量结构化，不把核心业务塞进 JSON。
4. 任务配置允许少量 JSON 扩展字段，但必须有明确基础字段。
5. 文件、资源、作品统一走文件元数据表，避免每个模块重复造轮子。

## 7.2 核心实体清单

### 身份与组织域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `users` | id, username, password_hash, display_name, user_type, status | 所有用户基础表 |
| `roles` | id, code, name | 角色表，如 `student`、`teacher`、`admin` |
| `user_roles` | user_id, role_id | 用户角色绑定 |
| `student_profiles` | user_id, student_no, grade_no, class_id, gender, photo_file_id, entry_year | 学生档案 |
| `staff_profiles` | user_id, staff_no, is_admin, title | 教师/管理员档案 |
| `schools` | id, name, short_name, theme_code | 学校信息 |
| `school_terms` | id, school_id, school_year, term_no, is_current | 学年学期 |
| `classes` | id, school_id, grade_no, class_no, class_name, head_teacher_id | 班级 |
| `class_memberships` | class_id, student_id, term_id, status | 学生班级归属 |

### 课程体系域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `curriculum_books` | id, name, subject, edition, grade_scope | 教材版本 |
| `curriculum_units` | id, book_id, term_no, unit_no, title | 单元 |
| `curriculum_lessons` | id, unit_id, lesson_no, title, summary | 课次 |
| `lesson_resources` | id, lesson_id, resource_id, sort_order | 课次默认资源 |

### 学案与任务域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `lesson_plans` | id, lesson_id, owner_staff_id, title, status, visibility | 学案 |
| `lesson_plan_classes` | plan_id, class_id | 学案发布到哪些班级 |
| `tasks` | id, plan_id, task_type, title, description, sort_order, is_required | 任务 |
| `task_read_records` | task_id, student_id, read_at | 阅读任务已读记录 |
| `task_dependencies` | task_id, depends_on_task_id | 任务前置关系 |
| `task_resources` | task_id, resource_id, relation_type | 任务附件、参考资料 |
| `task_settings` | task_id, submit_mode, allow_resubmit, peer_review_enabled, config_json | 任务行为设置 |
| `classroom_sessions` | id, plan_id, class_id, teacher_id, started_at, ended_at, status | 一次上课会话 |
| `classroom_switches` | session_id, switch_code, switch_value | 课堂开关状态 |

### 作品与评价域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `submissions` | id, task_id, student_id, submit_status, score, rubric_score, comment, submitted_at | 学生提交记录 |
| `submission_files` | submission_id, file_id, file_role | 提交附件 |
| `peer_review_votes` | task_id, reviewer_student_id, target_submission_id, score, created_at | 互评投票 |
| `rubrics` | id, owner_staff_id, title, description | 量规模板 |
| `rubric_items` | rubric_id, title, max_score, sort_order | 量规项 |
| `submission_rubric_scores` | submission_id, rubric_item_id, score, teacher_id | 分项评分 |

### 签到与课堂记录域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `attendance_sessions` | id, class_id, teacher_id, session_id, attendance_date | 某次签到 |
| `attendance_records` | attendance_session_id, student_id, status, ip_address, note | 学生签到记录 |
| `classroom_events` | id, session_id, event_type, payload_json, created_at | 课堂事件日志 |

### 测验域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `question_banks` | id, owner_staff_id, title, scope_type | 题库 |
| `questions` | id, bank_id, question_type, content, difficulty | 题目 |
| `question_options` | id, question_id, option_key, option_text, is_correct | 选项 |
| `quizzes` | id, title, source_type, class_id, status | 测验 |
| `quiz_attempts` | id, quiz_id, student_id, score, started_at, submitted_at | 学生作答 |
| `quiz_attempt_answers` | attempt_id, question_id, answer_payload, is_correct | 作答明细 |

### 打字域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `typing_sets` | id, name, typing_mode, difficulty | 打字词库 / 文章 |
| `typing_records` | id, student_id, typing_set_id, speed, accuracy, duration_sec, played_at | 打字成绩 |
| `typing_rank_snapshots` | id, scope_type, scope_id, generated_at | 排行榜快照，可选 |

### 资源与网盘域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `resources` | id, owner_staff_id, category_id, title, resource_type, summary | 学习资源 |
| `resource_categories` | id, parent_id, name, sort_order | 资源分类 |
| `files` | id, storage_backend, object_key, original_name, ext, size, mime_type, sha256 | 文件元数据 |
| `drive_spaces` | id, owner_type, owner_id, quota_mb, used_bytes | 网盘空间 |
| `drive_files` | id, drive_space_id, file_id, folder_path, visibility | 网盘文件 |

### AI 与设置域

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `ai_providers` | id, name, base_url, model_name, api_key_encrypted, is_default | LLM Provider |
| `assistants` | id, assistant_type, owner_staff_id, provider_id, name, prompt_template | 智能体配置 |
| `assistant_bindings` | assistant_id, binding_type, binding_id | 绑定课时、学案或系统范围 |
| `assistant_conversations` | id, assistant_id, user_id, session_scope, created_at | 会话 |
| `assistant_messages` | conversation_id, role, content, tokens_in, tokens_out | 消息 |
| `system_settings` | setting_key, setting_value | 系统设置 |
| `theme_settings` | scope_type, scope_id, theme_code, theme_json | 主题配置 |

## 7.3 关键关系说明

1. 一个 `curriculum_lesson` 可以有多个 `lesson_plans`。
2. 一个 `lesson_plan` 可以发布给多个班级。
3. 一个 `lesson_plan` 下有多个 `tasks`。
4. 一个 `task` 可以依赖多个前置任务。
5. 一个 `task` 可以产生多个 `submissions`。
6. 一个 `submission` 可以关联多个文件。
7. 一个 `task` 可以开启或关闭互评。
8. 一个教师创建的课时智能体可以绑定到某一个 `lesson_plan` 或某一个 `curriculum_lesson`。

## 8. 统一任务模型规格

## 8.1 首版必须支持的任务类型

| 任务类型 | 说明 | 线上证据 |
|---|---|---|
| `reading` | 阅读材料 / 活动说明 / 已读确认 | `description.aspx` |
| `upload_file` | 文件上传任务 | `showmission.aspx` |
| `upload_image` | 截图 / 图片上传任务 | `showmission.aspx` |
| `code_python` | Python 代码任务 | `program.aspx?lid=40` |
| `external_link` | 跳转外站完成任务 | 数字素养测评、心理测评 |
| `peer_review` | 作品互评 | `myevaluate.aspx` |
| `quiz` | 常识测验 | `myquiz.aspx` |
| `typing` | 打字训练任务 | `myfinger.aspx` |
| `self_evaluation` | 自评任务 | `showmission.aspx?lid=59` |

## 8.2 任务统一字段

每种任务都至少拥有以下基础字段：

1. 标题
2. 任务类型
3. 所属学案
4. 排序号
5. 是否必做
6. 开放时间
7. 截止时间
8. 是否允许重新提交
9. 是否启用互评
10. 前置任务
11. 附件资源
12. 扩展配置 `config_json`

## 8.3 任务扩展配置示例

### `upload_image`

```json
{
  "allowed_exts": ["png", "jpg", "jpeg"],
  "max_file_mb": 20,
  "submit_label": "作品提交",
  "need_preview": true
}
```

### `code_python`

```json
{
  "editor_mode": "python",
  "run_enabled": true,
  "save_enabled": true,
  "starter_code": "",
  "reference_output": ""
}
```

### `external_link`

```json
{
  "target_url": "https://example.com",
  "open_in_new_tab": true,
  "submit_mode": "screenshot"
}
```

## 9. 权限模型

## 9.1 角色定义

| 角色 | 说明 |
|---|---|
| `student` | 学生端使用者 |
| `teacher` | 普通教师 |
| `admin` | 拥有管理员权限的教师 |
| `system_admin` | 可选，仅用于平台部署与全局维护 |

## 9.2 权限分层

| 层级 | 内容 |
|---|---|
| 页面权限 | 是否可进入某个路由 |
| 数据权限 | 是否可查看某个班级 / 学案 / 作品 |
| 操作权限 | 是否可创建、编辑、删除、导入、评分 |
| 系统权限 | 是否可配置 AI Provider、系统主题、系统设置 |

## 9.3 首版建议权限矩阵

| 能力 | 学生 | 教师 | 管理员 |
|---|---|---|---|
| 登录学生端 | 是 | 否 | 否 |
| 查看学习中心 | 是 | 否 | 否 |
| 提交作品 | 是 | 否 | 否 |
| 互评投票 | 是 | 否 | 否 |
| 进入教师工作台 | 否 | 是 | 是 |
| 创建学案 | 否 | 是 | 是 |
| 启动课堂 | 否 | 是 | 是 |
| 评分 | 否 | 是 | 是 |
| 管理本班学生 | 否 | 是 | 是 |
| 管理教师账号 | 否 | 否 | 是 |
| 导入学生 | 否 | 否 | 是 |
| 系统设置 | 否 | 否 | 是 |
| AI Provider 配置 | 否 | 否 | 是 |

## 10. AI 实施规格

## 10.1 通用智能体

1. 入口形式：浏览器悬浮按钮。
2. 可见范围：默认学生端和教职工端都可见，但最终以系统设置开关控制。
3. 后台配置：
   - provider 名称
   - `base_url`
   - `api_key`
   - 默认模型
   - 温度、超时、并发限制
4. 接口兼容：按 OpenAI Compatible Chat Completions 方式设计。
5. 安全要求：
   - `api_key` 必须加密存储
   - 会话日志可配置是否保存
   - 学生端默认不开启系统级工具调用

当前已落地补充：

1. 学生端与教职工端布局都已挂载统一悬浮入口。
2. 支持“通用模式 / 当前课程学案模式”切换，并可自动识别课程、学案、任务和课堂会话上下文。
3. 支持 Provider 临时切换、知识库选择、标准响应与 SSE 流式响应。
4. 支持“停止生成”，并在关闭抽屉、退出登录、组件卸载时自动中止请求。
5. 支持图片、多模态附件与文本附件的轻量输入增强。

## 10.2 课时智能体

1. 由教师创建。
2. 必须能绑定到：
   - 某一课
   - 某一份学案
   - 某一个班级课堂会话
3. 教师可配置：
   - 智能体名称
   - 系统提示词
   - 可访问的教材资料
   - 是否仅教师可见
   - 是否学生可提问
4. 首版建议能力：
   - 解释当前课内容
   - 回答任务说明
   - 给学生提示但不直接给答案
   - 给教师备课建议

## 11. 存储与部署规格

## 11.1 文件存储

首版建议采用“抽象接口 + 本地磁盘实现”的方式：

1. 开发 / 首版部署：本地磁盘。
2. 文件元数据全部写入 `files` 表。
3. 存储实现通过 `StorageService` 抽象隔离。
4. 后续若迁移 MinIO / OSS，只替换存储实现，不改业务层接口。

## 11.2 部署环境建议

| 环境 | 建议 |
|---|---|
| 应用服务器 | Windows 或 Linux 均可，优先 Linux |
| 前端 | Nginx 静态托管 |
| 后端 | Uvicorn / Gunicorn + FastAPI |
| 数据库 | SQLite 首版，后续 PostgreSQL |
| 文件存储 | 本地磁盘 |
| 反向代理 | Nginx |

## 12. 分阶段开发计划

## 12.1 Phase 0：项目骨架

目标：让前后端仓架、权限、主题、基础表跑起来。

交付项：

1. Vue3 + Element Plus 基础壳层
2. FastAPI 基础工程
3. 登录与角色权限
4. 系统设置表
5. 主题系统
6. 基础用户 / 班级 / 学年学期表

## 12.2 Phase 1：学生学习闭环

目标：先打通学生主链路。

交付项：

1. 学习中心首页
2. 课程体系树
3. 学案详情
4. 阅读任务
5. 上传任务
6. 代码任务基础版
7. 我的作品
8. 作品互评
9. 个人资料中心（首批：基本信息、签到记录、密码修改）
10. 网盘基础版（个人网盘容量统计、文件列表、上传、下载、删除）

## 12.3 Phase 2：教师教学闭环

目标：打通教师从备课到评分的主链路。

交付项：

1. 学案管理
2. 任务编排
3. 课堂中控
4. 评分与量规
5. 签到
6. 学生管理
7. 题库与测验
8. 打字内容管理

## 12.4 Phase 3：管理员能力与 AI

目标：让平台具备学校级运维能力。

交付项：

1. 教师管理
2. 新生导入
3. 升班 / 分班
4. 机房座位图
5. 系统设置
6. AI Provider 设置
7. 通用智能体
8. 课时智能体

## 12.5 Phase 4：增强与上线准备

目标：补齐质量与运营能力。

交付项：

1. 完整权限审计
2. 文件清理策略
3. 监控与日志
4. 数据库迁移脚本
5. 部署脚本
6. 验收测试脚本

## 13. 测试与验收重点

## 13.1 必测业务路径

1. 学生登录后进入学习中心。
2. 学生打开学案并进入任务。
3. 学生上传作品并在作品中心看到记录。
4. 学生进入互评并完成一次投票。
5. 学生打开网盘并上传文件。
6. 教师创建学案并添加任务。
7. 教师启动课堂并切换课堂开关。
8. 教师查看作品并评分。
9. 教师查看签到记录。
10. 管理员导入学生并完成升班。
11. 管理员配置 AI Provider 后，通用智能体可正常访问模型。

## 13.2 首版上线前必须特别检查的问题

1. 不得再出现公开学号泄露页。
2. 不得再出现心理测评账号密码明文展示。
3. 教师 / 管理员权限边界必须可审计。
4. 上传接口必须限制类型、大小与权限。
5. SQLite 数据必须能通过 Alembic 迁移到 PostgreSQL。

## 14. 交付建议

给后续团队的建议是：

1. 先以这份文档锁定边界，再做项目初始化。
2. 任何需求新增，都要先判断是不是“线上明确在用”。
3. 不要直接照搬旧 aspx 页名作为新系统模块边界。
4. 尤其不要把旧库结构直接映射成新表结构。
5. 所有看起来“只是旧站的小按钮”的能力，都要先判断它背后是不是课堂控制、权限或协作机制。

## 15. 结论

如果只用一句话概括这套实施规格：

这不是“把一个老网站翻新成 Vue + FastAPI”，而是要把一个已经在线运行多年的信息科技课堂工作台，拆成可维护的课程体系、学案系统、任务引擎、课堂中控、作品评价、学生工作台和 AI 能力中心，再用现代技术栈重新组装回来。
## 18. 2026-04-01 增量落地说明

本次已完成以下落地：

1. `/student/groups`
   - 不再是占位页
   - 已改为真实小组页
   - 对应接口：`GET /api/v1/groups/me`
2. `/student/drive`
   - 保留个人网盘
   - 已接通小组共享网盘
   - 组内成员共享同一文件空间
3. 数据模型新增：
   - `student_groups`
   - `student_group_members`
4. 网盘空间复用：
   - 个人空间：`owner_type = student`
   - 小组空间：`owner_type = group`
5. 小组网盘上传接口新增：
   - `POST /api/v1/drives/group/files`
6. 文件权限规则：
   - 学生可访问自己的个人网盘文件
   - 学生可访问自己所在小组的共享文件
   - 无权限时返回 `403`

当前本地种子数据口径：

1. 每个班会自动生成若干小组。
2. 小组 1 的第一位学生默认为组长。
3. 小组页会联动：
   - 座位绑定
   - 今日签到记录
   - 小组共享网盘概览

## 19. 2026-04-03 测验 / 打字 / 资源 / 通用智能体落地说明

本次同步写实以下当前状态：

1. 测验 / 题库
   - 学生端已接通测验首页、开始测验、提交测验、结果反馈与当日排行榜。
   - 教师端已接通题库管理、单选题维护与按班级发布测验，并补齐题库/题目/测验的编辑与删除保护。
   - 教师测验列表已升级为服务端筛选/排序/分页（按“更新时间 / 参与人数”），并支持筛选条件与分页偏好记忆，避免前端全量计算。
   - 教师测验列表筛选/分页刷新默认走 `bootstrap_mode=quiz_list` 轻量响应，减少题库大数据量场景下的重复传输与前端重算。
   - 教师测验总览卡“已发布测验”口径已改为 `quiz_list.overall_total`（可见总量），避免分页后误显示成“当前页条数”。
   - 轻量刷新 loading 已收敛到测验表格区域，筛选区与左侧编辑区可保持连续操作。
   - 后端已正式挂接 `/api/v1/quizzes/*`。
2. 打字训练
   - 学生端已接通练习内容、成绩提交与班级 / 年级 / 全校排行榜。
   - 教师端已接通打字内容维护与成绩概览。
   - 后端已正式挂接 `/api/v1/typing/*`。
3. 资源中心
   - 学生端已接通分类浏览、详情阅读、同类资源推荐与外链访问。
   - 教师端已接通分类维护、资源创建、发布控制与正文预览。
   - 后端已正式挂接 `/api/v1/resources/*`。
4. 通用智能体悬浮入口
   - 学生端与教职工端布局已统一挂载悬浮入口。
   - 已支持 Provider 选择联动、标准响应、流式响应、知识库切换与停止生成。
   - 管理端 Provider 配置已与悬浮入口形成闭环。

## 20. 2026-04-03 课堂开关联动与任务聚焦落地说明

本次补齐了“课堂内容聚焦与教学操作细节”相关能力：

1. 课堂开关联动（统一配置 + 前后端生效）
   - 开关统一收敛到课堂会话配置：`drive`、`group_drive`、`group_discussion`、`programming_control`、`ip_lock`。
   - 后端在 `drives` / `groups` / `tasks` 关键接口执行能力校验，命中时返回明确的 `403` / `409` 与可读文案。
   - 学生端页面统一消费 `classroom_capabilities`，在按钮禁用态、提示条与提交拦截中保持一致反馈。
2. 随机点名历史与去重
   - 点名结果新增近期历史列表，课堂页可直接回看“最近点名记录”。
   - 点名策略新增短时间去重窗口，命中时返回 `dedupe_applied = true`，优先避开刚被点到的学生。
3. 课堂任务聚焦卡与评分页联动
   - 课堂任务聚焦卡已直接显示“未交 / 已交 / 已评”三段进度条，减少教师在多个页面间来回切换。
   - 任务卡新增快捷入口“看未交 / 看待评 / 查看提交”，通过 `/staff/submissions/:taskId?focus=...` 直达评分页筛选状态。
   - 评分页已支持 `focus=pending_review` 与 `focus=pending_submit` 的提示与默认筛选行为。
