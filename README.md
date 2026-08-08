# Pi Web

基于 [Pi](https://github.com/earendil-works/pi) 做的网页版聊天界面，平时自己用。

## 功能

- 浏览器里和 Pi 对话，流式输出
- 工具调用可视化：bash 命令高亮 + ANSI 输出、文件编辑/写入显示 diff（左右/上下分栏）
- 会话与终端里的 Pi 共享（`~/.pi/agent/sessions`），网页里开的会话终端也能恢复
- 亮色 / 暗色 / 跟随系统三模式主题

## 启动

```bash
vp install
vp run dev
```

打开 http://localhost:5173 即可（后端监听 8787）。

## 结构

```
apps/website   React 前端（聊天 UI）
apps/server    Node + Pi SDK 后端（WebSocket 流式推送事件）
packages/utils 共享代码
```

## 说明

只监听本机，未做认证，不要暴露到公网。
