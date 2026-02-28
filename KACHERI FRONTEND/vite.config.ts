import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // HTTP API → Fastify (drop /api)
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      // KCL component library assets → Fastify
      "/kcl": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
      // Yjs websocket
      "/yjs": {
        // Yjs now runs as a standalone websocket server (default port 1234)
        target: "http://127.0.0.1:1234",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      // Workspace websocket namespace → Fastify
      "/workspace": {
        target: "http://127.0.0.1:4000",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
