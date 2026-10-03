import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/main" },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/preload" },
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: { "@": resolve(__dirname, "src/renderer"), "@shared": resolve(__dirname, "src/shared") },
    },
    plugins: [react(), tailwindcss()],
    // Inline PostCSS config so Vite does not pick up the ERP's postcss.config.mjs one level up.
    css: { postcss: { plugins: [] } },
    build: {
      outDir: "out/renderer",
      rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") },
    },
  },
});
