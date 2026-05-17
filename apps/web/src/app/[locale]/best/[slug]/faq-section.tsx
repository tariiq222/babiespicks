'use client';

import { useState } from 'react';

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = q.slice(0, 20).replace(/\s/g, '-');
  return (
    <div className="hairline-b last:border-0" role="region" aria-labelledby={`faq-${id}`}>
      <button
        id={`faq-${id}`}
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center gap-3 text-right hover:bg-linen/60"
        aria-expanded={open}
        aria-controls={`faq-answer-${id}`}
      >
        <span className="flex-1 text-[14px] text-charcoal">{q}</span>
        <i className={`ti text-sage text-[18px] transition-transform ${open ? 'ti-minus' : 'ti-plus'}`} aria-hidden="true"></i>
      </button>
      {open && <div id={`faq-answer-${id}`} role="region" className="px-5 pb-5 text-[13px] text-stone leading-[1.9]">{a}</div>}
    </div>
  );
}

export function FaqSection({ faqs }: { faqs: { q: string; a: string }[] }) {
  if (faqs.length === 0) return null;
  return (
    <div className="hairline rounded-xl overflow-hidden bg-cream">
      {faqs.map((f, i) => (
        <FaqItem key={i} q={f.q} a={f.a} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
