/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { TemporaryEvidenceService } from './temporary-evidence.service';

describe('TemporaryEvidenceService', () => {
  it('stores a reextractable hash with a seven-day TTL and audits reads', async () => {
    let record: any;
    const prisma: any = {
      temporaryEvidenceObject: {
        findUnique: vi.fn(() => Promise.resolve(record ? { ...record, workspace: { accountId: 'account' } } : null)),
        upsert: vi.fn(({ create }: any) => { record = { id: 'evidence', ...create, deletedAt: null }; return Promise.resolve(record); }),
        findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), update: vi.fn(),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const storage: any = {
      put: vi.fn().mockResolvedValue({ reference: 'private://evidence.enc', sizeBytes: 3, sha256: 'a'.repeat(64) }),
      get: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])), delete: vi.fn(),
    };
    const service = new TemporaryEvidenceService(prisma, new ConfigService({ EVIDENCE_TTL_HOURS: '168' }), storage);
    const before = Date.now();
    await service.store({ workspaceId: 'workspace', sourceEventId: 'event', bytes: Buffer.from([1, 2, 3]), mimeType: 'image/png', sha256: 'a'.repeat(64) });
    expect(record.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 168 * 3_600_000);
    const result = await service.readForReextraction({ workspaceId: 'workspace', sha256: 'a'.repeat(64), actorUserId: 'user' });
    expect(Buffer.from(result.bytes)).toEqual(Buffer.from([1, 2, 3]));
    expect(prisma.auditEvent.create).toHaveBeenCalledOnce();
  });

  it('deletes encrypted bytes after TTL expiration', async () => {
    const storage: any = { delete: vi.fn().mockResolvedValue(undefined) };
    const prisma: any = { temporaryEvidenceObject: {
      findMany: vi.fn().mockResolvedValue([{ id: 'expired', storageReference: 'private://expired.enc' }]),
      update: vi.fn().mockResolvedValue({}),
    } };
    const service = new TemporaryEvidenceService(prisma, new ConfigService(), storage);
    await expect(service.deleteExpired(new Date())).resolves.toBe(1);
    expect(storage.delete).toHaveBeenCalledWith('private://expired.enc');
  });
});
