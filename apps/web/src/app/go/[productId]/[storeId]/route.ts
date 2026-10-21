import { prisma } from '@babiespicks/db';
import { resolvePurchaseTarget } from '@babiespicks/domain';
import { createPurchaseHandler } from '@/server/purchase-handler';
export const dynamic = 'force-dynamic';
const handle = createPurchaseHandler(prisma, resolvePurchaseTarget);
export async function GET(request: Request, context: { params: Promise<{ productId: string; storeId: string }> }) { return handle(request, await context.params); }
