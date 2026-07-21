import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Authentication and session management (Blueprint §10.1).
 *
 * Refresh tokens rotate and carry a family id. Presenting an already-used token
 * is treated as theft and revokes the whole family, so a stolen token cannot be
 * replayed alongside the legitimate user's session.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Compare against a dummy hash when the user is absent so that a missing
    // account and a wrong password take the same time — otherwise the response
    // time tells an attacker which emails are registered.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hash);

    if (!user || !passwordMatches || user.status !== 'ACTIVE' || user.deletedAt) {
      await this.audit.record({
        actorId: user?.id ?? null,
        action: 'AUTH_FAILURE',
        entity: 'user',
        entityId: user?.id ?? null,
        meta: { email, reason: !user ? 'unknown_email' : 'bad_credentials_or_inactive' },
        ip,
      });
      // One message for every failure mode — never reveal which part was wrong.
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_SUCCESS',
      entity: 'user',
      entityId: user.id,
      ip,
    });

    return this.issueTokens(user.id, user.email, user.role, randomUUID());
  }

  /** Rotate a refresh token, revoking the family if a used token is replayed. */
  async refresh(rawToken: string, ip?: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Reuse detection: this token was already rotated away, so treat the whole
    // family as compromised.
    if (stored.revokedAt !== null) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        actorId: stored.userId,
        action: 'REFRESH_REUSE_DETECTED',
        entity: 'refresh_token',
        entityId: stored.id,
        meta: { familyId: stored.familyId },
        ip,
      });
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; family revoked.`,
      );
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (stored.user.status !== 'ACTIVE' || stored.user.deletedAt) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      stored.familyId,
    );
  }

  async logout(rawToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!stored) return;

    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async hashPassword(plain: string): Promise<string> {
    const cost = this.config.get<number>('BCRYPT_COST', 12);
    return bcrypt.hash(plain, Number(cost));
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    familyId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      },
    );

    // The refresh token is opaque random material, not a JWT: it is a database
    // lookup key, so it can be revoked instantly rather than merely expiring.
    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: refreshExpiry(this.config.get<string>('JWT_REFRESH_TTL', '7d')),
      },
    });

    return { accessToken, refreshToken };
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Parse a simple duration such as "7d", "12h", "30m" into an absolute expiry. */
function refreshExpiry(ttl: string): Date {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const ms = match ? Number(match[1]) * multipliers[match[2]] : 7 * 86_400_000;
  return new Date(Date.now() + ms);
}

/**
 * A real bcrypt hash of a value nobody can supply, used purely to equalise
 * timing on the unknown-email path.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5ZQBtqM0kSNRO0/1nWlKMSuqPBpTpVy';
