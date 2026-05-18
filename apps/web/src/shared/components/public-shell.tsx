'use client';
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
  const isAdmin = pathname.includes('/admin');

  if (isAdmin) return <>{children}</>;

  return (
    <>
      {header}
      {children}
      {footer}
    </>
  );
}