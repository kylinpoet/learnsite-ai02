# 教学闭环操作说明

更新时间：2026-03-31  
状态：ACTIVE  
适用范围：教师创建学案、发布任务、开课推送、学生进入课程学习与提交、教师评分反馈

## 1. 目标

这一轮实现的目标不是单点页面可用，而是把下面这条主链路打通：

1. 教师登录后台
2. 教师创建学案并配置任务
3. 教师发布学案
4. 教师开课并推送给班级
5. 学生在首页看到新课程
6. 学生进入课程学习并提交作业
7. 教师进入评分中心查看并评分
8. 学生在作品详情页看到教师反馈

## 2. 测试账号

教师账号：

1. `kylin / 222221`
2. `admin / 222221`

学生账号：

1. `240101 / 12345`
2. `240102 / 12345`

当前默认班级：

1. `8.1班`

## 3. 教师操作流程

### 3.1 创建学案

页面：

1. `/staff/lesson-plans`

当前能力：

1. 可新建学案
2. 可绑定课程体系中的具体课次
3. 可设置发布日期
4. 可配置多个任务
5. 支持任务类型：
   - `reading`
   - `upload_image`
   - `programming`
6. 可先保存为草稿

对应接口：

1. `GET /api/v1/lesson-plans/staff/list`
2. `GET /api/v1/lesson-plans/staff/{plan_id}`
3. `POST /api/v1/lesson-plans/staff`
4. `PUT /api/v1/lesson-plans/staff/{plan_id}`

### 3.2 发布学案

页面：

1. `/staff/lesson-plans`

当前能力：

1. 草稿学案可以直接发布
2. 发布后才允许进入开课流程

对应接口：

1. `POST /api/v1/lesson-plans/staff/{plan_id}/publish`

### 3.3 开课

页面：

1. `/staff/classroom`

当前能力：

1. 可从“已发布学案”里选择一份学案
2. 可选择班级
3. 点击“开始上课”后，系统会为该班学生创建课程进度
4. 同时生成课堂会话记录
5. 开课后学案状态会更新为 `active`

对应接口：

1. `GET /api/v1/classroom/launchpad`
2. `POST /api/v1/classroom/sessions`
3. `GET /api/v1/classroom/sessions/{session_id}`

## 4. 学生操作流程

### 4.1 进入学习中心

页面：

1. `/student/home`

当前行为：

1. 开课后，学生首页的“未学学案”会出现新学案
2. 学生可直接点击进入课程

对应接口：

1. `GET /api/v1/lesson-plans/student/home`

### 4.2 进入课程与任务

页面：

1. `/student/courses/:courseId`
2. `/student/courses/:courseId/tasks/:taskId`
3. `/student/courses/:courseId/programs/:taskId`
4. `/student/courses/:courseId/readings/:taskId`

当前行为：

1. 课程页会按任务类型自动跳转到对应任务页
2. 阅读任务进入阅读页
3. 上传任务进入普通提交页
4. 编程任务进入编程任务页

### 4.3 提交作业

页面：

1. `/student/courses/:courseId/tasks/:taskId`

当前行为：

1. 学生填写作品说明
2. 学生上传附件
3. 提交后立即保存
4. 教师评分前允许再次提交
5. 教师评分后不允许再次提交

对应接口：

1. `GET /api/v1/tasks/{task_id}`
2. `POST /api/v1/tasks/{task_id}/submit`

## 5. 教师评分反馈流程

页面：

1. `/staff/submissions`
2. `/staff/submissions/:taskId`

当前行为：

1. 教师可以看到已有提交的任务
2. 教师进入任务评分页后可查看学生作品
3. 支持图片、文字、PDF 直接预览
4. 支持评分与教师评语
5. 支持保存后继续下一份作品
6. 学生评分结果会回写到作品详情页

对应接口：

1. `GET /api/v1/submissions/teacher`
2. `GET /api/v1/submissions/teacher/task/{task_id}`
3. `POST /api/v1/submissions/{submission_id}/score`
4. `GET /api/v1/submissions/{submission_id}`

## 6. 一轮手工联调建议

建议本地按下面顺序操作：

1. 执行 `npm run dev:up`
2. 教师登录 `http://localhost:5173/login/staff`
3. 进入“学案管理”
4. 新建一份学案，并至少配置一个上传任务
5. 发布学案
6. 点击“去开课”或进入“上课中控”
7. 选择班级并开始上课
8. 学生登录 `http://localhost:5173/login/student`
9. 在学习中心进入刚开课的课程
10. 进入上传任务并提交作品
11. 教师回到“作品评分”
12. 找到对应任务并给学生评分
13. 学生进入“我的作品”或作品详情，确认教师评分与评语已更新

## 7. 本轮涉及的关键文件

后端：

1. `apps/api/app/api/v1/endpoints/lesson_plans.py`
2. `apps/api/app/api/v1/endpoints/classroom.py`
3. `apps/api/app/api/v1/endpoints/tasks.py`
4. `apps/api/app/api/v1/endpoints/submissions.py`
5. `apps/api/app/models/entities.py`

前端：

1. `apps/web/src/modules/staff-lesson-plan/LessonPlanPage.vue`
2. `apps/web/src/modules/staff-classroom/ClassroomPage.vue`
3. `apps/web/src/modules/student-course/CourseDetailPage.vue`
4. `apps/web/src/modules/student-task/TaskPage.vue`
5. `apps/web/src/modules/staff-submission/SubmissionTaskPage.vue`

测试：

1. `apps/api/tests/test_smoke.py`

## 8. 已完成验证

本轮已经完成以下验证：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
2. `npm run check:api`
3. `npm run typecheck:web`
4. `npm run build:web`

当前结果：

1. 后端测试 `28 passed`
2. 后端编译检查通过
3. 前端类型检查通过
4. 前端构建通过
