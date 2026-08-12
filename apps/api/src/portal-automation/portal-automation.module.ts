import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BROWSER_PROVIDER } from './browser-provider';
import { CostcoInvoiceReadOnlyAdapter } from './costco-invoice-read-only.adapter';
import { PlaywrightBrowserProvider } from './playwright-browser.provider';
import { PortalProbeService } from './portal-probe.service';
import { PortalFlowService } from './portal-flow.service';
import { PortalStageFlowEngine } from './portal-stage-flow';
import { PortalAdapterRegistry } from './portal-adapter.registry';
import { PortalSessionService } from './portal-session.service';
import { PortalActionObservationService } from './portal-action-observation.service';

@Module({
  imports: [ConfigModule],
  providers: [
    PrismaService,
    PlaywrightBrowserProvider,
    PortalAdapterRegistry,
    { provide: BROWSER_PROVIDER, useExisting: PlaywrightBrowserProvider },
    CostcoInvoiceReadOnlyAdapter,
    PortalSessionService,
    PortalActionObservationService,
    PortalProbeService,
    PortalFlowService,
    PortalStageFlowEngine,
  ],
  exports: [PortalProbeService, PortalFlowService, PortalStageFlowEngine, PortalAdapterRegistry],
})
export class PortalAutomationModule {}
