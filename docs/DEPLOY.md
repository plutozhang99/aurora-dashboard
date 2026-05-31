# 部署 Aurora Dashboard

Aurora 是单用户、本地优先的应用。生产部署 = **一个进程同时托管前端静态产物与 `/api`**：FastAPI 用 `StaticFiles` 服务 `vite build` 出的 `dist/`，并对非 `/api` 路由回退 `index.html`（SPA）。前后端绑同一端口，一起启动。

## 一、Docker（推荐，单镜像多阶段）

```bash
docker compose up --build
# 打开 http://localhost:5174/
```

`Dockerfile` 两个阶段：

1. `node:22-slim` —— `npm ci && npm run build`，产出 `/app/dist`。
2. `python:3.12-slim` —— 安装 `backend/`（`pip install -e ./backend`），复制 `dist/`，`uvicorn app.main:app --host 0.0.0.0 --port 5174` 同时服务静态与 API。

不用 compose 也可以：

```bash
docker build -t aurora-dashboard .
docker run --rm -p 5174:5174 aurora-dashboard
```

### 验证

- `http://<host>:5174/` 显示应用。
- `http://<host>:5174/api/health` 返回 `{"ok":true,"time":...}`。
- 在 UI 里加 IMAP 账户与 AI key 后，邮件 / 日程 / 晨报可用。

## 二、不用 Docker（裸机 / NAS）

```bash
npm ci && npm run build                         # 产出 dist/
python3 -m venv backend/.venv
backend/.venv/bin/pip install -e ./backend
AURORA_HOST=0.0.0.0 AURORA_DIST_DIR=$PWD/dist \
  backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 5174 --app-dir backend
```

## 端口

| 场景 | 端口 | 说明 |
|------|------|------|
| Dev | 5173 (vite) + 5174 (uvicorn) | vite 把 `/api` 代理到 5174 |
| Prod / Docker | 5174 | 单端口，FastAPI 同时托管静态 + API |

## 环境变量

| 变量 | 默认 | 用途 |
|------|------|------|
| `AURORA_HOST` | `127.0.0.1`（Docker 内设为 `0.0.0.0`） | uvicorn 绑定 host |
| `AURORA_PORT` | `5174` | uvicorn 绑定端口 |
| `AURORA_DIST_DIR` | `<repo>/dist` | 前端构建产物目录；存在则托管静态，否则纯 API（dev） |
| `AURORA_IMAP_CONCURRENCY` | `3` | 跨账户并行收取的最大 IMAP 连接数（避免连接风暴） |
| `AURORA_DATA_DIR` | `<repo>/data`（Docker 内 `/app/data`，挂在 `aurora-data` 卷） | 单用户 JSON 数据存储目录（`store.json`：待办、便签、邮件/建议已忽略状态）。指向同步盘可跨机器保留 |

## 配置入口

**所有配置都在 UI 内完成**（右上角「设置」），无需 env 或配置文件：

- **邮件账户** —— 设置 ▸ 邮件：加 IMAP 账户（常见邮箱按域名自动推断 host/port/SSL，通常只填邮箱 + 应用专用密码）。
- **AI key** —— 设置 ▸ AI：选 Anthropic / OpenAI、填 key 与模型。未配置则邮件/日程/待办走关键词、晨报走结构化拼接。
- **清晨时间 / 语音引擎 / 提示词** —— 设置 ▸ 晨报 / Prompts 标签页。

## 数据存储与隐私

- **待办、便签、邮件/建议的已忽略状态** —— 存在**后端的 JSON 文件**（`AURORA_DATA_DIR/store.json`，无数据库）。后端不可达时这些功能不可用（与邮件/日程/晨报一致）。首次升级时旧的浏览器数据会一次性自动迁移到后端。
- **设置、布局、当天晨报缓存** —— 仍存在**浏览器的 IndexedDB**（每个浏览器/设备各自一份）。
- **IMAP 密码与 AI Key 也只存浏览器**，仅随请求体发往你自己的后端；后端不持久化凭据。
- 容器侧无持久邮箱凭据；进程内 TTL 缓存（6h）只缓存 AI 判定结果，重启即清。
- `docker-compose.yml` 的命名卷 `aurora-data` 挂在 `/app/data`，持久化上面的 `store.json`（容器重建不丢）。

> 设置/布局仍在浏览器，换浏览器 / 清缓存会丢这部分。待办与便签已在后端，**跨设备的前提是各设备连同一个后端**（在固定主机部署后从各设备访问同一地址，或把 `AURORA_DATA_DIR` 指向同步盘）。建议配合 Tailscale / Cloudflare Tunnel，不要把未鉴权的实例直接暴露到公网。

## PWA 安装

在 iPad / 手机 Safari 打开部署地址 → 分享 → 添加到主屏幕，即获得全屏横屏 PWA。
