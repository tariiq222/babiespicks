declare global { interface Window { gtag?: (...args: unknown[]) => void } }

/** Measurement never blocks the user action it describes. */
export function trackEvent(name: string, params: Record<string, string | number | undefined>) {
  try { window.gtag?.('event', name, { ...params, transport_type: 'beacon' }); } catch { /* best effort analytics */ }
}
