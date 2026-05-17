'use client';

import { useEffect } from 'react';
import { initGlitchTip } from '@/shared/lib/glitchtip';

export function GlitchTipInit() {
  useEffect(() => {
    initGlitchTip();
  }, []);
  return null;
}
