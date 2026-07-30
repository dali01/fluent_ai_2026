import { del, put } from "@vercel/blob";
import type { FileStorage } from "./index";

/** Production storage on Vercel Blob. URLs are public-but-unguessable;
 * private access control is on TODO-FUTURE. */
export class VercelBlobStorage implements FileStorage {
  private urls = new Map<string, string>();

  async put(key: string, data: Buffer, options: { contentType: string }) {
    const blob = await put(key, data, {
      access: "public",
      contentType: options.contentType,
      addRandomSuffix: false,
    });
    this.urls.set(key, blob.url);
    return { url: blob.url };
  }

  async get(key: string): Promise<Buffer> {
    const url = this.urls.get(key) ?? (await this.resolveUrl(key));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const url = this.urls.get(key) ?? (await this.resolveUrl(key));
    await del(url);
    this.urls.delete(key);
  }

  private async resolveUrl(key: string): Promise<string> {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: key, limit: 1 });
    if (blobs.length === 0) throw new Error(`Blob not found: ${key}`);
    return blobs[0].url;
  }
}
