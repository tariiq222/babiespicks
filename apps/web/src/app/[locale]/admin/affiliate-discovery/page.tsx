'use client';
import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { adminFetch } from '@/shared/lib/admin-fetch';

type ToastType = 'success' | 'error';
type Source = 'amazon' | 'noon' | 'manual';

interface AffiliateDiscoveryResult {
  query: string;
  source: string;
  searchResults: unknown[];
  selectedAsin?: string;
  selectedUrl?: string;
  affiliateLink?: {
    asin: string;
    tag: string;
    url: string;
  };
  errors: string[];
  skipped: boolean;
  skipReason?: string;
  provider: string;
  searchMetadata?: {
    engine: string;
    queryTime: number;
    resultCount: number;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AffiliateDiscoveryPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('admin.affiliateDiscovery');
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source>('amazon');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AffiliateDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(null);

  const showToast = useCallback((type: ToastType, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleRun = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await adminFetch(`${API_BASE}/admin/affiliate-discovery/trigger`, {
        method: 'POST',
        body: JSON.stringify({ query: query.trim(), source }),
      });

      if (!res.ok) {
        throw new Error(t('errors.searchFailed'));
      }

      const result = await res.json();
      setResults(result);

      if (result.errors && result.errors.length > 0) {
        showToast('error', result.errors[0]);
      } else if (result.affiliateLink) {
        showToast('success', t('results.title'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.searchFailed'));
      showToast('error', t('errors.searchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', t('results.copy'));
  };

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <h1 className="text-lg font-semibold text-charcoal">
          {t('title')}
        </h1>
      </header>

      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-sage text-cream' : 'bg-terracotta text-cream'
          }`}
          role="status"
        >
          <span
            aria-hidden="true"
            className={`ti ${toast.type === 'success' ? 'ti-check' : 'ti-alert-circle'} text-base`}
          />
          {toast.msg}
        </div>
      )}

      <div className="flex-1 px-6 py-6 space-y-6 overflow-auto">
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-sage/20 p-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 rounded-xl border border-sage/25 bg-linen/30 px-4 py-2.5 text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/40"
            />

            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="rounded-xl border border-sage/25 bg-linen/30 px-4 py-2.5 text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/40"
            >
              <option value="amazon">{t('source.amazon')}</option>
              <option value="noon">{t('source.noon')}</option>
              <option value="manual">{t('source.manual')}</option>
            </select>

            <button
              onClick={handleRun}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 rounded-xl bg-sage px-6 py-2.5 text-cream font-medium hover:bg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="ti ti-loader animate-spin text-base" />
              ) : (
                <span className="ti ti-player-play text-base" />
              )}
              {t('run')}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <span className="ti ti-loader animate-spin text-3xl text-sage" />
          </div>
        )}

        {error && (
          <div className="bg-terracotta/10 border border-terracotta/25 rounded-2xl p-4 text-terracotta">
            <span className="ti ti-alert-circle text-lg ml-2" />
            {error}
          </div>
        )}

        {results && results.affiliateLink && (
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-sage/20 p-6">
            <h2 className="text-lg font-semibold text-charcoal mb-4">{t('results.title')}</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-linen/30 rounded-xl">
                <div>
                  <p className="text-sm text-stone">{t('results.asin')}</p>
                  <p className="font-mono text-charcoal">{results.affiliateLink.asin}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(results.affiliateLink!.asin)}
                    className="p-2 rounded-lg hover:bg-sage/10 transition-colors"
                    title={t('results.copy')}
                  >
                    <span className="ti ti-copy text-lg text-charcoal" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-linen/30 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone">{t('results.link')}</p>
                  <p className="font-mono text-sm text-charcoal truncate">{results.affiliateLink.url}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => copyToClipboard(results.affiliateLink!.url)}
                    className="p-2 rounded-lg hover:bg-sage/10 transition-colors"
                    title={t('results.copy')}
                  >
                    <span className="ti ti-copy text-lg text-charcoal" />
                  </button>
                  <a
                    href={results.affiliateLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-sage/10 transition-colors"
                    title={t('results.open')}
                  >
                    <span className="ti ti-external-link text-lg text-charcoal" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
