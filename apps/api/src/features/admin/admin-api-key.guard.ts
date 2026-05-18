import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-admin-key'] || request.query?.adminKey;
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
}
