import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, BadRequestException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { DifyExceptionFilter } from '../dify-exception.filter';

function mockHost(url: string): { host: ArgumentsHost; response: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status, json };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('DifyExceptionFilter', () => {
  const filter = new DifyExceptionFilter();

  it('wraps BadRequestException with retryable=false', () => {
    const { host, response } = mockHost('/agents/dify/marketplace-search');
    filter.catch(new BadRequestException('bad input'), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const jsonArg = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(jsonArg).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'bad input', retryable: false },
    });
  });

  it('wraps UnauthorizedException', () => {
    const { host, response } = mockHost('/agents/dify/process-product');
    filter.catch(new UnauthorizedException('no token'), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    const jsonArg = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(jsonArg.error.code).toBe('unauthorized');
    expect(jsonArg.error.retryable).toBe(false);
  });

  it('wraps generic Error with retryable=true', () => {
    const { host, response } = mockHost('/agents/dify/marketplace-search');
    filter.catch(new Error('boom'), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const jsonArg = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(jsonArg.error.retryable).toBe(true);
  });

  it('rethrows for non-dify routes', () => {
    const { host } = mockHost('/admin/something');
    expect(() => filter.catch(new Error('x'), host)).toThrow('x');
  });
});
