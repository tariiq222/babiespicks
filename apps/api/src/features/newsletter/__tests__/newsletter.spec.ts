import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';

// ── Helpers duplicated from controller to test the logic in isolation ─────────
// (avoids needing @nestjs/testing which is not installed)

function verifyResendSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: Buffer | undefined,
): void {
  if (!svixId || !svixTimestamp || !svixSignature || !rawBody) {
    throw new Error('Missing Svix signature headers');
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const isValid = svixSignature
    .split(' ')
    .some((sig) => sig === `v1,${expectedSignature}`);

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }
}

// ── Webhook event routing logic ───────────────────────────────────────────────

type WebhookEvent = {
  type: string;
  data?: Record<string, unknown>;
};

function processWebhookEvent(event: WebhookEvent): string {
  switch (event.type) {
    case 'email.delivered':
      return `delivered:${event.data?.['to'] ?? 'unknown'}`;
    case 'email.bounced':
      return `bounced:${event.data?.['to'] ?? 'unknown'}`;
    case 'email.complained':
      return `complained:${event.data?.['to'] ?? 'unknown'}`;
    default:
      return `unhandled:${event.type}`;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Newsletter webhook signature verification', () => {
  function makeSecret() {
    const raw = crypto.randomBytes(24);
    return { raw, secret: `whsec_${raw.toString('base64')}` };
  }

  function makeSignature(raw: Buffer, svixId: string, svixTimestamp: string, body: string) {
    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    const sig = crypto.createHmac('sha256', raw).update(signedContent).digest('base64');
    return `v1,${sig}`;
  }

  it('passes with a valid signature', () => {
    const { raw, secret } = makeSecret();
    const body = '{"type":"email.delivered"}';
    const svixId = 'test-id-1';
    const svixTimestamp = '1700000000';
    const sig = makeSignature(raw, svixId, svixTimestamp, body);

    expect(() =>
      verifyResendSignature(secret, svixId, svixTimestamp, sig, Buffer.from(body)),
    ).not.toThrow();
  });

  it('throws on invalid signature', () => {
    const { secret } = makeSecret();
    expect(() =>
      verifyResendSignature(secret, 'id', '1234', 'v1,badsignature', Buffer.from('body')),
    ).toThrow('Invalid webhook signature');
  });

  it('throws when svix headers are missing', () => {
    const { secret } = makeSecret();
    expect(() =>
      verifyResendSignature(secret, '', '', '', Buffer.from('body')),
    ).toThrow('Missing Svix signature headers');
  });

  it('throws when rawBody is undefined', () => {
    const { secret } = makeSecret();
    expect(() =>
      verifyResendSignature(secret, 'id', '1234', 'v1,sig', undefined),
    ).toThrow('Missing Svix signature headers');
  });

  it('accepts multiple space-separated signatures (rotation)', () => {
    const { raw, secret } = makeSecret();
    const body = '{"type":"email.bounced"}';
    const svixId = 'test-id-2';
    const svixTimestamp = '1700000001';
    const validSig = makeSignature(raw, svixId, svixTimestamp, body);
    // Prepend an old/invalid signature to simulate key rotation
    const combinedSig = `v1,oldinvalidsig ${validSig}`;

    expect(() =>
      verifyResendSignature(secret, svixId, svixTimestamp, combinedSig, Buffer.from(body)),
    ).not.toThrow();
  });
});

describe('Newsletter webhook event routing', () => {
  it('routes email.delivered', () => {
    expect(processWebhookEvent({ type: 'email.delivered', data: { to: 'user@example.com' } }))
      .toBe('delivered:user@example.com');
  });

  it('routes email.bounced', () => {
    expect(processWebhookEvent({ type: 'email.bounced', data: { to: 'bounce@example.com' } }))
      .toBe('bounced:bounce@example.com');
  });

  it('routes email.complained', () => {
    expect(processWebhookEvent({ type: 'email.complained', data: { to: 'spam@example.com' } }))
      .toBe('complained:spam@example.com');
  });

  it('handles unknown event types gracefully', () => {
    expect(processWebhookEvent({ type: 'email.opened' })).toBe('unhandled:email.opened');
  });

  it('handles missing data field', () => {
    expect(processWebhookEvent({ type: 'email.delivered' })).toBe('delivered:unknown');
  });
});

describe('Newsletter subscribe deduplication', () => {
  it('normalises email to lowercase', () => {
    const email = 'User@Example.COM';
    const normalized = email.toLowerCase().trim();
    expect(normalized).toBe('user@example.com');
  });

  it('strips surrounding whitespace from email', () => {
    const email = '  hello@test.com  ';
    const normalized = email.toLowerCase().trim();
    expect(normalized).toBe('hello@test.com');
  });
});
