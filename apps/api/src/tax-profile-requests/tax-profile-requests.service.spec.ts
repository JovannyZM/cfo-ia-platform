import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TaxProfileRequestsService } from './tax-profile-requests.service';

describe('TaxProfileRequestsService.approve', () => {
  it('changes status and creates profile, subscription item and audit event in one transaction', async () => {
    const tx = {
      taxProfileRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'request-id',
          accountId: 'account-id',
          rfc: 'XAXX010101000',
          legalName: 'Empresa Demo',
          status: 'UNDER_REVIEW',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      subscription: { findFirst: vi.fn().mockResolvedValue({ id: 'subscription-id' }) },
      workspace: { findMany: vi.fn().mockResolvedValue([{ id: 'workspace-id' }]) },
      taxProfile: { create: vi.fn().mockResolvedValue({ id: 'tax-profile-id' }) },
      subscriptionItem: { create: vi.fn().mockResolvedValue({ id: 'item-id' }) },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: 'event-id' }) },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new TaxProfileRequestsService(prisma as never);

    await service.approve('request-id', 'admin-id');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.taxProfileRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
    expect(tx.taxProfile.create).toHaveBeenCalledOnce();
    expect(tx.subscriptionItem.create).toHaveBeenCalledOnce();
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'TAX_PROFILE_REQUEST_APPROVED' }),
      }),
    );
  });

  it('does not approve a submitted request directly', async () => {
    const tx = {
      taxProfileRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'request-id',
          status: 'SUBMITTED',
        }),
      },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new TaxProfileRequestsService(prisma as never);

    await expect(service.approve('request-id', 'admin-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
