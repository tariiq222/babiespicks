import { describe, expect, it, beforeEach } from 'vitest';
import { CallHandler, ExecutionContext, BadRequestException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

function mockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, url: '/test', method: 'POST' }),
    }),
  } as unknown as ExecutionContext;
}

function mockHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  it('passes through when key is present (first call)', async () => {
    const ctx = mockContext({ 'x-idempotency-key': 'abc-12345' });
    const result = await firstValueFrom(interceptor.intercept(ctx, mockHandler({ ok: true, id: 1 })));
    expect(result).toEqual({ ok: true, id: 1 });
  });

  it('returns cached response on repeat call with same key', async () => {
    const key = 'abc-45678';
    await firstValueFrom(interceptor.intercept(mockContext({ 'x-idempotency-key': key }), mockHandler({ ok: true, id: 7 })));
    const second = await firstValueFrom(
      interceptor.intercept(mockContext({ 'x-idempotency-key': key }), mockHandler({ ok: true, id: 999 })),
    );
    expect(second).toEqual({ ok: true, id: 7 });
  });

  it('rejects when header missing', async () => {
    await expect(
      firstValueFrom(interceptor.intercept(mockContext({}), mockHandler({}))),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not collide when same key used on different routes', async () => {
    const key = 'shared-key-abc123';
    await firstValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-idempotency-key': key }, url: '/route-a', method: 'POST' }) }) } as never,
        mockHandler({ ok: true, id: 1 }),
      ),
    );
    const second = await firstValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-idempotency-key': key }, url: '/route-b', method: 'POST' }) }) } as never,
        mockHandler({ ok: true, id: 2 }),
      ),
    );
    expect(second).toEqual({ ok: true, id: 2 });
  });
});
