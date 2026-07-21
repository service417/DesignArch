import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client lifecycle.
 *
 * Transactions matter more here than in most systems: the blueprint requires the
 * inspection -> price -> earning path to commit atomically, so that a partial
 * failure can never leave a stage priced but unpaid-for or an earning without
 * its stage. Services on that path must use `prisma.$transaction`.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
