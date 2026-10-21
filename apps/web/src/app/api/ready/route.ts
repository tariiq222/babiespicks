import { prisma } from '@babiespicks/db';
export const dynamic = 'force-dynamic';
export async function GET() { try { await prisma.$queryRaw`SELECT 1`; return Response.json({ status: 'ready' }); } catch { return Response.json({ status: 'unavailable' }, { status: 503 }); } }
