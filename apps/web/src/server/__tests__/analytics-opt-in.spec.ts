import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('next/script', () => ({ default: ({ strategy, ...props }: React.ScriptHTMLAttributes<HTMLScriptElement> & { strategy?: string }) => React.createElement('script', props) }));
import { AnalyticsScripts } from '../../shared/components/analytics-scripts';
describe('analytics is explicitly configured', () => {
  it('emits nothing by default or for an invalid identifier', () => {
    for (const measurementId of [undefined, '', 'G-123<script>', 'not-a-measurement-id']) expect(renderToStaticMarkup(React.createElement(AnalyticsScripts, { measurementId }))).toBe('');
  });
  it('uses only a validated configured measurement id', () => {
    const html = renderToStaticMarkup(React.createElement(AnalyticsScripts, { measurementId: 'G-ABC123XYZ1' }));
    expect(html).toContain('gtag/js?id=G-ABC123XYZ1');
    expect(html).toContain("gtag('config','G-ABC123XYZ1')");
  });
});
