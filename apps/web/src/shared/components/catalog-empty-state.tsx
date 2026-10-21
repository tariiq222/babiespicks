import React from 'react';
export function CatalogEmptyState({ locale }: { locale: string }) {
  return <div role="status" className="bg-linen rounded-xl p-6 text-stone leading-8">
    <h2 className="text-lg text-charcoal">{locale === 'ar' ? 'لا توجد منتجات منشورة حاليًا' : 'No published products yet'}</h2>
    <p>{locale === 'ar' ? 'يمكنك تصفح التصنيفات وقراءة منهجية التقييم. ستظهر المنتجات هنا بعد إضافتها ونشرها.' : 'You can browse the categories and read our editorial approach. Products will appear here after they are added and published.'}</p>
  </div>;
}
