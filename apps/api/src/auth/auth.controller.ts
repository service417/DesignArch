import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from './roles.decorator';

class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  password!: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Ip() ip: string) {
    return this.auth.refresh(dto.refreshToken, ip);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
