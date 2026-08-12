import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InvoiceRequestsController } from './invoice-requests.controller';
import { InvoiceRequestsService } from './invoice-requests.service';
import { WorkersModule } from '../workers/workers.module';
import { PortalAutomationModule } from '../portal-automation/portal-automation.module';
import { InvoiceAutomationWorker } from './invoice-automation.worker';
import { InvoiceDownloadManagerService } from './invoice-download-manager.service';
import { PendingInvoiceDocumentsService } from './pending-invoice-documents.service';
import { InboundInvoiceEmailService } from './inbound-invoice-email.service';

@Module({
  imports: [WorkersModule, PortalAutomationModule],
  controllers: [InvoiceRequestsController],
  providers: [PrismaService, InvoiceRequestsService, InvoiceDownloadManagerService, PendingInvoiceDocumentsService, InboundInvoiceEmailService, InvoiceAutomationWorker],
  exports: [InvoiceRequestsService, InvoiceDownloadManagerService, PendingInvoiceDocumentsService, InboundInvoiceEmailService, InvoiceAutomationWorker],
})
export class InvoiceRequestsModule {}
