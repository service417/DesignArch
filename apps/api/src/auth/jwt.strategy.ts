import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './authenticated-request';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Re-check the account on every request rather than trusting the token alone.
   *
   * A short-lived token would otherwise keep working for its remaining lifetime
   * after an Admin deactivates the account or changes its role — unacceptable
   * when the role determines who can move money.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, deletedAt: true },
    });

    if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
