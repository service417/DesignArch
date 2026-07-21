import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

/** Sri Lankan mobile numbers, local or +94. */
const PHONE_PATTERN = /^(\+94|0)[0-9]{9}$/;

export class CreateUserDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Length(1, 255)
  email!: string;

  @IsOptional()
  @Matches(PHONE_PATTERN, {
    message: 'Enter a valid Sri Lankan phone number, e.g. 0771234567 or +94771234567.',
  })
  phone?: string;

  @IsEnum(Role, { message: 'role must be ADMIN, CARPENTER, PAINTER or SUPERVISOR' })
  role!: Role;

  /**
   * Length is the control that matters; composition rules mostly push people
   * towards predictable substitutions. The account is created with this and the
   * holder is expected to change it.
   */
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters.' })
  @Length(12, 200)
  password!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Matches(PHONE_PATTERN, {
    message: 'Enter a valid Sri Lankan phone number, e.g. 0771234567 or +94771234567.',
  })
  phone?: string | null;

  @IsOptional()
  @IsEnum(Role, { message: 'role must be ADMIN, CARPENTER, PAINTER or SUPERVISOR' })
  role?: Role;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters.' })
  @Length(12, 200)
  password!: string;
}
