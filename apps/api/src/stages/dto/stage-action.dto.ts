import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Base for any stage action that participates in optimistic locking. */
export class VersionedActionDto {
  /**
   * The stage version the client last read. Optional, but strongly recommended:
   * without it, a write based on a stale view can silently overwrite someone
   * else's change.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class RejectStageDto extends VersionedActionDto {
  /** Mandatory, and long enough to be actionable — the worker must know what to fix. */
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class SetPriceDto extends VersionedActionDto {
  /**
   * Price in integer minor units (LKR cents). Never a decimal — see domain/money.ts.
   * The ceiling mirrors MAX_STAGE_PRICE_MINOR so a bad value is rejected at the
   * edge as well as in the domain.
   */
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of LKR cents, not a decimal' })
  @IsPositive()
  @Max(100_000_000)
  amount!: number;

  /** True when revising a declined price rather than proposing the first one. */
  @IsOptional()
  @IsBoolean()
  revision?: boolean;
}

export class DeclinePriceDto extends VersionedActionDto {
  /** Optional, but valuable: it tells the Admin what to change in the revision. */
  @IsOptional()
  @IsString()
  @Length(5, 500)
  reason?: string;
}
