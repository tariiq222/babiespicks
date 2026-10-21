import React from 'react';
import { getLocalizedName, getProductTranslation, type Product } from '../lib/api';
export function ProductName({ product, locale }: { product: Product; locale: string }) {
  const translation = getProductTranslation(product, locale);
  return <span lang={translation?.locale} dir={translation ? (translation.locale === 'ar' ? 'rtl' : 'ltr') : 'auto'}>{getLocalizedName(product, locale)}</span>;
}
