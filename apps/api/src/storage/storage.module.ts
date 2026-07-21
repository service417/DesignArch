import { Global, Module } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk.storage';
import { STORAGE_PROVIDER } from './storage.types';
import { UrlSigner } from './url-signer';

/**
 * The single place that decides where bytes live.
 *
 * Moving to S3 means writing S3Storage and changing `useClass` here — nothing
 * that consumes STORAGE_PROVIDER needs to know. Global because storage is
 * infrastructure, like Prisma, rather than a bounded module of the domain.
 */
@Global()
@Module({
  providers: [UrlSigner, LocalDiskStorage, { provide: STORAGE_PROVIDER, useExisting: LocalDiskStorage }],
  exports: [STORAGE_PROVIDER, UrlSigner],
})
export class StorageModule {}
