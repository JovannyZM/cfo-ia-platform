import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConversationSessionService } from './conversation-session.service';

@Module({
  providers: [PrismaService, ConversationSessionService],
  exports: [ConversationSessionService],
})
export class ConversationsModule {}
