/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaxProfileStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TaxProfilesService } from './tax-profiles.service';

const ids = { workspace: '00000000-0000-4000-8000-000000000001', account: '00000000-0000-4000-8000-000000000002', user: '00000000-0000-4000-8000-000000000003', profile: '00000000-0000-4000-8000-000000000004' };
const complete = { postalCode: '91000', taxRegime: '601', cfdiUse: 'G03', billingEmail: 'billing@example.com' };
function harness(overrides: Record<string, unknown> = {}) {
  let profile: any = { id: ids.profile, workspaceId: ids.workspace, accountId: ids.account, rfc: 'GODE561231GR8', legalName: 'Persona', status: TaxProfileStatus.PENDING_VERIFICATION, approvedAt: null, approvedByUserId: null, deletedAt: null, ...complete, ...overrides };
  const audits: any[] = [];
  const prisma: any = { workspace: { findUnique: vi.fn().mockResolvedValue({ accountId: ids.account }) }, taxProfile: { create: vi.fn(({ data }) => Promise.resolve(profile = { ...profile, ...data })), findFirst: vi.fn(({ where }) => Promise.resolve(where.workspaceId === ids.workspace ? profile : null)), update: vi.fn(({ data }) => Promise.resolve(profile = { ...profile, ...data })) }, auditEvent: { create: vi.fn(({ data }) => { audits.push(data); return Promise.resolve(data); }) }, $transaction: vi.fn((callback) => callback(prisma)) };
  return { service: new TaxProfilesService(prisma), audits, profile: () => profile };
}
describe('TaxProfilesService', () => {
  it('creates and audits', async () => { const h = harness(); await h.service.create(ids.workspace, ids.user, { rfc: 'GODE561231GR8', legalName: 'Persona', ...complete }); expect(h.audits[0].action).toBe('TAX_PROFILE_CREATED'); });
  it('rejects incomplete approval', async () => { await expect(harness({ billingEmail: null }).service.approve(ids.workspace, ids.profile, ids.user)).rejects.toBeInstanceOf(BadRequestException); });
  it('approves complete data', async () => { const h = harness(); await h.service.approve(ids.workspace, ids.profile, ids.user); expect(h.profile().approvedByUserId).toBe(ids.user); expect(h.audits[0].action).toBe('TAX_PROFILE_APPROVED'); });
  it('requires approval before activation', async () => { await expect(harness().service.activate(ids.workspace, ids.profile, ids.user)).rejects.toBeInstanceOf(BadRequestException); });
  it('activates and deactivates with audit', async () => { const h = harness({ approvedAt: new Date(), approvedByUserId: ids.user }); await h.service.activate(ids.workspace, ids.profile, ids.user); await h.service.deactivate(ids.workspace, ids.profile, ids.user); expect(h.profile().status).toBe(TaxProfileStatus.SUSPENDED); expect(h.audits.map((x) => x.action)).toEqual(['TAX_PROFILE_ACTIVATED', 'TAX_PROFILE_DEACTIVATED']); });
  it('isolates Workspace', async () => { await expect(harness().service.get('00000000-0000-4000-8000-000000000099', ids.profile)).rejects.toBeInstanceOf(NotFoundException); });
});
