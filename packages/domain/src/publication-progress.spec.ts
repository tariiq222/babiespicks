import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTool } from './index';
const editor = {id:'editor',canPublish:false};
const product = (publishedAt:string|null,publishStatus='PUBLISHED',isActive=true) => ({publishedAt:publishedAt?new Date(publishedAt):null,publishStatus,isActive});
function database(rows: ReturnType<typeof product>[]) {
  return {product:{count:async({where}:any)=>rows.filter(row=>Object.entries(where).every(([key,value]:[string,any])=>{
    const actual=row[key as keyof typeof row];
    if(value===null||typeof value!=='object')return actual===value;
    if('in' in value)return value.in.includes(actual);
    return actual instanceof Date&&actual>=value.gte&&actual<value.lt;
  })).length}} as never;
}
afterEach(()=>vi.useRealTimers());
describe('daily unique first-publication progress',()=>{
  it('uses Riyadh day boundaries and retains archived first publications without reading product bodies',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const rows=[product('2026-11-02T20:59:59.999Z'),product('2026-11-02T21:00:00Z'),product('2026-11-03T20:59:59.999Z','ARCHIVED'),product('2026-11-03T21:00:00Z'),product(null),product(null,'DRAFT'),product(null,'REVIEW')];
    const db=database(rows);
    const expected={date:'2026-11-03',timezone:'Asia/Riyadh',dailyMinimum:3,dailyMaximum:6,firstPublishedToday:2,remainingToMinimum:1,remainingCapacity:4,currentlyPublishedToday:1,publishedTotal:4,drafts:2,publicationDateUnknown:1,asOf:'2026-11-03T12:00:00.000Z'};
    expect(await executeTool('bp_get_publication_progress',{date:'2026-11-03'},editor,db)).toEqual(expected);
    // Repeating the read and later state changes cannot add first-publication events.
    rows[1].publishStatus='ARCHIVED';
    expect(await executeTool('bp_get_publication_progress',{date:'2026-11-03'},editor,db)).toMatchObject({firstPublishedToday:2,currentlyPublishedToday:0});
  });
  it('defaults to the Riyadh day at local year rollover and handles leap day',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
    expect(await executeTool('bp_get_publication_progress',{},editor,database([product('2026-12-31T21:00:00Z')]))).toMatchObject({date:'2027-01-01',firstPublishedToday:1,remainingToMinimum:2,remainingCapacity:5});
    expect(await executeTool('bp_get_publication_progress',{date:'2024-02-29'},editor,database([product('2024-02-28T21:00:00Z')]))).toMatchObject({firstPublishedToday:1});
  });
  it('clamps daily minimum and capacity above six, without adding a monthly gate',async()=>{
    expect(await executeTool('bp_get_publication_progress',{date:'2026-11-03'},editor,database(Array.from({length:7},()=>product('2026-11-03T00:00:00Z'))))).toMatchObject({firstPublishedToday:7,remainingToMinimum:0,remainingCapacity:0});
  });
  it('rejects invalid dates and retired monthly inputs before querying',async()=>{
    for(const input of [{date:'1999-12-31'},{date:'2100-01-01'},{date:'2026-02-29'},{date:'2026-04-31'},{date:'2026-13-01'},{date:'2026-1-01'},{month:'2026-11'},{excludeReviewIds:[]}])await expect(executeTool('bp_get_publication_progress',input,editor,{} as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
  });
});
