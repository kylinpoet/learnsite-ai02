# 学生网盘流程说明
更新时间：2026-04-02  
状态：ACTIVE  
适用范围：学生个人网盘、小组共享网盘、网盘前后端接口、共享文件权限、小组网盘上传限制

## 1. 本轮范围

当前“学生网盘”已经从基础版推进到“个人网盘 + 小组网盘”双空间真实可用，范围如下：

1. 学生可进入 `/student/drive` 查看个人网盘。
2. 学生可在同一页面切换“我的网盘 / 小组网盘”。
3. 个人网盘支持容量统计、文件列表、上传、下载、删除。
4. 小组网盘支持容量统计、文件列表、上传、下载、删除。
5. 同组学生共享同一组文件，任一成员上传后，其他成员可立即看到并下载。
6. 小组共享文件删除权限已细化为“上传者本人或组长”。
7. 小组网盘支持文件数量、单文件大小、扩展名限制。
8. 上述限制可由管理员在系统设置页统一配置。
9. 学生若尚未加入小组，则小组网盘页会展示说明，并引导前往 `/student/groups`。

## 2. 前端页面行为

文件：`apps/web/src/modules/student-drive/DrivePage.vue`

当前行为：

1. 页面真实调用 `GET /api/v1/drives/me`。
2. 顶部通过标签页切换：
   - `personal`
   - `group`
3. 个人网盘显示：
   - 文件总数
   - 已用空间
   - 总容量
   - 使用率
4. 小组网盘显示：
   - 文件总数
   - 已用空间
   - 总容量
   - 使用率
   - 小组成员数
5. 页面共用一套文件列表操作：
   - 选择文件
   - 上传
   - 下载
   - 删除
6. 小组网盘文件会显示上传者姓名、学号和当前账号是否可删除。
7. 当文件不可由当前账号删除时，页面会明确提示“仅上传者本人或组长可删除”。
8. 当路由为 `/student/drive?tab=group` 时，页面默认打开“小组网盘”标签。
9. 若当前学生没有小组，则小组标签显示说明卡片，并提供跳转 `/student/groups` 的入口。

## 3. 后端接口说明

### 3.1 获取网盘总览

接口：`GET /api/v1/drives/me`

返回：

1. `personal_space`
2. `group_space`

其中：

1. `personal_space` 为学生个人空间。
2. `group_space` 为当前学生所属小组空间。
3. 若学生未加入小组，则 `group_space.enabled = false`，并返回提示文案。
4. 每个文件项会额外返回：
   - `uploaded_by_name`
   - `uploaded_by_student_no`
   - `can_delete`

### 3.2 上传到个人网盘

接口：`POST /api/v1/drives/me/files`

请求格式：`multipart/form-data`

字段：

1. `files`

规则：

1. 首次访问时若个人空间不存在，会自动创建。
2. 上传前会检查剩余额度。
3. 若同名文件已存在，会自动生成带序号的新文件名。
4. 上传成功后会返回最新的个人网盘和小组网盘状态。

### 3.3 上传到小组网盘

接口：`POST /api/v1/drives/group/files`

请求格式：`multipart/form-data`

字段：

1. `files`

规则：

1. 仅已加入小组的学生可上传。
2. 首次访问小组空间时若共享空间不存在，会自动创建。
3. 上传前会校验当前小组空间的文件总数上限。
4. 上传前会校验每个文件的单文件大小上限。
5. 若管理员设置了允许扩展名，则上传前会校验文件类型。
6. 上传成功后，小组其他成员再访问 `/api/v1/drives/me` 时可以看到同一文件。
7. 上传成功后会返回最新的个人网盘和小组网盘状态。

### 3.4 小组网盘上传限制来源

系统设置项：

1. `group_drive_file_max_count`
2. `group_drive_single_file_max_mb`
3. `group_drive_allowed_extensions`

规则：

1. `group_drive_allowed_extensions` 留空表示不限制类型。
2. 限制由后端统一校验，学生上传与教师上传到小组空间都会生效。
3. 若超限，接口返回明确错误提示，前端直接展示给用户。

### 3.5 下载文件

接口：`GET /api/v1/drives/files/{file_id}`

规则：

1. 学生可以下载：
   - 自己个人网盘中的文件
   - 自己所在小组共享空间中的文件
2. 无权访问的文件会返回 `403`。

### 3.6 删除文件

接口：`DELETE /api/v1/drives/files/{file_id}`

规则：

1. 学生可以删除：
   - 自己个人网盘中的文件
   - 自己上传到小组共享空间中的文件
   - 若自己是组长，也可删除本组全部共享文件
2. 删除后会同步回收空间占用。
3. 非上传者且非组长删除共享文件时会返回 `403`。
4. 返回值会携带最新的个人网盘和小组网盘状态。

## 4. 数据模型

当前相关数据表：

1. `drive_spaces`
2. `drive_files`
3. `student_groups`
4. `student_group_members`

### 4.1 `drive_spaces`

关键字段：

1. `owner_type`
2. `owner_id`
3. `display_name`
4. `quota_mb`
5. `used_bytes`

说明：

1. 个人网盘使用 `owner_type = student`。
2. 小组网盘使用 `owner_type = group`。
3. `(owner_type, owner_id)` 唯一，确保每个主体只有一个空间。

### 4.2 `drive_files`

关键字段：

1. `space_id`
2. `uploaded_by_user_id`
3. `original_name`
4. `stored_name`
5. `file_ext`
6. `size_bytes`
7. `folder_path`

说明：

1. 当前统一保存在根目录 `/`。
2. `stored_name` 用于处理重名文件。
3. 小组网盘与个人网盘共用同一张文件表，不另外拆分。

## 5. 存储规则

文件：`apps/api/app/services/drive_files.py`

当前存储方式：

1. 使用本地磁盘。
2. 根目录为 `LEARNSITE_STORAGE_ROOT/drives/`。
3. 每个空间单独建立目录：`space_{space_id}`。
4. 实际文件名按 `file_id.ext` 保存，避免原始文件名引发路径冲突。

## 6. 关联页面

1. 小组页：`/student/groups`
2. 小组网盘页签：`/student/drive?tab=group`

联动方式：

1. 小组页展示小组成员与共享网盘概览。
2. 小组页点击“打开小组网盘”后，直接跳转到小组网盘页签。
3. 小组网盘不可用时，会提示先到小组页查看分组信息。

## 7. 关键文件清单

后端：

1. `apps/api/app/models/entities.py`
2. `apps/api/app/models/__init__.py`
3. `apps/api/app/api/v1/endpoints/drives.py`
4. `apps/api/app/api/v1/endpoints/groups.py`
5. `apps/api/app/api/v1/router.py`
6. `apps/api/app/services/drive_files.py`
7. `apps/api/app/services/student_groups.py`
8. `apps/api/app/services/system_settings.py`
9. `apps/api/app/db/init_db.py`
10. `apps/api/tests/test_smoke.py`

前端：

1. `apps/web/src/modules/student-drive/DrivePage.vue`
2. `apps/web/src/modules/student-group/GroupPage.vue`
3. `apps/web/src/modules/staff-admin/AdminSystemPage.vue`
4. `apps/web/src/router/index.ts`

## 8. 已完成验证

本次变更已完成以下验证：

1. `apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests/test_smoke.py -q`
2. `npm run typecheck:web`
3. `npm run build:web`

当前结果：

1. 后端冒烟测试 `26 passed`
2. 前端类型检查通过
3. 前端生产构建通过

其中新增覆盖：

1. 小组页真实数据返回
2. 小组共享网盘上传
3. 同组学生可见同一共享文件
4. 同组学生可下载共享文件
5. 非上传者组员不能删除他人上传的共享文件
6. 上传者本人可删除自己上传的共享文件
7. 组长可删除本组全部共享文件
8. 小组网盘文件数量、大小、类型限制对学生与教师上传同时生效

## 9. 后续建议

下一步建议：

1. 小组网盘目录化、批量整理与归档。
2. 更细粒度的教师侧共享空间管理与检索。
3. 大文件异步上传、断点续传或对象存储迁移。
