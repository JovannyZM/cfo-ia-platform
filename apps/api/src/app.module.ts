import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { resolve } from 'node:path';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { AdminTaxProfileRequestsController } from './admin/admin-tax-profile-requests.controller';
import { AuthGuard } from './auth/auth.guard';
import { PlatformAdminGuard } from './auth/platform-admin.guard';
import { BrainModule } from './brain/brain.module';
import { HealthController } from './health.controller';
import { ExpensesModule } from './expenses/expenses.module';
import { EvidenceModule } from './evidence/evidence.module';
import { TaxProfileRequestsService } from './tax-profile-requests/tax-profile-requests.service';
import { TelegramModule } from './telegram/telegram.module';
import { ConversationsModule } from './conversations/conversations.module';
import { BudgetsModule } from './budgets/budgets.module';
import { ExpenseAnalysisModule } from './expense-analysis/expense-analysis.module';
import { InvoiceRequestsModule } from './invoice-requests/invoice-requests.module';
import { PortalAutomationModule } from './portal-automation/portal-automation.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { PrismaService } from './prisma.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: resolve(__dirname, '../../../.env'),
    }),
    StorageModule,
    BrainModule,
    BudgetsModule,
    ExpenseAnalysisModule,
    ConversationsModule,
    ExpensesModule,
    EvidenceModule,
    TelegramModule,
    InvoiceRequestsModule,
    PortalAutomationModule,
    TaxProfilesModule,
  ],
  controllers: [HealthController, AccountsController, AdminTaxProfileRequestsController],
  providers: [
    AccountsService,
    PrismaService,
    TaxProfileRequestsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    PlatformAdminGuard,
  ],
})
export class AppModule {}
