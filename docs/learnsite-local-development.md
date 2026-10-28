# LearnSite 本地开发说明

本文档面向参与 LearnSite 新平台开发的团队成员，目标是解决三个问题：

1. 新同事第一次接手仓库时，如何最快把前后端跑起来。
2. 本地开发时，哪些配置文件生效，端口和代理关系是什么。
3. 遇到 `CORS`、`localhost / 127.0.0.1`、端口冲突、虚拟环境缺失等常见问题时，应该如何排查。

当前仓库是新平台，不迁移原 ASPX 项目；技术栈为 `Vue 3 + TypeScript + naive-ui + FastAPI + SQLite`。

## 1. 目录结构

```text
learnsite-ai02/
  apps/
    api/    FastAPI 后端
    web/    Vue 3 前端
  docs/     设计、规格和开发文档
  scripts/  本地开发辅助脚本
  .env      根级环境变量
  package.json
```

## 2. 环境要求

推荐使用以下环境：

1. Node.js 20 及以上
2. npm 10 及以上
3. Python 3.12
4. Windows PowerShell 5.1 或 PowerShell 7

说明：

1. 当前一键脚本优先面向 Windows 开发环境，因为项目内大量本地协作动作都在 Windows 上验证过。
2. 后端推荐使用项目自己的虚拟环境 `apps/api/.venv`，不要混用系统 Python、Anaconda、IDE 自动注入的解释器。

## 3. 首次安装

### 3.1 安装前端依赖

在仓库根目录执行：

```powershell
npm install
```

### 3.2 创建后端虚拟环境

在仓库根目录执行：

```powershell
cd apps/api
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -e .[dev]
cd ../..
```

### 3.3 检查根级环境变量

项目根目录使用 `./.env` 作为本地开发环境变量文件，默认建议至少包含：

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_DEV_PROXY_TARGET=http://127.0.0.1:8010

LEARNSITE_ENV=development
LEARNSITE_DATABASE_URL=sqlite:///./learnsite.db
LEARNSITE_STORAGE_ROOT=./storage
LEARNSITE_WEB_DIST_DIR=./apps/web/dist
LEARNSITE_SERVE_FRONTEND=true
LEARNSITE_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5175,http://127.0.0.1:5175
LEARNSITE_CORS_ORIGIN_REGEX=^https?://(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(:\d+)?$
```

如果本地没有 `.env`，可以先复制 `.env.example`：

```powershell
Copy-Item .env.example .env
```

## 4. 一键启动

项目已经提供两种启动方式：

1. 双击脚本启动
2. 命令行启动

### 4.1 双击启动

直接双击以下文件之一：

1. `scripts/dev-up.cmd`
2. `scripts/dev-down.cmd`

启动后会弹出两个可见窗口：

1. `LearnSite API 8010`
2. `LearnSite Web 5173`

### 4.2 命令行启动

在仓库根目录执行：

```powershell
npm run dev:up
```

停止：

```powershell
npm run dev:down
```

### 4.3 脚本的行为说明

`scripts/dev-up.ps1` 会做这些事情：

1. 检查 `apps/api/.venv/Scripts/python.exe` 是否存在
2. 检查 `node_modules/.bin/vite.cmd` 是否存在
3. 检查目标端口是否已被占用
4. 如果端口已经被当前 LearnSite 进程占用，则跳过重复启动
5. 如果端口被其他进程占用，则停止启动并给出 PID 和命令行提示
6. 在独立窗口中启动后端和前端

`scripts/dev-down.ps1` 会做这些事情：

1. 关闭一键脚本打开的可见窗口
2. 清理对应的 `uvicorn` 和 `vite` 子进程
3. 再次检查 `8010` 和 `5173` 是否已释放

## 5. 手动启动方式

如果你不想使用一键脚本，也可以手动分别启动。

### 5.1 后端

在仓库根目录执行：

```powershell
apps\api\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --app-dir apps/api
```

### 5.2 前端

在仓库根目录执行：

```powershell
npm --workspace apps/web run dev -- --host 0.0.0.0 --port 5173
```

## 6. 访问地址

本地开发统一使用以下地址：

1. 前端首页：`http://localhost:5173`
2. 局域网前端：`http://<本机局域网IP>:5173`
3. 后端接口根：`http://<本机局域网IP>:8010`
4. OpenAPI 文档：`http://<本机局域网IP>:8010/docs`

本机调试仍建议统一使用 `http://localhost:5173` 打开前端；需要给同一局域网设备访问时，使用本机局域网 IP。

## 7. 为什么浏览器里看到的是 5173，不是 8010

这是本项目本地开发的关键约定。

### 7.1 前端请求方式

前端代码在 `apps/web/src/api/http.ts` 中默认请求：

```ts
/api/v1/...
```

也就是说，浏览器看到的请求地址通常会是：

```text
http://localhost:5173/api/v1/auth/student/login
```

这不是错误，而是刻意设计的同源开发模式。

### 7.2 实际代理路径

Vite 在 `apps/web/vite.config.ts` 里会把 `/api` 代理到：

```text
http://127.0.0.1:8010
```

所以真实链路是：

```text
浏览器 -> http://localhost:5173/api/v1/...
Vite 代理 -> http://127.0.0.1:8010/api/v1/...
FastAPI 返回响应 -> 浏览器
```

这样做的目的：

1. 避免浏览器跨域限制频繁干扰开发
2. 减少 `localhost` 和 `127.0.0.1` 混用造成的 CORS 问题
3. 保持前端请求写法更接近未来生产部署方式

### 7.3 局域网访问

一键脚本默认监听 `0.0.0.0`，因此同一局域网设备可以访问：

```text
http://<本机局域网IP>:5173
```

如果 Windows 防火墙阻止访问，需要放行端口 `5173` 和 `8010`。

## 8. CORS 配置说明

后端 CORS 配置位于：

1. `apps/api/app/core/config.py`
2. `apps/api/app/main.py`

当前允许的本地开发来源包含：

1. `http://localhost:5173`
2. `http://127.0.0.1:5173`
3. `http://localhost:5175`
4. `http://127.0.0.1:5175`

另外还允许匹配正则：

```text
^https?://(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(:\d+)?$
```

注意：

1. 即使后端 CORS 已经配置正确，本地开发时仍然建议前端通过 Vite 代理访问后端。
2. 不要把前端环境变量重新改成 `http://127.0.0.1:8010/api/v1` 这种浏览器直连方式，除非你明确知道自己为什么要这样做。

## 9. 配置文件位置

### 9.1 根级 `.env`

路径：`./.env`

用途：

1. 后端读取 `LEARNSITE_*` 配置
2. 前端开发时通过 `vite.config.ts` 的 `envDir` 读取 `VITE_*` 配置

### 9.2 前端开发环境文件

路径：`apps/web/.env.development`

用途：

1. 提供前端开发期默认值
2. 与根级 `.env` 保持一致时，便于多入口调试

### 9.3 后端配置对象

路径：`apps/api/app/core/config.py`

用途：

1. 定义环境变量模型
2. 定义默认数据库地址
3. 定义 CORS 白名单和正则

## 10. 本地数据库

当前开发阶段使用 SQLite。

相关位置：

1. 数据库文件：`./learnsite.db` 或 `apps/api/learnsite.db`
2. 初始化逻辑：`apps/api/app/db/init_db.py`
3. 数据模型：`apps/api/app/models/entities.py`

应用启动时会自动初始化基础数据。

### 10.1 数据库迁移（Alembic）

schema 迁移由 Alembic 管理（脚手架位于 `apps/api/alembic/`，配置文件 `apps/api/alembic.ini`）。数据库地址沿用应用配置（`LEARNSITE_DATABASE_URL` / 根级 `.env`），无需在 alembic.ini 里另配。

与现有初始化逻辑的关系：

1. `init_db()` 仍负责建表（`create_all`）、历史列迁移与种子数据——这是全新库/存量库的兜底路径，保持不变。
2. `init_db()` 结束时会自动为没有 `alembic_version` 表的库打上当前 head 标记（stamp），之后该库的 schema 版本进入 Alembic 管理。
3. 今后修改 `entities.py` 后，不要再往 `init_db.py` 里加手写 ALTER，改用迁移命令生成并执行变更。

常用命令（在 `apps/api` 目录下执行）：

```powershell
# 生成迁移（改完 models 后执行；自动对比模型与库的差异）
..\.venv\Scripts\python.exe -m alembic -c alembic.ini revision --autogenerate -m "add xxx column"

# 执行迁移 / 回退一步
..\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
..\.venv\Scripts\python.exe -m alembic -c alembic.ini downgrade -1

# 查看当前版本
..\.venv\Scripts\python.exe -m alembic -c alembic.ini current
```

注意：生成的迁移文件请人工审阅后提交（autogenerate 对列改名会识别为删列+加列，SQLite 下默认以批处理模式重建表）。

默认测试账号：

1. 学生：`240101 / 12345`
2. 教师：`kylin / 222221`
3. 管理员：`admin / 222221`

## 11. 验证步骤

### 11.1 启动后验证端口

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5173,8010 }
```

### 11.2 检查前端是否拿到正确的 API 基地址

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5173/src/api/http.ts | Select-Object -ExpandProperty Content
```

预期应能看到：

```text
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api/v1";
```

### 11.3 检查后端健康状态

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8010/ | Select-Object -ExpandProperty Content
```

### 11.4 验证学生登录接口

```powershell
$body = @{ username = '240101'; password = '12345' } | ConvertTo-Json
Invoke-WebRequest -UseBasicParsing http://localhost:5173/api/v1/auth/student/login `
  -Method Post `
  -ContentType 'application/json' `
  -Headers @{ Origin = 'http://localhost:5173' } `
  -Body $body | Select-Object -ExpandProperty Content
```

预期返回 `code = OK`。

## 12. 常见问题

### 12.1 浏览器提示 CORS 错误

先确认以下三件事：

1. 浏览器打开的是 `http://localhost:5173`
2. 前端请求的是 `/api/v1/...`，不是浏览器直连 `http://127.0.0.1:8010/...`
3. 后端运行在 `127.0.0.1:8010`

如果仍然异常：

1. 先执行 `npm run dev:down`
2. 再执行 `npm run dev:up`
3. 浏览器对 `http://localhost:5173` 做一次强制刷新 `Ctrl + F5`

### 12.2 8010 端口已被占用

本项目默认后端端口固定为 `8010`，因为很多机器上的 `8000` 经常被其他服务占用。

排查命令：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 8010 }
```

如果是一键脚本提示端口被其他进程占用，先看提示里的 PID 和命令行，不要直接暴力结束未知进程。

### 12.3 5173 端口已被占用

排查命令：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 5173 }
```

如果是当前仓库旧的 Vite 进程没有退出，优先执行：

```powershell
npm run dev:down
```

### 12.4 `.venv` 不存在

执行：

```powershell
cd apps/api
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e .[dev]
cd ../..
```

### 12.5 前端明明改了代码，但浏览器还是旧结果

通常是以下几种情况：

1. 本地有多个 Vite 进程同时运行
2. 浏览器标签页还停留在旧地址
3. 旧的 HMR 会话没有断开

建议处理顺序：

1. `npm run dev:down`
2. `npm run dev:up`
3. 关闭旧标签页，重新打开 `http://localhost:5173`

## 13. 质量检查命令

### 13.1 前端类型检查

```powershell
npm run typecheck:web
```

### 13.2 前端构建

```powershell
npm run build:web
```

### 13.3 后端编译检查

```powershell
npm run check:api
```

### 13.4 后端测试

```powershell
apps\api\.venv\Scripts\python.exe -m pytest apps/api/tests -q
```

## 14. OpenAPI 类型生成

前端通过 [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) 从后端 FastAPI 的 OpenAPI 声明生成 TypeScript 类型，避免前后端接口结构脱节。

### 14.1 生成命令

在 `apps/web` 目录下执行（或仓库根 `npm --workspace apps/web run generate:api-types`）：

```powershell
npm run generate:api-types
```

该命令读取 `apps/web/openapi.json`，生成 `apps/web/src/api/schema.d.ts`。

### 14.2 导出 openapi.json

`apps/web/openapi.json` 是生成物，不入库（已加入 `.gitignore`）。后端接口变动后，在仓库根重新导出：

```powershell
apps\api\.venv\Scripts\python.exe -c "import sys; sys.path.insert(0, r'apps\api'); from fastapi.testclient import TestClient; from app.main import app; import json; open(r'apps\web\openapi.json','w',encoding='utf-8').write(json.dumps(app.openapi(), ensure_ascii=False))"
```

导入 `app.main` 较慢（30–60 秒）属正常现象。导出后重跑 14.1 的生成命令。

### 14.3 用法示例

```ts
import type { components } from '@/api/schema';

type LoginRequest = components['schemas']['LoginRequest'];
```

当前示范模块：`apps/web/src/modules/auth/StudentLoginPage.vue`（登录表单改用生成的 `LoginRequest`）。

### 14.4 当前覆盖范围与局限

1. 覆盖：所有命名请求体 schema（如 `LoginRequest`、各 `*Payload`），以及少量命名响应 schema。
2. 局限：后端响应统一为 `ApiResponse` envelope（`{code, message, data}`），`data` 字段未内联具体结构，导致大部分响应体类型无法从 OpenAPI 生成，前端仍需手写。如 `StudentLoginPage.vue` 的 `LoginResponse` 即为手写，页面内有注释说明。
3. 因此目前建议优先把生成的类型用于请求体（request body）和路径/查询参数，响应体类型等后端补齐 envelope 内结构后再逐步接入。

## 15. 学情报告真实 Provider 人工验证步骤

本地环境（`npm run dev:up`，Web 端口被占用时 `npm run dev:up` 带参数换口，如 `-WebPort 5175`）启动后，按以下步骤人工验证学情报告真实 Provider 端到端链路：

1. **接入真实 Provider**：以 admin 登录（种子账号 admin / 222221，未 seed 时先执行 `npm run dev:seed-demo`），进入「系统管理 → AI Provider」，新增或编辑 Provider 为真实模型服务（base_url + api_key + model_name），确认列表中该 Provider 已启用且不是 demo 形态。
2. **准备班级数据**：确认目标班级下有学生、提交/评分/互评/签到等学习记录（seed 脚本已注入演示数据）。
3. **生成报告**：以教师账号（t1 / 222221）登录，进入「学情报告」页，选择班级（可选指定学案范围），点击生成；等待期间前端保持 loading 态（同步调用，AI 超时上限 60s）。
4. **核对结果**：生成成功后报告应立即渲染为 Markdown；检查内容是否真实反映该班统计（人数、提交率、评分分布等），而非 mock 文本。
5. **历史与详情**：刷新页面后历史列表仍可见该记录；切换历史可正常加载详情全文；状态应为 completed。
6. **失败留痕（可选）**：将 Provider 的 base_url 改为不可达地址后再次生成，预期前端提示 502 错误，历史列表中出现 status=failed 的留痕记录。
7. **无 Provider 拦截（可选）**：删除全部真实 Provider 后点击生成，预期返回 409「尚未配置可用的 AI Provider」。

说明：CI 测试对该链路用的是 mock（见 `apps/api/tests/test_smoke.py` 学情报告两用例），以上步骤补上的是真实 Provider 的端到端人工核对。

## 16. 推荐工作流

建议团队统一按这个节奏开发：

1. 执行 `npm run dev:up`
2. 浏览器打开 `http://localhost:5173`
3. 完成功能开发后执行前端构建和后端测试
4. 提交代码前更新相关文档
5. 当天结束工作前执行 `npm run dev:down`

## 17. 相关文档

建议结合以下文档一起阅读：

1. [docs/learnsite-redesign-design.md](./learnsite-redesign-design.md)
2. [docs/learnsite-implementation-spec.md](./learnsite-implementation-spec.md)
3. [docs/learnsite-live-feature-matrix.md](./learnsite-live-feature-matrix.md)
