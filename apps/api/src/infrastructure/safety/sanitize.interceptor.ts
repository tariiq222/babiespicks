import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SafetyService } from './safety.service';

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SanitizeInterceptor.name);

  // Fields that should NOT have HTML stripped (e.g., rich text editor inputs)
  private readonly htmlAllowedFields = new Set(['content', 'description', 'body']);

  constructor(private readonly safetyService: SafetyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const body = request.body;

    if (body && typeof body === 'object') {
      request.body = this.sanitizeObject(body);
    }

    return next.handle();
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitizeString(key, value);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'string'
            ? this.sanitizeString(key, item)
            : item && typeof item === 'object'
              ? this.sanitizeObject(item as Record<string, unknown>)
              : item,
        );
      } else if (value && typeof value === 'object') {
        result[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private sanitizeString(fieldName: string, value: string): string {
    let sanitized = value.trim();

    // Check for suspicious patterns before sanitization
    const safetyCheck = this.safetyService.checkContentSafety(sanitized);
    if (!safetyCheck.isSafe) {
      this.safetyService.logSecurityEvent('SUSPICIOUS_INPUT', {
        field: fieldName,
        flags: safetyCheck.flags,
        inputLength: sanitized.length,
      });
    }

    // Strip HTML unless the field is in the allowed list
    if (!this.htmlAllowedFields.has(fieldName)) {
      sanitized = this.safetyService.sanitizeHtml(sanitized);
      // Also strip any remaining angle brackets for non-allowed fields
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    } else {
      // For allowed fields, still sanitize dangerous HTML
      sanitized = this.safetyService.sanitizeHtml(sanitized);
    }

    return sanitized;
  }
}
