import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';
import { MediaFilesController, StagePhotosController } from './media.controller';

/**
 * Inspection evidence capture and retrieval.
 *
 * Files are buffered in memory rather than spooled to a temp directory: the cap
 * is 5 MB and nothing may touch the disk before the magic-byte check has run.
 * MulterModule's limit is a coarse first gate that stops an oversized body being
 * read at all; MediaService re-checks the size so the rule holds regardless of
 * how a file arrives.
 */
@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: Number(config.get('MAX_PHOTO_BYTES') ?? 5 * 1024 * 1024),
          files: 1,
        },
      }),
    }),
  ],
  controllers: [StagePhotosController, MediaFilesController],
  providers: [MediaService],
})
export class MediaModule {}
