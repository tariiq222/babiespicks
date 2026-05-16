import Link from 'next/link';

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
    <div className="flex items-end justify-between mb-5">
      <h2 className={`text-charcoal ${size === 'lg' ? 'text-[22px] md:text-[26px]' : 'text-[18px] md:text-[20px]'}`}>
        {children}
      </h2>
      {action && actionHref && (
        <Link href={actionHref} className="text-[13px] text-sage hover:underline">
          {action}
        </Link>
      )}
    </div>
  );
}
