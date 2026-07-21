import { Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';

class FeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

/**
 * The signed-in user's own notification feed (FR-7).
 *
 * Every route here is scoped to the caller inside the service, by recipientId
 * from the token. There is deliberately no id-addressed read route and no way to
 * ask for someone else's feed: a notification names the work, the money and the
 * people involved, so one user reading another's would leak the workflow itself.
 *
 * Open to all four roles because everyone receives notifications — this is the
 * one part of the API where a carpenter and an admin have identical rights over
 * their own data.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  feed(@Query() query: FeedQueryDto, @Req() req: AuthenticatedRequest) {
    return this.notifications.feed(req.user!.id, query.take);
  }

  /**
   * Just the badge number. Split from the feed because a client polls this far
   * more often than it opens the list, and it should not pay for fifty rows to
   * learn there are none.
   */
  @Get('unread-count')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  async unreadCount(@Req() req: AuthenticatedRequest) {
    return { unread: await this.notifications.unreadCount(req.user!.id) };
  }

  @Post('read-all')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  @HttpCode(200)
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user!.id);
  }

  /**
   * Marking read is idempotent and reports how many rows it touched. A zero
   * means the notification was already read, or was never the caller's — the
   * response does not distinguish, because saying which would confirm that
   * somebody else's notification exists.
   */
  @Post(':id/read')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  @HttpCode(200)
  markRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.notifications.markRead(req.user!.id, id);
  }
}
