import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

type HeaderValue = string | string[] | undefined;
type HttpHeaders = Record<string, HeaderValue>;

const BEARER_PREFIX = 'bearer ';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: HttpHeaders }>();
    const apiKey = this.getAdminApiKey(request.headers);
    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey) {
      // If no key configured, allow in development
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Admin API key not configured');
      }
      return true;
    }

    if (apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid admin API key');
    }
    return true;
  }

  /** Reads admin credentials only from headers, never from URL query strings. */
  private getAdminApiKey(headers: HttpHeaders): string | undefined {
    const directHeader = this.getHeader(headers, 'x-admin-key')?.trim();

    if (directHeader) {
      return directHeader;
    }

    const authorizationHeader = this.getHeader(headers, 'authorization')?.trim();

    if (!authorizationHeader) {
      return undefined;
    }

    if (!authorizationHeader.toLowerCase().startsWith(BEARER_PREFIX)) {
      return undefined;
    }

    return authorizationHeader.slice(BEARER_PREFIX.length).trim() || undefined;
  }

  private getHeader(headers: HttpHeaders, name: string): string | undefined {
    const expectedName = name.toLowerCase();

    for (const [headerName, value] of Object.entries(headers)) {
      if (headerName.toLowerCase() !== expectedName) {
        continue;
      }

      return Array.isArray(value) ? value[0] : value;
    }

    return undefined;
  }
}
