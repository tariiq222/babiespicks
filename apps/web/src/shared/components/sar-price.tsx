export function SarPrice({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span dir="ltr" className={`sar ${className}`} style={{ unicodeBidi: 'isolate', whiteSpace: 'nowrap' }}>
      <span className="riyal-glyph">&#x20C1;</span>&nbsp;{amount}
    </span>
  );
}
