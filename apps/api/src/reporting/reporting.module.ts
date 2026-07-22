import { Module } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { DashboardService } from './dashboard.service';
import {
  DashboardController,
  ReportingController,
  WorkerStatementController,
} from './reporting.controller';

@Module({
  controllers: [DashboardController, WorkerStatementController, ReportingController],
  providers: [ReportingService, DashboardService],
})
export class ReportingModule {}
