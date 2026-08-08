import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { serveStatic, staticCacheControl } from "../../backend/static";

test("only content-hashed build assets receive immutable caching", () => {
  for (const filePath of [
    "public/assets/index-D4sH8eD1.js",
    "public/assets/styles-a1B2c3D4.css",
  ]) {
    assert.equal(
      staticCacheControl(filePath),
      "public, max-age=31536000, immutable",
      filePath,
    );
  }

  for (const filePath of [
    "public/index.html",
    "public/assets/app.js",
    "public/assets/logo.svg",
    "public/manifest.webmanifest",
    "public/sw.js",
  ]) {
    assert.equal(staticCacheControl(filePath), "no-store", filePath);
  }
});

test("static serving fails clearly when the client bundle is absent", () => {
  const globals = globalThis as typeof globalThis & { __dirname?: string };
  const previous = globals.__dirname;
  globals.__dirname = path.join(process.cwd(), "src", "backend");
  try {
    assert.throws(
      () => serveStatic({} as never),
      /Could not find the build directory/,
    );
  } finally {
    if (previous === undefined) delete globals.__dirname;
    else globals.__dirname = previous;
  }
});
