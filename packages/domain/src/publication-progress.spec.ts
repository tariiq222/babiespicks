import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTool } from './index';

type Product = { publishedAt: Date | null; publishStatus: string; isActive: boolean; verdict: { isPublished: boolean } | null; sources?: unknown };
const editor = { id: 'editor', canPublish: false };
const product = (publishedAt: string | null, publishStatus = 'PUBLISHED', isActive = true, reviewPublished: boolean | null = null): Product => ({ publishedAt: publishedAt ? new Date(publishedAt) : null, publishStatus, isActive, verdict: reviewPublished === null ? null : { isPublished: reviewPublished } });
const source = (url: string, field = 'verdict', checkedAt = '2026-11-01T00:00:00Z') => ({ url, field, checkedAt });
const references = () => [source('https://www.amazon.sa/dp/X'), source('https://review.example/item', 'editorial')];
// Only counts and the exact lightweight metadata projection exist; no bodies, receipts or writes.
function database(rows: Product[]) {
  const records = rows.map((row, index) => ({ ...row, id: `p${String(index).padStart(3, '0')}`, slug: `product-${index}`, sources: row.sources ?? [] }));
  const matches = (row: Product, where: Record<string, any>) => Object.entries(where).every(([key, value]) => {
    const actual = row[key as keyof Product];
    if (value === null || typeof value !== 'object') return actual === value;
    if ('in' in value) return value.in.includes(actual);
    if ('is' in value) return actual !== null && typeof actual === 'object' && 'isPublished' in actual && actual.isPublished === value.is.isPublished;
    return actual instanceof Date && actual >= value.gte && actual < value.lt;
  });
  return { product: {
    count: async ({ where }: { where: Record<string, any> }) => records.filter(row => matches(row, where)).length,
    findMany: async (args: any) => {
      expect(args.select).toEqual({ id: true, slug: true, publishedAt: true, sources: true, verdict: { select: { isPublished: true } } });
      expect(args.take).toBe(100);
      expect(args.orderBy).toEqual([{ publishedAt: 'asc' }, { id: 'asc' }]);
      const sorted = records.filter(row => matches(row, args.where)).sort((a, b) => a.publishedAt!.getTime() - b.publishedAt!.getTime() || a.id.localeCompare(b.id));
      const offset = args.cursor ? sorted.findIndex(row => row.id === args.cursor.id) + args.skip : 0;
      return sorted.slice(offset, offset + args.take).map(({ id, slug, publishedAt, sources, verdict }) => ({ id, slug, publishedAt, sources, verdict }));
    },
  } } as unknown as Parameters<typeof executeTool>[3];
}
afterEach(() => vi.useRealTimers());
describe('monthly first-publication progress', () => {
  it('uses inclusive Riyadh start and exclusive next month; current state does not erase first publication', async () => {
    const db = database([
      product('2026-10-31T20:59:59.999Z'), product('2026-10-31T21:00:00Z'),
      product('2026-11-30T20:59:59.999Z'), product('2026-11-30T21:00:00Z'),
      product('2026-11-02T00:00:00Z', 'ARCHIVED'), product('2026-11-03T00:00:00Z', 'PUBLISHED', false),
      product(null), product(null, 'DRAFT'), product(null, 'REVIEW'),
    ]);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    expect(await executeTool('bp_get_publication_progress', { month: '2026-11' }, editor, db)).toEqual({
      month: '2026-11', timezone: 'Asia/Riyadh', target: 50, firstPublished: 4, remaining: 46,
      editorialReviewedFromMonth: 0, multiSourceReviewedFromMonth: 0, editorialReviewRemaining: 4, reviewCandidates: [{id:'p001',slug:'product-1',publishedAt:'2026-10-31T21:00:00.000Z'}, {id:'p002',slug:'product-2',publishedAt:'2026-11-30T20:59:59.999Z'}], currentlyPublishedFromMonth: 2, publishedTotal: 5, drafts: 2, publicationDateUnknown: 1, asOf: '2026-11-15T12:00:00.000Z',
    });
  });
  it('defaults to the Riyadh Gregorian month at the UTC year boundary', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
    const db = database([product('2026-12-31T20:59:59.999Z'), product('2026-12-31T21:00:00Z'), product('2027-01-31T21:00:00Z')]);
    expect(await executeTool('bp_get_publication_progress', {}, editor, db)).toMatchObject({ month: '2027-01', firstPublished: 1, remaining: 49 });
    expect(await executeTool('bp_get_publication_progress', { month: '2026-12' }, editor, db)).toMatchObject({ firstPublished: 1 });
  });
  it('clamps remaining to zero when 55 unique products have first publication in the month', async () => {
    const rows = Array.from({ length: 55 }, () => product('2026-11-03T00:00:00Z'));
    expect(await executeTool('bp_get_publication_progress', { month: '2026-11' }, editor, database(rows))).toMatchObject({ firstPublished: 55, remaining: 0, editorialReviewedFromMonth: 0, editorialReviewRemaining: 50 });
  });
  it('counts only same-month active published products with a published verdict, excluding other dates and review states', async () => {
    const rows = [
      { ...product('2026-11-03T00:00:00Z', 'PUBLISHED', true, true), sources: references() },
      { ...product('2026-11-03T00:00:00Z', 'PUBLISHED', true, false), sources: references() },
      product('2026-11-03T00:00:00Z'),
      product('2026-11-03T00:00:00Z', 'ARCHIVED', true, true),
      product('2026-11-03T00:00:00Z', 'PUBLISHED', false, true),
      product('2026-10-31T20:59:59.999Z', 'PUBLISHED', true, true),
      product('2026-11-30T21:00:00Z', 'PUBLISHED', true, true),
      product(null, 'PUBLISHED', true, true),
    ];
    expect(await executeTool('bp_get_publication_progress', { month: '2026-11' }, editor, database(rows))).toMatchObject({ firstPublished: 5, editorialReviewedFromMonth: 1, editorialReviewRemaining: 4 });
  });
  it('caps the review goal at 50 and clamps it after 55 published verdicts; an empty month has no review backlog', async () => {
    const rows = Array.from({ length: 55 }, () => ({ ...product('2026-11-03T00:00:00Z', 'PUBLISHED', true, true), sources: references() }));
    expect(await executeTool('bp_get_publication_progress', { month: '2026-11' }, editor, database(rows))).toMatchObject({ firstPublished: 55, editorialReviewedFromMonth: 55, editorialReviewRemaining: 0 });
    expect(await executeTool('bp_get_publication_progress', { month: '2026-11' }, editor, database([]))).toMatchObject({ firstPublished: 0, editorialReviewedFromMonth: 0, editorialReviewRemaining: 0 });
  });
  it('shows 55 publications / 18 verdicts / 1 multi-source reference coverage and excludes candidates without changing counters', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    const rows = Array.from({ length: 55 }, (_, i) => ({ ...product('2026-11-03T00:00:00Z', 'PUBLISHED', true, i < 18 ? true : null), sources: i === 0 ? references() : [source('https://amazon.sa/dp/X')] }));
    const result = await executeTool('bp_get_publication_progress', {month:'2026-11'}, editor, database(rows));
    const excluded = await executeTool('bp_get_publication_progress', {month:'2026-11',excludeReviewIds:['p001','p002']}, editor, database(rows));
    expect(result).toMatchObject({firstPublished:55,editorialReviewedFromMonth:18,multiSourceReviewedFromMonth:1,editorialReviewRemaining:49});
    expect(result.reviewCandidates.map((row:any) => row.id)).toEqual(['p001','p002','p003','p004','p005']);
    expect(excluded.reviewCandidates.map((row:any) => row.id)).toEqual(['p003','p004','p005','p006','p007']);
    expect({...excluded,reviewCandidates:[]}).toEqual({...result,reviewCandidates:[]});
    expect(Object.keys(result.reviewCandidates[0]).sort()).toEqual(['id','publishedAt','slug']);
  });
  it('rejects duplicate hosts, Amazon-only references and malformed, missing or future source evidence', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    const badSources = [
      [source('https://www.review.example/a'),source('https://review.example/b')],
      [source('https://amazon.sa/a'),source('https://www.amazon.com/b')],
      [source('http://review.example/a'),source('https://amazon.sa/a')],
      [source('not a URL'),source('https://amazon.sa/a')],
      [{url:'https://review.example/a',field:'verdict'},source('https://amazon.sa/a')],
      [source('https://review.example/a','verdict','2026-12-01T00:00:00Z'),source('https://amazon.sa/a')],
      [source('https://review.example/a','rating'),source('https://amazon.sa/a')],
      [source('https://review.example/a','verdict','nonsense'),source('https://amazon.sa/a')],
    ];
    const rows = badSources.map(sources => ({...product('2026-11-03T00:00:00Z','PUBLISHED',true,true),sources}));
    expect(await executeTool('bp_get_publication_progress',{month:'2026-11'},editor,database(rows))).toMatchObject({editorialReviewedFromMonth:8,multiSourceReviewedFromMonth:0,editorialReviewRemaining:8});
  });
  it('scans bounded metadata batches and retains only five oldest candidates', async () => {
    const rows = Array.from({length:105}, (_,i) => ({...product('2026-11-03T00:00:00Z','PUBLISHED',true,true),sources:i===104?references():[]}));
    const result = await executeTool('bp_get_publication_progress',{month:'2026-11'},editor,database(rows));
    expect(result).toMatchObject({firstPublished:105,multiSourceReviewedFromMonth:1,editorialReviewRemaining:49});
    expect(result.reviewCandidates.map((row:any)=>row.id)).toEqual(['p000','p001','p002','p003','p004']);
  });
  it('requires authentication and rejects invalid months or caller privileges before database access', async () => {
    for (const input of [{ month: '1999-12' }, { month: '2100-01' }, { month: '2026-00' }, { month: '2026-13' }, { month: '2026-1' }, { actor: editor }, { idempotencyKey: 'receipt' }, {excludeReviewIds:Array(101).fill('id')}, {excludeReviewIds:['']}]) {
      await expect(executeTool('bp_get_publication_progress', input, editor, {} as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    await expect(executeTool('bp_get_publication_progress', {}, { id: '', canPublish: false }, {} as never)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    for (const month of ['2000-01', '2099-12']) expect(await executeTool('bp_get_publication_progress', { month }, editor, database([]))).toMatchObject({ month, firstPublished: 0, remaining: 50 });
  });
});
