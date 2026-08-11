import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DailyCloseMessageService } from './daily-close-message.service';
import { ExpenseAnalysisController } from './expense-analysis.controller';
import { ExpenseAnalysisPolicy } from './expense-analysis.policy';
import { ExpenseAnalysisService } from './expense-analysis.service';
import { BudgetNotificationService } from './budget-notification.service';
import { TelegramModule } from '../telegram/telegram.module';
import { DailyCloseSchedulerService } from './daily-close-scheduler.service';
import { DailyCloseDevController } from './daily-close-dev.controller';

@Module({
  imports: [TelegramModule],
  controllers: [ExpenseAnalysisController, DailyCloseDevController],
  providers: [
    PrismaService,
    ExpenseAnalysisPolicy,
    ExpenseAnalysisService,
    DailyCloseMessageService,
    BudgetNotificationService,
    DailyCloseSchedulerService,
  ],
  exports: [ExpenseAnalysisService, DailyCloseMessageService, BudgetNotificationService, DailyCloseSchedulerService],
})
export class ExpenseAnalysisModule {}
