import { createHash } from 'node:crypto';
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, switchMap } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../auth/authenticated-request';

/**
 * Replay protection for retried writes (decision C3).
 *
 * The SRS calls out workshop connectivity as unreliable: a worker on a bad
 * connection may not hear the reply and will retry. Without this, that retry is
 * a *second action* — a second price proposal, a second payment record — and on
 * the money path that is a real financial defect, not an inconvenience.
 *
 * Applied per-route rather than globally, because it is only correct for
 * non-idempotent writes. A GET needs no protection and a state-machine action
 * already refuses an illegal repeat; this exists for the cases where a repeat
 * would legitimately succeed twice.
 *
 * Deliberately *not* a distributed lock. Two genuinely simultaneous requests
 * with the same key are rare, and the honest answer to one is 409 rather than a
 * queue: the record is written after the handler succeeds, so the loser is told
 * to retry and will then find the stored response.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = request.headers['idempotency-key'];

    // The header is optional. Without it the request is simply not protected —
    // refusing would break every existing caller for no safety gain.
    if (typeof key !== 'string' || key.trim() === '') {
      return next.handle();
    }

    const userId = request.user?.id;
    if (!userId) return next.handle();

    const trimmedKey = key.trim().slice(0, 120);
    const endpoint = `${request.method} ${request.route?.path ?? request.url}`;
    const requestHash = hashBody(request.body);

    return from(
      this.prisma.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key: trimmedKey } },
      }),
    ).pipe(
      switchMap((existing) => {
        if (existing) {
          // Same key, different request: the client has reused a key for
          // something else. Replaying the old response would be a lie about
          // what happened, so refuse.
          if (existing.endpoint !== endpoint || existing.requestHash !== requestHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message:
                'This Idempotency-Key was already used for a different request. ' +
                'Use a new key.',
            });
          }

          this.logger.log(`Replayed idempotent response for ${endpoint} (key ${trimmedKey})`);
          context.switchToHttp().getResponse().status(existing.statusCode);
          // Parsed back from the stored text. JS objects preserve string-key
          // insertion order, so re-serialising this yields the original bytes.
          return of(JSON.parse(existing.responseBody) as unknown);
        }

        return next.handle().pipe(
          tap((response) => {
            // Recorded only on success: a failed action must remain retryable,
            // or a transient database error would be frozen in place forever.
            void this.remember(userId, trimmedKey, endpoint, requestHash, context, response);
          }),
        );
      }),
    );
  }

  private async remember(
    userId: string,
    key: string,
    endpoint: string,
    requestHash: string,
    context: ExecutionContext,
    response: unknown,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          endpoint,
          requestHash,
          statusCode: context.switchToHttp().getResponse().statusCode ?? 200,
          // BigInt is not JSON-serialisable; main.ts installs a toJSON that
          // renders it as a string, so this stores exactly the bytes the live
          // response carried.
          responseBody: JSON.stringify(response ?? null),
        },
      });
    } catch (error) {
      // Failing to record must never fail the action that already succeeded.
      // The cost is that a retry re-executes; the alternative is rejecting work
      // that has already been committed.
      this.logger.error(
        `Could not store idempotency record for ${endpoint} (key ${key}): ${String(error)}`,
      );
    }
  }
}

function hashBody(body: unknown): string {
  // Keys are sorted so that a body differing only in property order is treated
  // as the same request, which is what a retrying HTTP client will send.
  return createHash('sha256').update(stableStringify(body ?? {})).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);

  return `{${entries.join(',')}}`;
}
