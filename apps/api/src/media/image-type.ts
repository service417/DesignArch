/**
 * Image identification by magic bytes (decision TBD-05).
 *
 * Pure, no I/O, so it is unit-testable in the same way as the state machine.
 *
 * The declared Content-Type on a multipart part is attacker-controlled and
 * therefore worthless as a security control: a client can label a script
 * `image/jpeg`. Only the bytes decide. Anything unrecognised is rejected rather
 * than stored under a guessed type — the allowlist is the whole point.
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/heic';

export interface ImageType {
  mime: ImageMime;
  /** The extension we store under; the key's extension is what we serve back. */
  extension: '.jpg' | '.png' | '.heic';
}

const JPEG_SOI = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * ISO-BMFF brands that denote a HEIF still image. `mif1`/`msf1` are the generic
 * image and image-sequence brands that iOS also emits, so accepting only `heic`
 * would reject photos from real iPhones.
 */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

export function sniffImageType(buffer: Buffer): ImageType | null {
  if (startsWith(buffer, JPEG_SOI)) {
    return { mime: 'image/jpeg', extension: '.jpg' };
  }

  if (startsWith(buffer, PNG_SIGNATURE)) {
    return { mime: 'image/png', extension: '.png' };
  }

  // HEIC has no fixed prefix: the first four bytes are a box length, followed by
  // the 'ftyp' box type and then the brand.
  if (buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buffer.toString('latin1', 8, 12);
    if (HEIF_BRANDS.has(brand)) {
      return { mime: 'image/heic', extension: '.heic' };
    }
  }

  return null;
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}
