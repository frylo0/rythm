import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  publicDir: false,
  build: {
    outDir: "public/assets",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        app: "src/client/main.ts"
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]"
      }
    }
  }
});
