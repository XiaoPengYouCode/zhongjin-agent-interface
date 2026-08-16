import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  run: {
    tasks: {
      // 常驻服务不缓存：`vp run server#start` / `server#dev` 必须真实执行并前台阻塞。
      // （脚本名与 package.json scripts 不能重名，故 dev/start 已从 scripts 移除。）
      dev: {
        command: "tsx watch src/index.ts",
        cache: false,
      },
      start: {
        command: "tsx src/index.ts",
        cache: false,
      },
    },
  },
});
