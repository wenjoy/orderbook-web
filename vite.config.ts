import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // 后端地址通过 VITE_BACKEND_URL 配置，未配置时才回退到本地默认值。
  const backend = (env.VITE_BACKEND_URL || "http://127.0.0.1:8080").replace(
    /\/+$/,
    ""
  );
  const wsBackend = backend.replace(/^http/i, "ws");

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
        "/ws": {
          target: wsBackend,
          ws: true,
        },
      },
    },
  };
});
