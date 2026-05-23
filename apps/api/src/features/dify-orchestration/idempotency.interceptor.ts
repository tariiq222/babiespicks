import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';

type CacheEntry = { value: unknown; expiresAt: number };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  // In-memory cache; OK for a single-instance deployment.
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1h

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      url: string;
      method: string;
    }>();
    const rawKey = request.headers['x-idempotency-key'] ?? request.headers['X-Idempotency-Key'];
    const rawKeyValue = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!rawKeyValue || typeof rawKeyValue !== 'string' || rawKeyValue.length < 8) {
      return throwError(
        () => new BadRequestException('X-Idempotency-Key header required (min 8 chars)'),
      );
    }

    const key = `${request.method}:${request.url}:${rawKeyValue}`;

    const now = Date.now();
    this.purgeExpired(now);

    const cached = this.cache.get(key);
    if (cached) {
      return of(cached.value);
    }

    return next.handle().pipe(
      tap((value) => {
        this.cache.set(key, { value, expiresAt: now + this.TTL_MS });
      }),
    );
  }

  private purgeExpired(now: number): void {
    for (const [k, entry] of this.cache) {
      if (entry.expiresAt < now) this.cache.delete(k);
    }
  }
}
