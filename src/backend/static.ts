import express, { type Express } from "express";
import fs from "fs";
import path from "path";

const HASHED_ASSET_NAME = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

export function staticCacheControl(filePath: string): string {
  return HASHED_ASSET_NAME.test(path.basename(filePath))
    ? "public, max-age=31536000, immutable"
    : "no-store";
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders(response, filePath) {
      response.setHeader("Cache-Control", staticCacheControl(filePath));
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
