export const EDITORIAL_SCORE_MAX = 10;
export function boundedEditorialScore(value: number): number {
  return Number.isFinite(value) ? Math.min(EDITORIAL_SCORE_MAX, Math.max(0, value)) : 0;
}
export function editorialScorePercent(value: number): number {
  return Math.round((boundedEditorialScore(value) / EDITORIAL_SCORE_MAX) * 10_000) / 100;
}
export function editorialRating(value: number) {
  return { '@type': 'Rating' as const, ratingValue: value, bestRating: EDITORIAL_SCORE_MAX, worstRating: 0 };
}
