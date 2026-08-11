import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AccountsController } from './accounts.controller';

describe('public API surface', () => {
  it('does not expose POST /tax-profiles', () => {
    const methods = Object.getOwnPropertyNames(AccountsController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        // Reading prototype metadata is intentional; no method is invoked unbound.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const handler = AccountsController.prototype[name as keyof AccountsController];
        return {
          path: Reflect.getMetadata(PATH_METADATA, handler as object) as string | undefined,
          method: Reflect.getMetadata(METHOD_METADATA, handler as object) as
            RequestMethod | undefined,
        };
      });

    expect(methods).not.toContainEqual(
      expect.objectContaining({
        path: expect.stringContaining('tax-profiles'),
        method: RequestMethod.POST,
      }),
    );
  });
});
