import { ConfigService } from '@nestjs/config';
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
  const config = new ConfigService(process.env);
  const prisma = new PrismaService();
  const browser = new PlaywrightBrowserProvider(config);
  const sessions = new PortalSessionService(prisma);
  const adapter = new CostcoInvoiceReadOnlyAdapter();
  const probe = new PortalProbeService(browser, sessions, adapter, config);
  try {
    await prisma.$connect();
    const workspaceId = process.env.PAE_PROBE_WORKSPACE_ID ?? process.argv[2] ?? DEMO_WORKSPACE_ID;
    const result = await probe.probeCostco(workspaceId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const code = error instanceof Error && 'code' in error ? String(error.code) : 'PROBE_FAILED';
  process.stderr.write(`${JSON.stringify({ success: false, errorCode: code, errorMessage: error instanceof Error ? error.message : 'Probe failed' })}\n`);
  process.exitCode = 1;
});

