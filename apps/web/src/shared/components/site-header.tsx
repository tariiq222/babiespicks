'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur hairline-b">
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 h-16 flex items-center gap-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-sage text-cream flex items-center justify-center text-[16px]">ب</div>
          <div className="leading-tight text-right">
            <div className="text-[14px] text-charcoal">بيبيز بيكس</div>
            <div className="text-[11px] text-stone tracking-wider font-inter">BABIESPICKS</div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-5 me-1">
          <Link href="/" className="text-[13px] text-charcoal transition-colors">الرئيسية</Link>
          <Link href="/categories" className="text-[13px] text-stone hover:text-charcoal transition-colors">الفئات</Link>
          <Link href="/best" className="text-[13px] text-stone hover:text-charcoal transition-colors">أفضل القوائم</Link>
          <Link href="/about" className="text-[13px] text-stone hover:text-charcoal transition-colors">كيف نراجع</Link>
        </nav>

        {/* End cluster */}
        <div className="ms-auto flex items-center gap-2">
          {/* Search (lg+) */}
          <div className="hidden lg:flex items-center gap-2 bg-linen hairline rounded-full px-4 py-[7px] w-[200px]">
            <i className="ti ti-search text-stone text-[15px]"></i>
            <input className="bg-transparent flex-1 text-[12px] outline-none text-right" placeholder="ابحثي عن منتج..." aria-label="ابحثي عن منتج" />
          </div>

          {/* Search icon (mobile) */}
          <button className="lg:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-linen text-stone" aria-label="بحث">
            <i className="ti ti-search text-[18px]"></i>
          </button>

          {/* Language toggle */}
          <Link
            href="/en"
            className="w-10 h-10 grid place-items-center rounded-full hover:bg-linen text-stone relative"
            aria-label="English"
          >
            <i className="ti ti-world text-[18px]"></i>
            <span className="absolute bottom-[3px] left-[3px] text-[8px] text-sage leading-none tracking-wider font-inter">
              EN
            </span>
          </Link>

          {/* Newsletter CTA */}
          <Link
            href="#newsletter"
            className="hidden sm:inline-flex items-center gap-2 bg-sage text-cream rounded-full px-4 py-[8px] text-[12.5px] hover:bg-sage-hover relative"
          >
            <span className="absolute top-[6px] right-[6px] w-2 h-2 rounded-full bg-terracotta ring-2 ring-cream"></span>
            <i className="ti ti-sparkles text-[14px]"></i>
            <span>عروض حصرية</span>
          </Link>

          {/* Mobile menu */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="md:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-linen text-stone"
            aria-label="القائمة"
          >
            <i className={`ti text-[18px] ${open ? 'ti-x' : 'ti-menu-2'}`}></i>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden hairline-t bg-cream px-5 py-3 flex flex-col gap-3">
          <Link href="/" onClick={() => setOpen(false)} className="text-[13px] text-charcoal">الرئيسية</Link>
          <Link href="/categories" onClick={() => setOpen(false)} className="text-[13px] text-stone">الفئات</Link>
          <Link href="/best" onClick={() => setOpen(false)} className="text-[13px] text-stone">أفضل القوائم</Link>
          <Link href="/about" onClick={() => setOpen(false)} className="text-[13px] text-stone">كيف نراجع</Link>
          <Link
            href="#newsletter"
            onClick={() => setOpen(false)}
            className="mt-1 bg-sage text-cream rounded-lg px-4 py-2 text-[13px] flex items-center justify-center gap-2"
          >
            <i className="ti ti-sparkles text-[14px]"></i>
            <span>عروض حصرية · اشتركي</span>
          </Link>
        </div>
      )}
    </header>
  );
}
