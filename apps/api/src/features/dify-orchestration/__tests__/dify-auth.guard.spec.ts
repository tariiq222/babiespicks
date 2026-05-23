import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DifyAuthGuard } from '../dify-auth.guard';

function mockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('DifyAuthGuard', () => {
  const guard = new DifyAuthGuard();
  const ORIGINAL = process.env.DIFY_API_TOKEN;

  beforeEach(() => {
    process.env.DIFY_API_TOKEN = 'test-token-123';
  });

  afterEach(() => {
    process.env.DIFY_API_TOKEN = ORIGINAL;
  });

  it('allows requests with the correct token', () => {
    expect(guard.canActivate(mockContext({ 'x-dify-token': 'test-token-123' }))).toBe(true);
  });

  it('rejects requests with a wrong token', () => {
    expect(() => guard.canActivate(mockContext({ 'x-dify-token': 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests without the header', () => {
    expect(() => guard.canActivate(mockContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects when DIFY_API_TOKEN is unset', () => {
    delete process.env.DIFY_API_TOKEN;
    expect(() => guard.canActivate(mockContext({ 'x-dify-token': 'anything' }))).toThrow(
      UnauthorizedException,
    );
  });
});
