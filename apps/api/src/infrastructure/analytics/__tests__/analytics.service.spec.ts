import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../analytics.service';
import { PrismaService } from '../../database/prisma.service';

describe('AnalyticsService security hardening', () => {
  it('hashes raw session identifiers and derives idempotency keys before persistence', async () => {
    const prisma = {
      analyticsEvent: { create: vi.fn().mockResolvedValue({ id: 'evt_1' }) },
    };
    const service = new AnalyticsService(prisma as unknown as PrismaService);

    await service.recordEvent({
      eventType: 'social_impression',
      sessionHash: 'raw-browser-session-id',
      idempotencyKey: 'client supplied key with spaces',
      occurredAt: new Date('2026-05-20T10:00:00.000Z'),
    });

    const data = prisma.analyticsEvent.create.mock.calls[0][0].data;
    expect(data.sessionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(data.sessionHash).not.toBe('raw-browser-session-id');
    expect(data.idempotencyKey).toMatch(/^analytics:[a-f0-9]{64}$/);
    expect(data.idempotencyKey).not.toContain('client supplied key');
  });

  it('preserves already-normalized sha256 session hashes', async () => {
    const prisma = {
      analyticsEvent: { create: vi.fn().mockResolvedValue({ id: 'evt_1' }) },
    };
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    const normalized = `sha256:${'a'.repeat(64)}`;

    await service.recordEvent({ eventType: 'affiliate_click', sessionHash: normalized });

    expect(prisma.analyticsEvent.create.mock.calls[0][0].data.sessionHash).toBe(normalized);
  });
});
