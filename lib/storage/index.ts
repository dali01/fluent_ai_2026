import { LocalDiskStorage } from "./local";
import { VercelBlobStorage } from "./vercel-blob";

/**
 * Storage abstraction for uploaded artwork/proof files.
 *
 * Keys are always `<organizationId>/<jobId>/<fileName>` — the org prefix is
 * part of the tenant-isolation story and is enforced by the file-serving
 * route. Implementations must treat keys as opaque paths.
 *
 * Vercel Blob is used when BLOB_READ_WRITE_TOKEN is set (production);
 * local disk otherwise (dev). S3 later = one more implementation.
 */
export interface FileStorage {
  /** Store a file and return the URL it can be fetched from. */
  put(
    key: string,
    data: Buffer,
    options: { contentType: string },
  ): Promise<{ url: string }>;
  /** Read a file back (used by prepress checks and the local file route). */
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let storage: FileStorage | undefined;

export function getStorage(): FileStorage {
  if (!storage) {
    storage = process.env.BLOB_READ_WRITE_TOKEN
      ? new VercelBlobStorage()
      : new LocalDiskStorage();
  }
  return storage;
}
