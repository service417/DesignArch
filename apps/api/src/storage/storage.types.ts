import { Readable } from 'node:stream';

/** DI token — always inject the interface, never a concrete provider. */
export const STORAGE_PROVIDER = 'designarc:storage-provider';

export interface StoredObject {
  /** Provider-relative object key. This is what goes in `file_ref`. */
  key: string;
  bytes: number;
  /** SHA-256 of the stored bytes, hex. Lets us prove evidence was not altered. */
  checksum: string;
}

export interface RetrievedObject {
  stream: Readable;
  bytes: number;
  contentType: string;
}

/**
 * Binary object storage (Blueprint §9).
 *
 * The blueprint calls for S3-compatible storage with short-lived signed URLs.
 * That is a deployment concern, not a domain one, so the rest of the system
 * depends on this interface and never on where the bytes physically live. The
 * local-disk provider exists so the inspection-evidence path can be built and
 * proven end to end now; swapping in S3 later is a new class and one binding in
 * StorageModule, with no change to MediaService or the state machine.
 *
 * `signedUrl` is on the interface because time-limited, credential-free read
 * access is a guarantee callers depend on — every provider must offer it, even
 * though each does so by a different mechanism.
 */
export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<RetrievedObject>;
  /**
   * Remove an object. Used only to compensate a failed database write — never to
   * delete inspection evidence, which is immutable and retained (decision C4).
   */
  delete(key: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): string;
}
