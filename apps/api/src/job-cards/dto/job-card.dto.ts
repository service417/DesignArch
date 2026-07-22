import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { StageType } from '@prisma/client';

export class StageSpecDto {
  @IsEnum(StageType, { message: 'type must be CARPENTRY or PAINTING' })
  type!: StageType;

  /**
   * Optional at creation: a job card can be planned before it is staffed. The
   * stage then sits ASSIGNED with no assignee and simply cannot be started,
   * which is the honest representation of unstaffed work.
   */
  @IsOptional()
  @IsUUID('7', { message: 'assigneeId must be a user id' })
  assigneeId?: string;

  /**
   * Several workers on the same stage type, working in parallel.
   *
   * Each entry becomes its own assignment with its own status, inspection,
   * price and earning. Use this instead of `assigneeId` when a job needs more
   * than one pair of hands. Supplying both is rejected rather than guessed at.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('7', { each: true, message: 'assigneeIds must all be user ids' })
  assigneeIds?: string[];
}

export class CreateJobCardDto {
  @IsString()
  @Length(1, 150)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  /**
   * At most two: a job card carries one carpentry stage and one painting stage,
   * which the unique (job_card_id, type) index enforces regardless.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => StageSpecDto)
  stages?: StageSpecDto[];
}

export class UpdateJobCardDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;
}

export class AssignStageDto {
  @IsUUID('7', { message: 'assigneeId must be a user id' })
  assigneeId!: string;
}
