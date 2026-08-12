import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { PortalActionObservation } from './browser-provider';

@Injectable()
export class PortalActionObservationService {
  constructor(private readonly prisma: PrismaService) {}

  async persist(
    portalSessionId: string,
    invoiceRequestAttemptId: string | undefined,
    observation: PortalActionObservation,
  ): Promise<void> {
    await this.prisma.portalActionObservation.create({
      data: {
        portalSessionId,
        ...(invoiceRequestAttemptId ? { invoiceRequestAttemptId } : {}),
        stageKey: observation.stageKey,
        actionKey: observation.actionKey,
        outcome: observation.outcome,
        startedAt: new Date(observation.startedAt),
        finishedAt: new Date(observation.finishedAt),
        requestObserved: observation.request.observed,
        requestMethod: observation.request.method ?? null,
        requestUrl: observation.request.url ?? null,
        responseStatus: observation.request.status ?? null,
        requestDurationMs: observation.request.durationMs ?? null,
        requestStructure: toJson({ expected: observation.request.structure ?? null, networkActivity: observation.networkActivity ?? [] })!,
        responseContentType: observation.request.responseContentType ?? null,
        ...(toJson(observation.request.responseSummary) === undefined ? {} : { responseSummary: toJson(observation.request.responseSummary)! }),
        redirects: toJson(observation.request.redirects)!,
        networkErrors: toJson(observation.networkErrors)!,
        javascriptErrors: toJson(observation.javascriptErrors)!,
        consoleMessages: toJson(observation.consoleMessages)!,
        beforeSnapshot: toJson(observation.before)!,
        afterSnapshot: toJson(observation.after)!,
        resolvedSnapshot: toJson(observation.resolved)!,
        beforeScreenshot: Buffer.from(observation.screenshots.before),
        afterScreenshot: Buffer.from(observation.screenshots.after),
        resolvedScreenshot: Buffer.from(observation.screenshots.resolved),
        screenshotMimeType: observation.screenshots.mimeType,
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
