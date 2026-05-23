import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

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
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid Dify token');
    }
    return true;
  }

  private readHeader(headers: HttpHeaders, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0]?.trim() : value?.trim();
  }
}
