'use client';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useState, useEffect } from 'react';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface CircuitBreaker {
  name: string;
  isTripped: boolean;
  tripCount: number;
}

interface ApprovalsResponse {
  items?: unknown[];
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [breakers, setBreakers] = useState<CircuitBreaker[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;

    async function loadSidebarData() {
      try {
        const [cbRes, appRes] = await Promise.all([
          adminFetch(`${API_BASE}/admin/circuit-breakers`).catch(() => null),
          adminFetch(`${API_BASE}/admin/approvals`).catch(() => null),
        ]);

        if (!mounted) return;

        if (cbRes?.ok) {
          const cbData: CircuitBreaker[] = await cbRes.json().catch(() => []);
          setBreakers(Array.isArray(cbData) ? cbData : []);
        }

        if (appRes?.ok) {
          const appData: ApprovalsResponse | unknown[] = await appRes.json().catch(() => []);
          const items: unknown[] = Array.isArray(appData)
            ? appData
            : (appData as ApprovalsResponse).items ?? [];
          const pending = items.filter(
            (i) => (i as { status: string }).status === 'PENDING_APPROVAL',
          ).length;
          setPendingCount(pending);
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

  return (
    <div className="min-h-screen bg-cream flex" dir="rtl">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-l border-beige flex flex-col">
        {/* Logo + Status */}
        <div className="px-4 py-4 border-b border-beige">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sage flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-cream font-semibold text-sm">ب</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-charcoal leading-none">BabiesPicks</p>
                <p className="text-[10px] text-stone mt-0.5">لوحة التحكم</p>
              </div>
            </div>
            {/* Pipeline status dot */}
            <div className="flex items-center gap-1.5" title={anyTripped ? 'يوجد خلل في الحماية' : 'النظام سليم'}>
              <span className={`w-2 h-2 rounded-full ${statusDot}`} />
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <NavItem href="/admin" icon="ti-layout-dashboard" label="لوحة القيادة" pathname={pathname} exact />
          <NavItem
            href="/admin/approvals"
            icon="ti-clipboard-check"
            label="الموافقات"
            pathname={pathname}
            badge={pendingCount > 0 ? pendingCount : undefined}
          />
          <NavItem href="/admin/operations" icon="ti-player-play" label="التشغيل" pathname={pathname} />
          <NavItem href="/admin/settings" icon="ti-settings-2" label="الإعدادات" pathname={pathname} />

          <div className="h-px bg-beige my-2.5 mx-1" />

          <NavItem
            href="/"
            icon="ti-arrow-right"
            label="العودة للموقع"
            external
            pathname={pathname}
          />
        </nav>

        {/* User */}
        <div className="px-4 py-3.5 border-t border-beige">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sage text-xs font-semibold">ط</span>
            </div>
            <p className="text-sm font-medium text-charcoal">طارق</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
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
  badge,
  exact,
}: {
  href: string;
  icon: string;
  label: string;
  external?: boolean;
  pathname: string;
  badge?: number;
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
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
        isActive
          ? 'bg-sage/10 text-charcoal font-medium'
          : 'text-stone hover:bg-sage/5 hover:text-charcoal'
      }`}
    >
      <span className={`ti ${icon} text-base flex-shrink-0`} />
      <span className="flex-1 font-medium">{label}</span>
      {badge !== undefined && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 rounded-full text-[10px] font-semibold px-1.5 bg-sage text-cream tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
