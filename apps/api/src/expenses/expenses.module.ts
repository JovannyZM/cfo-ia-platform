import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkersModule } from '../workers/workers.module';
import { ExpenseAssistantWorker } from './expense-assistant.worker';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { LanguageNormalizer } from '../common/language-normalizer';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [WorkersModule, ConversationsModule],
  controllers: [ExpensesController],
  providers: [PrismaService, ExpenseAssistantWorker, ExpensesService, LanguageNormalizer],
  exports: [PrismaService],
})
export class ExpensesModule {}
