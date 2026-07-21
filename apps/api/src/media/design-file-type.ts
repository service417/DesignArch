/**
 * Identification for job card attachments (FR-4).
 *
 * Same principle as image-type.ts — the bytes decide, never the declared
 * Content-Type — but a wider allowlist, because a design brief is legitimately a
 * PDF drawing rather than a photograph.
 *
 * Kept separate from the inspection-photo sniffer on purpose. Widening *that*
 * allowlist to admit PDFs would let a document be filed as inspection evidence,
 * and evidence is what an approval, and therefore a payment, rests on.
 */

import { sniffImageType } from './image-type';

export type DesignMime =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/heic'
  | 'image/webp';

export interface DesignFileType {
  mime: DesignMime;
  extension: '.pdf' | '.jpg' | '.png' | '.heic' | '.webp';
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function sniffDesignFile(buffer: Buffer): DesignFileType | null {
  if (startsWith(buffer, PDF_SIGNATURE)) {
    return { mime: 'application/pdf', extension: '.pdf' };
  }

  // WebP is a RIFF container: "RIFF" <4-byte length> "WEBP".
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: '.webp' };
  }

  // Everything an inspection photo may be is also a valid attachment.
  const image = sniffImageType(buffer);
  return image ? { mime: image.mime, extension: image.extension } : null;
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}
