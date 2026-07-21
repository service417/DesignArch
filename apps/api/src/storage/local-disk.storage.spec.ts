import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk.storage';
import { UrlSigner } from './url-signer';

/**
 * The traversal guard cannot be reached over HTTP — the signature check rejects
 * a forged key first — so it is proven here instead. It matters because
 * `file_ref` is a database column: the guard is what stands between a corrupted
 * or maliciously written row and the filesystem.
 */
describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  const signer = { sign: () => ({ expiresAt: 1, signature: 'sig' }) } as unknown as UrlSigner;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'designarc-media-'));
    const config = {
      get: (key: string) => (key === 'MEDIA_LOCAL_ROOT' ? root : undefined),
    } as unknown as ConfigService;
    storage = new LocalDiskStorage(config, signer);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores and returns the bytes it was given, with a checksum', async () => {
    const body = Buffer.from('inspection evidence');
    const stored = await storage.put('inspections/stage-1/a.jpg', body, 'image/jpeg');

    expect(stored.bytes).toBe(body.byteLength);
    expect(stored.checksum).toMatch(/^[0-9a-f]{64}$/);

    const onDisk = await readFile(join(root, 'inspections/stage-1/a.jpg'));
    expect(onDisk.equals(body)).toBe(true);
  });

  it('refuses to overwrite an existing object', async () => {
    await storage.put('a.jpg', Buffer.from('original'), 'image/jpeg');
    await expect(storage.put('a.jpg', Buffer.from('replacement'), 'image/jpeg')).rejects.toThrow();

    // The original evidence must survive the attempt.
    const onDisk = await readFile(join(root, 'a.jpg'));
    expect(onDisk.toString()).toBe('original');
  });

  it.each([
    ['parent traversal', '../../../.env'],
    ['traversal in the middle', 'inspections/../../../../etc/passwd'],
    ['absolute posix path', '/etc/passwd'],
    ['null byte truncation', 'a.jpg\0.png'],
    ['empty key', ''],
  ])('refuses to read outside the media root: %s', async (_label, key) => {
    await expect(storage.get(key)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports a missing object as not found rather than throwing a raw fs error', async () => {
    await expect(storage.get('nope.jpg')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves a content type derived from the stored key, not from the caller', async () => {
    await storage.put('a.png', Buffer.from('x'), 'text/html');
    const object = await storage.get('a.png');
    expect(object.contentType).toBe('image/png');
  });
});
