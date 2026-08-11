import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { InvoiceRequestsService } from './invoice-requests.service';

@Controller('workspaces/:workspaceId/invoice-requests')
@UseGuards(WorkspaceAccessGuard([
  AccountRole.ACCOUNT_OWNER, AccountRole.ACCOUNT_ADMIN, AccountRole.MEMBER, AccountRole.VIEWER,
]))
export class InvoiceRequestsController {
  constructor(private readonly invoiceRequests: InvoiceRequestsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.invoiceRequests.list(workspaceId);
  }

  @Get(':invoiceRequestId')
  getById(
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceRequestId') invoiceRequestId: string,
  ) {
    return this.invoiceRequests.getById(workspaceId, invoiceRequestId);
  }
}
