import { Injectable } from '@nestjs/common';
import type { CreateTaxProfileRequestDto } from '../tax-profile-requests/tax-profile-request.schemas';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  getUserAccounts(userId: string) {
    return this.prisma.accountMember.findMany({
      where: { userId, deletedAt: null, account: { deletedAt: null } },
      select: { role: true, account: { select: { id: true, name: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  getTaxProfiles(accountId: string) {
    return this.prisma.taxProfile.findMany({
      where: { accountId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  getTaxProfileRequests(accountId: string) {
    return this.prisma.taxProfileRequest.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createTaxProfileRequest(
    accountId: string,
    requestedById: string,
    dto: CreateTaxProfileRequestDto,
  ) {
    return this.prisma.taxProfileRequest.create({
      data: { accountId, requestedById, rfc: dto.rfc, legalName: dto.legalName },
    });
  }
}
