# Pi Web

基于 [Pi](https://github.com/earendil-works/pi) 和 [Vite+](https://viteplus.dev/) 做的网页版聊天界面。

## 功能

- 浏览器里和 Pi 对话，流式输出；排队消息可引导（打断发送）、删除、就地编辑；双击 ESC 中断任务
- 工具调用可视化：bash 命令高亮 + ANSI 输出、文件编辑/写入显示 diff（左右/上下分栏）
- 输入增强：`@` 选文件（目录下钻、递归搜索、类型图标、模糊匹配）、`$` 选 skills（标注全局/项目）
- 模型选择：悬停模型 chip 切换模型与思考等级；会话用量卡片（token / 缓存 / 成本 / 上下文占用环形图）
- 会话与终端里的 Pi 共享（`~/.pi/agent/sessions`），网页里开的会话终端也能恢复；切换会话数据按会话隔离
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
