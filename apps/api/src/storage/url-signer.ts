import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Issues and verifies the signatures on media URLs.
 *
 * Deliberately separate from StorageProvider. Signing is only needed by
 * providers that serve their own bytes back through this API — an S3 provider
 * would hand out AWS-signed URLs and this class would go unused, along with the
 * media file route. Keeping it apart means that swap deletes code rather than
 * rewriting it.
 *
 * The signature covers both the key and the expiry, so neither can be edited
 * independently: changing either invalidates the other's signature.
 */
@Injectable()
export class UrlSigner {
  private readonly logger = new Logger(UrlSigner.name);
  private readonly secret: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('MEDIA_URL_SECRET');

    if (!configured) {
      // Falling back silently would mean signatures that survive a restart only
      // by accident, so be loud. A random per-process secret still fails closed:
      // old links stop working rather than becoming forgeable.
      this.logger.warn(
        'MEDIA_URL_SECRET is not set; using a per-process random secret. ' +
          'Media links will not survive a restart. Set it in .env.',
      );
    }

    this.secret = configured ?? randomSecret();
  }

  sign(key: string, ttlSeconds: number): { expiresAt: number; signature: string } {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    return { expiresAt, signature: this.compute(key, expiresAt) };
  }

  /** Constant-time verification, plus the expiry check. */
  verify(key: string, expiresAt: number, signature: string): boolean {
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expected = Buffer.from(this.compute(key, expiresAt), 'hex');
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }

    // timingSafeEqual throws on a length mismatch, which would itself leak the
    // expected length through an exception path.
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }

  private compute(key: string, expiresAt: number): string {
    return createHmac('sha256', this.secret).update(`${key}:${expiresAt}`).digest('hex');
  }
}

function randomSecret(): string {
  return randomBytes(32).toString('hex');
}
