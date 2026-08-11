import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BROWSER_PROVIDER, type BrowserProvider, type BrowserSession } from './browser-provider';
import {
  COSTCO_ALLOWED_DOMAINS,
  CostcoInvoiceReadOnlyAdapter,
  type CostcoInitialValidationInput,
  type CostcoControlledProbeResult,
  type CostcoReadOnlyProbeResult,
} from './costco-invoice-read-only.adapter';
import { PortalSessionService } from './portal-session.service';

export const COSTCO_PROBE_CAPABILITY = 'INVOICE_PORTAL_READ_ONLY_PROBE';

export type ProbeExecutionResult = CostcoReadOnlyProbeResult & { portalSessionId: string };
export type ControlledProbeExecutionResult = CostcoControlledProbeResult & { portalSessionId: string };

@Injectable()
export class PortalProbeService {
  constructor(
    @Inject(BROWSER_PROVIDER) private readonly browser: BrowserProvider,
    private readonly sessions: PortalSessionService,
    private readonly adapter: CostcoInvoiceReadOnlyAdapter,
    private readonly config: ConfigService,
  ) {}

  async probeCostco(workspaceId: string): Promise<ProbeExecutionResult> {
    const record = await this.sessions.create(workspaceId, COSTCO_PROBE_CAPABILITY, this.adapter.adapterKey);
    let browserSession: BrowserSession | undefined;
    const timeoutMs = normalizeTimeout(this.config.get<string>('PAE_SESSION_TIMEOUT_MS'));
    try {
      if (!isEnabled(this.config.get<string>('PAE_ENABLED'))) {
        throw new ProbeError('PAE_DISABLED', 'Portal Automation Engine kill switch is active');
      }
      await this.sessions.markRunning(record.id);
      browserSession = await this.browser.createSession({
        allowedDomains: COSTCO_ALLOWED_DOMAINS,
        timeoutMs,
      });
      const result = await withDeadline(
        () => this.executeWithNavigationRetry(browserSession!, record.id),
        timeoutMs,
      );
      await this.sessions.markNavigationCompleted(record.id, result.finalUrl);
      await this.sessions.markScreenshot(record.id);
      await this.sessions.complete(record.id, result.finalUrl);
      return { portalSessionId: record.id, ...result };
    } catch (error) {
      const normalized = normalizeProbeError(error);
      await this.sessions.fail(record.id, probeErrorCode(normalized), normalized.message);
      throw normalized;
    } finally {
      if (browserSession) await this.browser.closeSession(browserSession);
    }
  }

  async probeCostcoInitialValidation(
    workspaceId: string,
    input: CostcoInitialValidationInput,
  ): Promise<ControlledProbeExecutionResult> {
    const record = await this.sessions.create(workspaceId, 'INVOICE_PORTAL_INITIAL_VALIDATION', this.adapter.adapterKey);
    let browserSession: BrowserSession | undefined;
    const timeoutMs = normalizeTimeout(this.config.get<string>('PAE_SESSION_TIMEOUT_MS'));
    try {
      if (!isEnabled(this.config.get<string>('PAE_ENABLED'))) {
        throw new ProbeError('PAE_DISABLED', 'Portal Automation Engine kill switch is active');
      }
      await this.sessions.markRunning(record.id);
      browserSession = await this.browser.createSession({ allowedDomains: COSTCO_ALLOWED_DOMAINS, timeoutMs });
      // The response observer owns its 60-second deadline. An outer race here
      // could enter finally and close the browser while the listener is pending.
      const result = await this.adapter.executeInitialValidation(
        this.browser,
        browserSession,
        `costco-controlled-probe-${record.id}`,
        input,
      );
      if (!result.validationResponse.responseReceived) {
        await this.sessions.markUnknownOutcome(record.id, 'VALIDATION_RESPONSE_TIMEOUT');
        return { portalSessionId: record.id, ...result };
      }
      await this.sessions.markNavigationCompleted(record.id, result.finalUrl);
      await this.sessions.markScreenshot(record.id);
      await this.sessions.complete(record.id, result.finalUrl);
      return { portalSessionId: record.id, ...result };
    } catch (error) {
      const normalized = normalizeProbeError(error);
      await this.sessions.fail(record.id, probeErrorCode(normalized), normalized.message);
      throw normalized;
    } finally {
      if (browserSession) await this.browser.closeSession(browserSession);
    }
  }

  private async executeWithNavigationRetry(session: BrowserSession, portalSessionId: string) {
    let firstError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.adapter.execute(this.browser, session, `costco-probe-${portalSessionId}`);
      } catch (error) {
        firstError ??= error;
        if (attempt === 1 || !isRetryableNavigationError(error)) throw error;
      }
    }
    throw firstError;
  }
}

export class ProbeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function normalizeProbeError(error: unknown): Error {
  if (error instanceof ProbeError) return error;
  if (error instanceof Error && error.name === 'TimeoutError') return error;
  return new ProbeError('NAVIGATION_FAILED', error instanceof Error ? error.message : 'Portal navigation failed');
}

function probeErrorCode(error: Error): string {
  if (error instanceof ProbeError) return error.code;
  return error.name === 'TimeoutError' ? 'SESSION_TIMEOUT' : 'NAVIGATION_FAILED';
}

function isRetryableNavigationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return !/DOMAIN_BLOCKED|REDIRECT_BLOCKED|PAE_DISABLED/i.test(`${'code' in error ? String(error.code) : ''} ${error.message}`);
}

function normalizeTimeout(value: string | undefined): number {
  const parsed = Number(value ?? 60_000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60_000) : 60_000;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

async function withDeadline<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let handle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        handle = setTimeout(() => {
          const error = new Error('Session timeout');
          error.name = 'TimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}
