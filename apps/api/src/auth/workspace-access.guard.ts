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

export function WorkspaceAccessGuard(allowedRoles?: readonly AccountRole[]): Type<CanActivate> {
  @Injectable()
  class Guard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const workspaceId = request.params.workspaceId;
      const membership = await this.prisma.workspace.findFirst({
        where: {
          id: typeof workspaceId === 'string' ? workspaceId : '',
          account: {
            deletedAt: null,
            members: {
              some: {
                userId: request.user.id,
                deletedAt: null,
                ...(allowedRoles ? { role: { in: [...allowedRoles] } } : {}),
              },
            },
          },
        },
        select: { id: true },
      });
      if (!membership) throw new ForbiddenException('Workspace access denied');
      return true;
    }
  }
  return mixin(Guard);
}
