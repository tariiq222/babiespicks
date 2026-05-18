'use client';

// Get or assign a variant for an experiment
export function getVariant(experimentId: string, variants: string[] = ['control', 'variant']): string {
  if (typeof window === 'undefined') return variants[0];

  const key = `ab_${experimentId}`;
  const stored = localStorage.getItem(key);
  if (stored && variants.includes(stored)) return stored;

  // Random assignment
  const variant = variants[Math.floor(Math.random() * variants.length)];
  localStorage.setItem(key, variant);
  return variant;
}

// Track conversion event via GA4
export function trackConversion(experimentId: string, variant: string, action: string) {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'ab_conversion', {
      experiment_id: experimentId,
      variant,
      action,
    });
  }
}

// Track impression
export function trackImpression(experimentId: string, variant: string) {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'ab_impression', {
      experiment_id: experimentId,
      variant,
    });
  }
}
