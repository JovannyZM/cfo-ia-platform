import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BROWSER_PROVIDER } from './browser-provider';
import { CostcoInvoiceReadOnlyAdapter } from './costco-invoice-read-only.adapter';
import { PlaywrightBrowserProvider } from './playwright-browser.provider';
import { PortalProbeService } from './portal-probe.service';
import { PortalSessionService } from './portal-session.service';

@Module({
  imports: [ConfigModule],
  providers: [
    PrismaService,
    PlaywrightBrowserProvider,
    { provide: BROWSER_PROVIDER, useExisting: PlaywrightBrowserProvider },
    CostcoInvoiceReadOnlyAdapter,
    PortalSessionService,
    PortalProbeService,
  ],
  exports: [PortalProbeService],
})
export class PortalAutomationModule {}

