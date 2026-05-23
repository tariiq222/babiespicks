import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

type HeaderValue = string | string[] | undefined;
type HttpHeaders = Record<string, HeaderValue>;

@Injectable()
export class DifyAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: HttpHeaders }>();
    const expected = process.env.DIFY_API_TOKEN;

    if (!expected) {
      throw new UnauthorizedException('DIFY_API_TOKEN not configured');
    }

    const provided = this.readHeader(request.headers, 'x-dify-token');
    const providedBuf = Buffer.from(provided ?? '', 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      throw new UnauthorizedException('Invalid Dify token');
    }
    return true;
  }

  private readHeader(headers: HttpHeaders, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0]?.trim() : value?.trim();
  }
}
