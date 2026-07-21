import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { EarningQueryDto, MarkPaidDto } from './dto/payment.dto';
import { Actor } from '../domain/stage.types';

/**
 * Earnings and payment records (FR-8).
 *
 * Workers may read their own earnings — being able to see what you are owed is
 * the point of the record — but only an Admin may mark one paid. That keeps the
 * three-way separation intact: Admin prices and pays, Supervisor inspects,
 * Worker accepts. Nobody signs off their own money.
 */
@Controller('earnings')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles('ADMIN', 'CARPENTER', 'PAINTER')
  list(@Query() query: EarningQueryDto, @Req() req: AuthenticatedRequest) {
    return this.payments.list(actorOf(req), query);
  }

  /** The payment run: who is owed what. Declared before `:id`. */
  @Get('outstanding')
  @Roles('ADMIN')
  outstanding() {
    return this.payments.outstandingByWorker();
  }

  @Get(':id')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.payments.findOne(id, actorOf(req));
  }

  /**
   * Records that payment happened outside the system. It does not move money —
   * see PaymentsService.
   */
  @Post(':id/pay')
  @Roles('ADMIN')
  @HttpCode(200)
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.payments.markPaid(id, req.user!.id, dto.reference, ip);
  }
}

function actorOf(req: AuthenticatedRequest): Actor {
  return { id: req.user!.id, role: req.user!.role };
}
