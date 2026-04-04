# 学生作品提交流程说明

更新时间：2026-04-02  
状态：ACTIVE  
适用范围：学生任务页、作品中心、作品详情页、后端提交接口、SQLite 本地数据

## 1. 业务规则

当前新平台已经明确采用以下提交规则：

1. 个人任务不保留服务端草稿，学生点击“提交作品”后，当前内容立即视为正式保存。
2. 小组共同提交任务新增“共享草稿”，组员可在正式提交前轮流同步说明或代码。
3. 小组编程任务额外保留“本地浏览器草稿”，优先保护当前设备尚未提交的编辑内容。
4. 教师尚未评价前，学生可以再次进入同一任务重新提交。
5. 再次提交时，会覆盖本次任务的当前提交记录，而不是新建多条正式提交。
6. 如果本次重新提交时重新选择了附件，则新附件替换旧附件；未重新选择时保留已经保存附件。
7. 小组任务正式提交后，会把本次说明与代码同步回共享草稿，保证组内看到的是最新版本。
8. 一旦教师已经评价，学生不可再次正式提交，也不可继续修改小组共享草稿。

## 2. 前端页面行为

### 2.1 课程详情页

文件：`apps/web/src/modules/student-course/CourseDetailPage.vue`

当前行为：

1. 课程详情页展示真实任务列表。
2. 上传类任务可直接点击“进入任务”进入学生任务页。
3. 阅读类任务继续走阅读页占位路由。

### 2.2 学生任务页

文件：`apps/web/src/modules/student-task/TaskPage.vue`

本轮补充：
1. 当前任务页新增“当前课题推荐作品展示”区域。
2. 教师评分为 `G` 且分数为 `120` 的作品，会自动进入该任务的推荐展示。
3. 推荐展示支持直接查看图片、文字、PDF 类附件。
4. 其他学生可以在已登录状态下查看“被推荐作品”的附件内容，但仍不能访问普通未推荐作品的附件。

当前行为：

1. 真实读取 `/api/v1/tasks/{task_id}`。
2. 展示任务名称、所属课程、单元、课次、任务说明。
3. 新增“作品互评”入口，学生可直接从任务页进入当前任务的互评页。
3. 展示当前提交状态：
   - 未提交
   - 待教师评价
   - 已评价
4. 作品说明已改为富文本编辑，支持标题、列表、加粗、链接和图片。
5. 支持选择多个附件。
6. 若已有已保存附件，则在未重新选新附件时继续展示旧附件。
7. 点击提交后调用真实提交接口。
8. 小组共同提交任务会展示“共享草稿”卡片，支持同步、恢复、刷新。
9. 小组共同提交任务新增“历史版本”按钮，可查看共享草稿历史并对比差异。
10. 上传类小组任务当前共享的是“作品说明”草稿，附件仍在正式提交时处理。
11. 编程类小组任务会同时展示“共享草稿”和“本地草稿”状态，避免覆盖个人尚未提交内容。
12. 教师评价后，提交按钮自动禁用。

### 2.3 作品互评页

文件：`apps/web/src/modules/student-review/PeerReviewPage.vue`

当前行为：

1. 真实读取 `/api/v1/peer-reviews/task/{task_id}`。
2. 展示作品总数、可投次数、我的得票、互评得分。
3. 若当前学生尚未提交本任务作品，会提示先回任务页提交。
4. 已提交作品的学生可查看当前任务的作品墙。
5. 学生不能给自己的作品投票。
6. 学生不能重复给同一份作品投票。
7. 推荐投票后，作品得票和互评得分即时刷新。
8. 互评页内支持直接展示图片、文字、PDF 附件。
9. 互评附件通过独立接口授权，不影响普通作品附件的访问边界。

### 2.4 我的作品

文件：`apps/web/src/modules/student-work/WorkListPage.vue`

当前行为：

1. 不再显示草稿统计。
2. 改为展示：
   - 作品总数
   - 已评价
   - 待教师评价
   - 可再次提交
3. 列表中如果作品仍可再次提交，则直接提供“再次提交”入口。

### 2.5 作品详情页

文件：`apps/web/src/modules/student-work/WorkDetailPage.vue`

当前行为：

1. 展示作品当前状态、教师评分、互评得分、更新时间。
2. 展示作品说明、教师评语和附件清单。
3. 如果教师未评价，则可直接从详情页回到任务页再次提交。

## 3. 后端接口说明

### 3.1 任务详情

接口：`GET /api/v1/tasks/{task_id}`

新增返回：
1. `recommended_showcase.count`
2. `recommended_showcase.items`
3. `current_submission.is_recommended`
4. `group_collaboration`
5. `group_draft`

`recommended_showcase.items` 当前包含：
1. 推荐作品提交 ID
2. 学生姓名、学号、班级
3. 分数、作品说明、教师评语
4. 推荐附件列表，以及 `mime_type` / `previewable` 信息

用途：

1. 返回任务标题、类型、说明。
2. 返回所属课程、单元、课次信息。
3. 返回当前学生在该任务下的提交记录。
4. 返回当前任务是否还能继续提交。

关键字段：

1. `submission_policy.direct_submit = true`
2. `submission_policy.allow_resubmit_until_reviewed = true`
3. `submission_policy.draft_enabled = true/false`
4. `group_draft.submission_note`
5. `group_draft.source_code`
6. `group_draft.version_no`
7. `group_draft.updated_by_name`
8. `group_draft.updated_by_student_no`
9. `current_submission`
10. `can_submit`

### 3.2 小组共享草稿

接口：`PUT /api/v1/tasks/{task_id}/group-draft`

请求格式：`application/json`

字段：

1. `submission_note`
2. `source_code`

处理规则：

1. 仅 `submission_scope = group` 的任务可调用。
2. 仅当前任务所属小组成员可写入共享草稿。
3. 上传类任务主要使用 `submission_note`，编程类任务可同时同步 `submission_note + source_code`。
4. 当说明和代码都为空时，接口会清空当前小组草稿。
5. 每次成功保存都会递增 `version_no` 并记录最近更新人。
6. 若该任务已被教师评价，接口返回 `409`，禁止继续编辑。

### 3.3 小组共享草稿历史

接口：`GET /api/v1/tasks/{task_id}/group-draft/history`

返回字段：

1. `task_id`
2. `group_id`
3. `items[].version_no`
4. `items[].previous_version_no`
5. `items[].event_type`
6. `items[].event_label`
7. `items[].submission_note`
8. `items[].source_code`
9. `items[].updated_by_name`
10. `items[].updated_by_student_no`

处理规则：

1. 仅 `submission_scope = group` 的任务可调用。
2. 仅当前任务所属小组成员可查看本组共享草稿历史。
3. 会保留“同步草稿”“清空草稿”“正式提交回写”三类历史快照。
4. 草稿被清空后，后续版本号仍保持连续递增，不回退。
5. 前端在弹窗内默认对比当前版本与上一版本差异。

### 3.4 学生提交作品

接口：`POST /api/v1/tasks/{task_id}/submit`

请求格式：`multipart/form-data`

字段：

1. `submission_note`
2. `draft_source_code`
3. `files`

处理规则：

1. `submission_note` 当前允许提交富文本 HTML 内容。
2. 若当前学生该任务没有提交记录，则创建一条新的 `submissions` 记录。
2. 若已有提交记录且状态不是 `reviewed`，则更新原记录。
3. 若已有提交记录且状态是 `reviewed`，返回 `409`。
4. 若重新选择了附件，则替换当前附件。
5. 若未重新选择附件，则保留当前附件。
6. 小组共同提交任务在正式提交后，会把当前 `submission_note` / `draft_source_code` 同步回 `group_draft`。

### 3.5 我的作品列表

接口：`GET /api/v1/submissions/mine`

调整点：

1. 删除 `draft_count`。
2. 新增 `resubmittable_count`。
3. 每条记录新增 `can_resubmit`。

### 3.6 作品详情

接口：`GET /api/v1/submissions/{submission_id}`

调整点：

1. `submission.can_resubmit` 现在根据是否已评价动态计算。
2. 已评价作品返回 `false`。
3. 未评价作品返回 `true`。

### 3.7 作品互评

接口：

1. `GET /api/v1/peer-reviews/task/{task_id}`
2. `GET /api/v1/peer-reviews/task/{task_id}/summary`
3. `POST /api/v1/peer-reviews/task/{task_id}/vote`
4. `GET /api/v1/peer-reviews/files/{file_id}`

当前规则：

1. 只有已经提交当前任务作品的学生，才能进入完整作品墙并参与互评。
2. 互评票数上限按 `min(3, 当前可互评作品数)` 计算。
3. 当前实现中，一次推荐记为 `1` 分，并累计到 `Submission.peer_review_score`。
4. 互评附件走独立接口授权，避免放宽普通作品附件的访问范围。
5. 普通 `/api/v1/submissions/files/{file_id}` 仍只允许：
   - 学生本人访问自己的附件
   - 已被教师推荐的作品附件被其他登录学生访问

## 4. 数据与存储规则

### 4.1 数据库状态

涉及模型：

1. `Submission`
2. `SubmissionFile`
3. `PeerReviewVote`
4. `GroupTaskDraft`

当前状态约束：

1. `Submission.submit_status` 只保留：
   - `submitted`
   - `reviewed`
2. `SubmissionFile.file_role` 当前统一使用：
   - `attachment`

### 4.2 旧数据兼容

文件：`apps/api/app/db/init_db.py`

启动时已加入数据归一化逻辑：

1. 旧的 `draft` 状态会自动转换为 `submitted`。
2. 旧的 `draft` 文件角色会自动转换为 `attachment`。
3. 若旧数据缺少 `submitted_at`，会自动补齐。

这意味着：

1. 旧本地 SQLite 数据库可以直接继续使用。
2. 不需要先手工删除数据库才能运行当前版本。

### 4.3 本地文件存储

当前附件采用本地磁盘存储，根目录来自：

1. 配置项 `LEARNSITE_STORAGE_ROOT`
2. 默认值：`./storage`

实际提交附件存放位置：

1. `storage/submissions/{submission_id}/`

## 5. 关键文件清单

后端：

1. `apps/api/app/api/v1/endpoints/tasks.py`
2. `apps/api/app/api/v1/endpoints/submissions.py`
3. `apps/api/app/api/v1/endpoints/peer_reviews.py`
4. `apps/api/app/api/v1/endpoints/lesson_plans.py`
5. `apps/api/app/models/entities.py`
6. `apps/api/app/db/init_db.py`
7. `apps/api/app/core/config.py`

前端：

1. `apps/web/src/api/http.ts`
2. `apps/web/src/modules/student-course/CourseDetailPage.vue`
3. `apps/web/src/modules/student-task/TaskPage.vue`
4. `apps/web/src/modules/student-task/ProgramTaskPage.vue`
5. `apps/web/src/modules/student-task/components/GroupDraftHistoryDialog.vue`
6. `apps/web/src/modules/student-review/PeerReviewPage.vue`
7. `apps/web/src/components/RecommendedWorksShowcase.vue`
8. `apps/web/src/modules/student-work/WorkListPage.vue`
9. `apps/web/src/modules/student-work/WorkDetailPage.vue`

测试：

1. `apps/api/tests/test_smoke.py`

## 6. 已完成验证

本次变更已完成以下验证：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
2. `npm run typecheck:web`
3. `npm run build:web`

当前结果：

1. 后端测试 `26 passed`
2. 前端类型检查通过
3. 前端构建通过

## 7. 手工联调建议

建议本地联调顺序如下：

1. 执行 `npm run dev:up`
2. 打开 `http://localhost:5173`
3. 使用同组学生账号 `70101 / 12345` 与 `70102 / 12345` 分别登录
4. 进入包含小组任务的课程
5. 打开小组上传任务或小组编程任务
6. 由第一个学生点击“同步到小组草稿”
7. 切换到第二个学生刷新并恢复共享草稿，继续补充内容
8. 由任一组员正式提交
9. 另一位组员重新打开任务，确认看到的是同一份提交与最新共享草稿
10. 如需继续验证，再进入“作品互评”或“我的作品”查看联动状态

## 8. 后续建议

下一步适合继续推进的内容：

1. 小组共享草稿版本回滚或教师点评
2. 小组提交页与共享网盘、操作日志之间的快捷联动
3. 更细的多模态协作输入与版本标记
