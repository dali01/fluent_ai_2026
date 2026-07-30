import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStorage } from "./index";

const ROOT = path.join(process.cwd(), ".uploads");

function resolveSafe(key: string): string {
  const abs = path.resolve(ROOT, key);
  if (!abs.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return abs;
}

/** Dev-only storage: files under .uploads/ (gitignored), served by
 * /api/files/[...key] with org checks. */
export class LocalDiskStorage implements FileStorage {
  // contentType is unused locally; the file route sniffs on serve.
  async put(key: string, data: Buffer, options: { contentType: string }) {
    void options;
    const abs = resolveSafe(key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return { url: `/api/files/${key}` };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(resolveSafe(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(resolveSafe(key)).catch(() => {});
  }
}
