import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import type { PortalActionObservation } from './browser-provider';
import { PortalActionObservationService } from './portal-action-observation.service';

const snapshot = {
  url: 'https://portal.example/form',
  action: { visible: true, enabled: true, disabled: false, ariaDisabled: null },
  statusMessages: [], currentStageFieldsVisible: { ticket: true }, nextStageFieldsVisible: { legalName: false },
};
const observation: PortalActionObservation = {
  stageKey: 'IDENTIFY', actionKey: 'CONTINUE', outcome: 'ACTION_RESPONSE_REJECTED',
  startedAt: new Date(0).toISOString(), finishedAt: new Date(1).toISOString(),
  actionResolution: { anchorTotalCount: 1, anchorVisibleCount: 1, formVisibleCount: 1, totalCount: 1, visibleCount: 1, containerSelector: 'form' },
  request: { observed: true, method: 'POST', url: 'https://portal.example/validate', status: 459, durationMs: 25, structure: { ticket: { present: true } }, responseSummary: { message: 'Rejected' }, redirects: [] },
  networkErrors: [], javascriptErrors: [], consoleMessages: [], before: snapshot, after: snapshot, resolved: snapshot,
  screenshots: { before: new Uint8Array([1]), after: new Uint8Array([2]), resolved: new Uint8Array([3]), mimeType: 'image/png' },
};

describe('PortalActionObservationService', () => {
  it('persists sanitized evidence and screenshots linked to session and attempt', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'observation' });
    const prisma = { portalActionObservation: { create } } as unknown as PrismaService;
    await new PortalActionObservationService(prisma).persist('session-id', 'attempt-id', observation);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      portalSessionId: 'session-id', invoiceRequestAttemptId: 'attempt-id', responseStatus: 459,
      beforeScreenshot: Buffer.from([1]), afterScreenshot: Buffer.from([2]), resolvedScreenshot: Buffer.from([3]),
    }) });
  });
});
