# LearnSite 发布运行说明

本文档用于把项目从本地调试模式整理为可在局域网或服务器上访问的发布版本。

## 推荐方式：单端口发布

单端口模式会先构建 `apps/web/dist`，再由 FastAPI 同时提供前端页面和 `/api/v1` 接口。

```powershell
npm install
cd apps/api
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -e .[dev]
cd ../..
npm run release:up
```

默认监听：

```text
0.0.0.0:8010
```

同一局域网设备访问：

```text
http://<服务器IP>:8010
```

例如服务器 IP 是 `192.168.1.20`，访问地址就是：

```text
http://192.168.1.20:8010
```

## 常用命令

```powershell
npm run build:release
```

执行前端类型检查、后端语法检查和前端构建。

```powershell
npm run serve:api
```

不重新构建，直接以 `0.0.0.0:8010` 启动 API；如果 `apps/web/dist/index.html` 存在，也会同时提供前端页面。

```powershell
npm run dev:lan
```

局域网开发模式，前端 Vite 和后端 API 都监听 `0.0.0.0`。适合课堂内临时联调，不建议作为长期发布方式。

## 环境变量

根目录 `.env` 支持以下发布相关配置：

```dotenv
VITE_API_BASE_URL=/api/v1
LEARNSITE_ENV=production
LEARNSITE_DATABASE_URL=sqlite:///./learnsite.db
LEARNSITE_STORAGE_ROOT=./storage
LEARNSITE_WEB_DIST_DIR=./apps/web/dist
LEARNSITE_SERVE_FRONTEND=true
```

如果前端和后端拆分到不同域名或端口，需要配置 CORS：

```dotenv
LEARNSITE_CORS_ORIGINS=http://192.168.1.20:5173
```

默认 CORS 正则允许 `localhost`、`127.0.0.1` 和常见局域网网段 `10.*`、`172.16-31.*`、`192.168.*`。

## 防火墙

Windows 服务器需要放行端口，例如默认发布端口 `8010`：

```powershell
New-NetFirewallRule -DisplayName "LearnSite 8010" -Direction Inbound -Protocol TCP -LocalPort 8010 -Action Allow
```

如果使用局域网开发模式，还需要放行 Vite 端口 `5173`。

## 生产建议

1. 对公网发布时，把 `LEARNSITE_SECRET_KEY` 改为高强度随机字符串。
2. 优先使用反向代理提供 HTTPS，例如 Nginx、Caddy 或 IIS ARR。
3. 不要把 `apps/api/.venv`、`node_modules`、`apps/web/dist` 之外的临时文件作为发布依赖上传到服务器。
4. SQLite 适合单机课堂和小规模部署；多人高并发或多进程部署时建议切换到独立数据库。
