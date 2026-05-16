import * as Sentry from '@sentry/browser';

export function initGlitchTip() {
  const dsn = process.env.NEXT_PUBLIC_GLITCHTIP_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.01,
      autoSessionTracking: false,
    });
  }
}
