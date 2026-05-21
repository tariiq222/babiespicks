'use client';

import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface CircuitBreaker {
  name: string;
  isTripped: boolean;
  tripCount: number;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('admin');
  const brandT = useTranslations('brand');
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const [isPending, startTransition] = useTransition();

  const [breakers, setBreakers] = useState<CircuitBreaker[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadSidebarData() {
      try {
        const cbRes = await adminFetch(`${API_BASE}/admin/circuit-breakers`).catch(() => null);

        if (!mounted) return;

        if (cbRes?.ok) {
          const cbData: CircuitBreaker[] = await cbRes.json().catch(() => []);
          setBreakers(Array.isArray(cbData) ? cbData : []);
        }
      } catch {
        // sidebar data is non-critical; silently skip
      }
    }

    loadSidebarData();
    const interval = setInterval(loadSidebarData, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const anyTripped = breakers.some((b) => b.isTripped);
  const statusDot = anyTripped
    ? 'bg-red-400'
    : breakers.length > 0
    ? 'bg-emerald-400'
    : 'bg-stone/30';
  const sidebarBorderClass = isRtl ? 'border-l' : 'border-r';

  function handleLogout() {
    startTransition(async () => {
      await fetch('/api/admin-auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      }).catch(() => null);
      router.replace(`/${locale}/admin-login`);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-cream flex" dir={dir}>
      <aside className={`w-56 flex-shrink-0 bg-white ${sidebarBorderClass} border-beige flex flex-col`}>
        <div className="px-4 py-4 border-b border-beige">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sage flex items-center justify-center flex-shrink-0 shadow-sm">
                <span aria-hidden="true" className="text-cream font-semibold text-sm">{t('brandInitial')}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-charcoal leading-none">{brandT('name')}</p>
                <p className="text-[10px] text-stone mt-0.5">{t('dashboardSubtitle')}</p>
              </div>
            </div>
            <div
              className="flex items-center gap-1.5"
              title={anyTripped ? t('statusIssue') : t('statusHealthy')}
              role="status"
              aria-label={anyTripped ? t('statusIssue') : t('statusHealthy')}
            >
              <span aria-hidden="true" className={`w-2 h-2 rounded-full ${statusDot}`} />
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label={t('adminPrimaryNavigation')}>
          <NavItem href="/admin/affiliate-os" icon="ti-chart-arcs" label={t('affiliateOs')} pathname={pathname} />

          <div className="h-px bg-beige my-2.5 mx-1" />

          <NavItem
            href="/"
            icon={isRtl ? 'ti-arrow-right' : 'ti-arrow-left'}
            label={t('backToSite')}
            external
            pathname={pathname}
          />
        </nav>

        <div className="px-4 py-3.5 border-t border-beige space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
              <span aria-hidden="true" className="text-sage text-xs font-semibold">{t('userInitial')}</span>
            </div>
            <p className="text-sm font-medium text-charcoal">{t('userName')}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="w-full rounded-lg border border-beige px-3 py-2 text-sm font-medium text-stone transition-colors hover:bg-sage/5 hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('logout')}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  external,
  pathname,
  exact,
}: {
  href: string;
  icon: string;
  label: string;
  external?: boolean;
  pathname: string;
  exact?: boolean;
}) {
  const isActive = exact
    ? pathname === href || pathname.endsWith(href)
    : pathname.includes(href) && href !== '/';

  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
        isActive
          ? 'bg-sage/10 text-charcoal font-medium'
          : 'text-stone hover:bg-sage/5 hover:text-charcoal'
      }`}
    >
      <span aria-hidden="true" className={`ti ${icon} text-base flex-shrink-0`} />
      <span className="flex-1 font-medium">{label}</span>
    </Link>
  );
}
