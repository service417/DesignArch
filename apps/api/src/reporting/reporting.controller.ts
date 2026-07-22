import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { ReportingService } from './reporting.service';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';

class DateRangeDto {
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date, e.g. 2026-07-01' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date, e.g. 2026-07-31' })
  to?: string;
}

/**
 * Role-specific home screens (FR-9.1).
 *
 * Each role reads its own dashboard and no other. A worker's home is scoped from
 * their token, so there is no parameter through which one worker could read
 * another's workload or earnings.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('admin')
  @Roles('ADMIN')
  admin() {
    return this.dashboard.admin();
  }

  @Get('supervisor')
  @Roles('SUPERVISOR')
  supervisor(@Req() req: AuthenticatedRequest) {
    return this.dashboard.supervisor(req.user!.id);
  }

  @Get('worker')
  @Roles('CARPENTER', 'PAINTER')
  worker(@Req() req: AuthenticatedRequest) {
    return this.dashboard.worker(req.user!.id);
  }

  /**
   * A worker's own month. `month` is an optional YYYY-MM; omitted means the
   * current one.
   *
   * An Admin may read any worker's month for the payment run; a worker only ever
   * sees their own. That is enforced here from the token rather than trusted to
   * the query parameter, which anyone could edit.
   */
  @Get('worker/monthly')
  @Roles('CARPENTER', 'PAINTER', 'ADMIN')
  workerMonthly(
    @Req() req: AuthenticatedRequest,
    @Query('month') month?: string,
    @Query('workerId') workerId?: string,
  ) {
    const target = req.user!.role === 'ADMIN' && workerId ? workerId : req.user!.id;
    return this.dashboard.workerMonthlyReport(target, month);
  }
}

/**
 * Reporting (FR-9). Admin-only: these aggregate everybody's pay.
 */
@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('earnings')
  @Roles('ADMIN')
  earnings(@Query() range: DateRangeDto) {
    return this.reporting.earningsReport(range);
  }

  /**
   * The same report as a spreadsheet.
   *
   * CSV rather than PDF because this is the format the number actually gets used
   * in — an accountant reconciling a payroll run needs cells, not a page. PDF
   * rendering needs a headless browser in a worker and is a separate piece.
   */
  @Get('earnings.csv')
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="designarc-earnings.csv"')
  async earningsCsv(@Query() range: DateRangeDto): Promise<string> {
    const report = await this.reporting.earningsReport(range);

    const rows = report.earnings.map((earning) => [
      earning.createdAt.toISOString().slice(0, 10),
      earning.worker.name,
      earning.worker.role,
      earning.stage.jobCard.project.name,
      earning.stage.jobCard.project.client,
      earning.stage.jobCard.title,
      earning.stage.type,
      // Minor units to a decimal string, still without touching a float.
      toDecimal(earning.amount),
      earning.status,
      earning.paidAt ? earning.paidAt.toISOString().slice(0, 10) : '',
    ]);

    return toCsv(
      ['Date', 'Worker', 'Role', 'Project', 'Client', 'Job card', 'Stage', 'Amount (LKR)', 'Status', 'Paid on'],
      rows,
    );
  }

  @Get('projects')
  @Roles('ADMIN')
  projects(@Query() range: DateRangeDto) {
    return this.reporting.projectReport(range);
  }

  /** Replays every settled stage's pricing ledger and reports disagreement. */
  @Get('reconciliation')
  @Roles('ADMIN')
  reconciliation() {
    return this.reporting.reconcileLedger();
  }
}

/**
 * A worker's monthly statement as a downloadable file.
 *
 * CSV rather than PDF. Server-side PDF rendering needs a headless Chromium in a
 * worker process, which is a heavy dependency to add for one document; this
 * carries exactly the same figures and opens in any spreadsheet. The route is
 * shaped so a PDF renderer can be swapped in behind it later without the client
 * changing.
 */
@Controller('dashboard')
export class WorkerStatementController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('worker/monthly.csv')
  @Roles('CARPENTER', 'PAINTER', 'ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="designarc-monthly-statement.csv"')
  async monthlyCsv(
    @Req() req: AuthenticatedRequest,
    @Query('month') month?: string,
    @Query('workerId') workerId?: string,
  ): Promise<string> {
    const target = req.user!.role === 'ADMIN' && workerId ? workerId : req.user!.id;
    const report = await this.dashboard.workerMonthlyReport(target, month);

    const rows = report.jobs.map((earning) => [
      earning.createdAt.toISOString().slice(0, 10),
      earning.stage.jobCard.project.name,
      earning.stage.jobCard.project.client,
      earning.stage.jobCard.title,
      earning.stage.type,
      toDecimal(earning.amount),
      earning.status,
      earning.paidAt ? earning.paidAt.toISOString().slice(0, 10) : '',
    ]);

    // A summary line after a blank row, so the totals a worker actually cares
    // about are visible without adding them up by hand.
    rows.push([]);
    rows.push(['', '', '', '', 'Earned', toDecimal(report.totals.earned), '', '']);
    rows.push(['', '', '', '', 'Paid', toDecimal(report.totals.paid), '', '']);
    rows.push(['', '', '', '', 'Outstanding', toDecimal(report.totals.outstanding), '', '']);

    return toCsv(
      ['Date', 'Project', 'Client', 'Job card', 'Stage', 'Amount (LKR)', 'Status', 'Paid on'],
      rows,
    );
  }
}

/** Minor units to a plain decimal string, in BigInt space throughout. */
function toDecimal(minor: bigint): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function toCsv(header: string[], rows: string[][]): string {
  // CRLF and a UTF-8 BOM: Excel misreads a plain UTF-8 CSV as the local
  // codepage, which mangles the client names this report is full of.
  return '﻿' + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

function escapeCell(value: string): string {
  // A leading =, +, - or @ makes Excel treat a cell as a formula. Client and
  // project names are user-supplied, so prefix those with a quote.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
