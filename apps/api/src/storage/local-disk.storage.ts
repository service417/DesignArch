import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetrievedObject, StorageProvider, StoredObject } from './storage.types';
import { UrlSigner } from './url-signer';

/**
 * Content types we are willing to serve back, keyed by the extension we chose
 * when the object was written.
 *
 * The stored key's extension is authoritative rather than anything the client
 * sent, because MediaService only ever mints keys from a magic-byte sniff. An
 * unknown extension is therefore a bug or a tampered `file_ref`, not a normal
 * case — hence the deliberately inert fallback further down.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  // Job card attachments admit a wider set than inspection evidence.
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/**
 * Filesystem-backed StorageProvider for local development.
 *
 * Chosen over standing up MinIO so the inspection-evidence path could be built
 * and proven end to end immediately; the S3 provider is a drop-in replacement
 * behind StorageProvider. Not suitable for production: no replication, and it
 * pins the API to a single machine's disk.
 */
@Injectable()
export class LocalDiskStorage implements StorageProvider {
  private readonly logger = new Logger(LocalDiskStorage.name);
  private readonly root: string;
  private readonly publicBase: string;
  private readonly ttlSeconds: number;

  constructor(
    config: ConfigService,
    private readonly signer: UrlSigner,
  ) {
    this.root = resolve(config.get<string>('MEDIA_LOCAL_ROOT') ?? '.local-storage');
    this.publicBase = (config.get<string>('MEDIA_PUBLIC_BASE_URL') ?? '/api/v1').replace(
      /\/$/,
      '',
    );
    this.ttlSeconds = Number(config.get('MEDIA_URL_TTL_SECONDS') ?? 300);
    this.logger.log(`Local media storage rooted at ${this.root}`);
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    // 'wx' fails rather than overwrites: keys are UUID-based, so a collision
    // means something is wrong, and silently replacing stored evidence is the
    // one outcome we must never allow.
    await writeFile(path, body, { flag: 'wx' });

    return {
      key,
      bytes: body.byteLength,
      checksum: createHash('sha256').update(body).digest('hex'),
    };
  }

  async get(key: string): Promise<RetrievedObject> {
    const path = this.resolveKey(key);

    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      throw new NotFoundException('That file is no longer available.');
    }

    return {
      stream: createReadStream(path),
      bytes: size,
      contentType:
        CONTENT_TYPE_BY_EXTENSION[extname(key).toLowerCase()] ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  signedUrl(key: string, ttlSeconds: number = this.ttlSeconds): string {
    const { expiresAt, signature } = this.signer.sign(key, ttlSeconds);
    const query = new URLSearchParams({
      key,
      expires: String(expiresAt),
      signature,
    });
    return `${this.publicBase}/media/file?${query.toString()}`;
  }

  /**
   * Map an object key onto a path, refusing anything that escapes the root.
   *
   * Keys are generated internally today, but `file_ref` is a database column and
   * this method is the last line between it and the filesystem. Traversal is
   * checked after normalisation so `a/../../etc/passwd` and friends cannot slip
   * through as literal substrings.
   */
  private resolveKey(key: string): string {
    if (!key || isAbsolute(key) || key.includes('\0')) {
      throw new NotFoundException('That file is no longer available.');
    }

    const path = resolve(join(this.root, normalize(key)));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      this.logger.error(`Refused object key escaping the media root: ${key}`);
      throw new NotFoundException('That file is no longer available.');
    }
    return path;
  }
}
