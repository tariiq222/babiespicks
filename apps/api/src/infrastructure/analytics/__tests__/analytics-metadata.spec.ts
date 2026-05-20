import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsMetadata } from '../analytics-metadata';

describe('sanitizeAnalyticsMetadata', () => {
  it('keeps allowlisted analytics dimensions and removes raw PII/session keys', () => {
    const sanitized = sanitizeAnalyticsMetadata({
      campaign: 'spring-strollers',
      channel: 'organic',
      component: 'hero-card',
      variant: 'a',
      email: 'parent@example.com',
      phone: '+966500000000',
      ip: '203.0.113.10',
      ipAddress: '203.0.113.11',
      userId: 'user_123',
      sessionId: 'sess_123',
      userAgent: 'Mozilla/5.0',
      referrer: 'https://example.com/private',
      rawDebugPayload: 'not allowlisted',
    });

    expect(sanitized).toEqual({
      campaign: 'spring-strollers',
      channel: 'organic',
      component: 'hero-card',
      variant: 'a',
    });
  });

  it('returns an empty metadata object for non-object input', () => {
    expect(sanitizeAnalyticsMetadata('parent@example.com')).toEqual({});
    expect(sanitizeAnalyticsMetadata(null)).toEqual({});
  });
});
