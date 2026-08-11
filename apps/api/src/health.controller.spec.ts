import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import type { PrismaService } from './prisma.service';

describe('HealthController', () => {
  it('reports API and PostgreSQL availability', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.health()).resolves.toEqual({ status: 'ok', database: 'ok' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('returns a safe unavailable response when PostgreSQL cannot be reached', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection failed')) };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.health()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
