import { ConfigService } from '@nestjs/config';
import { TaxProfileStatus } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma.service';
import { CostcoInvoiceReadOnlyAdapter } from './costco-invoice-read-only.adapter';
import { PlaywrightBrowserProvider } from './playwright-browser.provider';
import { PortalProbeService } from './portal-probe.service';
import { PortalSessionService } from './portal-session.service';

const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000007';

async function main(): Promise<void> {
  loadEnv({ path: resolve(__dirname, '../../../../.env') });
  const ticketOrOrder = process.env.PAE_COSTCO_TICKET;
  const totalPaid = process.env.PAE_COSTCO_TOTAL;
  if (!ticketOrOrder || !totalPaid) throw new Error('Controlled probe input is incomplete');

  const workspaceId = process.env.PAE_PROBE_WORKSPACE_ID ?? DEMO_WORKSPACE_ID;
  const config = new ConfigService(process.env);
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const profiles = await prisma.taxProfile.findMany({
      where: {
        status: TaxProfileStatus.ACTIVE,
        deletedAt: null,
        account: { workspaces: { some: { id: workspaceId } } },
      },
      select: { rfc: true },
      take: 2,
    });
    if (profiles.length !== 1) throw new Error('The Workspace must have exactly one active authorized TaxProfile for this probe');

    const browser = new PlaywrightBrowserProvider(config);
    const sessions = new PortalSessionService(prisma);
    const adapter = new CostcoInvoiceReadOnlyAdapter();
    const probe = new PortalProbeService(browser, sessions, adapter, config);
    const result = await probe.probeCostcoInitialValidation(workspaceId, {
      ticketOrOrder,
      totalPaid,
      rfc: profiles[0]!.rfc,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const code = error instanceof Error && 'code' in error ? String(error.code) : 'CONTROLLED_PROBE_FAILED';
  process.stderr.write(`${JSON.stringify({ success: false, errorCode: code, errorMessage: error instanceof Error ? error.message : 'Controlled probe failed' })}\n`);
  process.exitCode = 1;
});
