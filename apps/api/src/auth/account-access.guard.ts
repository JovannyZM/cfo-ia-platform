import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import type { AccountRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { AuthenticatedRequest } from './auth.types';

export function AccountAccessGuard(allowedRoles?: readonly AccountRole[]): Type<CanActivate> {
  @Injectable()
  class Guard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const accountId = request.params.accountId;
      if (typeof accountId !== 'string') {
        throw new ForbiddenException('Account access denied');
      }
      const membership = await this.prisma.accountMember.findFirst({
        where: {
          accountId,
          userId: request.user.id,
          deletedAt: null,
          account: { deletedAt: null },
        },
        select: { accountId: true, role: true },
      });
      if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
        throw new ForbiddenException('Account access denied');
      }
      request.accountMembership = membership;
      return true;
    }
  }
  return mixin(Guard);
}
