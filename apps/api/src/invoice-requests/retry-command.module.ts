import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InvoiceRequestsModule } from './invoice-requests.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InvoiceRequestsModule],
})
export class RetryCommandModule {}
