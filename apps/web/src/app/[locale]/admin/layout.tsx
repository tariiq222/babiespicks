import { redirect } from 'next/navigation';

import { hasValidAdminSession } from '@/shared/lib/admin-auth';

import { AdminShell } from './admin-shell';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(await hasValidAdminSession())) {
    redirect(`/${locale}/admin-login`);
  }

  return <AdminShell>{children}</AdminShell>;
}
