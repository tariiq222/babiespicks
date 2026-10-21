import { describe, expect, it } from 'vitest';
import { publicMediaType } from '../public-media';
describe('public asset names', () => {
  it('allows only a SHA-256 basename and an image extension', () => {
    expect(publicMediaType(`${'a'.repeat(64)}.png`)).toBe('image/png');
    expect(publicMediaType(`${'a'.repeat(64)}.jpg`)).toBe('image/jpeg');
    expect(publicMediaType(`${'a'.repeat(64)}.webp`)).toBe('image/webp');
    for (const name of ['../secret.png', 'a.svg', `${'a'.repeat(64)}.html`, `${'a'.repeat(64)}.png/../x`, 'a.png']) expect(publicMediaType(name)).toBeNull();
  });
});
