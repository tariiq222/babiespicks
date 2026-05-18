type VerdictVariant = 'good' | 'cond' | 'wait' | 'bad';

const VERDICT_LABEL: Record<VerdictVariant, string> = {
  good: 'يستاهل',
  cond: 'يستاهل بشرط',
  wait: 'انتظر',
  bad: 'ما يستاهل',
};

const VERDICT_CLASS: Record<VerdictVariant, string> = {
  good: 'bg-verdict-good-bg text-verdict-good-text',
  cond: 'bg-verdict-cond-bg text-verdict-cond-text',
  wait: 'bg-verdict-wait-bg text-verdict-wait-text',
  bad: 'bg-verdict-bad-bg text-verdict-bad-text',
};

const VERDICT_ICON: Record<VerdictVariant, string> = {
  good: 'ti-check',
  cond: 'ti-alert-circle',
  wait: 'ti-clock',
  bad: 'ti-x',
};

export function VerdictPill({
  variant = 'good',
  score,
  label,
}: {
  variant?: VerdictVariant;
  score?: number;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[4px] text-[11px] rounded-md font-medium ${VERDICT_CLASS[variant]}`}
    >
      <i className={`ti ${VERDICT_ICON[variant]} text-[12px]`} aria-hidden="true"></i>
      <span>{label ?? VERDICT_LABEL[variant]}</span>
      {score != null && (
        <span className="font-semibold">{score}</span>
      )}
    </span>
  );
}

export function VerdictCard({
  variant = 'good',
  score,
  reason,
}: {
  variant?: VerdictVariant;
  score: number;
  reason?: string;
}) {
  return (
    <div
      className={`rounded-xl overflow-hidden p-4 md:p-5 ${VERDICT_CLASS[variant]}`}
    >
      {/* Decorative top bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${
        variant === 'good' ? 'bg-verdict-good-border' :
        variant === 'cond' ? 'bg-verdict-cond-border' :
        variant === 'wait' ? 'bg-verdict-wait-border' :
        'bg-verdict-bad-border'
      }`} aria-hidden="true"/>

      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl grid place-items-center ${
          variant === 'good' ? 'bg-verdict-good-border/20' :
          variant === 'cond' ? 'bg-verdict-cond-border/20' :
          variant === 'wait' ? 'bg-verdict-wait-border/20' :
          'bg-verdict-bad-border/20'
        }`}>
          <i className={`ti ${VERDICT_ICON[variant]} text-[24px]`} aria-hidden="true"></i>
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold">{VERDICT_LABEL[variant]}</div>
          {reason && <p className="text-[12px] mt-1 opacity-80 leading-relaxed line-clamp-2">{reason}</p>}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[32px] leading-none font-bold">{score}</span>
          <span className="text-[11px] opacity-60">/100</span>
        </div>
      </div>
    </div>
  );
}

export { VERDICT_LABEL, VERDICT_CLASS };
export type { VerdictVariant };
