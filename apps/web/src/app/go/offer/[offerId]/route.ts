import { prisma } from '@babiespicks/db';
import { resolveOfferTarget } from '@babiespicks/domain';
import { createOfferPurchaseHandler } from '@/server/purchase-handler';
export const dynamic = 'force-dynamic';
const handle = createOfferPurchaseHandler(prisma, resolveOfferTarget);
export async function GET(request: Request, context: { params: Promise<{ offerId: string }> }) { return handle(request, await context.params); }
