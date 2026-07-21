import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class MarkPaidDto {
  /**
   * How the money actually moved — cash, bank transfer, cheque. Free text
   * because DesignArc settles informally and a fixed enum would force people to
   * mislabel a real payment. Optional but recorded when given.
   */
  @IsOptional()
  @IsString()
  @Length(2, 120)
  reference?: string;
}

export class EarningQueryDto {
  @IsOptional()
  @IsUUID('7', { message: 'workerId must be a user id' })
  workerId?: string;

  @IsOptional()
  @IsIn(['UNPAID', 'PAID'], { message: 'status must be UNPAID or PAID' })
  status?: 'UNPAID' | 'PAID';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
