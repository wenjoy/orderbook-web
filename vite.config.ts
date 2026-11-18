import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 任何带 api-key 的 RPC 地址一旦写进 VITE_*，都会被原样打进浏览器 bundle。
// 这里在 dev / build 启动时直接失败，防止密钥再次泄露。
const API_KEY_IN_ENDPOINT = /[?&]api[-_]?key=/i;

function assertNoSecretInClientEnv(env: Record<string, string>): void {
  const leaked = Object.entries(env)
    .filter(([key]) => key.startsWith("VITE_"))
    .filter(([, value]) => API_KEY_IN_ENDPOINT.test(value))
    .map(([key]) => key);
  if (leaked.length > 0) {
    throw new Error(
      `[vite] 以下 VITE_* 变量包含 api-key，会被打包进前端代码：${leaked.join(", ")}\n` +
        "请改为走同源代理（VITE_SOLANA_RPC=/rpc），api-key 只保留在后端环境变量里。",
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  assertNoSecretInClientEnv(env);
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
        // Solana JSON-RPC 代理：api-key 由后端注入，浏览器只看到 /rpc。
        "/rpc": {
          target: backend,
          changeOrigin: true,
        },
        "/ws": {
          target: wsBackend,
          ws: true,
        },
      },
    },
  };
});
