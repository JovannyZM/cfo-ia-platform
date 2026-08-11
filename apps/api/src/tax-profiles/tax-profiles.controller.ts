import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createTaxProfileSchema, type CreateTaxProfileDto } from './tax-profile.schemas';
import { TaxProfilesService } from './tax-profiles.service';

const manageGuard = WorkspaceAccessGuard([AccountRole.ACCOUNT_OWNER, AccountRole.ACCOUNT_ADMIN]);

@Controller('workspaces/:workspaceId/tax-profiles')
export class TaxProfilesController {
  constructor(private readonly profiles: TaxProfilesService) {}

  @Get(':taxProfileId')
  @UseGuards(WorkspaceAccessGuard())
  get(@Param('workspaceId') workspaceId: string, @Param('taxProfileId') id: string) { return this.profiles.get(workspaceId, id); }

  @Post()
  @UseGuards(manageGuard)
  create(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(createTaxProfileSchema)) dto: CreateTaxProfileDto) { return this.profiles.create(workspaceId, req.user.id, dto); }

  @Post(':taxProfileId/approve')
  @UseGuards(manageGuard)
  approve(@Param('workspaceId') workspaceId: string, @Param('taxProfileId') id: string, @Req() req: AuthenticatedRequest) { return this.profiles.approve(workspaceId, id, req.user.id); }

  @Post(':taxProfileId/activate')
  @UseGuards(manageGuard)
  activate(@Param('workspaceId') workspaceId: string, @Param('taxProfileId') id: string, @Req() req: AuthenticatedRequest) { return this.profiles.activate(workspaceId, id, req.user.id); }

  @Post(':taxProfileId/deactivate')
  @UseGuards(manageGuard)
  deactivate(@Param('workspaceId') workspaceId: string, @Param('taxProfileId') id: string, @Req() req: AuthenticatedRequest) { return this.profiles.deactivate(workspaceId, id, req.user.id); }
}
