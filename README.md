# Pi Web

一个极简的 Pi 客户端：浏览器里的聊天界面，与你电脑上的 [Pi](https://github.com/earendil-works/pi-coding-agent) 交互。

- **前端** `apps/website` — React + Vite+，聊天 UI（流式输出、工具调用可视化、会话列表）
- **后端** `apps/server` — 独立 Node 服务，内嵌 Pi SDK（`@earendil-works/pi-coding-agent`），通过 WebSocket 流式推送事件

会话由 Pi 的 `SessionManager` 持久化到 `~/.pi/agent/sessions/<encoded-cwd>/`，与终端里的 Pi 共享同一份会话文件——在 Web 里开的会话可以在终端恢复，反之亦然。

## 每个会话有自己的工作目录

Pi Web 里**文件夹是 session 的属性**，而不是全局设置：

- **新建会话**时点「📂 用系统对话框选择文件夹」弹出 **macOS 原生文件夹选择器**（NSOpenPanel，经 `osascript`），选完即创建；agent 会在所选目录下运行，并加载该项目的 `AGENTS.md`、extensions、skills、prompts、settings
- **侧边栏按目录分组**列出所有工作目录的会话（`SessionManager.listAll`），点击任意会话即可恢复——SDK 会按会话文件头里记录的 cwd 自动重建 runtime，等价于在那个目录重新启动 pi
- 恢复旧会话时，agent 回到该会话自己的目录，不受当前其它会话影响

## 快速开始

```bash
vp install        # 安装依赖
vp run dev        # 同时启动后端(8787)和前端 dev server
```

打开 http://localhost:5173 即可使用（后端默认只监听 127.0.0.1:8787）。

也可以分开启动：

```bash
vp run dev:server   # 后端
vp run dev:web      # 前端（代理 /api 和 /ws 到后端）
```

## 配置

环境变量（作用于 `apps/server`）：

| 变量       | 默认                | 说明                       |
| ---------- | ------------------- | -------------------------- |
| `PORT`     | `8787`              | 后端监听端口               |
| `HOST`     | `127.0.0.1`         | 监听地址（默认仅本机）     |
| `PI_CWD`   | monorepo 根目录     | Pi agent 的工作目录        |
| `WEB_DIST` | `apps/website/dist` | 生产模式下要托管的静态站点 |

## 生产模式（单进程）

```bash
vp run -r build     # 构建前端和后端
cd apps/server && npm start   # 或: node --experimental-strip-types 直接跑
```

后端会自动托管 `apps/website/dist` 的静态文件，访问 http://127.0.0.1:8787 即可。

## 开发

```bash
vp run ready    # 格式、lint、类型检查、测试、构建
vp check        # 只做检查
```

## 说明

- 后端与终端 Pi 共享模型 / API key / skills / extensions（`~/.pi/agent`），无需额外配置。
- 只监听本机，未做认证；不要把它暴露到公网。
