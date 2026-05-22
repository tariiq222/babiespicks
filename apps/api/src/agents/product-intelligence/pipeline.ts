// Pipeline name constant
export const PRODUCT_INTELLIGENCE_PIPELINE = 'Product Intelligence Pipeline';

// Ordered pipeline stages
export const PIPELINE_STAGES = [
  'discovery',
  'sourcer',
  'matcher',
  'data_acquisition',
  'quality_guard',
  'reviews',
  'verdict',
  'seo_publisher',
] as const;

// Allowed BabiesPicks discovery categories
export const ALLOWED_CATEGORIES = [
  'formula',
  'diapers',
  'bottles',
  'carseats',
  'baby_care',
  'educational_toys',
] as const;

// Category keywords for classification (AR + EN)
export const CATEGORY_KEYWORDS: Record<string, { ar: string[]; en: string[] }> = {
  formula: {
    ar: ['حليب', 'تركيبة', 'لبن', 'حليب اطفال'],
    en: ['formula', 'baby formula', 'infant formula', 'milk formula'],
  },
  diapers: {
    ar: ['حفاضات', 'حفاظ', 'پampers', 'diaper'],
    en: ['diaper', 'diapers', 'nappy', 'pampers', 'huggies'],
  },
  bottles: {
    ar: ['زجاجة', 'رضاعة', 'bottle'],
    en: ['baby bottle', 'bottles', 'feeding bottle', 'nursing bottle', 'sippy cup'],
  },
  carseats: {
    ar: ['كرسي سيارة', 'مقعد سيارة', 'كرسي اطفال للسيارة', 'حزام سيارة'],
    en: [
      'car seat',
      'carseat',
      'child safety seat',
      'baby car seat',
      'infant car seat',
      'convertible car seat',
    ],
  },
  baby_care: {
    ar: ['عناية الاطفال', 'بشرة', 'غسول', 'كريم', 'مرطب', 'شامبو'],
    en: [
      'baby care',
      'baby lotion',
      'baby wash',
      'baby shampoo',
      'baby cream',
      'baby oil',
      'baby sunscreen',
      'baby thermometer',
    ],
  },
  educational_toys: {
    ar: [
      'لعبة تعليمية',
      'ألعاب تعليمية',
      'مكعبات',
      'بازل',
      'كتاب تعليمي',
      'لوح تعليمي',
      'مكعب تعليمي',
      'لعبة ذكاء',
    ],
    en: [
      'educational toy',
      'learning toy',
      'montessori',
      'building blocks',
      'stacking toy',
      'activity gym',
      'playmat',
      'puzzle',
      'shape sorter',
      'counting toy',
      'alphabet toy',
      'math toy',
      'science toy',
      'art and craft toy',
      'developmental toy',
      'interactive toy',
      'early learning toy',
      'baby puzzle',
      'wooden block set',
      'sorting toy',
    ],
  },
};

/**
 * Check if a candidate (by name, category, or snippet) matches
 * any of the six allowed BabiesPicks categories.
 */
export function isAllowedCandidate(candidate: {
  name?: string;
  category?: string;
  snippet?: string;
}): boolean {
  const text = [candidate.name, candidate.category, candidate.snippet]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return false;

  for (const cat of ALLOWED_CATEGORIES) {
    const kw = CATEGORY_KEYWORDS[cat];
    if (!kw) continue;
    const allKw = [...kw.ar, ...kw.en];
    if (allKw.some((keyword) => text.includes(keyword.toLowerCase()))) {
      return true;
    }
  }
  return false;
}
