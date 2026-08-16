import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  build: {
    // mermaid 懒加载主包约 662KB（首次遇到图表才下载，不阻塞首屏），
    // 默认 500KB 阈值会误报。首屏主包 ~490KB / gzip 159KB，可接受。
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
