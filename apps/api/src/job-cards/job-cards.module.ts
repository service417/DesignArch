import { Module } from '@nestjs/common';
import { JobCardsService } from './job-cards.service';
import {
  JobCardsController,
  ProjectJobCardsController,
  StageAssignmentController,
} from './job-cards.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ProjectJobCardsController, JobCardsController, StageAssignmentController],
  providers: [JobCardsService],
})
export class JobCardsModule {}
