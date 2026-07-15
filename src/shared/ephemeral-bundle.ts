import { readFile, rm } from "node:fs/promises";

export async function readAndDeleteBundle(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } finally {
    await rm(filePath, { force: true });
  }
}
