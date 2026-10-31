import type { ReactNode } from 'react';
import { Link } from '../../i18n/navigation';
import type { TagTone } from './tags';

const HERO_TONE = { sage: 'bg-hero-start', deal: 'bg-tag-deal-bg', info: 'bg-tag-info-bg', verified: 'bg-tag-verified-bg' } as const;
const ICON_TONE: Record<TagTone, string> = {
  deal: 'bg-tag-deal-bg text-tag-deal-text',
  time: 'bg-tag-time-bg text-tag-time-text',
  urgent: 'bg-tag-urgent-bg text-tag-urgent-text',
  info: 'bg-tag-info-bg text-tag-info-text',
  verified: 'bg-tag-verified-bg text-tag-verified-text',
  rating: 'bg-tag-rating-bg text-tag-rating-text',
  muted: 'bg-tag-muted-bg text-tag-muted-text',
};

/** Shared page opening: every inner page shows where it sits, then its title. */
export function PageHero({ title, subtitle, icon, media, tone = 'sage', crumbs, crumbsLabel, children }: { title: string; subtitle?: string; icon?: string; media?: ReactNode; tone?: keyof typeof HERO_TONE; crumbs: { label: string; href?: string }[]; crumbsLabel: string; children?: ReactNode }) {
  return <section className={`px-5 py-8 md:px-8 md:py-12 lg:px-12 ${HERO_TONE[tone]}`}>
    <div className="mx-auto max-w-5xl">
      <nav aria-label={crumbsLabel} className="mb-4 text-xs text-charcoal"><ol className="flex flex-wrap items-center gap-1">{crumbs.map((crumb, index) => <li key={index} className="flex items-center gap-1">{index > 0 && <i aria-hidden="true" className="ti ti-chevron-right flip-x text-xs opacity-60" />}{crumb.href ? <Link href={crumb.href} className="underline-offset-2 hover:underline">{crumb.label}</Link> : <span aria-current="page" className="font-medium">{crumb.label}</span>}</li>)}</ol></nav>
      <div className="flex items-center gap-4">
        {media ?? (icon && <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-sage-deep"><i className={`ti ${icon} text-3xl`} /></span>)}
        <div className="min-w-0"><h1 className="text-2xl font-semibold leading-snug text-sage-deep text-balance md:text-4xl">{title}</h1>{subtitle && <p className="mt-1.5 text-sm leading-6 text-charcoal md:text-base">{subtitle}</p>}</div>
      </div>
      {children && <div className="mt-4 flex flex-wrap gap-1.5">{children}</div>}
    </div>
  </section>;
}

export function InfoCard({ title, icon, tone = 'info', children }: { title: string; icon: string; tone?: TagTone; children: ReactNode }) {
  return <section className="hairline rounded-2xl bg-white p-5 md:p-6">
    <h2 className="flex items-center gap-3 text-base font-semibold text-charcoal"><span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ICON_TONE[tone]}`}><i className={`ti ${icon} text-lg`} /></span>{title}</h2>
    <div className="mt-3 text-sm leading-7 text-stone [&_a]:text-sage-deep [&_a]:underline [&_strong]:text-charcoal [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-5">{children}</div>
  </section>;
}
