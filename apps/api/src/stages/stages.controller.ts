import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { StagesService } from './stages.service';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  DeclinePriceDto,
  RejectStageDto,
  SetPriceDto,
  VersionedActionDto,
} from './dto/stage-action.dto';
import { Actor } from '../domain/stage.types';

/**
 * Stage workflow endpoints (Blueprint §7.2).
 *
 * Each route is annotated with the roles permitted to reach it, but the role
 * annotation is only the outer gate: the state machine independently re-checks
 * role *and* assignment, so a mis-annotated route still cannot break a business
 * rule. Defence in depth on the money path.
 */
@Controller('stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  /**
   * The Admin's daily queue: approved work awaiting a price, and declined
   * prices awaiting revision. Declared before `:id` so the literal path is not
   * captured by the parameter route.
   */
  @Get('awaiting-pricing')
  @Roles('ADMIN')
  awaitingPricing() {
    return this.stages.awaitingAdminAction();
  }

  /**
   * The signed-in worker's own stages. Scoped from the token, so there is no
   * parameter through which one worker could read another's workload.
   */
  @Get('mine')
  @Roles('CARPENTER', 'PAINTER')
  mine(@Req() req: AuthenticatedRequest, @Query('includeCompleted') includeCompleted?: string) {
    return this.stages.assignedTo(req.user!.id, includeCompleted === 'true');
  }

  /** The supervisor's inspection queue. */
  @Get('awaiting-inspection')
  @Roles('SUPERVISOR')
  awaitingInspection() {
    return this.stages.awaitingInspection();
  }

  /** Stage detail: evidence and the full price history behind it. */
  @Get(':id')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.stages.findOne(id);
  }

  @Post(':id/start')
  @Roles('CARPENTER', 'PAINTER')
  start(
    @Param('id') id: string,
    @Body() dto: VersionedActionDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'START_WORK', dto, ip);
  }

  @Post(':id/ready')
  @Roles('CARPENTER', 'PAINTER')
  markReady(
    @Param('id') id: string,
    @Body() dto: VersionedActionDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'MARK_READY', dto, ip);
  }

  @Post(':id/rework')
  @Roles('CARPENTER', 'PAINTER')
  resumeRework(
    @Param('id') id: string,
    @Body() dto: VersionedActionDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'RESUME_REWORK', dto, ip);
  }

  /** Approve requires at least one inspection photo to already be stored (FR-5.6). */
  @Post(':id/approve')
  @Roles('SUPERVISOR')
  approve(
    @Param('id') id: string,
    @Body() dto: VersionedActionDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'APPROVE', dto, ip);
  }

  @Post(':id/reject')
  @Roles('SUPERVISOR')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectStageDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'REJECT', dto, ip);
  }

  /**
   * Set or revise the price. One endpoint serves both because the correct action
   * is a function of the stage's current state, not of the caller's intent —
   * APPROVED means propose, PRICE_DECLINED means revise.
   */
  @Post(':id/price')
  @Roles('ADMIN')
  @UseInterceptors(IdempotencyInterceptor)
  async setPrice(
    @Param('id') id: string,
    @Body() dto: SetPriceDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    const action = dto.revision ? 'REVISE_PRICE' : 'PROPOSE_PRICE';
    return this.stages.transition(id, actorOf(req), action, dto, ip);
  }

  @Post(':id/price/accept')
  @Roles('CARPENTER', 'PAINTER')
  acceptPrice(
    @Param('id') id: string,
    @Body() dto: VersionedActionDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'ACCEPT_PRICE', dto, ip);
  }

  @Post(':id/price/decline')
  @Roles('CARPENTER', 'PAINTER')
  declinePrice(
    @Param('id') id: string,
    @Body() dto: DeclinePriceDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.stages.transition(id, actorOf(req), 'DECLINE_PRICE', dto, ip);
  }
}

function actorOf(req: AuthenticatedRequest): Actor {
  // JwtAuthGuard and RolesGuard both run before any handler, so `user` is set.
  return { id: req.user!.id, role: req.user!.role };
}
