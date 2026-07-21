import { sniffDesignFile } from './design-file-type';
import { sniffImageType } from './image-type';

const pdf = () => Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(32)]);
const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'latin1'),
    Buffer.alloc(16),
  ]);

describe('sniffDesignFile', () => {
  it('accepts a PDF, which a design brief usually is', () => {
    expect(sniffDesignFile(pdf())).toEqual({ mime: 'application/pdf', extension: '.pdf' });
  });

  it('accepts WebP, which inspection photographs do not allow', () => {
    expect(sniffDesignFile(webp())).toEqual({ mime: 'image/webp', extension: '.webp' });
    expect(sniffImageType(webp())).toBeNull();
  });

  it('accepts everything an inspection photograph may be', () => {
    expect(sniffDesignFile(png())).toEqual({ mime: 'image/png', extension: '.png' });
  });

  it('rejects a PDF as inspection evidence', () => {
    // The separation that matters: a document must never satisfy the approval
    // gate that requires a photograph of the physical work.
    expect(sniffImageType(pdf())).toBeNull();
  });

  it('rejects a RIFF container that is not WebP, such as a WAV', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'latin1'),
      Buffer.alloc(16),
    ]);
    expect(sniffDesignFile(wav)).toBeNull();
  });

  it('rejects an executable renamed to .pdf', () => {
    const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(32)]);
    expect(sniffDesignFile(exe)).toBeNull();
  });

  it('rejects empty and truncated buffers', () => {
    expect(sniffDesignFile(Buffer.alloc(0))).toBeNull();
    expect(sniffDesignFile(Buffer.from('%PD', 'latin1'))).toBeNull();
    expect(sniffDesignFile(Buffer.from('RIFF', 'latin1'))).toBeNull();
  });
});
