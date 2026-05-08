import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
  ],

  // 路径别名配置
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  // 优化依赖预构建
  optimizeDeps: {
    include: ["@vue-flow/core", "@vue-flow/background", "@vue-flow/controls", "@vue-flow/minimap", "zustand", "immer", "zod", "uuid"],
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/.venv-video/**"],
    },
  },
}));
