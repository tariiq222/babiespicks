export type TagTone = 'deal' | 'time' | 'urgent' | 'info' | 'verified' | 'rating' | 'muted';
const TONE: Record<TagTone, string> = {
  deal: 'bg-tag-deal-bg text-tag-deal-text',
  time: 'bg-tag-time-bg text-tag-time-text',
  urgent: 'bg-tag-urgent-bg text-tag-urgent-text',
  info: 'bg-tag-info-bg text-tag-info-text',
  verified: 'bg-tag-verified-bg text-tag-verified-text',
  rating: 'bg-tag-rating-bg text-tag-rating-text',
  muted: 'bg-tag-muted-bg text-tag-muted-text',
};
/** Tone carries the meaning, so the icon and text must still make sense without color. */
export function Tag({ tone, icon, children }: { tone: TagTone; icon?: string; children: React.ReactNode }) {
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium leading-4 ${TONE[tone]}`}>{icon && <i aria-hidden="true" className={`ti ${icon} text-sm leading-none`} />}<span className="min-w-0 truncate">{children}</span></span>;
}

export function CategoryTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-lavender text-lavender-text text-[11px] px-3 py-[3px] rounded-full">
      {children}
    </span>
  );
}

export function DiscountTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-terracotta text-cream text-[11px] px-2 py-[2px] rounded-lg font-medium">
      {children}
    </span>
  );
}
