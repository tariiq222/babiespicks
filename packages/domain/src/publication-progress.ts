import type { PrismaClient } from '@babiespicks/db';
import { z } from 'zod';

export const MONTHLY_PUBLICATION_TARGET = 50;
const TIMEZONE = 'Asia/Riyadh';
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

const checkedTimestamp = z.iso.datetime({ offset: true });
const AMAZON_ROOT = /(?:^|\.)amazon\.(?:com(?:\.(?:au|br|mx|tr|be))?|co\.(?:uk|jp|za)|sa|ae|ca|cn|de|eg|es|fr|in|it|nl|pl|se|sg|ie)$/;

/** Structural reference coverage only; this does not establish source independence or correctness. */
function hasReferenceCoverage(sources: unknown, now: Date): boolean {
  if (!Array.isArray(sources)) return false;
  const hosts = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source !== 'object' || !['verdict', 'editorial'].includes(source.field) || typeof source.url !== 'string') continue;
    if (!checkedTimestamp.safeParse(source.checkedAt).success || Date.parse(source.checkedAt) > now.getTime()) continue;
    try {
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
      hosts.add(host);
    } catch { /* Invalid reference URLs remain uncounted. */ }
  }
  return hosts.size >= 2 && [...hosts].some(host => !AMAZON_ROOT.test(host));
}

/** Counts immutable first publication timestamps, independently of later edits or status changes. */
export async function getPublicationProgress(db: PrismaClient, requestedMonth?: string, excludeReviewIds: readonly string[] = [], now = new Date()) {
  // Riyadh uses UTC+03 year round; shifting before slicing also handles local year rollover.
  const month = requestedMonth ?? new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const publishedAt = {
    gte: new Date(Date.UTC(year, monthNumber - 1, 1) - RIYADH_OFFSET_MS),
    lt: new Date(Date.UTC(year, monthNumber, 1) - RIYADH_OFFSET_MS),
  };
  const current = { publishStatus: 'PUBLISHED' as const, isActive: true };
  const [firstPublished, currentlyPublishedFromMonth, publishedTotal, drafts, publicationDateUnknown, editorialReviewedFromMonth] = await Promise.all([
    db.product.count({ where: { publishedAt } }),
    db.product.count({ where: { ...current, publishedAt } }),
    db.product.count({ where: current }),
    db.product.count({ where: { publishStatus: { in: ['DRAFT', 'REVIEW'] } } }),
    db.product.count({ where: { ...current, publishedAt: null } }),
    db.product.count({ where: { ...current, publishedAt, verdict: { is: { isPublished: true } } } }),
  ]);
  let multiSourceReviewedFromMonth = 0;
  const reviewCandidates: Array<{ id: string; slug: string; publishedAt: string }> = [];
  const excluded = new Set(excludeReviewIds);
  let cursor: string | undefined;
  while (true) {
    const batch = await db.product.findMany({
      where: { ...current, publishedAt },
      select: { id: true, slug: true, publishedAt: true, sources: true, verdict: { select: { isPublished: true } } },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }], take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of batch) {
      const covered = row.verdict?.isPublished === true && hasReferenceCoverage(row.sources, now);
      if (covered) multiSourceReviewedFromMonth++;
      else if (reviewCandidates.length < 5 && !excluded.has(row.id)) reviewCandidates.push({ id: row.id, slug: row.slug, publishedAt: row.publishedAt!.toISOString() });
    }
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1].id;
  }
  return {
    month, timezone: TIMEZONE, target: MONTHLY_PUBLICATION_TARGET, firstPublished,
    remaining: Math.max(0, MONTHLY_PUBLICATION_TARGET - firstPublished),
    editorialReviewedFromMonth, multiSourceReviewedFromMonth, reviewCandidates,
    editorialReviewRemaining: Math.max(0, Math.min(MONTHLY_PUBLICATION_TARGET, firstPublished) - multiSourceReviewedFromMonth),
    currentlyPublishedFromMonth, publishedTotal, drafts, publicationDateUnknown, asOf: now.toISOString(),
  };
}
