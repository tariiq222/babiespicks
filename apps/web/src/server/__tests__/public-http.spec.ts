import { describe, expect, it, vi } from 'vitest';
import { createPurchaseHandler } from '../purchase-handler';
import { createNewsletterHandler } from '../newsletter-handler';

const request = (body: unknown, origin = 'https://babiespicks.com') => new Request('https://babiespicks.com/api/newsletter/subscribe', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('purchase redirects', () => {
  it('keeps store selection and returns the destination even when click tracking fails', async () => {
    const db = { affiliateClick: { create: vi.fn().mockRejectedValue(new Error('tracking unavailable')) } };
    const resolve = vi.fn().mockResolvedValue({ url: 'https://store.example/p?a=1', storeId: 's', price: 50, currency: 'SAR' });
    const response = await createPurchaseHandler(db as never, resolve)(new Request('https://babiespicks.com/go/p/s'), { productId: 'p', storeId: 's' });
    expect(resolve).toHaveBeenCalledWith(db, { productId: 'p', storeId: 's' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://store.example/p?a=1');
    expect(db.affiliateClick.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 'p', storeId: 's' }) });
  });
  it('does not redirect or track a missing/unpublished target', async () => {
    const db = { affiliateClick: { create: vi.fn() } };
    const response = await createPurchaseHandler(db as never, vi.fn().mockResolvedValue(null))(new Request('https://babiespicks.com/go/p/s'), { productId: 'p', storeId: 's' });
    expect(response.status).toBe(404);
    expect(db.affiliateClick.create).not.toHaveBeenCalled();
  });
});

describe('newsletter subscription', () => {
  it('rejects invalid email, unknown fields, oversized requests and cross-site posts before writes', async () => {
    const db = { newsletterSubscriber: { upsert: vi.fn() } };
    const subscribe = createNewsletterHandler(db as never);
    for (const body of [{ email: 'invalid' }, { email: 'a@example.com', publish: true }, { email: 'x'.repeat(5000) }]) expect((await subscribe(request(body))).status).toBe(400);
    expect((await subscribe(request({ email: 'a@example.com' }, 'https://attacker.example'))).status).toBe(403);
    expect(db.newsletterSubscriber.upsert).not.toHaveBeenCalled();
  });
  it('normalizes email and uses a unique upsert without sending a message', async () => {
    const db = { newsletterSubscriber: { upsert: vi.fn().mockResolvedValue({}) } };
    const subscribe = createNewsletterHandler(db as never);
    expect((await subscribe(request({ email: ' User@Example.com ', locale: 'en' }))).status).toBe(200);
    expect(db.newsletterSubscriber.upsert).toHaveBeenCalledWith({ where: { email: 'user@example.com' }, create: { email: 'user@example.com', name: null, locale: 'en' }, update: {} });
  });
});
