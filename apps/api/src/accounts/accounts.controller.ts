import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { AccountAccessGuard } from '../auth/account-access.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createTaxProfileRequestSchema,
  type CreateTaxProfileRequestDto,
} from '../tax-profile-requests/tax-profile-request.schemas';
import { AccountsService } from './accounts.service';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('me/accounts')
  getMyAccounts(@Req() request: AuthenticatedRequest) {
    return this.accounts.getUserAccounts(request.user.id);
  }

  @UseGuards(AccountAccessGuard())
  @Get('accounts/:accountId/tax-profiles')
  getTaxProfiles(@Param('accountId') accountId: string) {
    return this.accounts.getTaxProfiles(accountId);
  }

  @UseGuards(AccountAccessGuard())
  @Get('accounts/:accountId/tax-profile-requests')
  getTaxProfileRequests(@Param('accountId') accountId: string) {
    return this.accounts.getTaxProfileRequests(accountId);
  }

  @UseGuards(
    AccountAccessGuard([AccountRole.ACCOUNT_OWNER, AccountRole.ACCOUNT_ADMIN, AccountRole.MEMBER]),
  )
  @Post('accounts/:accountId/tax-profile-requests')
  createTaxProfileRequest(
    @Param('accountId') accountId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createTaxProfileRequestSchema)) dto: CreateTaxProfileRequestDto,
  ) {
    return this.accounts.createTaxProfileRequest(accountId, request.user.id, dto);
  }
}
