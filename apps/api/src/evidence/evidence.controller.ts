import {
  EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
  EXPENSE_EVIDENCE_RECEIVED,
  EXPENSE_REGISTERED,
  EXPENSE_INFORMATION_REQUIRED,
  type DomainEvent,
  type EventBus,
  type ExpenseEvidenceInterpretationFailedPayload,
  type ExpenseRegisteredPayload,
  type ExpenseInformationRequiredPayload,
} from '@cfo-ia/domain';
import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccountRole, ConversationIntentType } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { EVENT_BUS } from '../workers/workers.module';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ConversationSessionService } from '../conversations/conversation-session.service';
import { PrismaService } from '../prisma.service';
import {
  MultiPagePdfError,
  PDF_EVIDENCE_PROCESSOR,
  type PdfEvidenceProcessor,
} from './pdf-evidence-processor';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

@Controller('workspaces/:workspaceId/expenses/evidence')
export class EvidenceController {
  private readonly logger = new Logger(EvidenceController.name);

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly conversationSessions: ConversationSessionService,
    private readonly prisma: PrismaService,
    @Inject(PDF_EVIDENCE_PROCESSOR)
    private readonly pdfProcessor: PdfEvidenceProcessor,
  ) {}

  @UseGuards(
    WorkspaceAccessGuard([
      AccountRole.ACCOUNT_OWNER,
      AccountRole.ACCOUNT_ADMIN,
      AccountRole.MEMBER,
    ]),
  )
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }),
  )
  @Post()
  async upload(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { sourceChannel?: string; sourceConversationId?: string },
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateFile(file);
    const evidenceSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.expense.findUnique({
      where: { workspaceId_evidenceSha256: { workspaceId, evidenceSha256 } },
      select: { id: true },
    });
    if (duplicate) {
      response.status(HttpStatus.OK);
      return {
        status: 'DUPLICATE_EVIDENCE',
        message: file.mimetype === 'application/pdf'
          ? 'Este comprobante ya fue registrado.'
          : 'Este ticket ya fue registrado.',
        expenseId: duplicate.id,
      };
    }
    let evidenceBytes: Uint8Array = file.buffer;
    let evidenceMimeType = file.mimetype;
    let extractedText: string | undefined;
    if (file.mimetype === 'application/pdf') {
      try {
        const processed = await this.pdfProcessor.process(file.buffer);
        if (processed.kind === 'TEXT') extractedText = processed.text;
        else {
          evidenceBytes = processed.image;
          evidenceMimeType = processed.mimeType;
        }
      } catch (error: unknown) {
        if (error instanceof MultiPagePdfError) {
          response.status(HttpStatus.UNPROCESSABLE_ENTITY);
          return {
            status: 'MULTI_PAGE_PDF',
            message: 'Este PDF contiene varias páginas. En la versión actual solo se admite un comprobante por PDF.',
          };
        }
        this.logger.error(
          `PDF processing failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'}`,
        );
        throw new BadRequestException('Invalid PDF document');
      }
    }
    const correlationId = randomUUID();
    const sourceEventId = randomUUID();
    let registered: ExpenseRegisteredPayload | undefined;
    let failure: ExpenseEvidenceInterpretationFailedPayload | undefined;
    let informationRequired: ExpenseInformationRequiredPayload | undefined;

    const unsubscribeRegistered = this.eventBus.subscribe(
      EXPENSE_REGISTERED,
      (event) => {
        if (event.correlationId === correlationId) {
          registered = event.payload as ExpenseRegisteredPayload;
        }
      },
    );
    const unsubscribeFailed = this.eventBus.subscribe(
      EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
      (event) => {
        if (event.correlationId === correlationId) {
          failure = event.payload as ExpenseEvidenceInterpretationFailedPayload;
        }
      },
    );
    const unsubscribeInformation = this.eventBus.subscribe(
      EXPENSE_INFORMATION_REQUIRED,
      (event) => {
        if (event.correlationId === correlationId) {
          informationRequired = event.payload as ExpenseInformationRequiredPayload;
        }
      },
    );

    try {
      const event: DomainEvent = {
        eventId: sourceEventId,
        type: EXPENSE_EVIDENCE_RECEIVED,
        workspaceId,
        correlationId,
        payload: {
          image: evidenceBytes,
          mimeType: evidenceMimeType,
          ...(extractedText ? { extractedText } : {}),
          ...(body.sourceChannel ? { sourceChannel: body.sourceChannel } : {}),
          ...(body.sourceConversationId ? { sourceConversationId: body.sourceConversationId } : {}),
          evidenceSha256,
        },
        createdAt: new Date(),
      };
      await this.eventBus.publish(event);
    } finally {
      unsubscribeRegistered();
      unsubscribeFailed();
      unsubscribeInformation();
    }

    if (registered) {
      response.status(HttpStatus.CREATED);
      return { expense: registered };
    }
    if (failure) {
      const needsReview = failure.code === 'NEEDS_REVIEW';
      response.status(
        needsReview ? HttpStatus.ACCEPTED : HttpStatus.UNPROCESSABLE_ENTITY,
      );
      return {
        status: needsReview ? 'NEEDS_REVIEW' : 'FAILED',
        errorCode: failure.code,
        reason: failure.reason,
        confidence: failure.confidence,
        missingFields: failure.missingFields,
        warnings: failure.warnings,
      };
    }
    if (informationRequired) {
      if (body.sourceChannel && body.sourceConversationId) {
        await this.conversationSessions.start({
          workspaceId,
          sourceChannel: body.sourceChannel,
          sourceConversationId: body.sourceConversationId,
          userId: request.user.id,
          workerId: 'expense-assistant',
          intentType: ConversationIntentType.NEW_EXPENSE,
          contextJson: {
            draft: informationRequired.draft,
            missingFields: informationRequired.missingFields,
            sourceEventId,
            captureSource: 'EVIDENCE',
          },
          pendingField: informationRequired.missingFields[0]!,
        });
      }
      response.status(HttpStatus.ACCEPTED);
      return {
        status: 'NEEDS_INFORMATION',
        ...informationRequired,
        draft: { ...informationRequired.draft, captureSource: 'EVIDENCE' },
      };
    }

    throw new InternalServerErrorException('Expense processing did not complete');
  }

  private validateFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('Exactly one file is required');
    if (file.buffer.byteLength > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds the 10 MB limit');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }
    const bytes = file.buffer;
    const valid =
      (file.mimetype === 'image/jpeg' &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (file.mimetype === 'image/png' &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.mimetype === 'image/webp' &&
        bytes.subarray(0, 4).toString() === 'RIFF' &&
        bytes.subarray(8, 12).toString() === 'WEBP') ||
      (file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-');
    if (!valid) {
      throw new BadRequestException('File content does not match MIME type');
    }
  }
}
