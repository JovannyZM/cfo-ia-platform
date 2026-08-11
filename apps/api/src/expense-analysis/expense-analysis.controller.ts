import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { DailyCloseMessageService } from './daily-close-message.service';
import { ExpenseAnalysisService } from './expense-analysis.service';

@Controller('workspaces/:workspaceId/expense-analysis')
@UseGuards(
  WorkspaceAccessGuard([
    AccountRole.ACCOUNT_OWNER,
    AccountRole.ACCOUNT_ADMIN,
    AccountRole.MEMBER,
    AccountRole.VIEWER,
  ]),
)
export class ExpenseAnalysisController {
  constructor(
    private readonly analysis: ExpenseAnalysisService,
    private readonly messages: DailyCloseMessageService,
  ) {}

  @Get('daily-close')
  async dailyClose(
    @Param('workspaceId') workspaceId: string,
    @Query('date') date: string,
  ) {
    const analysis = await this.analysis.analyze(workspaceId, date);
    return { analysis, message: this.messages.format(analysis) };
  }
}
