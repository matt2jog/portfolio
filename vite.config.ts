import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import istanbul from "vite-plugin-istanbul";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    // runtimeErrorOverlay injects a tiny script to help display runtime errors in a
    // development overlay. it contains TypeScript-style `as` casts which aren't
    // transpiled, so including it in a production build results in a syntax error
    // (`Unexpected identifier 'as'`) that breaks the entire bundle. limit its use to
    // non-production builds.
    ...(process.env.NODE_ENV !== "production" ? [runtimeErrorOverlay()] : []),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.VITE_COVERAGE === "1"
      ? [
          istanbul({
            include: ["src/client/src/**/*.{ts,tsx}"],
            exclude: ["node_modules", "src/tests/**"],
            extension: [".ts", ".tsx"],
            requireEnv: false,
            forceBuildInstrument: true,
          }),
        ]
      : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src", "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "src", "shared"),
      "@backend": path.resolve(import.meta.dirname, "src", "backend"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "src", "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    // temporarily disable the HMR overlay so runtime errors don't block the UI
    hmr: { overlay: false },
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
