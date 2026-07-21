import { Body, Controller, Get, Ip, Param, Patch, Post, Req } from '@nestjs/common';
import { JobCardsService } from './job-cards.service';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  AssignStageDto,
  CreateJobCardDto,
  StageSpecDto,
  UpdateJobCardDto,
} from './dto/job-card.dto';

/** Job cards live under their project — a card without one is meaningless. */
@Controller('projects/:projectId/job-cards')
export class ProjectJobCardsController {
  constructor(private readonly jobCards: JobCardsService) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateJobCardDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.jobCards.create(projectId, dto, req.user!.id, ip);
  }

  /** Workers need to see the cards on a project to find their own stages. */
  @Get()
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  list(@Param('projectId') projectId: string) {
    return this.jobCards.listForProject(projectId);
  }
}

@Controller('job-cards')
export class JobCardsController {
  constructor(private readonly jobCards: JobCardsService) {}

  @Get(':id')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.jobCards.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateJobCardDto) {
    return this.jobCards.update(id, dto);
  }

  @Post(':id/stages')
  @Roles('ADMIN')
  addStage(
    @Param('id') id: string,
    @Body() dto: StageSpecDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.jobCards.addStage(id, dto, req.user!.id, ip);
  }
}

/**
 * Assignment sits on the stage rather than the job card because it is a
 * property of the stage. It is kept in this module, not StagesModule, because
 * assigning work is an administrative act — StagesService is deliberately the
 * only writer of stage *status*, and this never touches status.
 */
@Controller('stages')
export class StageAssignmentController {
  constructor(private readonly jobCards: JobCardsService) {}

  @Patch(':id/assignee')
  @Roles('ADMIN')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignStageDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.jobCards.assign(id, dto, req.user!.id, ip);
  }
}
