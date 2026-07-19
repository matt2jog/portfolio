import path from "node:path";
import { preview } from "vite";

await preview({
  configFile: path.resolve(process.cwd(), "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 5000,
    strictPort: true,
  },
});
