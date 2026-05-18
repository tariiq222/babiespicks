const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';
const LOCALES = ['ar', 'en'] as const;
const DEFAULT_LOCALE = 'ar';
// x-default targets users whose language doesn't match any locale (e.g. US/global audience)
const X_DEFAULT_LOCALE = 'en';

/**
 * Generate alternates (hreflang) for a given path.
 * @param path - The path WITHOUT locale prefix, e.g. '/products/some-slug' or ''
 * @param locale - Current locale for self-referencing canonical. Defaults to DEFAULT_LOCALE.
 */
export function getAlternates(path: string = '', locale: string = DEFAULT_LOCALE) {
  return {
    canonical: `${BASE_URL}/${locale}${path}`,
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, `${BASE_URL}/${l}${path}`])),
      'x-default': `${BASE_URL}/${X_DEFAULT_LOCALE}${path}`,
    },
  };
}