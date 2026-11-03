import type { PrismaClient } from '@babiespicks/db';
export const DAILY_PUBLICATION_TARGET = { min: 3, max: 6 } as const;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
/** Immutable first publication per product; edits, price updates and republication add no events. */
export async function getPublicationProgress(db: PrismaClient, requestedDate?: string, now = new Date()) {
  const date = requestedDate ?? new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00+03:00`);
  const publishedAt = { gte: start, lt: new Date(start.getTime() + 86400000) };
  const current = { publishStatus: 'PUBLISHED' as const, isActive: true };
  const [firstPublishedToday, currentlyPublishedToday, publishedTotal, drafts, publicationDateUnknown] = await Promise.all([
    db.product.count({ where: { publishedAt } }),
    db.product.count({ where: { ...current, publishedAt } }),
    db.product.count({ where: current }),
    db.product.count({ where: { publishStatus: { in: ['DRAFT', 'REVIEW'] } } }),
    db.product.count({ where: { ...current, publishedAt: null } }),
  ]);
  return {
    date, timezone: 'Asia/Riyadh', dailyMinimum: DAILY_PUBLICATION_TARGET.min, dailyMaximum: DAILY_PUBLICATION_TARGET.max,
    firstPublishedToday, remainingToMinimum: Math.max(0, DAILY_PUBLICATION_TARGET.min - firstPublishedToday),
    remainingCapacity: Math.max(0, DAILY_PUBLICATION_TARGET.max - firstPublishedToday),
    currentlyPublishedToday, publishedTotal, drafts, publicationDateUnknown, asOf: now.toISOString(),
  };
}
