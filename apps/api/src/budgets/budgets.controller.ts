import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { BudgetsService } from './budgets.service';

@Controller('workspaces/:workspaceId/budgets')
@UseGuards(
  WorkspaceAccessGuard([
    AccountRole.ACCOUNT_OWNER,
    AccountRole.ACCOUNT_ADMIN,
    AccountRole.MEMBER,
    AccountRole.VIEWER,
  ]),
)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.budgets.list(workspaceId);
  }

  @Get(':budgetId')
  getById(@Param('workspaceId') workspaceId: string, @Param('budgetId') budgetId: string) {
    return this.budgets.getById(workspaceId, budgetId);
  }
}
