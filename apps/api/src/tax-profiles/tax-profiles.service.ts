import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaxProfileStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { CreateTaxProfileDto } from './tax-profile.schemas';

@Injectable()
export class TaxProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, actorUserId: string, dto: CreateTaxProfileDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { accountId: true } });
        if (!workspace) throw new NotFoundException('Workspace not found');
        const profile = await tx.taxProfile.create({ data: {
          workspaceId, accountId: workspace.accountId, rfc: dto.rfc, legalName: dto.legalName,
          ...(dto.postalCode ? { postalCode: dto.postalCode } : {}),
          ...(dto.taxRegime ? { taxRegime: dto.taxRegime } : {}),
          ...(dto.cfdiUse ? { cfdiUse: dto.cfdiUse } : {}),
          ...(dto.billingEmail ? { billingEmail: dto.billingEmail } : {}),
        } });
        await this.audit(tx, workspace.accountId, actorUserId, 'TAX_PROFILE_CREATED', profile.id, {
          status: profile.status,
          providedFields: { postalCode: !!dto.postalCode, taxRegime: !!dto.taxRegime, cfdiUse: !!dto.cfdiUse, billingEmail: !!dto.billingEmail },
        });
        return profile;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('RFC already exists in this Workspace');
      throw error;
    }
  }

  get(workspaceId: string, taxProfileId: string) {
    return this.find(workspaceId, taxProfileId);
  }

  async approve(workspaceId: string, taxProfileId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await this.find(workspaceId, taxProfileId, tx);
      this.requireComplete(profile);
      if (profile.approvedAt) throw new ConflictException('TaxProfile is already approved');
      const approvedAt = new Date();
      const updated = await tx.taxProfile.update({ where: { id: profile.id }, data: { approvedAt, approvedByUserId: actorUserId } });
      await this.audit(tx, profile.accountId, actorUserId, 'TAX_PROFILE_APPROVED', profile.id, { changes: { approvedAt: { old: null, new: approvedAt.toISOString() }, approvedByUserId: { old: null, new: actorUserId } } });
      return updated;
    });
  }

  async activate(workspaceId: string, taxProfileId: string, actorUserId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const profile = await this.find(workspaceId, taxProfileId, tx);
        this.requireComplete(profile);
        if (!profile.approvedAt) throw new BadRequestException('TaxProfile must be approved before activation');
        if (profile.status === TaxProfileStatus.ACTIVE) return profile;
        const updated = await tx.taxProfile.update({ where: { id: profile.id }, data: { status: TaxProfileStatus.ACTIVE } });
        await this.audit(tx, profile.accountId, actorUserId, 'TAX_PROFILE_ACTIVATED', profile.id, { changes: { status: { old: profile.status, new: TaxProfileStatus.ACTIVE } } });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Workspace already has an ACTIVE TaxProfile');
      throw error;
    }
  }

  async deactivate(workspaceId: string, taxProfileId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await this.find(workspaceId, taxProfileId, tx);
      if (profile.status !== TaxProfileStatus.ACTIVE) throw new ConflictException('TaxProfile is not ACTIVE');
      const updated = await tx.taxProfile.update({ where: { id: profile.id }, data: { status: TaxProfileStatus.SUSPENDED } });
      await this.audit(tx, profile.accountId, actorUserId, 'TAX_PROFILE_DEACTIVATED', profile.id, { changes: { status: { old: profile.status, new: TaxProfileStatus.SUSPENDED } } });
      return updated;
    });
  }

  private async find(workspaceId: string, id: string, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const profile = await db.taxProfile.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!profile) throw new NotFoundException('TaxProfile not found');
    return profile;
  }

  private requireComplete(profile: { postalCode: string | null; taxRegime: string | null; cfdiUse: string | null; billingEmail: string | null }) {
    if (!profile.postalCode || !profile.taxRegime || !profile.cfdiUse || !profile.billingEmail) throw new BadRequestException('TaxProfile fiscal data is incomplete');
  }

  private audit(tx: Prisma.TransactionClient, accountId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    return tx.auditEvent.create({ data: { accountId, actorUserId, action, entityType: 'TaxProfile', entityId, metadata } });
  }
}
