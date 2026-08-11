import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InvoiceRequestsController } from './invoice-requests.controller';
import { InvoiceRequestsService } from './invoice-requests.service';

@Module({
  controllers: [InvoiceRequestsController],
  providers: [PrismaService, InvoiceRequestsService],
  exports: [InvoiceRequestsService],
})
export class InvoiceRequestsModule {}
