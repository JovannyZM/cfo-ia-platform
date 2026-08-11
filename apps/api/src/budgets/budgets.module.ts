import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BudgetClassifierService } from './budget-classifier.service';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { WorkersModule } from '../workers/workers.module';
import { ExpenseBudgetAssignmentService } from './expense-budget-assignment.service';
import { ExpenseBudgetClassifierWorker } from './expense-budget-classifier.worker';

@Module({
  imports: [WorkersModule],
  controllers: [BudgetsController],
  providers: [
    PrismaService,
    BudgetsService,
    BudgetClassifierService,
    ExpenseBudgetAssignmentService,
    ExpenseBudgetClassifierWorker,
  ],
  exports: [BudgetClassifierService, ExpenseBudgetAssignmentService],
})
export class BudgetsModule {}
