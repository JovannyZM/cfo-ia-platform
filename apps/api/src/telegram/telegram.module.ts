import { Module } from '@nestjs/common';
import { TelegramAdapterService } from './telegram-adapter.service';
import { PrismaService } from '../prisma.service';
import { LanguageNormalizer } from '../common/language-normalizer';

@Module({
  providers: [PrismaService, LanguageNormalizer, TelegramAdapterService],
  exports: [TelegramAdapterService],
})
export class TelegramModule {}
