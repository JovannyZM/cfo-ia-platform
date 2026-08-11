import type { AccountRole, PlatformRole } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRole: PlatformRole | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  accountMembership?: { accountId: string; role: AccountRole };
}
