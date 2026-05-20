const FORBIDDEN_ANALYTICS_METADATA_KEYS = new Set([
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'ip',
  'ipaddress',
  'userid',
  'sessionid',
  'useragent',
  'referrer',
  'referer',
]);

const ALLOWED_ANALYTICS_METADATA_KEYS = new Set([
  'campaign',
  'channel',
  'component',
  'entityId',
  'entityType',
  'experiment',
  'placement',
  'position',
  'reason',
  'score',
  'source',
  'tags',
  'variant',
]);

function normalizeMetadataKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sanitizeAnalyticsMetadataValue(value: unknown): unknown {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return typeof value === 'string' ? value.slice(0, 512) : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeAnalyticsMetadataValue);
  }

  if (isPlainRecord(value)) {
    return sanitizeAnalyticsMetadata(value);
  }

  return undefined;
}

/**
 * Keeps analytics metadata intentionally low-risk: only allowlisted business
 * dimensions survive, and raw PII/session/network identifiers are always removed.
 */
export function sanitizeAnalyticsMetadata(
  metadata: unknown,
): Record<string, unknown> {
  if (!isPlainRecord(metadata)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = normalizeMetadataKey(key);

    if (
      FORBIDDEN_ANALYTICS_METADATA_KEYS.has(normalizedKey) ||
      !ALLOWED_ANALYTICS_METADATA_KEYS.has(key)
    ) {
      continue;
    }

    const sanitizedValue = sanitizeAnalyticsMetadataValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }

  return sanitized;
}
