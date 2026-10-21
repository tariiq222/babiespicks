import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerdictCard } from '../../shared/components/verdict-pill';
import { JsonLd } from '../../shared/components/json-ld';
vi.stubGlobal('React', React);

describe('editorial scores use the stored 0–10 scale', () => {
  it('labels a displayed 8.2 score out of 10', () => {
    const html = renderToStaticMarkup(VerdictCard({ variant: 'good', score: 8.2 }));
    expect(html).toContain('>8.2</span>');
    expect(html).toContain('>/10</span>');
    expect(html).not.toContain('/100');
  });
  it('renders 8.2 as an 82 percent bar and bounds malformed values', async () => {
    const { ScoreTrack } = await import('../../shared/components/score-track');
    for (const [score, width] of [[8.2, 82], [15, 100], [-2, 0], [Number.NaN, 0]]) {
      const html = renderToStaticMarkup(ScoreTrack({ value: score }));
      expect(html).toContain(`width:${width}%`);
      expect(html).toContain('aria-valuemax="10"');
    }
  });
  it('declares the same maximum in structured data', async () => {
    const { editorialRating } = await import('../../shared/lib/scores');
    const html = renderToStaticMarkup(JsonLd({ data: { '@type': 'Product', review: { '@type': 'Review', reviewRating: editorialRating(8.2) } } }));
    expect(editorialRating(8.2)['@type']).toBe('Rating');
    expect(html).toContain('"ratingValue":8.2');
    expect(html).toContain('"bestRating":10');
    expect(html).not.toContain('"bestRating":100');
  });
});
