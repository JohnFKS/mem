import { defineConfig } from "vite";
import * as path from "path";

// 思源插件: 构建为 iife, 输出到 dist/, 直接放进 工作空间/data/plugins/<name>/
export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production") },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["iife"],
      name: "siyuanPluginMem",
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["siyuan"],
      output: {
        globals: { siyuan: "siyuan" },
      },
    },
  },
});
