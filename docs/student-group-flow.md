# 学生小组页流程说明
更新时间：2026-04-02  
状态：ACTIVE  
适用范围：学生小组页、分组数据展示、小组签到状态、小组共享网盘概览、小组课堂动态、小组操作日志

## 1. 目标

当前 `/student/groups` 不再是占位页，而是接通了真实小组数据，目标如下：

1. 展示学生当前所在小组。
2. 展示组长、组员和成员身份。
3. 展示成员的机房座位与今日签到状态。
4. 展示小组共享网盘容量与最近文件。
5. 展示小组近期课堂动态，包括签到、共享文件上传和共同提交结果。
6. 为学生提供跳转到小组网盘的真实入口。

## 2. 页面入口

路由：

1. `/student/groups`

来源：

1. 学生侧导航栏“小组协作”
2. 小组网盘不可用时的引导按钮

## 3. 页面结构

文件：`apps/web/src/modules/student-group/GroupPage.vue`

页面结构：

1. 顶部 Hero 区：
   - 小组标题
   - 页面说明
   - 刷新按钮
   - 打开小组网盘按钮
2. 指标卡片：
   - 当前小组
   - 成员人数
   - 今日已到课人数
   - 共享文件数
3. 成员面板：
   - 姓名
   - 学号
   - 身份（组长 / 组员）
   - 座位
   - 机房
   - 今日是否签到
   - 签到时间
4. 共享网盘概览：
   - 容量进度条
   - 已用空间
   - 剩余空间
   - 文件总数
   - 最近文件列表
5. 课堂动态：
   - 最近签到
   - 最近共享文件上传
   - 小组共同提交
   - 教师评阅回流
6. 操作日志：
   - 小组草稿同步 / 清空
   - 小组正式提交
   - 教师评阅
   - 小组共享文件上传 / 删除

## 4. 后端接口

接口：`GET /api/v1/groups/me`

返回结构：

1. `group`
2. `today_summary`
3. `members`
4. `shared_drive`
5. `activity_feed`
6. `operation_logs`

### 4.1 `group`

包含：

1. `id`
2. `name`
3. `group_no`
4. `description`
5. `class_id`
6. `class_name`
7. `member_count`
8. `me_role`
9. `leader_name`
10. `leader_student_no`

### 4.2 `today_summary`

包含：

1. `member_count`
2. `checked_in_count`
3. `pending_count`

### 4.3 `members`

每个成员包含：

1. `user_id`
2. `student_no`
3. `name`
4. `role`
5. `seat_label`
6. `room_name`
7. `checked_in_today`
8. `checked_in_at`

### 4.4 `shared_drive`

包含：

1. `enabled`
2. `message`
3. `display_name`
4. `quota_mb`
5. `used_bytes`
6. `remaining_bytes`
7. `usage_percent`
8. `file_count`
9. `recent_files`

### 4.5 `activity_feed`

每条动态包含：

1. `id`
2. `event_type`
3. `event_label`
4. `occurred_at`
5. `actor_name`
6. `actor_student_no`
7. `title`
8. `description`
9. `file_id`
10. `submission_id`
11. `task_id`

### 4.6 `operation_logs`

每条日志包含：

1. `id`
2. `event_type`
3. `event_label`
4. `occurred_at`
5. `title`
6. `description`
7. `actor_name`
8. `actor_student_no`
9. `actor_role`
10. `task_id`
11. `submission_id`
12. `version_no`

## 5. 数据来源

### 5.1 分组主数据

表：

1. `student_groups`
2. `student_group_members`

说明：

1. 每个班的学生会按本地测试数据自动分为若干组。
2. 同一学生当前只归属于一个小组。
3. 每个组都有：
   - `group_no`
   - `name`
   - `leader_user_id`

### 5.2 成员座位

表：

1. `class_seat_assignments`
2. `computer_seats`
3. `computer_rooms`

说明：

1. 页面会读取当前班级的座位绑定。
2. 若学生存在座位绑定，则显示座位号和机房名。

### 5.3 今日签到

表：

1. `attendance_records`

说明：

1. 页面只读取“今天”的签到记录。
2. 若有签到记录，则该成员显示“已签到”。
3. 若无签到记录，则显示“未签到”。

### 5.4 小组共享网盘

表：

1. `drive_spaces`
2. `drive_files`

说明：

1. 小组空间使用 `owner_type = group`。
2. 页面展示共享空间容量概览。
3. 页面展示最近 5 个共享文件。

### 5.5 小组课堂动态

表：

1. `attendance_records`
2. `drive_files`
3. `submissions`
4. `submission_files`
5. `tasks`

说明：

1. 动态流目前是“真实业务记录拼装”，不是单独的日志表。
2. 会合并当前小组最近签到、共享文件上传、小组共同提交和教师评阅结果。
3. 动态按时间倒序返回，默认展示最近 8 条。

### 5.6 小组操作日志

表：

1. `group_operation_logs`

说明：

1. 用于保留可追溯的小组协作操作记录。
2. 学生页默认展示当前小组最近 8 条持久化日志。
3. 日志与课堂动态并行展示，前者强调追溯，后者强调课堂实时感知。

## 6. 本地测试数据口径

当前本地测试库会自动生成：

1. 七年级、八年级多个班级。
2. 每班至少 10 名学生。
3. 每班自动拆分为若干小组。
4. 小组 1 的第一位学生默认为组长。

示例：

1. `70101`、`70102` 位于同一小组。
2. `70101` 为该组组长。

## 7. 关键文件清单

后端：

1. `apps/api/app/models/entities.py`
2. `apps/api/app/models/__init__.py`
3. `apps/api/app/api/v1/endpoints/groups.py`
4. `apps/api/app/api/v1/endpoints/drives.py`
5. `apps/api/app/api/v1/router.py`
6. `apps/api/app/services/student_groups.py`
7. `apps/api/app/services/group_activity.py`
8. `apps/api/app/db/init_db.py`
9. `apps/api/tests/test_smoke.py`

前端：

1. `apps/web/src/modules/student-group/GroupPage.vue`
2. `apps/web/src/modules/student-drive/DrivePage.vue`
3. `apps/web/src/router/index.ts`

## 8. 已完成验证

本次已验证：

1. 学生访问 `/api/v1/groups/me` 能拿到真实小组数据。
2. 小组页能展示组长、组员、座位与签到状态。
3. 小组页能展示共享网盘容量和最近文件。
4. 小组页能展示课堂动态流。
5. 小组页能展示持久化操作日志。
6. 小组页可跳转到 `/student/drive?tab=group`。
7. 与小组网盘共享能力联动正常。
8. 与小组共同提交、教师评阅结果联动正常。

## 9. 后续建议

下一步建议：

1. 增加课堂动态中的快捷操作，例如直接跳转到评分页或共享网盘。
2. 增加与任务页共享草稿的互跳提示或最近协作摘要。
3. 支持按成员、任务或版本号聚合日志摘要。
