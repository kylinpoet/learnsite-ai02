# 本轮任务约束（2026-10-27）

来源：用户原话 + 已核实事实。所有子任务简报必须携带与其相关的条目。

## 用户原话（逐字）

1. 「修好：5 个既有测试失败」
2. 「P2：调用层换 openai SDK、前端 SSE 解析器换 @microsoft/fetch-event-source」
3. 「P3：AI 学情报告、Edge TTS；以及上轮遗留的 PyJWT / passlib / Alembic / OpenAPI 类型生成。」

## 基线事实（已实测）

- 基线 pytest：`apps\api\.venv\Scripts\python.exe -m pytest apps/api/tests -q` → **5 failed, 76 passed**。
  失败：test_admin_can_create_large_room_and_import_seat_bindings、test_admin_can_update_system_settings_and_teacher_admin_role、test_admin_can_batch_create_classes_and_import_students、test_admin_can_discover_ai_provider_models、test_admin_discover_ai_provider_models_returns_error_when_lookup_fails。
- typecheck:web 基线绿（2026-10-27 审计实测 exit 0）。
- 工作区存在上轮未提交改动（assistants 安全/审计/代理等 + 4 个新测试），本轮在其上继续，不得回退。
- 5 个失败均为已提交的既有测试（非上轮新增）。
- 新依赖已由主线统一安装：venv 内 openai 3.39.0 / pyjwt 2.15.1 / passlib 1.7.4 / alembic 1.20.1 / edge-tts 7.3.1；web 内 @microsoft/fetch-event-source ^2.0.1、openapi-typescript ^7.9.1。子任务不得再改依赖清单。

## 推断项

- [推断] 不做 git 提交，改动留在工作区由所有者审阅。
- [推断] 不破坏现有 76 个通过测试与前端 typecheck/build。
- [推断] 优先级：测试修复 > P2 > P3。
- [推断] AI 学情报告：教师端功能（无既有规格，按仓库教师工作台模式设计，需在文档中写明假设）。
- [推断] Edge TTS：用 edge-tts Python 包做朗读合成，学生/学伴场景优先（无既有规格，需写明假设）。
- [推断] PyJWT/passlib 迁移需兼容存量数据（旧令牌短期可解码、旧密码哈希可验证）。

## 发现的既有缺口（本轮不修，报告中说明）

- AdminSystemPage.vue 的单学生删除按钮调用 DELETE /settings/admin/students/{id}，后端无此路由（前端 404，未被测试覆盖）。
- config.py secret_key 默认值硬编码 "learnsite-dev-secret"（审计已指出，本轮不改默认行为）。
