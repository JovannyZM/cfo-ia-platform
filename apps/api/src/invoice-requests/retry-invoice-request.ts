import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { InvoiceAutomationWorker } from './invoice-automation.worker';
import { RetryCommandModule } from './retry-command.module';

async function main(): Promise<void> {
  const invoiceRequestId = process.argv[2]?.trim();
  if (!invoiceRequestId) throw new Error('invoiceRequestId is required');
  const app = await NestFactory.createApplicationContext(RetryCommandModule, { logger: ['error', 'warn', 'log'] });
  try {
    const result = await app.get(InvoiceAutomationWorker).retry(invoiceRequestId);
    console.log(JSON.stringify({ invoiceRequestId, result }));
    if (result !== 'STARTED') process.exitCode = 2;
  } finally {
    await app.close();
  }
}

void main();
