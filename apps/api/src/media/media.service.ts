import { randomUUID } from 'node:crypto';
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
import { sniffImageType } from './image-type';

/** The subset of a multipart part we actually use. */
export interface UploadedPhoto {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}

export interface PhotoView {
  id: string;
  url: string;
  uploadedAt: Date;
  supervisorId: string;
  /** Present on upload only — the size is not carried on the row. */
  bytes?: number;
}

/**
 * Inspection evidence (FR-5.6).
 *
 * A photograph here is not a decoration on a record — it is the evidence that a
 * supervisor physically attended the work, and it is what an approval, and
 * therefore a payment, ultimately rests on. So the rules are strict: only during
 * inspection, only by a supervisor, only real images, and never deletable.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly maxPhotos: number;
  private readonly maxBytes: number;
  private readonly urlTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    this.maxPhotos = Number(config.get('MAX_INSPECTION_PHOTOS') ?? 10);
    this.maxBytes = Number(config.get('MAX_PHOTO_BYTES') ?? 5 * 1024 * 1024);
    this.urlTtlSeconds = Number(config.get('MEDIA_URL_TTL_SECONDS') ?? 300);
  }

  async attachInspectionPhoto(
    stageId: string,
    supervisorId: string,
    file: UploadedPhoto | undefined,
    ip?: string,
  ): Promise<PhotoView> {
    if (!file?.buffer?.length) {
      throw new UnsupportedMediaTypeException({
        code: 'PHOTO_MISSING',
        message: 'Attach a photograph in the `file` field of the form.',
      });
    }

    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true, status: true, _count: { select: { photos: true } } },
    });

    if (!stage) throw new NotFoundException(`Stage ${stageId} was not found.`);

    // Evidence is gathered *during* the inspection. Allowing uploads after
    // approval would let the photo record be furnished after the fact, which is
    // exactly the tampering this trail exists to rule out.
    if (stage.status !== 'READY_FOR_INSPECTION') {
      throw new ConflictException({
        code: 'STAGE_NOT_UNDER_INSPECTION',
        message:
          `Inspection photographs can only be added while a stage is awaiting ` +
          `inspection; this one is ${stage.status}.`,
      });
    }

    if (stage._count.photos >= this.maxPhotos) {
      throw new ConflictException({
        code: 'PHOTO_LIMIT_REACHED',
        message: `A stage may carry at most ${this.maxPhotos} inspection photographs.`,
      });
    }

    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException({
        code: 'PHOTO_TOO_LARGE',
        message: `Each photograph must be ${Math.floor(this.maxBytes / 1024 / 1024)} MB or smaller.`,
      });
    }

    // The declared mimetype is never trusted — only the bytes.
    const imageType = sniffImageType(file.buffer);
    if (!imageType) {
      this.logger.warn(
        `Rejected upload on stage ${stageId}: declared ${file.mimetype}, ` +
          `but the content is not a JPEG, PNG or HEIC image.`,
      );
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_IMAGE',
        message: 'Photographs must be JPEG, PNG or HEIC images.',
      });
    }

    const key = `inspections/${stageId}/${randomUUID()}${imageType.extension}`;
    const stored = await this.storage.put(key, file.buffer, imageType.mime);

    try {
      const photo = await this.prisma.$transaction(async (tx) => {
        const created = await tx.inspectionPhoto.create({
          data: { stageId, supervisorId, fileRef: stored.key },
          select: { id: true, createdAt: true },
        });

        await this.audit.recordIn(tx, {
          actorId: supervisorId,
          action: 'INSPECTION_PHOTO_ADDED',
          entity: 'stage',
          entityId: stageId,
          meta: {
            photoId: created.id,
            fileRef: stored.key,
            bytes: stored.bytes,
            // Recorded so the stored bytes can later be shown to be the ones
            // that were uploaded.
            checksum: stored.checksum,
            mime: imageType.mime,
            declaredMime: file.mimetype,
          },
          ip,
        });

        return created;
      });

      return {
        id: photo.id,
        url: this.storage.signedUrl(stored.key, this.urlTtlSeconds),
        bytes: stored.bytes,
        uploadedAt: photo.createdAt,
        supervisorId,
      };
    } catch (error) {
      // The row is the system of record; a file with no row is unreferenced
      // junk, so drop it rather than leaving the bucket to grow. Compensating
      // here is safe precisely because nothing has referenced this key yet.
      await this.storage.delete(stored.key).catch((cleanupError: unknown) => {
        this.logger.error(
          `Orphaned object ${stored.key} after a failed photo insert: ${String(cleanupError)}`,
        );
      });
      throw error;
    }
  }

  /** Photographs for a stage, each with a freshly signed, short-lived URL. */
  async listForStage(stageId: string): Promise<PhotoView[]> {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true },
    });
    if (!stage) throw new NotFoundException(`Stage ${stageId} was not found.`);

    const photos = await this.prisma.inspectionPhoto.findMany({
      where: { stageId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileRef: true, createdAt: true, supervisorId: true },
    });

    return photos.map((photo) => ({
      id: photo.id,
      url: this.storage.signedUrl(photo.fileRef, this.urlTtlSeconds),
      uploadedAt: photo.createdAt,
      supervisorId: photo.supervisorId,
    }));
  }
}
