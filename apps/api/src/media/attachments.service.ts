import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.types';
import { sniffDesignFile } from './design-file-type';
import type { UploadedPhoto } from './media.service';

/**
 * Design files attached to a job card (FR-4).
 *
 * Deliberately a different module from inspection photographs even though both
 * store bytes, because they are different things: an attachment is the
 * *instruction* — the drawing a carpenter works from — while an inspection photo
 * is the *evidence* that the work was done. The schema separates them for the
 * same reason, and conflating them would let a design file satisfy the approval
 * gate that requires evidence.
 *
 * So the rules differ too. Attachments are admin-supplied, may be replaced while
 * the work is still open, and permit PDFs and drawings, not just images.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly maxBytes: number;
  private readonly maxPerCard: number;
  private readonly urlTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    // Drawings are legitimately larger than a phone photograph.
    this.maxBytes = Number(config.get('MAX_ATTACHMENT_BYTES') ?? 20 * 1024 * 1024);
    this.maxPerCard = Number(config.get('MAX_ATTACHMENTS_PER_JOB_CARD') ?? 20);
    this.urlTtlSeconds = Number(config.get('MEDIA_URL_TTL_SECONDS') ?? 300);
  }

  async attach(jobCardId: string, uploaderId: string, file: UploadedPhoto | undefined, ip?: string) {
    if (!file?.buffer?.length) {
      throw new UnsupportedMediaTypeException({
        code: 'FILE_MISSING',
        message: 'Attach a file in the `file` field of the form.',
      });
    }

    const jobCard = await this.prisma.jobCard.findUnique({
      where: { id: jobCardId },
      select: { id: true, _count: { select: { attachments: true } } },
    });
    if (!jobCard) throw new NotFoundException(`Job card ${jobCardId} was not found.`);

    if (jobCard._count.attachments >= this.maxPerCard) {
      throw new ConflictException({
        code: 'ATTACHMENT_LIMIT_REACHED',
        message: `A job card may carry at most ${this.maxPerCard} attachments.`,
      });
    }

    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: `Attachments must be ${Math.floor(this.maxBytes / 1024 / 1024)} MB or smaller.`,
      });
    }

    // Same principle as inspection photos: the bytes decide, not the label.
    const fileType = sniffDesignFile(file.buffer);
    if (!fileType) {
      this.logger.warn(
        `Rejected attachment on job card ${jobCardId}: declared ${file.mimetype}, ` +
          `but the content is not a PDF or a supported image.`,
      );
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_ATTACHMENT',
        message: 'Attachments must be a PDF, JPEG, PNG, HEIC or WebP file.',
      });
    }

    const key = `attachments/${jobCardId}/${randomUUID()}${fileType.extension}`;
    const stored = await this.storage.put(key, file.buffer, fileType.mime);

    try {
      const attachment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.attachment.create({
          data: {
            jobCardId,
            fileRef: stored.key,
            // Persisted for the file carousel. Previously this lived only in the
            // audit meta, so the list endpoint had no name to show. The stored
            // key stays a UUID we mint; this never reaches the filesystem.
            filename: safeFilename(file.originalname),
            kind: 'DESIGN',
            uploadedById: uploaderId,
          },
          select: { id: true, createdAt: true, kind: true, filename: true },
        });

        await this.audit.recordIn(tx, {
          actorId: uploaderId,
          action: 'ATTACHMENT_ADDED',
          entity: 'job_card',
          entityId: jobCardId,
          meta: {
            attachmentId: created.id,
            fileRef: stored.key,
            bytes: stored.bytes,
            checksum: stored.checksum,
            mime: fileType.mime,
            // The original name is kept for display only; it never touches the
            // stored key, which is a UUID we mint.
            filename: safeFilename(file.originalname),
          },
          ip,
        });

        return created;
      });

      return {
        id: attachment.id,
        kind: attachment.kind,
        filename: safeFilename(file.originalname),
        bytes: stored.bytes,
        url: this.storage.signedUrl(stored.key, this.urlTtlSeconds),
        uploadedAt: attachment.createdAt,
      };
    } catch (error) {
      await this.storage.delete(stored.key).catch((cleanupError: unknown) => {
        this.logger.error(
          `Orphaned object ${stored.key} after a failed attachment insert: ${String(cleanupError)}`,
        );
      });
      throw error;
    }
  }

  async listForJobCard(jobCardId: string) {
    const jobCard = await this.prisma.jobCard.findUnique({
      where: { id: jobCardId },
      select: { id: true },
    });
    if (!jobCard) throw new NotFoundException(`Job card ${jobCardId} was not found.`);

    const attachments = await this.prisma.attachment.findMany({
      where: { jobCardId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fileRef: true,
        filename: true,
        kind: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    return attachments.map(({ fileRef, filename, ...attachment }) => {
      const extension = extname(fileRef).toLowerCase();
      return {
        ...attachment,
        // Derived from the key we minted, so it is always accurate.
        extension,
        isPdf: extension === '.pdf',
        // Rows written before filenames were stored have none; fall back to
        // something a person can read rather than showing an empty label.
        filename: filename ?? `design${extension}`,
        url: this.storage.signedUrl(fileRef, this.urlTtlSeconds),
      };
    });
  }

  /**
   * Remove a design file.
   *
   * Permitted, unlike inspection evidence: a superseded drawing is a mistake to
   * correct, not a record to preserve. The object is left in storage and only
   * the row is dropped — an orphan costs disk, whereas deleting bytes another
   * row might reference costs a document. The audit row records who removed it.
   */
  async remove(attachmentId: string, adminId: string, ip?: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, jobCardId: true, fileRef: true },
    });
    if (!attachment) throw new NotFoundException(`Attachment ${attachmentId} was not found.`);

    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: attachmentId } });
      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'ATTACHMENT_REMOVED',
        entity: 'job_card',
        entityId: attachment.jobCardId,
        meta: { attachmentId, fileRef: attachment.fileRef },
        ip,
      });
    });

    return { id: attachmentId, removed: true };
  }
}

/**
 * A display name safe to store and echo back.
 *
 * Strips any path component a client may have sent — browsers send a bare name
 * but nothing forces them to — and caps the length. This value never reaches
 * the filesystem, but it does reach other people's screens.
 */
function safeFilename(original: string | undefined): string {
  if (!original) return 'attachment';
  const base = original
    .replace(/^.*[\\/]/, '')
    // Control characters, written escaped: raw bytes here would be invisible
    // to review, and they can forge line breaks in logs and response headers.
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return base.slice(0, 120) || 'attachment';
}
