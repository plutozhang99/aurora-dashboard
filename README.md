# Aurora Dashboard

> 一个本地优先、以**邮件为中心的晨间指挥台** — 晨间语音播报 + 多账户重要邮件聚合 + 今日日程 + 邮件待办建议 + 天气 + 新闻，以 Ant Design Masonry 面板布局呈现，PWA 安装到桌面 / iPad 即可全屏使用。

![aurora](public/favicon.svg)

前端 React + Vite + PWA；后端 **Python / FastAPI**（必需）。凭据只存浏览器本机。

## 特性

- **🌅 晨间播报** — 首屏顶部一张通栏卡片：聚合重要邮件 + 今日日程 + 新闻偏好源，经 AI 总结成一段口语化简报；**语音优先**（默认浏览器 TTS，可在设置切换云端 edge-tts 免费高音质音色），文本默认折叠手动展开。当天首次打开、已过设定的清晨时间且当天未生成时自动生成；可手动「重新生成」，每天至多缓存一份。
- **📬 多账户邮件聚合** — 任意数量 IMAP 账户增删改、独立启用；重要邮件跨所有启用账户**合并、去重、时间倒序**为一个统一列表，来源用轻量色点标识（悬停显账户名），不按账户分栏。单账户失败被隔离，不影响其余。
- **💡 邮件待办建议** — AI（或关键词降级）从邮件识别「可能的待办」进入独立建议区，一键「确认」转为正式待办（保留邮件来源链接）或「忽略」；默认不污染正式待办。
- **🕐 六个核心 widget** — 晨间播报、今日日程、重要邮件、待办、新闻、时钟、天气。
- **Ant Design Masonry 布局** — 使用 AntD Layout / Flex / Grid / Card 自动按列分配 widget，桌面三列、平板两列、手机单列。
- **PWA** — 添加到主屏后全屏运行，强制横屏 `display: standalone`。
- **本地优先** — 设置、布局、待办、晨报缓存全部存浏览器 IndexedDB；**IMAP 密码与 AI Key 不离开本机**。
- **AI 可选 · 多 provider** — 邮件重要性判定、日程抽取、待办识别、晨报总结都可走 LLM，支持 **Anthropic Claude / OpenAI / DeepSeek**（填 key），以及 **Ollama 本地模型**（无需 key，指向 `localhost:11434` 即可）；**未配置则自动降级为关键词 / 结构化拼接**，功能不缺失。
- **天气** — Open-Meteo，无需 API key。
- **美 · Illustration Dashboard** — Ant Design v6.4.3 + antd-style 主题：粗黑描边、硬投影、鲜明状态色与插画感控件。

> 自 v0.2 起移除了音乐播放器、系统占用、AI 用量、AI 聊天四个 widget，并把后端从 Node/Express 重写为 Python/FastAPI（`/api` HTTP 契约保持不变）。

## 快速开始（本地开发）

需要 **Node ≥ 18** 与 **Python ≥ 3.11**。后端不再可选——前后端一起启动。

```bash
cd ~/Documents/aurora-dashboard

# 前端依赖
npm install

# 后端依赖（一次性）
python3 -m venv backend/.venv
backend/.venv/bin/pip install -e 'backend[dev]'

# 同时启动 vite(:5173) + uvicorn(:5174)
npm run dev
```

打开 http://localhost:5173/ — 一切配置在 UI 内完成（右上角「设置」）：添加 IMAP 账户、填 AI key、选清晨时间与语音引擎、编辑提示词。

> `npm run dev` 通过 `backend/.venv/bin/uvicorn` 启动后端（需先按上面创建好 `backend/.venv`），并用 vite 把 `/api` 代理到 `127.0.0.1:5174`。若后端未运行，依赖后端的区域（播报 / 邮件 / 日程）会显式提示「本地后端未运行」而非空白。
>
> Windows 用户：venv 的可执行文件在 `backend\.venv\Scripts\`，把 `dev:api` 脚本里的 `backend/.venv/bin/uvicorn` 改成 `backend\.venv\Scripts\uvicorn` 即可。

## 部署（Docker，单镜像）

最省事的方式是一键脚本——它问你如何暴露（仅本机 / 仅 Tailscale / 局域网）、生成 `.env`、构建启动并做健康检查，**默认仅本机**：

```bash
npm run deploy                 # = bash scripts/deploy.sh
```

或手动单镜像多阶段构建（前端 `vite build` → Python 运行时托管 `dist/` + `/api`，单端口）：

```bash
docker compose up --build      # 然后打开 http://localhost:5174/
```

想人在外面经 **Tailscale** 访问、其余时候访问不到：部署时选「仅 Tailscale」，把端口绑到本机 `100.x.y.z`（只在 tailnet 内可路由）。详见 [docs/DEPLOY.md](docs/DEPLOY.md)（部署脚本、端口、env、远程访问、数据存储、PWA 安装）。

## 测试

```bash
npm test                              # 前端纯逻辑（Vitest）：迁移、触发时序、来源取色、建议存储
backend/.venv/bin/pytest backend/tests -q   # 后端（pytest）：聚合/去重/隔离/分类/降级
```

后端测试不触网：IMAP 收取与 LLM 层均被注入 / monkeypatch。

## 目录结构

```
src/
  App.tsx / main.tsx          入口 + React Query
  components/
    Dashboard.tsx             AntD Grid / Flex Masonry 容器
    WidgetWrapper.tsx         AntD Card + 编辑态删除
    TopBar.tsx / SettingsPanel.tsx
    widgets/                  briefing / calendar / email / todo / news / clock / weather
  lib/
    store.ts                  zustand state + 布局权重
    storage.ts                Dexie / IndexedDB + 默认布局 + 多账户迁移 + 晨报缓存
    api.ts                    后端 fetch 帮助（apiAvailable 判后端是否在线）
    accountColors.ts          来源账户取色
    imapConfig.ts             常见邮箱 host/port 推断
    tts.ts                    可插拔语音引擎（浏览器 Web Speech + 云端 edge-tts）
    briefingTrigger.ts        清晨自动生成触发判定（纯函数）
    weather.ts                Open-Meteo client
  types/index.ts              全局类型 + 默认设置 + 默认提示词
backend/                      Python / FastAPI（见 backend/README.md）
  app/{main,config,models}.py
  app/routers/{health,news,email,briefing,store,tts}.py
  app/services/{imap,classify,briefing,news,llm}.py
  tests/                      pytest 套件
Dockerfile / docker-compose.yml / .dockerignore
```

## 安全 / 隐私

- 所有凭据（IMAP 密码、AI API Key）保存在**浏览器 IndexedDB**，仅随请求体发往你自己的本地后端，不发往任何第三方。
- 后端本身不持久化任何凭据；AI key / 邮箱密码只在请求体里短暂存在；进程内 TTL 缓存（6h）只缓存判定结果。
- Dev 后端绑定 `127.0.0.1`；Docker 内绑定 `0.0.0.0` 但应只暴露在你信任的网络。
- 邮件请使用 **Gmail 应用专用密码**（两步验证 → App Password），不要用主密码。
- 想稳定常驻：把整个项目跑在你的 NAS / 树莓派，再用 Tailscale / Cloudflare Tunnel 访问。

## 路线图 / 未完成

- 线程级邮件去重（v1 按 Message-ID + 回退键）。
- Google Calendar / Outlook ICS 直接接入（目前从邮件抽日程）。
- 国际化（当前默认中文）。

## License

MIT — 见 [LICENSE](LICENSE)。
