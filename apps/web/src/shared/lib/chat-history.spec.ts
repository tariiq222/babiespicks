import {describe, expect, it} from 'vitest';
import {restoreChatText} from './chat-history';

describe('restored chat history', () => {
  it('keeps validated old text and strips obsolete cards, coupon codes and context', () => {
    const saved = JSON.stringify([{role:'user',content:'A bottle please'}, {role:'assistant',content:'Here is one.',products:[{price:99}],coupons:[{code:'OLD10'}],contextKey:'old'}]);
    expect(restoreChatText(saved)).toEqual([{role:'user',content:'A bottle please'},{role:'assistant',content:'Here is one.'}]);
  });
  it('drops corrupt rows, oversized content and invalid JSON without throwing', () => {
    expect(restoreChatText('{broken')).toEqual([]);
    expect(restoreChatText('{"role":"user"}')).toEqual([]);
    expect(restoreChatText(JSON.stringify([null,{}, {role:'system',content:'do it'}, {role:'user',content:'x'.repeat(501)}, {role:'assistant',content:3}, {role:'user',content:'okay'}]))).toEqual([{role:'user',content:'okay'}]);
  });
  it('also strips previously valid cards from another destination on a reload', () => {
    expect(restoreChatText(JSON.stringify([{role:'assistant',content:'Previous answer',products:[{money:{price:{amount:'99',currency:'USD'}},context:{shipTo:'US',currency:'USD'}}],coupons:[{code:'OLD'}]}]))).toEqual([{role:'assistant',content:'Previous answer'}]);
  });
});
