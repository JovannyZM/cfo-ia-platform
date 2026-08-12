import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkersModule } from '../workers/workers.module';
import { EvidenceController } from './evidence.controller';
import {
  EXPENSE_EVIDENCE_INTERPRETER,
} from './expense-evidence-interpreter';
import { ExpenseInterpreterWorker } from './expense-interpreter.worker';
import { OpenAIExpenseEvidenceInterpreter } from './openai-expense-evidence-interpreter';
import { ConversationsModule } from '../conversations/conversations.module';
import { InMemoryPdfEvidenceProcessor, PDF_EVIDENCE_PROCESSOR } from './pdf-evidence-processor';
import { TemporaryEvidenceService } from './temporary-evidence.service';

@Module({
  imports: [WorkersModule, ConversationsModule],
  controllers: [EvidenceController],
  providers: [
    ExpenseInterpreterWorker,
    OpenAIExpenseEvidenceInterpreter,
    InMemoryPdfEvidenceProcessor,
    TemporaryEvidenceService,
    {
      provide: PDF_EVIDENCE_PROCESSOR,
      useExisting: InMemoryPdfEvidenceProcessor,
    },
    {
      provide: EXPENSE_EVIDENCE_INTERPRETER,
      useExisting: OpenAIExpenseEvidenceInterpreter,
    },
    PrismaService,
  ],
})
export class EvidenceModule {}
