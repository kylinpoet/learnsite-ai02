# 学生阅读任务流程说明

更新时间：2026-04-01  
状态：ACTIVE  
适用范围：学生阅读任务页、阅读已读确认、学案导读展示、后端阅读状态接口

## 1. 业务目标

当前新平台已把旧站 `student/description.aspx` 从占位页升级为真实业务页，承接以下能力：

1. 展示教师在任务说明中录入的富文本阅读内容。
2. 展示当前学案的导读内容，帮助学生理解本课次上下文。
3. 支持“已读确认”，记录学生完成阅读的时间。
4. 支持按任务顺序在上一任务、下一任务之间跳转。
5. 不生成作品提交记录，不影响上传任务与评分链路。

## 2. 前端页面行为

文件：`apps/web/src/modules/student-reading/ReadingTaskPage.vue`

当前行为：

1. 学生从课程详情页点击阅读任务后，进入 `/student/courses/:courseId/readings/:taskId`。
2. 页面真实调用 `GET /api/v1/tasks/{task_id}`，不再使用占位组件。
3. 页面展示：
   - 阅读任务标题
   - 所属教材、单元、课次
   - 阅读内容富文本
   - 学案导读富文本
   - 任务资料卡片与外链资源入口
   - 当前已读状态
   - 已读时间
   - 上一任务 / 下一任务入口
4. 学生点击“标记为已读”后，调用 `POST /api/v1/tasks/{task_id}/mark-read`。
5. 已读后按钮变为完成状态，不再重复写入新记录。
6. 如果当前任务不是阅读任务，前端会自动跳转到对应的上传任务页或编程任务页。

## 3. 后端接口说明

### 3.1 任务详情

接口：`GET /api/v1/tasks/{task_id}`

阅读任务场景下新增返回字段：

1. `course.book_title`
2. `course.content`
3. `task_navigation.previous_task`
4. `task_navigation.next_task`
5. `reading_progress.is_read`
6. `reading_progress.read_at`
7. `reading_progress.can_mark_read`
8. `resources`

字段说明：

1. `course.content` 来自当前学案的富文本导读。
2. `task_navigation` 用于在同一学案任务序列中跳转。
3. `reading_progress` 用于驱动已读状态展示和按钮禁用。

### 3.2 阅读已读确认

接口：`POST /api/v1/tasks/{task_id}/mark-read`

处理规则：

1. 只有 `task_type = reading` 的任务允许调用。
2. 首次调用会写入一条 `task_read_records` 记录。
3. 重复调用不会重复创建记录。
4. 返回更新后的任务详情载荷，便于前端直接刷新页面状态。

## 4. 数据模型

新增数据表：`task_read_records`

字段：

1. `id`
2. `task_id`
3. `student_id`
4. `read_at`

约束：

1. `(task_id, student_id)` 唯一，保证每个学生对同一阅读任务只保留一条已读记录。

## 5. 关键文件清单

后端：

1. `apps/api/app/models/entities.py`
2. `apps/api/app/models/__init__.py`
3. `apps/api/app/api/v1/endpoints/tasks.py`
4. `apps/api/tests/test_smoke.py`

前端：

1. `apps/web/src/modules/student-reading/ReadingTaskPage.vue`
2. `apps/web/src/router/index.ts`
3. `apps/web/src/modules/student-course/CourseDetailPage.vue`
4. `apps/web/src/components/RichTextContent.vue`

## 6. 已完成验证

本次变更已完成以下验证：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
2. `npm run typecheck:web`
3. `npm run build:web`

当前结果：

1. 后端冒烟测试 `60 passed`
2. 前端类型检查通过
3. 前端生产构建通过

## 7. 本轮补齐项

本轮已补齐以下阅读任务增强能力：

1. 教师侧课堂会话详情已支持阅读任务的“未读 / 已读”完成情况统计。
2. `task_resources` 已接入学生阅读页，支持资料卡片展示与外链资源入口。
3. 阅读任务完成后会参与学案整体进度重算，并与其他任务提交流程共同决定是否完成学案。
