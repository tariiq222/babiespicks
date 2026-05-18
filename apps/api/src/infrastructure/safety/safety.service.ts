import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  /**
   * Strip dangerous HTML tags/attributes while keeping basic formatting.
   * Allows: b, i, em, strong, p, br, ul, ol, li
   */
  sanitizeHtml(input: string): string {
    if (!input || typeof input !== 'string') {
      return input;
    }

    const allowedTags = new Set([
      'b',
      'i',
      'em',
      'strong',
      'p',
      'br',
      'ul',
      'ol',
      'li',
    ]);

    // Remove script/style tags and their contents first
    let cleaned = input
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove event handlers and javascript: protocols from attributes
    cleaned = cleaned.replace(
      /\s*(on\w+|style|xmlns|xmlns:xlink)\s*=\s*["'][^"']*["']/gi,
      '',
    );

    // Remove any remaining tags that are not in the allowed list
    cleaned = cleaned.replace(/<(\/?)(\w+)[^>]*>/g, (match, slash, tag) => {
      const tagLower = tag.toLowerCase();
      if (allowedTags.has(tagLower)) {
        return match;
      }
      return '';
    });

    return cleaned;
  }

  /**
   * Validate URL is http/https and not internal/localhost.
   */
  validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol.toLowerCase();

      if (protocol !== 'http:' && protocol !== 'https:') {
        return false;
      }

      const hostname = parsed.hostname.toLowerCase();

      // Reject localhost and private IPs
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('fc00:') ||
        hostname.startsWith('fe80:') ||
        hostname.startsWith('fd')
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Basic profanity/spam check using regex patterns.
   */
  checkContentSafety(text: string): { isSafe: boolean; flags: string[] } {
    if (!text || typeof text !== 'string') {
      return { isSafe: true, flags: [] };
    }

    const flags: string[] = [];
    const lower = text.toLowerCase();

    // SQL injection patterns
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|into|table|database|schema)\b)/i,
      /(\b(or|and)\b\s+\d+\s*=\s*\d+)/i,
      /(\b(or|and)\b\s+['"]\w+['"]\s*=\s*['"]\w+['"])/i,
      /(--\s|\/\*|\*\/|;\s*$)/i,
      /(\bwaitfor\b|\bdelay\b|\bshutdown\b)/i,
    ];

    // XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b/gi,
      /<object\b/gi,
      /<embed\b/gi,
    ];

    // Spam patterns
    const spamPatterns = [
      /(https?:\/\/\S+).*\1.*\1/gi, // Repeated URLs
      /\b(viagra|cialis|casino|lottery|winner|prize|click here|act now)\b/gi,
      /[!?]{3,}/g, // Excessive punctuation
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(text)) {
        flags.push('SQL_INJECTION');
        break;
      }
    }

    for (const pattern of xssPatterns) {
      if (pattern.test(text)) {
        flags.push('XSS_ATTEMPT');
        break;
      }
    }

    for (const pattern of spamPatterns) {
      if (pattern.test(text)) {
        flags.push('SPAM');
        break;
      }
    }

    // Check for excessive URLs (more than 5)
    const urlMatches = lower.match(/https?:\/\/\S+/g);
    if (urlMatches && urlMatches.length > 5) {
      flags.push('EXCESSIVE_URLS');
    }

    return { isSafe: flags.length === 0, flags };
  }

  /**
   * Validate and normalize email address.
   */
  sanitizeEmail(email: string): { isValid: boolean; normalized: string } {
    if (!email || typeof email !== 'string') {
      return { isValid: false, normalized: '' };
    }

    const normalized = email.toLowerCase().trim();

    // RFC 5322 compliant regex (simplified)
    const emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

    const isValid = emailRegex.test(normalized);

    return { isValid, normalized };
  }

  /**
   * Log security events to console with timestamp.
   * Future: persist to database or SIEM.
   */
  logSecurityEvent(type: string, details: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const event = {
      timestamp,
      type,
      ...details,
    };

    this.logger.warn(`SECURITY_EVENT: ${JSON.stringify(event)}`);
  }
}
