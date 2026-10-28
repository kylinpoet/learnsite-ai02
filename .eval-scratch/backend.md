# apps/api 后端审计（只读分析 + pytest）

日期：2026-10-27。方法：目录清点、逐文件阅读关键实现、Select-String 只读检索；除 pytest 外未运行任何应用/安装/写库命令，未修改仓库文件。

## 1. 结构与规模（实测）

`apps/api/app/` 共 33 个 .py 文件、**19,900 行**（Get-Content 逐行统计）。

| 分层 | 文件数 | 行数 | 说明 |
|---|---|---|---|
| api/v1/endpoints（路由） | 17 模块 | 15,725（占 79%） | + router.py 38 行注册 17 个子路由 |
| models | 3 | 892 | entities.py 单文件 775 行、**48 个模型类**；base.py 15 行 |
| schemas | 3 | 33 | 近乎空置；全项目 73 个 `BaseModel` 中约 60 个内联在 endpoint 文件里（settings.py 13、staff.py 9、quizzes.py 8…） |
| services | 14 | 1,678 | 业务辅助层，粒度合理 |
| db | 3 | 1,174 | init_db.py 1,139 行，混杂建表+迁移+种子数据+demo 文件生成 |
| core | 2 | 200 | config.py 52、security.py 148 |
| tests | 1 | 4,902 | test_smoke.py 单文件 77 个用例 |

最大端点文件：staff.py 2614、settings.py 2083、tasks.py 1738、lesson_plans.py 1589、assistants.py 1477。

结构判断：分层目录是 FastAPI 社区惯用布局（api/deps、core、models、services、schemas），路由注册干净（router.py 逐个 include）。问题不在「没有分层」，而在**厚度倒挂**：端点层占全量 79%，schemas 层名存实亡（请求/响应模型内联在端点文件里），init_db.py 一个文件承担了 DDL、迁移、种子、演示文件生成四种职责。

## 2. 认证实现（全部手写）

- **密码哈希：手写，未用任何库**。`app/core/security.py:9-19` `hash_password()`：`hashlib.pbkdf2_hmac("sha256", password, salt, 120_000)`，16 字节 `os.urandom` 盐，存 `hex(salt):hex(digest)`；`security.py:22-26` `verify_password()` 用 `hmac.compare_digest` 防时序比较。算法参数（PBKDF2-SHA256 / 120k 迭代）符合 OWASP 现行建议，实现无已知缺陷，但属手造轮子；主流替代：passlib（已停更但事实标准）、bcrypt、argon2-cffi。
- **令牌：手造非标准 JWT 变体**。`security.py:46-71` `create_access_token()`：`base64url(json_payload).HMAC-SHA256` 自定义签名格式（非 RFC 7515 JWS，payload 明文可读）；`security.py:~108-141` `decode_access_token()` 校验签名+过期。含 user_id/user_type/username/iat/exp。**同一套逻辑在 `create_task_runtime_token`/`decode_task_runtime_token`（security.py:74-105、~144-176）里近乎整段复制**，仅多一个 scope 字段。主流替代：PyJWT（`jwt.encode/decode`，HS256 即可覆盖）。
- **机制**：登录端点 `app/api/v1/endpoints/auth.py:29-73`（/auth/student/login、/auth/staff/login）在 JSON body 返回 `access_token`，前端以 `Authorization: Bearer` 携带（`app/api/deps/auth.py:13` `HTTPBearer(auto_error=False)`）。无服务端会话表、无吊销/登出机制（无状态令牌，TTL=120 分钟，config.py:45）。另有任务运行时令牌通过 `set_cookie` 下发（cookie 名 `learnsite_task_token`，deps/auth.py:11；tasks.py:631、1325）。
- **权限**：不是中间件，是 FastAPI 依赖注入链 `get_current_user → require_student/require_staff/require_admin`（deps/auth.py:16-58），管理员判定委托 `services/staff_access.py`。这是 FastAPI 官方推荐做法，**不是轮子**，评价正面。
- 风险事实：`config.py:44` `secret_key: str = "learnsite-dev-secret"` 硬编码默认值，未配置环境变量时令牌签名密钥公开可知。

## 3. 数据层

- ORM：**SQLAlchemy 2.0 现代风格**，`models/base.py:7-18` `DeclarativeBase` + `Mapped`/`mapped_column` + TimestampMixin；entities.py 全部 ORM 声明，未见裸 SQL 查询（仅迁移处 `text("ALTER TABLE ...")`）。`db/session.py`（6 行）标准 create_engine/sessionmaker。
- 建表：`Base.metadata.create_all(bind=engine)`，`app/db/init_db.py:1251`，在 `main.py:10-12` lifespan 启动时执行。
- 迁移：**无 Alembic**（pyproject.toml 依赖里没有，仓库无 alembic 目录/ini）。手写迁移：`init_db.py:370-378` 用 `sqlalchemy.inspect` 探测已有列，`init_db.py:423-467` 逐条 `ALTER TABLE ... ADD COLUMN`，`init_db.py:416` 甚至有「建新表-改名」式重建迁移。主流替代：Alembic（SQLAlchemy 官方配套）。
- 种子数据（5 个班学生名册、机房布局、demo 提交文件）与上述逻辑同文件混排，init_db.py 共 1,139 行。

## 4. 轮子审计（逐项）

| # | 手写代码 | 位置 | 主流替代 |
|---|---|---|---|
| 1 | PBKDF2 密码哈希 | core/security.py:9-26 | passlib / bcrypt / argon2-cffi |
| 2 | HMAC 签名令牌（自造格式，且 create/decode 两对函数互为复制） | core/security.py:46-176 | PyJWT / python-jose |
| 3 | 手写迁移（inspect + ALTER TABLE） | db/init_db.py:370-467 | Alembic |
| 4 | 分页：各端点自算 `page_count = (total+size-1)//size` 与 offset/limit，无共享 helper。quizzes.py:627-760 是最完整一例（含手写 page_size 白名单校验）；staff.py:2018/2646、tasks.py:1580、profiles.py:1340 各自为政 | 上述位置 | fastapi-pagination；或至少抽公共 paginate 函数 |
| 5 | 本地文件存储层：`drive_files.py:82-137` 上传（`await upload.read()` 整文件读入内存，非流式）、id.ext 命名、配额/扩展名校验全手写；`task_assets.py:28-42` 手写路径穿越防护；`submission_files.py` 同类。上传入口用了框架 `UploadFile`（正确） | services/drive_files.py、task_assets.py、submission_files.py | aiofiles 流式写；路径安全可用 `starlette.staticfiles` 同款 resolve+relative_to 封装；对象存储场景用 boto3/minio 客户端 |
| 6 | `build_content_disposition` 在 5 个文件重复实现 | drives.py:35、peer_reviews.py:53、profiles.py:155、staff.py:541、submissions.py:515 | 抽公共 util（内部去重） |
| 7 | 手写 PDF 字节流生成器（xref 表手拼）、手写 DOCX zip | db/init_db.py:86-111（PDF）、114-152（DOCX） | fpdf2 / reportlab；python-docx（仅 demo 种子用，风险低但典型） |
| 8 | 校验逻辑：pydantic 内联模型用了一部分（73 个 BaseModel），但大量手写 `if x not in {...}: raise HTTPException` 白名单校验（例 staff.py:2462 mode 白名单、quizzes.py:642 分页大小白名单） | 各端点 | pydantic `Literal`/`Enum`/`Field(ge, le)` 即可声明式覆盖（部分 `Query(ge=…, le=…)` 已正确使用） |

**openpyxl 用法**：仅用于**导入**（解析上传的 .xlsx），`curriculum.py:115-128`、`settings.py:269-282`，`load_workbook(read_only=True, data_only=True)` + close，用法正确、无滥用。**导出不用 xlsx**，全部是 CSV：stdlib `csv` 模块 + UTF-8 BOM（staff.py:2452-2481 考勤导出、2504-2529 学生导出、profiles.py:1384 审计导出、submissions.py:779 成绩汇总、staff.py:2054 小组日志导出）。CSV 用 stdlib csv 不算造轮子。

未造的轮子（正面）：CORS 用 CORSMiddleware、鉴权用依赖注入、响应包装用 pydantic、SPA 静态服务路径校验——这些走了框架正道。

## 5. pytest 实测（仓库根目录，允许的唯一执行命令）

```
apps\api\.venv\Scripts\python.exe -m pytest apps/api/tests -q
→ 5 failed, 72 passed in 106.18s（共 77 用例）
```

失败明细：
1. `test_admin_can_create_large_room_and_import_seat_bindings`（test_smoke.py:2926）——座位导入对「不完整表」期望 400，实际 200，边界校验缺失；
2. `test_admin_can_update_system_settings_and_teacher_admin_role`（test_smoke.py:3960）——更新 platform_name 后回读仍为旧值「OW³教学评AI平台」，设置未持久化；
3. `test_admin_can_batch_create_classes_and_import_students`（test_smoke.py:4841）——`GET /settings/admin/students/import-template` 返回 404，端点缺失或路由改名；
4/5. `test_admin_can_discover_ai_provider_models`、`test_admin_discover_ai_provider_models_returns_error_when_lookup_fails`（test_smoke.py:5062、5094）——两个测试替身签名缺 `remote_proxy_url` 参数，而实现 `settings.py:1520` 已新增该 kwarg，`TypeError`。属**测试未随实现同步**（测试漂移），非功能回归。

## 6. 发布模式（main.py）

`app/main.py:39-68`：`serve_frontend`（config.py:39，默认 True）时——
- `main.py:55-57`：`/assets` 挂 `StaticFiles(directory=web_dist/assets)`；
- `main.py:59-68`：catch-all `GET /{full_path:path}`：API 前缀显式 404 → `(dist_root/full_path).resolve()` 后 `is_relative_to(dist_root)` 防穿越 → 命中文件回 `FileResponse`，否则回退 `index.html`（SPA history 路由）；
- `main.py:34-46`：`/` 优先回 index.html，开发态回 JSON 状态。
- `web_dist_dir = BASE_DIR.parent / "web" / "dist"`（config.py:38）。

判断：手写但正确、含路径穿越防护，是 FastAPI 单端口服务 SPA 的常见社区方案；更简替代是把 SPA 交给 nginx/Caddy 或 `StaticFiles(html=True)` 挂根（需把 API 路由先注册）。CORS 正则同时放行局域网网段（config.py:40-47），适配教学内网。

## 总评

结构是教科书式 FastAPI 布局但严重头重脚轻（端点 79%、schemas 空转、init_db 四职责合一）；认证与迁移是完全手造轮子（算法参数合格但格式非标准、代码内部还有整段复制）；分页/存储/导出头有局部轮子与 5 处重复实现；测试 72/77 通过，5 个失败中 2 个是测试漂移、3 个指向真实校验/持久化/路由缺口。发布模式实现安全。修订优先级建议：引入 Alembic 与 PyJWT、抽公共分页/Content-Disposition、拆分 init_db、补齐 3 个真实失败用例对应的实现。
