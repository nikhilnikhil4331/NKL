import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "production-csp",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content:
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
  build: {
    rollupOptions: { output: { manualChunks: { charts: ["recharts"] } } },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy: {
      "/api/agent": {
        target: "http://127.0.0.1:8765",
        rewrite: (p) => p.replace("/api/agent", ""),
      },
    },
  },
});
