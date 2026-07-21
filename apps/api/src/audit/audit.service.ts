import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * The security and sensitive-action audit trail (FR-1.4, Blueprint §10.4).
 *
 * Auditing must never break the operation it is recording: a failure to write an
 * audit row is logged loudly but does not propagate, because refusing a
 * legitimate price acceptance over a logging hiccup would be worse than the gap
 * in the trail. Writes that must be atomic with business data (price, payment)
 * should instead pass a transaction client via `recordIn`.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.write(this.prisma, entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry '${entry.action}' on ${entry.entity}: ${String(error)}`,
      );
    }
  }

  /**
   * Record inside an existing transaction — use this on the money path so the
   * audit row commits or rolls back together with the change it describes.
   */
  async recordIn(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await this.write(tx, entry);
  }

  private async write(
    client: PrismaService | Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        meta: entry.meta ?? Prisma.JsonNull,
        ip: entry.ip ?? null,
      },
    });
  }
}
