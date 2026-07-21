import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';

/**
 * User administration (FR-1).
 *
 * Admin-only throughout. The one exception is `GET /users/assignable`, which
 * every role may call: assigning work and reading who is on a job are ordinary
 * parts of the workflow, and the projection carries no more than a name and a
 * role.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest, @Ip() ip: string) {
    return this.users.create(dto, req.user!.id, ip);
  }

  @Get()
  @Roles('ADMIN')
  list(
    @Query('role') role?: Role,
    @Query('includeDeactivated') includeDeactivated?: string,
  ) {
    return this.users.list({
      role,
      includeDeactivated: includeDeactivated === 'true',
    });
  }

  /**
   * The caller's own profile.
   *
   * Login returns tokens and nothing else, so without this a client would have
   * to decode the JWT to learn who it is — which means trusting a token it
   * cannot verify to render its own UI. Every role needs this: it is what backs
   * "my stages" and the signed-in user's name.
   *
   * Declared before `:id` so the literal path is not swallowed by the parameter
   * route.
   */
  @Get('me')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  me(@Req() req: AuthenticatedRequest) {
    return this.users.findOne(req.user!.id);
  }

  /** Workers eligible to take a stage, for the assignment picker. */
  @Get('assignable')
  @Roles('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR')
  assignable(@Query('role') role?: Role) {
    return this.users.list({ role });
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.users.update(id, dto, req.user!.id, ip);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @HttpCode(200)
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Ip() ip: string) {
    return this.users.deactivate(id, req.user!.id, ip);
  }

  @Post(':id/activate')
  @Roles('ADMIN')
  @HttpCode(200)
  activate(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Ip() ip: string) {
    return this.users.activate(id, req.user!.id, ip);
  }

  @Post(':id/password')
  @Roles('ADMIN')
  @HttpCode(200)
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.users.resetPassword(id, dto.password, req.user!.id, ip);
  }
}
