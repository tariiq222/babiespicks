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

const VERDICT_BORDER: Record<VerdictVariant, string> = {
  good: '#5C8A5C',
  cond: '#C8924A',
  wait: '#8B7AAB',
  bad: '#B07474',
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
      className={`inline-flex items-center gap-1 px-2 py-[3px] text-[11px] rounded-md ${VERDICT_CLASS[variant]}`}
      style={{ borderRight: `3px solid ${VERDICT_BORDER[variant]}` }}
    >
      <span>{label ?? VERDICT_LABEL[variant]}</span>
      {score != null && <span>{score}</span>}
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
      className={`p-4 md:p-5 ${VERDICT_CLASS[variant]}`}
      style={{ borderRight: `4px solid ${VERDICT_BORDER[variant]}`, borderRadius: '0 8px 8px 0' }}
    >
      <div className="flex items-center gap-2">
        <i className="ti ti-circle-check text-[22px]" aria-hidden="true"></i>
        <span className="text-[16px]">{VERDICT_LABEL[variant]}</span>
        <span className="ms-auto flex items-baseline">
          <span className="text-[26px] leading-none">{score}</span>
          <span className="text-[12px] opacity-70 ms-[2px]">/100</span>
        </span>
      </div>
      {reason && <p className="mt-3 text-[13px] leading-[1.8] opacity-90">{reason}</p>}
    </div>
  );
}

export { VERDICT_LABEL, VERDICT_CLASS, VERDICT_BORDER };
export type { VerdictVariant };
