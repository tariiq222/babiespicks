import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ProductDraftsService } from '../product-drafts.service';

describe('ProductDraftsService', () => {
  it('uses an explicit dashboard select and excludes rawData from listDrafts', async () => {
    const prisma = {
      productDraft: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    await service.listDrafts({ status: 'NEEDS_REVIEW', limit: 25 });

    const [findManyArgs] = prisma.productDraft.findMany.mock.calls[0] as [
      { select: Record<string, boolean>; take: number },
    ];

    expect(findManyArgs.take).toBe(25);
    expect(findManyArgs.select.id).toBe(true);
    expect(findManyArgs.select.title).toBe(true);
    expect(findManyArgs.select.status).toBe(true);
    expect(findManyArgs.select.rawData).toBeUndefined();
  });
});
