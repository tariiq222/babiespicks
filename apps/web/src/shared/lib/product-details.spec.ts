import {describe,it,expect} from 'vitest';
import {getProductImages,getAmazonReviewSource,organizeProductDescription} from './product-details';
describe('product detail presentation',()=>{
 it('keeps cover first and removes duplicates and unsafe gallery URLs',()=>{
  expect(getProductImages({imageUrl:'https://m.media-amazon.com/a.jpg',imageUrls:['https://m.media-amazon.com/a.jpg','https://m.media-amazon.com/b.jpg','javascript:alert(1)']})).toEqual(['https://m.media-amazon.com/a.jpg','https://m.media-amazon.com/b.jpg']);
  expect(getProductImages({imageUrl:null})).toEqual([]);
 });
 it('labels Amazon only for a dated explicit Amazon review source, not a price or lookalike domain',()=>{
  const source={url:'https://www.amazon.sa/dp/X',checkedAt:'2026-10-21T12:00:00Z',field:'reviewSummary'};
  expect(getAmazonReviewSource([source])).toEqual(source);
  for(const patch of [{field:'price'},{url:'https://amazon.sa.evil.test/X'},{url:'https://user:pass@amazon.sa/X'},{checkedAt:'invalid'}])expect(getAmazonReviewSource([{...source,...patch}])).toBeNull();
 });
 it('uses the latest review provenance before deciding whether it is Amazon',()=>{
  const amazon={url:'https://www.amazon.sa/dp/X',checkedAt:'2026-10-20T12:00:00Z',field:'reviewSummary'};
  const noon={...amazon,url:'https://www.noon.com/X',checkedAt:'2026-10-21T12:00:00Z'};
  expect(getAmazonReviewSource([amazon,noon])).toBeNull();
  expect(getAmazonReviewSource([amazon,{...noon,checkedAt:amazon.checkedAt}])).toBeNull();
 });
 it('handles bold headings and removes Markdown and bare purchase links',()=>{
  const result=organizeProductDescription('**لماذا اخترناها:** سبب مهم. **انتبهي:** ملاحظة. [رابط الشراء](https://www.amazon.sa/dp/X?tag=test) https://www.amazon.sa/dp/X?tag=legacy');
  expect(result).toContain('### لماذا اخترناها\n\nسبب مهم.');
  expect(result).toContain('### انتبهي\n\nملاحظة.');
  expect(result).not.toContain('https://');expect(result).not.toContain('**');
  for(const url of ['https://amzn.to/example','https://www.noon.com/saudi-en/example']) expect(organizeProductDescription(`Full facts. [Buy from store](${url})`)).not.toContain('https://');
  expect(organizeProductDescription('Full facts. Buy: https://www.amazon.sa/dp/X?tag=test')).toBe('Full facts.');
 });
 it('organizes complete legacy copy without keeping a raw affiliate purchase link',()=>{
  const text='نبذة كاملة. لماذا اخترناها: سبب مهم. انتبهي: ملاحظة مهمة. رابط الشراء: https://www.amazon.sa/dp/X?tag=test';
  const result=organizeProductDescription(text);
  expect(result).toContain('نبذة كاملة.');expect(result).toContain('### لماذا اخترناها');expect(result).toContain('سبب مهم.');expect(result).toContain('### انتبهي');expect(result).toContain('ملاحظة مهمة.');expect(result).not.toContain('https://');
 });
});
