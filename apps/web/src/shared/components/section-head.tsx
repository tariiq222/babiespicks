import { Link } from '@/i18n/navigation';

export function SectionHead({
  children,
  action,
  actionHref,
  size = 'md',
}: {
  children: React.ReactNode;
  action?: string;
  actionHref?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <div className="flex items-end justify-between mb-5 gap-4">
      <h2 className={`text-charcoal font-semibold ${size === 'lg' ? 'text-[22px] md:text-[26px]' : 'text-[18px] md:text-[20px]'}`}>
        {children}
      </h2>
      {action && actionHref && (
        <Link href={actionHref} className="text-[13px] text-sage hover:text-sage-deep transition-colors font-medium shrink-0 flex items-center gap-1.5">
          <span>{action}</span>
          <i className="ti ti-arrow-left flip-x text-[12px]" aria-hidden="true"/>
        </Link>
      )}
    </div>
  );
}
