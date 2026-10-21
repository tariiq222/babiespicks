import {describe,it,expect} from 'vitest';
import {schemas} from './contracts';
const input={name:'Product',idempotencyKey:'gallery'};
describe('MCP product galleries',()=>{
 it('accepts an ordered gallery on create and optional updates',()=>{
  const imageUrls=['https://m.media-amazon.com/images/I/first.jpg','/media/'+'a'.repeat(64)+'.webp'];
  expect(schemas.bp_create_product.parse({...input,imageUrls}).imageUrls).toEqual(imageUrls);
  expect(schemas.bp_update_product.parse({id:'p',expectedVersion:2,idempotencyKey:'update',imageUrls:[]})).toHaveProperty('imageUrls',[]);
 });
 it('rejects executable, insecure, userinfo and oversized galleries',()=>{
  for(const imageUrls of [['javascript:alert(1)'],['http://evil.test/a.jpg'],['https://user:password@example.com/a.jpg'],Array.from({length:13},(_,i)=>`https://example.com/${i}.jpg`)])expect(schemas.bp_create_product.safeParse({...input,imageUrls}).success).toBe(false);
 });
});
