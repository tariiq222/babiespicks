import { beforeEach, describe, expect, it, vi } from 'vitest';
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cache);
import { POST } from '../../app/api/revalidate/route';
const request = (body: unknown, token?: string) => new Request('https://babiespicks.com/api/revalidate', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) }, body: JSON.stringify(body) });
describe('revalidation authentication and withdrawal', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.REVALIDATE_SECRET = 'test-secret'; });
  it('fails closed without a bearer credential, even on localhost', async () => {
    expect((await POST(request({ paths: ['/ar'] }))).status).toBe(401);
    expect((await POST(request({ paths: ['/ar'] }, 'test-secret'))).status).toBe(401);
    delete process.env.REVALIDATE_SECRET;
    expect((await POST(request({ paths: ['/ar'] }))).status).toBe(503);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
  it('rejects invalid paths and malformed arrays before changing the cache', async () => {
    for (const body of [{ paths: ['/ar/%2e%2e/private'] }, { paths: ['/ar/%2fadmin'] }, { paths: ['/ar/../../admin'] }, { paths: '/ar' }, { tags: ['private:users'] }]) expect((await POST(request(body, 'Bearer test-secret'))).status).toBe(400);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
  it('immediately expires publication tags and accepts exact public detail routes', async () => {
    expect((await POST(request({ paths: ['/ar/products/item', '/en/offers/offer'], tags: ['products:item'] }, 'Bearer test-secret'))).status).toBe(200);
    expect(cache.revalidateTag).toHaveBeenCalledWith('products:item', { expire: 0 });
    expect(cache.revalidatePath).toHaveBeenCalledWith('/ar/products/item');
  });
});
