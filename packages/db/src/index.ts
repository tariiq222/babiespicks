import { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
const globalDb = globalThis as unknown as { babiespicksPrisma?: PrismaClient };
export const prisma = globalDb.babiespicksPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.babiespicksPrisma = prisma;
