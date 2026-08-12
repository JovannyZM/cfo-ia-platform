import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage } from '../storage/private-object-storage';

@Injectable()
export class TemporaryEvidenceService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
  ) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => void this.deleteExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async store(input: {
    workspaceId: string; sourceEventId: string; bytes: Uint8Array; mimeType: string; sha256: string;
  }) {
    const existing = await this.prisma.temporaryEvidenceObject.findUnique({
      where: { workspaceId_sha256: { workspaceId: input.workspaceId, sha256: input.sha256 } },
    });
    if (existing && !existing.deletedAt && existing.expiresAt > new Date()) return existing;
    const stored = await this.storage.put(`evidence/${input.workspaceId}`, input.bytes);
    const expiresAt = new Date(Date.now() + ttlHours(this.config.get<string>('EVIDENCE_TTL_HOURS')) * 3_600_000);
    return this.prisma.temporaryEvidenceObject.upsert({
      where: { workspaceId_sha256: { workspaceId: input.workspaceId, sha256: input.sha256 } },
      create: {
        workspaceId: input.workspaceId, sourceEventId: input.sourceEventId, sha256: input.sha256,
        mimeType: input.mimeType, sizeBytes: input.bytes.byteLength, storageReference: stored.reference, expiresAt,
      },
      update: {
        sourceEventId: input.sourceEventId, mimeType: input.mimeType, sizeBytes: input.bytes.byteLength,
        storageReference: stored.reference, expiresAt, deletedAt: null,
      },
    });
  }

  async linkExpense(sourceEventId: string, expenseId: string): Promise<void> {
    await this.prisma.temporaryEvidenceObject.updateMany({ where: { sourceEventId }, data: { expenseId } });
  }

  async linkInvoiceRequest(expenseId: string, invoiceRequestId: string): Promise<void> {
    await this.prisma.temporaryEvidenceObject.updateMany({ where: { expenseId }, data: { invoiceRequestId } });
  }

  async readForReextraction(input: { workspaceId: string; sha256: string; actorUserId: string }) {
    const record = await this.prisma.temporaryEvidenceObject.findUnique({
      where: { workspaceId_sha256: { workspaceId: input.workspaceId, sha256: input.sha256 } },
      include: { workspace: { select: { accountId: true } } },
    });
    if (!record || record.deletedAt || record.expiresAt <= new Date()) throw new Error('TEMPORARY_EVIDENCE_EXPIRED');
    const bytes = await this.storage.get(record.storageReference);
    await this.prisma.auditEvent.create({ data: {
      accountId: record.workspace.accountId, actorUserId: input.actorUserId,
      action: 'TEMPORARY_EVIDENCE_REEXTRACTED', entityType: 'TemporaryEvidenceObject', entityId: record.id,
      metadata: { sha256: record.sha256, invoiceRequestId: record.invoiceRequestId, expenseId: record.expenseId },
    } });
    return { bytes, mimeType: record.mimeType, sha256: record.sha256 };
  }

  async deleteExpired(now = new Date()): Promise<number> {
    const expired = await this.prisma.temporaryEvidenceObject.findMany({ where: { expiresAt: { lte: now }, deletedAt: null } });
    for (const record of expired) {
      await this.storage.delete(record.storageReference);
      await this.prisma.temporaryEvidenceObject.update({ where: { id: record.id }, data: { deletedAt: now } });
    }
    return expired.length;
  }
}

function ttlHours(value: string | undefined): number {
  const parsed = Number(value ?? 168);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 168;
}
