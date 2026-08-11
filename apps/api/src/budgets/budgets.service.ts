import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.budget.findMany({
      where: { workspaceId },
      include: { matchingRules: { orderBy: [{ priority: 'desc' }, { value: 'asc' }] } },
      orderBy: [{ period: 'asc' }, { name: 'asc' }],
    });
  }

  async getById(workspaceId: string, budgetId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, workspaceId },
      include: { matchingRules: { orderBy: [{ priority: 'desc' }, { value: 'asc' }] } },
    });
    if (!budget) throw new NotFoundException('Budget not found');
    return budget;
  }
}
