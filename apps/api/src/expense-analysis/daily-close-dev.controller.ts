import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { DailyCloseSchedulerService } from './daily-close-scheduler.service';

@Controller('dev/workspaces/:workspaceId/expense-analysis')
@UseGuards(WorkspaceAccessGuard([AccountRole.ACCOUNT_OWNER, AccountRole.ACCOUNT_ADMIN]))
export class DailyCloseDevController {
  constructor(private readonly scheduler: DailyCloseSchedulerService) {}

  @Post('daily-close/run')
  async run(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { date?: string },
  ) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.scheduler.runWorkspace(workspaceId, body.date);
  }
}
