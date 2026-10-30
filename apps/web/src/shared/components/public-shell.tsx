'use client';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';

export function PublicShell({
  children,
  header,
  footer,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const skipLabel = useLocale() === 'ar' ? 'انتقلي إلى المحتوى' : 'Skip to content';
  const isAdmin = pathname.includes('/admin');

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-sage-deep focus:px-4 focus:py-2 focus:text-cream">{skipLabel}</a>
      {header}
      {children}
      {footer}
    </>
  );
}