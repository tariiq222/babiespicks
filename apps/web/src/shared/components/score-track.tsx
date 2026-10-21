import React from 'react';
import { boundedEditorialScore, EDITORIAL_SCORE_MAX, editorialScorePercent } from '../lib/scores';
export function ScoreTrack({ value, className = 'h-full bg-sage rounded-full transition-all', label = 'Editorial score' }: { value: number; className?: string; label?: string }) {
  return <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={EDITORIAL_SCORE_MAX} aria-valuenow={boundedEditorialScore(value)} className={className} style={{ width: `${editorialScorePercent(value)}%` }} />;
}
