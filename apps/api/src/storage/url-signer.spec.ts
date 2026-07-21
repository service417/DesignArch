import { ConfigService } from '@nestjs/config';
import { UrlSigner } from './url-signer';

const config = (secret?: string) =>
  ({ get: () => secret }) as unknown as ConfigService;

describe('UrlSigner', () => {
  const signer = new UrlSigner(config('test-secret'));

  it('accepts a signature it just issued', () => {
    const { expiresAt, signature } = signer.sign('inspections/s1/a.jpg', 300);
    expect(signer.verify('inspections/s1/a.jpg', expiresAt, signature)).toBe(true);
  });

  it('rejects a signature once the link has expired', () => {
    const { expiresAt, signature } = signer.sign('a.jpg', -1);
    expect(signer.verify('a.jpg', expiresAt, signature)).toBe(false);
  });

  it('rejects a key swapped onto another key’s signature', () => {
    const { expiresAt, signature } = signer.sign('inspections/s1/a.jpg', 300);
    // The whole point of signing the key: holding one valid link must not grant
    // access to a different object.
    expect(signer.verify('inspections/s2/secret.jpg', expiresAt, signature)).toBe(false);
  });

  it('rejects an extended expiry on a valid signature', () => {
    const { expiresAt, signature } = signer.sign('a.jpg', 300);
    expect(signer.verify('a.jpg', expiresAt + 86_400, signature)).toBe(false);
  });

  it('rejects malformed, empty and wrong-length signatures without throwing', () => {
    const { expiresAt } = signer.sign('a.jpg', 300);
    for (const bad of ['', 'zz', 'not-hex', 'ab'.repeat(32), 'ff']) {
      expect(signer.verify('a.jpg', expiresAt, bad)).toBe(false);
    }
    expect(signer.verify('a.jpg', Number.NaN, 'ab'.repeat(32))).toBe(false);
  });

  it('does not honour signatures from a different secret', () => {
    const other = new UrlSigner(config('a-different-secret'));
    const { expiresAt, signature } = other.sign('a.jpg', 300);
    expect(signer.verify('a.jpg', expiresAt, signature)).toBe(false);
  });

  it('falls back to a random secret when none is configured, rather than a fixed one', () => {
    const first = new UrlSigner(config(undefined));
    const second = new UrlSigner(config(undefined));
    const { expiresAt, signature } = first.sign('a.jpg', 300);

    // Two processes must not accidentally trust each other's links.
    expect(second.verify('a.jpg', expiresAt, signature)).toBe(false);
  });
});
