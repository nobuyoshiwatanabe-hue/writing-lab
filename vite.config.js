import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // ローカラ開発時に /api/* を Vercel Dev へプロキシ
  // （vercel dev を使う場合は不要。npm run dev の場合のみ）
  server: {
    port: 3000,
  },
});
