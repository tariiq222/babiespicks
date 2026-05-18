'use client';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-cream flex" dir="rtl">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-white border-l border-beige flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-beige">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sage flex items-center justify-center">
              <span className="text-cream font-medium text-base">ب</span>
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal leading-none">BabiesPicks</p>
              <p className="text-[11px] text-sage mt-0.5">لوحة التحكم</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem href="/admin" icon="ti-dashboard" label="لوحة التحكم" pathname={pathname} />
          <NavItem href="/admin/pipeline" icon="ti-robot" label="خط الإنتاج" pathname={pathname} />
          <NavItem href="/admin/analytics" icon="ti-chart-dots-3" label="التحليلات" pathname={pathname} />
          <NavItem href="/admin/costs" icon="ti-chart-bar" label="التكاليف" pathname={pathname} />
          <NavItem href="/admin/affiliate" icon="ti-link" label="الأفلييت" pathname={pathname} />
          <div className="h-px bg-beige my-3" />
          <NavItem
            href="/"
            icon="ti-arrow-right"
            label="العودة للموقع"
            external
            pathname={pathname}
          />
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-beige">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center">
              <span className="text-sage text-sm font-medium">ط</span>
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
}: {
  href: string;
  icon: string;
  label: string;
  external?: boolean;
  pathname: string;
}) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
        isActive
          ? 'bg-sage/10 text-charcoal font-medium'
          : 'text-stone hover:bg-sage/5 hover:text-charcoal'
      }`}
    >
      <span className={`ti ${icon} text-base`} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}