import { sniffImageType } from './image-type';

/** Build an ISO-BMFF header with the given brand, as HEIC files carry. */
function ftyp(brand: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]), // box length
    Buffer.from('ftyp', 'latin1'),
    Buffer.from(brand, 'latin1'),
    Buffer.alloc(8),
  ]);
}

describe('sniffImageType', () => {
  it('recognises JPEG by its start-of-image marker', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    expect(sniffImageType(jpeg)).toEqual({ mime: 'image/jpeg', extension: '.jpg' });
  });

  it('recognises PNG by its 8-byte signature', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    expect(sniffImageType(png)).toEqual({ mime: 'image/png', extension: '.png' });
  });

  it.each(['heic', 'heix', 'mif1', 'msf1'])(
    'recognises HEIF brand %s, as iPhones emit',
    (brand) => {
      expect(sniffImageType(ftyp(brand))).toEqual({ mime: 'image/heic', extension: '.heic' });
    },
  );

  it('rejects an ISO-BMFF container that is not a still image (e.g. mp4)', () => {
    expect(sniffImageType(ftyp('isom'))).toBeNull();
  });

  it('rejects content that merely claims to be an image', () => {
    // The exact shape of an upload trying to smuggle a script past a
    // Content-Type check. The bytes are what matter, and these are not an image.
    const script = Buffer.from('<?php system($_GET["c"]); ?>', 'latin1');
    expect(sniffImageType(script)).toBeNull();
  });

  it('rejects empty and truncated buffers rather than reading past the end', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.from('ftyp', 'latin1'))).toBeNull();
  });
});
