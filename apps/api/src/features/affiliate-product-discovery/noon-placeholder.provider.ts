import { Injectable } from '@nestjs/common';
import type { PlaceholderResult } from './types';

@Injectable()
export class NoonPlaceholderProvider {
  /**
   * Returns a clear placeholder/unsupported result.
   * No real affiliate URL is generated until a generated URL example
   * is available from the dashboard.
   */
  getPlaceholder(): PlaceholderResult {
    return {
      provider: 'noon',
      status: 'placeholder',
      reason:
        'Noon affiliate URL generation is not yet supported. A real generated URL example is required before implementation.',
      generatedUrl: null,
    };
  }

  /**
   * Explicit unsupported variant for direct product URLs that cannot be converted.
   */
  getUnsupported(url?: string): PlaceholderResult {
    return {
      provider: 'noon',
      status: 'unsupported',
      reason: `Cannot generate Noon affiliate link${url ? ` for ${url}` : ''}. Implementation pending dashboard URL example.`,
      generatedUrl: null,
    };
  }
}
