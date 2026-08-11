import { canTransitionTaxProfileRequest } from '@cfo-ia/domain';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaxProfileRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TaxProfileRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.taxProfileRequest.findMany({
      include: {
        account: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async startReview(requestId: string, adminId: string) {
    return this.transition(
      requestId,
      adminId,
      TaxProfileRequestStatus.SUBMITTED,
      TaxProfileRequestStatus.UNDER_REVIEW,
    );
  }

  async reject(requestId: string, adminId: string, reason: string) {
    const request = await this.prisma.taxProfileRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Tax profile request not found');
    if (!canTransitionTaxProfileRequest(request.status, TaxProfileRequestStatus.REJECTED)) {
      throw new ConflictException(`Cannot reject request in ${request.status}`);
    }
    return this.prisma.taxProfileRequest.update({
      where: { id: requestId },
      data: {
        status: TaxProfileRequestStatus.REJECTED,
        rejectionReason: reason,
        reviewedById: adminId,
        resolvedAt: new Date(),
      },
    });
  }

  async approve(requestId: string, adminId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await tx.taxProfileRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new NotFoundException('Tax profile request not found');
        if (!canTransitionTaxProfileRequest(request.status, TaxProfileRequestStatus.APPROVED)) {
          throw new ConflictException(`Cannot approve request in ${request.status}`);
        }
        const subscription = await tx.subscription.findFirst({
          where: { accountId: request.accountId, status: 'ACTIVE', cancelledAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (!subscription) throw new ConflictException('Account has no active subscription');
        const workspaces = await tx.workspace.findMany({
          where: { accountId: request.accountId },
          select: { id: true },
          take: 2,
        });
        if (workspaces.length !== 1) {
          throw new ConflictException('Tax profile request does not identify a unique Workspace');
        }

        const claimed = await tx.taxProfileRequest.updateMany({
          where: { id: requestId, status: request.status, taxProfileId: null },
          data: {
            status: TaxProfileRequestStatus.APPROVED,
            reviewedById: adminId,
            resolvedAt: new Date(),
          },
        });
        if (claimed.count !== 1) throw new ConflictException('Request was already processed');

        const taxProfile = await tx.taxProfile.create({
          data: {
            accountId: request.accountId,
            workspaceId: workspaces[0]!.id,
            rfc: request.rfc,
            legalName: request.legalName,
            status: 'PENDING_VERIFICATION',
          },
        });
        const subscriptionItem = await tx.subscriptionItem.create({
          data: { subscriptionId: subscription.id, taxProfileId: taxProfile.id, unitAmount: 0 },
        });
        await tx.taxProfileRequest.update({
          where: { id: requestId },
          data: { taxProfileId: taxProfile.id },
        });
        await tx.auditEvent.create({
          data: {
            accountId: request.accountId,
            actorUserId: adminId,
            action: 'TAX_PROFILE_REQUEST_APPROVED',
            entityType: 'TaxProfileRequest',
            entityId: request.id,
            metadata: { taxProfileId: taxProfile.id, subscriptionItemId: subscriptionItem.id },
          },
        });
        await tx.auditEvent.create({
          data: {
            accountId: request.accountId,
            actorUserId: adminId,
            action: 'TAX_PROFILE_CREATED',
            entityType: 'TaxProfile',
            entityId: taxProfile.id,
            metadata: { source: 'TAX_PROFILE_REQUEST', workspaceId: workspaces[0]!.id },
          },
        });
        return { requestId, taxProfile, subscriptionItem };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('RFC already exists in this account');
      }
      throw error;
    }
  }

  private async transition(
    requestId: string,
    adminId: string,
    from: TaxProfileRequestStatus,
    to: TaxProfileRequestStatus,
  ) {
    const updated = await this.prisma.taxProfileRequest.updateMany({
      where: { id: requestId, status: from },
      data: { status: to, reviewedById: adminId },
    });
    if (updated.count !== 1) throw new ConflictException(`Request must be ${from}`);
    return this.prisma.taxProfileRequest.findUniqueOrThrow({ where: { id: requestId } });
  }
}
