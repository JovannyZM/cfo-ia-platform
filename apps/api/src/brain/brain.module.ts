import { Module } from '@nestjs/common';
import { WorkersModule } from '../workers/workers.module';
import { BrainService } from './brain.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [WorkersModule, ConversationsModule],
  providers: [BrainService],
  exports: [BrainService],
})
export class BrainModule {}
