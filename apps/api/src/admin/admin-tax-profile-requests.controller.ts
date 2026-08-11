import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  rejectTaxProfileRequestSchema,
  type RejectTaxProfileRequestDto,
} from '../tax-profile-requests/tax-profile-request.schemas';
import { TaxProfileRequestsService } from '../tax-profile-requests/tax-profile-requests.service';

@UseGuards(PlatformAdminGuard)
@Controller('admin/tax-profile-requests')
export class AdminTaxProfileRequestsController {
  constructor(private readonly requests: TaxProfileRequestsService) {}

  @Get()
  list() {
    return this.requests.list();
  }

  @Post(':requestId/start-review')
  startReview(@Param('requestId') requestId: string, @Req() request: AuthenticatedRequest) {
    return this.requests.startReview(requestId, request.user.id);
  }

  @Post(':requestId/approve')
  approve(@Param('requestId') requestId: string, @Req() request: AuthenticatedRequest) {
    return this.requests.approve(requestId, request.user.id);
  }

  @Post(':requestId/reject')
  reject(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(rejectTaxProfileRequestSchema)) dto: RejectTaxProfileRequestDto,
  ) {
    return this.requests.reject(requestId, request.user.id, dto.reason);
  }
}
