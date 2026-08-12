import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BROWSER_PROVIDER, type BrowserProvider, type BrowserSession } from './browser-provider';
import { PortalSessionService } from './portal-session.service';
import { PortalActionObservationService } from './portal-action-observation.service';
import {
  PortalStageFlowEngine,
  type PortalFlowResult,
  type StagedPortalAdapter,
} from './portal-stage-flow';

@Injectable()
export class PortalFlowService {
  constructor(
    @Inject(BROWSER_PROVIDER) private readonly browser: BrowserProvider,
    private readonly sessions: PortalSessionService,
    private readonly engine: PortalStageFlowEngine,
    private readonly config: ConfigService,
    private readonly observations: PortalActionObservationService,
  ) {}

  async execute<ActionKey extends string>(
    workspaceId: string,
    capability: string,
    adapter: StagedPortalAdapter<ActionKey>,
    input: Readonly<Record<string, string>>,
    invoiceRequestAttemptId?: string,
  ): Promise<PortalFlowResult & { portalSessionId: string }> {
    const record = await this.sessions.create(workspaceId, capability, adapter.adapterKey);
    let browserSession: BrowserSession | undefined;
    const timeoutMs = normalizeTimeout(this.config.get<string>('PAE_SESSION_TIMEOUT_MS'));
    try {
      if (!isEnabled(this.config.get<string>('PAE_ENABLED'))) {
        throw Object.assign(new Error('Portal Automation Engine kill switch is active'), { code: 'PAE_DISABLED' });
      }
      await this.sessions.markRunning(record.id);
      browserSession = await this.browser.createSession({ allowedDomains: adapter.allowedDomains, timeoutMs });
      const result = await this.engine.execute(
        this.browser,
        browserSession,
        adapter,
        input,
        timeoutMs,
        (observation) => this.observations.persist(record.id, invoiceRequestAttemptId, observation),
      );
      await this.sessions.markNavigationCompleted(record.id, result.navigation.finalUrl);
      if (result.outcome === 'UNKNOWN_OUTCOME') {
        await this.sessions.markUnknownOutcome(record.id, 'PORTAL_FLOW_UNKNOWN_OUTCOME');
      } else {
        await this.sessions.complete(record.id, result.navigation.finalUrl);
      }
      return { portalSessionId: record.id, ...result };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Portal flow failed');
      const code = 'code' in normalized ? String(normalized.code) : normalized.name === 'TimeoutError' ? 'SESSION_TIMEOUT' : 'PORTAL_FLOW_FAILED';
      await this.sessions.fail(record.id, code, normalized.message);
      throw normalized;
    } finally {
      if (browserSession) await this.browser.closeSession(browserSession);
    }
  }
}

function normalizeTimeout(value: string | undefined): number {
  const parsed = Number(value ?? 60_000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60_000) : 60_000;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}
