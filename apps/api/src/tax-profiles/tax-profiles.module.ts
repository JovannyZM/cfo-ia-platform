import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TaxProfilesController } from './tax-profiles.controller';
import { TaxProfilesService } from './tax-profiles.service';

@Module({ controllers: [TaxProfilesController], providers: [PrismaService, TaxProfilesService] })
export class TaxProfilesModule {}
