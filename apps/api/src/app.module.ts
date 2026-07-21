import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { StagesModule } from './stages/stages.module';
import { StorageModule } from './storage/storage.module';
import { MediaModule } from './media/media.module';
import { UsersModule } from './users/users.module';
import { JobCardsModule } from './job-cards/job-cards.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportingModule } from './reporting/reporting.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

/**
 * The modular monolith root.
 *
 * Module boundaries here are the seams the architecture blueprint calls for: if
 * Notifications or Reporting ever needs independent scaling it can be lifted out
 * without unpicking the rest. Until there is a reason, they stay in one
 * deployable and one ACID transaction.
 *
 * Guards are registered globally and in order — authenticate, then authorise,
 * then rate-limit — so security is opt-out (@Public) rather than opt-in.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ThrottlerModule.forRoot([
      // Blunt brute-force and abuse on auth and write endpoints (Blueprint §10.4).
      { name: 'short', ttl: 1_000, limit: 10 },
      { name: 'long', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    ProjectsModule,
    JobCardsModule,
    StagesModule,
    MediaModule,
    PaymentsModule,
    ReportingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
