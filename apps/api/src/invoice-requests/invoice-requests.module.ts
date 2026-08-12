import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InvoiceRequestsController } from './invoice-requests.controller';
import { InvoiceRequestsService } from './invoice-requests.service';
import { WorkersModule } from '../workers/workers.module';
import { PortalAutomationModule } from '../portal-automation/portal-automation.module';
import { InvoiceAutomationWorker } from './invoice-automation.worker';

@Module({
  imports: [WorkersModule, PortalAutomationModule],
  controllers: [InvoiceRequestsController],
  providers: [PrismaService, InvoiceRequestsService, InvoiceAutomationWorker],
  exports: [InvoiceRequestsService, InvoiceAutomationWorker],
})
export class InvoiceRequestsModule {}
