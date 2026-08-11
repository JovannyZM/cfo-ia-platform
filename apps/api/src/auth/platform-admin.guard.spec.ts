import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  it('prevents a normal account user from creating a TaxProfile through approval', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user-id', platformRole: null } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => new PlatformAdminGuard().canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows only the persisted PLATFORM_ADMIN role', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'admin-id', platformRole: 'PLATFORM_ADMIN' } }),
      }),
    } as unknown as ExecutionContext;

    expect(new PlatformAdminGuard().canActivate(context)).toBe(true);
  });
});
