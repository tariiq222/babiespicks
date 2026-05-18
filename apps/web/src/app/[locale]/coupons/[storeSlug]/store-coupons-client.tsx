'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.babiespicks.com';

interface Coupon {
  id: string;
  code: string;
  discountPercent: number | null;
  discountAmount: number | null;
  description: string | null;
  status: string;
  validUntil: string | null;
  verified: boolean;
  store: { id: string; name: string; slug: string; logoUrl: string | null };
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations('coupons');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
        copied
          ? 'bg-sage text-cream'
          : 'bg-linen hairline text-charcoal hover:bg-sage hover:text-cream'
      }`}
    >
      {copied ? (
        <>
          <i className="ti ti-check text-[14px]"></i>
          {t('copied')}
        </>
      ) : (
        <>
          <i className="ti ti-copy text-[14px]"></i>
          {t('copyCode')}
        </>
      )}
    </button>
  );
}

function CouponCard({ coupon, locale }: { coupon: Coupon; locale: string }) {
  const t = useTranslations('coupons');

  const discountLabel =
    coupon.discountPercent
      ? `${coupon.discountPercent}%`
      : coupon.discountAmount
      ? `${Number(coupon.discountAmount).toFixed(0)} ر.س`
      : '';

  const expiryLabel = coupon.validUntil
    ? new Date(coupon.validUntil).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="bg-cream hairline rounded-xl p-5 flex flex-col gap-3">
      {discountLabel && (
        <div className="text-[22px] font-bold text-terracotta">{discountLabel}</div>
      )}
      {coupon.description && (
        <p className="text-[13px] text-stone leading-[1.7]">{coupon.description}</p>
      )}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t hairline border-beige">
        <code className="text-[13px] font-mono bg-linen px-2 py-1 rounded text-charcoal">{coupon.code}</code>
        <CopyButton code={coupon.code} />
      </div>
      {expiryLabel && (
        <p className="text-[11px] text-stone">
          <i className="ti ti-clock text-[12px] me-1"></i>
          {t('expires')} {expiryLabel}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations('coupons');
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-linen mx-auto grid place-items-center mb-4">
        <i className="ti ti-discount-outline text-stone text-[28px]"></i>
      </div>
      <p className="text-[16px] text-charcoal mb-2">{t('emptyTitle')}</p>
      <p className="text-[13px] text-stone">{t('emptyDesc')}</p>
    </div>
  );
}

interface StoreCouponsClientProps {
  storeSlug: string;
  locale: string;
}

export function StoreCouponsClient({ storeSlug, locale }: StoreCouponsClientProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoupons = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/coupons?storeSlug=${storeSlug}&status=ACTIVE`);
        if (res.ok) {
          const data = await res.json();
          setCoupons(data.data || []);
        } else {
          setCoupons([]);
        }
      } catch {
        setCoupons([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCoupons();
  }, [storeSlug]);

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-cream hairline rounded-xl p-5 animate-pulse">
            <div className="h-8 w-16 bg-linen rounded mb-3" />
            <div className="h-4 w-full bg-linen rounded mb-2" />
            <div className="h-4 w-2/3 bg-linen rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (coupons.length === 0) return <EmptyState />;

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {coupons.map((coupon) => (
        <CouponCard key={coupon.id} coupon={coupon} locale={locale} />
      ))}
    </div>
  );
}