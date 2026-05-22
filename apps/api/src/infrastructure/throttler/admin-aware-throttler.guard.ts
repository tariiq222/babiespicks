import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AdminAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: any): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const headers = req?.headers || {};
    const adminKey =
      headers['x-admin-key'] ||
      (typeof headers['authorization'] === 'string' &&
      headers['authorization'].toLowerCase().startsWith('bearer ')
        ? headers['authorization'].slice(7).trim()
        : undefined);
    const expected = process.env.ADMIN_API_KEY;
    if (expected && adminKey && adminKey === expected) return true;
    return super.shouldSkip(context);
  }
}
