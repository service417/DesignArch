import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(1, 120)
  client!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @IsOptional()
  @IsDateString({}, { message: 'deadline must be an ISO 8601 date' })
  deadline?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  client?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @IsOptional()
  @IsDateString({}, { message: 'deadline must be an ISO 8601 date' })
  deadline?: string | null;
}
