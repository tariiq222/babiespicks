import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminApiKeyGuard } from '../admin-api-key.guard';

type MockRequest = {
  headers: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
};

const createContext = (request: MockRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as ExecutionContext;

describe('AdminApiKeyGuard', () => {
  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.NODE_ENV;
  });

  it('accepts the x-admin-key header', () => {
    process.env.ADMIN_API_KEY = 'expected-secret';
    const guard = new AdminApiKeyGuard();

    expect(
      guard.canActivate(
        createContext({ headers: { 'x-admin-key': 'expected-secret' } }),
      ),
    ).toBe(true);
  });

  it('accepts an Authorization bearer token', () => {
    process.env.ADMIN_API_KEY = 'expected-secret';
    const guard = new AdminApiKeyGuard();

    expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer expected-secret' } }),
      ),
    ).toBe(true);
  });

  it('does not accept adminKey from the query string', () => {
    process.env.ADMIN_API_KEY = 'expected-secret';
    const guard = new AdminApiKeyGuard();

    expect(() =>
      guard.canActivate(
        createContext({
          headers: {},
          query: { adminKey: 'expected-secret' },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });
});
