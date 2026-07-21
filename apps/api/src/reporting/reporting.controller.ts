import { Controller, Get, Header, Query } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { ReportingService } from './reporting.service';
import { Roles } from '../auth/roles.decorator';

class DateRangeDto {
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date, e.g. 2026-07-01' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date, e.g. 2026-07-31' })
  to?: string;
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
