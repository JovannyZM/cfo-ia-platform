import { Injectable } from '@nestjs/common';
import { PortalSessionStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type SafeMetadata = Record<string, string | number | boolean | null>;

@Injectable()
export class PortalSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, capability: string, adapterKey: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { accountId: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.portalSession.create({
        data: { workspaceId, capability, adapterKey, status: PortalSessionStatus.CREATED },
      });
      await tx.auditEvent.create({
        data: this.auditData(workspace.accountId, session.id, 'PORTAL_SESSION_CREATED', {
          capability,
          adapterKey,
        }),
      });
      return session;
    });
  }

  async markRunning(id: string): Promise<void> {
    await this.transition(id, PortalSessionStatus.RUNNING, 'PORTAL_NAVIGATION_STARTED');
  }

  async markNavigationCompleted(id: string, currentUrl: string): Promise<void> {
    await this.transition(id, PortalSessionStatus.RUNNING, 'PORTAL_NAVIGATION_COMPLETED', {
      currentUrl: sanitizeUrl(currentUrl),
    }, { currentUrl: sanitizeUrl(currentUrl) });
  }

  async markScreenshot(id: string): Promise<void> {
    await this.audit(id, 'PORTAL_SCREENSHOT_CAPTURED', { storage: 'temporary-local-development' });
  }

  async complete(id: string, currentUrl: string): Promise<void> {
    await this.transition(id, PortalSessionStatus.COMPLETED, 'PORTAL_SESSION_COMPLETED', {
      currentUrl: sanitizeUrl(currentUrl),
    }, { currentUrl: sanitizeUrl(currentUrl), finishedAt: new Date(), errorCode: null, errorMessage: null });
  }

  async fail(id: string, code: string, message: string): Promise<void> {
    const safeMessage = sanitizeError(message);
    await this.transition(id, PortalSessionStatus.FAILED, 'PORTAL_SESSION_FAILED', {
      errorCode: code,
    }, { finishedAt: new Date(), errorCode: code, errorMessage: safeMessage });
  }

  async markUnknownOutcome(id: string, code: string): Promise<void> {
    await this.transition(id, PortalSessionStatus.UNKNOWN_OUTCOME, 'PORTAL_SESSION_UNKNOWN_OUTCOME', {
      errorCode: code,
    }, { finishedAt: new Date(), errorCode: code, errorMessage: null });
  }

  private async transition(
    id: string,
    status: PortalSessionStatus,
    action: string,
    metadata: SafeMetadata = {},
    extra: Prisma.PortalSessionUpdateInput = {},
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.portalSession.update({ where: { id }, data: { status, ...extra } });
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: session.workspaceId },
        select: { accountId: true },
      });
      await tx.auditEvent.create({ data: this.auditData(workspace.accountId, id, action, metadata) });
    });
  }

  private async audit(id: string, action: string, metadata: SafeMetadata): Promise<void> {
    const session = await this.prisma.portalSession.findUniqueOrThrow({
      where: { id },
      select: { workspace: { select: { accountId: true } } },
    });
    await this.prisma.auditEvent.create({
      data: this.auditData(session.workspace.accountId, id, action, metadata),
    });
  }

  private auditData(accountId: string, entityId: string, action: string, metadata: SafeMetadata) {
    return { accountId, action, entityType: 'PortalSession', entityId, metadata };
  }
}

export function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '';
  }
}

export function sanitizeError(message: string): string {
  return message.replace(/https?:\/\/[^\s]+/gi, '[url]').slice(0, 500);
}
