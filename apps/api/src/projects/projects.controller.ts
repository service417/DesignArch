import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateProjectDto, @Req() req: AuthenticatedRequest) {
    return this.projects.create(dto, req.user!.id);
  }

  /** All internal roles may view projects; only Admin may write (BR-2.2). */
  @Get()
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  list(@Query('includeArchived') includeArchived?: string) {
    return this.projects.list(includeArchived === 'true');
  }

  @Get(':id')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  archive(@Param('id') id: string) {
    return this.projects.archive(id);
  }

  @Post(':id/unarchive')
  @Roles('ADMIN')
  unarchive(@Param('id') id: string) {
    return this.projects.unarchive(id);
  }
}
