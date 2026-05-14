import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL ?? "http://localhost:8000",
        changeOrigin: true,
        // FastAPI routes are unprefixed (/health, /analyse/...) — strip /api
        // before forwarding so the frontend can use a consistent /api/* path.
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
