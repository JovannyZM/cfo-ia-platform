import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user.platformRole !== PlatformRole.PLATFORM_ADMIN) {
      throw new ForbiddenException('PLATFORM_ADMIN role required');
    }
    return true;
  }
}
