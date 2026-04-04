# LearnSite 新平台

面向信息科技教学场景的新平台原型，技术栈为 `Vue 3 + TypeScript + Element Plus + FastAPI + SQLite`。

当前仓库不是迁移旧 ASPX 工程，而是基于线上明确在用的功能，重建一个更易维护、更易扩展的新平台。

## 当前状态

仓库已包含以下内容：

1. 详细设计文档：[docs/learnsite-redesign-design.md](docs/learnsite-redesign-design.md)
2. 实施规格文档：[docs/learnsite-implementation-spec.md](docs/learnsite-implementation-spec.md)
3. 线上功能映射矩阵：[docs/learnsite-live-feature-matrix.md](docs/learnsite-live-feature-matrix.md)
4. 本地开发说明：[docs/learnsite-local-development.md](docs/learnsite-local-development.md)
5. Vue 3 前端骨架：`apps/web`
6. FastAPI 后端骨架：`apps/api`
7. 首批真实 SQLite 数据和可联调页面

## 已落地的真实功能

当前已接入真实接口和 SQLite 数据的功能包括：

1. 学生登录
2. 学生学习中心首页
3. 学案详情页
4. 教师/管理员统一登录
5. 教师工作台
6. 教师学案管理列表
7. 教师课程体系页

## 本地开发

推荐直接使用一键脚本：

```powershell
npm run dev:up
```

停止：

```powershell
npm run dev:down
```

默认地址：

1. 前端：`http://localhost:5173`
2. 后端：`http://127.0.0.1:8010`
3. 接口文档：`http://127.0.0.1:8010/docs`

## 测试账号

1. 学生：`240101 / 12345`
2. 教师：`kylin / 222221`
3. 管理员：`admin / 222221`

说明：

1. 教师和管理员共用统一后台入口
2. 管理员通过权限区分，不再单独维护另一套登录页

## 质量检查

前端类型检查：

```powershell
npm run typecheck:web
```

前端构建：

```powershell
npm run build:web
```

后端测试：

```powershell
apps\api\.venv\Scripts\python.exe -m pytest apps/api/tests -q
```

## 说明

如果继续推进实现，请优先配合以下文档使用：

1. [docs/learnsite-redesign-design.md](docs/learnsite-redesign-design.md)
2. [docs/learnsite-implementation-spec.md](docs/learnsite-implementation-spec.md)
3. [docs/learnsite-live-feature-matrix.md](docs/learnsite-live-feature-matrix.md)
4. [docs/learnsite-local-development.md](docs/learnsite-local-development.md)
