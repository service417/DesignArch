import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  Ip,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { MediaService, UploadedPhoto } from './media.service';
import { AttachmentsService } from './attachments.service';
import { Public, Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.types';
import { UrlSigner } from '../storage/url-signer';

/**
 * Inspection photographs, hung off the stage they are evidence for.
 *
 * There is deliberately no delete route. Inspection photos are immutable
 * evidence retained for seven years (decision C4); removing one would break the
 * audit trail that a payment dispute depends on.
 */
@Controller('stages')
export class StagePhotosController {
  constructor(private readonly media: MediaService) {}

  @Post(':id/photos')
  @Roles('SUPERVISOR')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') stageId: string,
    @UploadedFile() file: UploadedPhoto | undefined,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.media.attachInspectionPhoto(stageId, req.user!.id, file, ip);
  }

  /**
   * Everyone on the job can see the evidence: the worker needs to see what was
   * photographed, and the admin pricing the stage needs to see what they are
   * paying for.
   */
  @Get(':id/photos')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  list(@Param('id') stageId: string) {
    return this.media.listForStage(stageId);
  }
}

/**
 * Design files on a job card (FR-4) — the brief the work is done from.
 *
 * Admin writes, everyone reads: a carpenter cannot build from a drawing they
 * cannot open. Unlike inspection evidence these can be removed, because a
 * superseded drawing is a mistake to correct rather than a record to preserve.
 */
@Controller('job-cards')
export class JobCardAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post(':id/attachments')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') jobCardId: string,
    @UploadedFile() file: UploadedPhoto | undefined,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.attachments.attach(jobCardId, req.user!.id, file, ip);
  }

  @Get(':id/attachments')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  list(@Param('id') jobCardId: string) {
    return this.attachments.listForJobCard(jobCardId);
  }

  @Delete('attachments/:attachmentId')
  @Roles('ADMIN')
  remove(
    @Param('attachmentId') attachmentId: string,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.attachments.remove(attachmentId, req.user!.id, ip);
  }
}

/**
 * Serves stored bytes against a signed URL.
 *
 * @Public because the signature *is* the credential — that is what makes these
 * URLs usable from an <img> tag, which cannot attach a bearer token. The
 * signature covers the key and the expiry and is verified on every request, so
 * this route grants nothing beyond the single object someone was already
 * authorised to be given a link to.
 *
 * This route belongs to the local-disk provider. Against S3 the signed URL
 * points at the bucket and clients never come here at all.
 */
@Controller('media')
export class MediaFilesController {
  private readonly ttlSeconds: number;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly signer: UrlSigner,
    config: ConfigService,
  ) {
    this.ttlSeconds = Number(config.get('MEDIA_URL_TTL_SECONDS') ?? 300);
  }

  @Public()
  @Get('file')
  async serve(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: Response,
  ): Promise<void> {
    // One indistinguishable 404 for a bad signature, an expired link and a
    // missing object alike: a distinct "expired" response would confirm that a
    // guessed key exists.
    if (!key || !this.signer.verify(key, Number(expires), signature ?? '')) {
      throw new NotFoundException('That link is invalid or has expired.');
    }

    const object = await this.storage.get(key);

    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Content-Length', object.bytes);
    // Private: a signed URL is per-recipient, so a shared cache must not keep a
    // copy that outlives the signature.
    res.setHeader('Cache-Control', `private, max-age=${this.ttlSeconds}`);
    res.setHeader('Content-Disposition', 'inline');
    // Stored images are user-supplied; never let one be interpreted as markup.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    object.stream.pipe(res);
  }
}
