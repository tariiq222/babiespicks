'use client';
import { usePathname } from 'next/navigation';
import { WhatsAppButton } from '@/shared/components/whatsapp-button';

export function PublicShell({
  children,
  header,
  footer,
  banner,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  banner: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.includes('/admin');

  if (isAdmin) return <>{children}</>;

  return (
    <>
      {header}
      {children}
      {banner}
      {footer}
      <WhatsAppButton />
    </>
  );
}