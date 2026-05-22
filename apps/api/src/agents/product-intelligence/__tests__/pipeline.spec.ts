import { describe, expect, it } from 'vitest';
import {
  isAllowedCandidate,
  ALLOWED_CATEGORIES,
  PRODUCT_INTELLIGENCE_PIPELINE,
  PIPELINE_STAGES,
} from '../pipeline';

describe('Product Intelligence Pipeline constants', () => {
  it('exports pipeline name', () => {
    expect(PRODUCT_INTELLIGENCE_PIPELINE).toBe('Product Intelligence Pipeline');
  });

  it('exports 8 pipeline stages in order', () => {
    expect(PIPELINE_STAGES).toEqual([
      'discovery',
      'sourcer',
      'matcher',
      'data_acquisition',
      'quality_guard',
      'reviews',
      'verdict',
      'seo_publisher',
    ]);
  });

  it('exports 6 allowed categories', () => {
    expect(ALLOWED_CATEGORIES).toHaveLength(6);
    expect(ALLOWED_CATEGORIES).toContain('formula');
    expect(ALLOWED_CATEGORIES).toContain('diapers');
    expect(ALLOWED_CATEGORIES).toContain('bottles');
    expect(ALLOWED_CATEGORIES).toContain('carseats');
    expect(ALLOWED_CATEGORIES).toContain('baby_care');
    expect(ALLOWED_CATEGORIES).toContain('educational_toys');
  });
});

describe('isAllowedCandidate', () => {
  it('returns true for formula keywords', () => {
    expect(isAllowedCandidate({ name: 'Similac Stage 1 Formula' })).toBe(true);
    expect(isAllowedCandidate({ name: 'حليب اطفال' })).toBe(true);
    expect(isAllowedCandidate({ name: 'Infant Formula Milk' })).toBe(true);
  });

  it('returns true for diaper keywords', () => {
    expect(isAllowedCandidate({ name: 'Pampers Baby Dry' })).toBe(true);
    expect(isAllowedCandidate({ name: 'حفاضات' })).toBe(true);
    expect(isAllowedCandidate({ name: 'Huggies Little Movers' })).toBe(true);
  });

  it('returns true for bottle keywords', () => {
    expect(isAllowedCandidate({ name: 'Philips Avent Baby Bottle' })).toBe(true);
    expect(isAllowedCandidate({ name: 'زجاجة رضاعة' })).toBe(true);
  });

  it('returns true for car seat keywords', () => {
    expect(isAllowedCandidate({ name: 'Graco car seat infant' })).toBe(true);
    expect(isAllowedCandidate({ category: 'car seat' })).toBe(true);
    expect(isAllowedCandidate({ name: 'كرسي سيارة اطفال' })).toBe(true);
  });

  it('returns true for baby care keywords', () => {
    expect(isAllowedCandidate({ name: 'Baby Shampoo Gentle' })).toBe(true);
    expect(isAllowedCandidate({ name: 'غسولbaby' })).toBe(true);
    expect(isAllowedCandidate({ category: 'baby lotion' })).toBe(true);
  });

  it('returns true for educational toy keywords', () => {
    expect(isAllowedCandidate({ name: 'Wooden Building Blocks Set' })).toBe(true);
    expect(isAllowedCandidate({ name: 'Montessori Activity Toy' })).toBe(true);
    expect(isAllowedCandidate({ name: 'Baby Puzzle Blocks' })).toBe(true);
    expect(isAllowedCandidate({ name: 'Shape Sorter Cube' })).toBe(true);
    expect(isAllowedCandidate({ name: 'لعبة تعليمية للاطفال' })).toBe(true);
    expect(isAllowedCandidate({ name: 'ألعاب تعليمية' })).toBe(true);
    expect(isAllowedCandidate({ name: 'مكعبات خشبية' })).toBe(true);
    expect(isAllowedCandidate({ name: 'بازل للأطفال' })).toBe(true);
    expect(isAllowedCandidate({ name: 'كتاب تعليمي للأطفال' })).toBe(true);
    expect(isAllowedCandidate({ name: 'Baby Activity Gym' })).toBe(true);
  });

  it('returns false for generic toy / doll keywords', () => {
    // Generic English toy terms
    expect(isAllowedCandidate({ name: 'Toy' })).toBe(false);
    expect(isAllowedCandidate({ name: 'Baby Toy' })).toBe(false);
    expect(isAllowedCandidate({ name: 'Soft Toy' })).toBe(false);
    expect(isAllowedCandidate({ name: 'Plush Toy' })).toBe(false);
    expect(isAllowedCandidate({ name: 'Remote Control Toy Car' })).toBe(false);
    // Generic Arabic toy/doll terms
    expect(isAllowedCandidate({ name: 'لعبة' })).toBe(false);
    expect(isAllowedCandidate({ name: 'دمية' })).toBe(false);
    expect(isAllowedCandidate({ name: 'لعبة اطفال' })).toBe(false);
    expect(isAllowedCandidate({ name: 'دمية اطفال' })).toBe(false);
  });

  it('returns false for strollers (not in allowed list)', () => {
    expect(isAllowedCandidate({ name: 'Baby Stroller' })).toBe(false);
    expect(isAllowedCandidate({ name: 'عربية اطفال' })).toBe(false);
  });

  it('returns false for cribs (not in allowed list)', () => {
    expect(isAllowedCandidate({ name: 'Wooden Crib' })).toBe(false);
    expect(isAllowedCandidate({ name: 'سرير اطفال' })).toBe(false);
  });

  it('returns false for monitors (not in allowed list)', () => {
    expect(isAllowedCandidate({ name: 'Baby Monitor' })).toBe(false);
    expect(isAllowedCandidate({ name: 'مراقبة الطفل' })).toBe(false);
  });

  it('returns false for baby carriers (not in allowed list)', () => {
    expect(isAllowedCandidate({ name: 'Baby Carrier Wrap' })).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isAllowedCandidate({})).toBe(false);
    expect(isAllowedCandidate({ name: '' })).toBe(false);
  });

  it('matches snippet content as fallback', () => {
    expect(isAllowedCandidate({ snippet: 'حليب اطفال تركيبة' })).toBe(true);
    expect(isAllowedCandidate({ snippet: 'stroller for baby' })).toBe(false);
  });
});
