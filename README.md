# Aurora Dashboard

> 一个本地优先的个人 AI 仪表盘 — todo + calendar + email + 天气 + 系统 + 新闻 + 音乐 + AI 聊天，全部以 widget 形式可拖拽布局，PWA 安装到桌面/iPad 即可全屏使用。

![aurora](public/favicon.svg)

## 特性

- **十个 widget 即开即用** — 时钟、天气、今日日程、重要邮件、Todo、系统占用、新闻、音乐播放器、AI 聊天、AI Agent 用量
- **拖拽布局** — react-grid-layout，4 个断点 (lg/md/sm/xs) 各自记忆
- **横屏 iPad 无滚动** — `rowHeight` 根据视口高度动态计算，所有 widget 都能塞进一屏
- **PWA** — 添加到主屏后全屏运行，强制横屏 `display: standalone`
- **完全本地** — 设置、布局、todo、音乐文件全部存浏览器 IndexedDB；密码不会离开本机
- **可选后端** — `npm run dev` 同时启动一个 127.0.0.1:5174 的 Express 服务，负责浏览器拿不到的能力：IMAP 邮件、系统占用、RSS、Claude/Codex 本地用量缓存读取
- **AI 聊天换风格** — 内置 5 种 persona（精炼/温柔/严师/段子手/哲思），随时切换
- **音乐"蒸馏"推荐** — 给喜欢的曲子点心，下次自动加权排队
- **天气** — Open-Meteo，无需 API key
- **美** — Glass-morphism + 极光渐变背景 + Inter / Space Grotesk

## 快速开始

```bash
cd ~/Documents/aurora-dashboard
npm install
npm run dev
```

打开 http://localhost:5173/ — 一切配置在 UI 内完成（右上角「设置」）。

构建生产版：

```bash
npm run build
npm run preview -- --host        # http://本机IP:4173
```

把 `http://本机IP:4173` 在 iPad Safari 打开，「分享 → 添加到主屏幕」即获得 PWA。

## 目录结构

```
src/
  App.tsx                    顶级布局，根据 ready/编辑模式渲染
  main.tsx                   入口 + React Query
  components/
    Dashboard.tsx            react-grid-layout 容器 + 动态行高
    WidgetWrapper.tsx        玻璃卡片 + 拖拽手柄 + 删除按钮
    TopBar.tsx               顶部工具栏
    SettingsPanel.tsx        全部 UI 配置
    ChatDrawer.tsx           右侧 AI 聊天抽屉
    widgets/                 十个 widget 实现
  lib/
    store.ts                 zustand state
    storage.ts               Dexie / IndexedDB + 默认布局
    api.ts                   后端 fetch 帮助
    ai.ts                    Anthropic / OpenAI 浏览器直连
    weather.ts               Open-Meteo client
  types/index.ts             全局类型 + persona 定义
server/
  index.mjs                  Express 入口
  routes/
    system.mjs               CPU / 内存
    news.mjs                 RSS 聚合
    email.mjs                IMAP 重要邮件 + 日程抽取
    agents.mjs               Claude/Codex 本地缓存解析
    ai.mjs                   AI 聊天反向代理（CORS 兜底）
```

## 关于 Claude Code / Codex 用量

Aurora 只读取 CLI 自己写在本地 (`~/.claude`, `~/.codex`) 的会话/项目文件，
**不**调用未公开的内部端点抓取 quota。这种做法符合 Anthropic Usage Policy（你只在读取自己机器上的本地文件）。

如果你想要"还剩多少消息 / 多久重置"这种精确指标，目前只能：

1. CLI 内执行 `/status` 或 `/usage`，把结果记下
2. 在组件内手动输入（仍可显示倒计时）

绕过官方策略去 scrape token、模拟 web UI 调用，可能触发账号风控 — Aurora 默认拒绝这种实现。

## 安全 / 隐私

- 所有凭据（IMAP 密码、AI API Key）保存在浏览器 IndexedDB，未发往任何远端
- 本地后端只监听 `127.0.0.1`
- 邮件请使用 Gmail App Password（两步验证 → 应用专用密码）
- 想真正稳一点：把整个项目跑在你的 NAS / 树莓派，然后用 Tailscale/Cloudflare Tunnel 访问

## 路线图 / 未完成

- Spotify OAuth + Web Playback SDK（settings 里已有入口，需要补 `/api/spotify/*` 路由）
- Google Calendar / Outlook ICS 直接接入（目前从邮件抽日程）
- 多 dashboard 切换 / 主题预设
- 国际化（当前默认中文，组件内文本独立）

## License

MIT
