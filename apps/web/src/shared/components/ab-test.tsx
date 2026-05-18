'use client';
import { useEffect, useState } from 'react';
import { getVariant, trackImpression } from '@/shared/lib/ab-testing';

interface ABTestProps {
  experimentId: string;
  variants: Record<string, React.ReactNode>;
}

export function ABTest({ experimentId, variants }: ABTestProps) {
  const [variant, setVariant] = useState<string | null>(() =>
    getVariant(experimentId, Object.keys(variants)),
  );

  useEffect(() => {
    trackImpression(experimentId, variant ?? '');
  }, [experimentId, variant]);

  if (!variant) return null;
  return <>{variants[variant]}</>;
}
