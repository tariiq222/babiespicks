'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface DifyRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  total_candidates: number;
  succeeded: number;
  failed: number;
  status: 'running' | 'completed' | 'failed';
}

interface DifyProduct {
  id: string;
  name: string;
  slug: string;
  source: string | null;
  trend_score: number | null;
  created_at: string;
  content_page_id: string | null;
}

interface TriggerResponse {
  workflow_run_id: string;
  status: string;
}

type ToastType = 'success' | 'error';

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

function statusStyles(status: DifyRun['status']): string {
  if (status === 'running') return 'bg-blue-100 text-blue-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  return 'bg-green-100 text-green-700';
}

export default function DifyFlowPage() {
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';

  const [runs, setRuns] = useState<DifyRun[]>([]);
  const [latestProducts, setLatestProducts] = useState<DifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runProducts, setRunProducts] = useState<Record<string, DifyProduct[]>>({});
  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(null);

  const showToast = useCallback((type: ToastType, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`${API_BASE}/admin/dify/runs?limit=20`);
      if (!res.ok) throw new Error(`Failed to load runs (HTTP ${res.status})`);
      const data: DifyRun[] = await res.json();
      const safe = Array.isArray(data) ? data : [];
      setRuns(safe);

      // Pre-load products from the most recent run so "Latest Products" is
      // populated even before the user expands any row.
      if (safe.length > 0) {
        const latest = safe[0];
        const productsRes = await adminFetch(
          `${API_BASE}/admin/dify/runs/${encodeURIComponent(latest.id)}/products`,
        );
        if (productsRes.ok) {
          const products: DifyProduct[] = await productsRes.json();
          setLatestProducts(Array.isArray(products) ? products.slice(0, 10) : []);
        }
      } else {
        setLatestProducts([]);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await adminFetch(`${API_BASE}/admin/dify/trigger`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data: TriggerResponse | { message?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok) {
        const message =
          (data as { message?: string }).message ?? `Trigger failed (HTTP ${res.status})`;
        throw new Error(message);
      }
      showToast(
        'success',
        `Dify run triggered: ${(data as TriggerResponse).workflow_run_id || '(no id)'}`,
      );
      await fetchRuns();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Trigger failed');
    } finally {
      setTriggering(false);
    }
  };

  const toggleRun = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!runProducts[runId]) {
      try {
        const res = await adminFetch(
          `${API_BASE}/admin/dify/runs/${encodeURIComponent(runId)}/products`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const products: DifyProduct[] = await res.json();
        setRunProducts((prev) => ({
          ...prev,
          [runId]: Array.isArray(products) ? products : [],
        }));
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to load products');
      }
    }
  };

  return (
    <div className="min-h-screen bg-cream" dir={dir}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 ${isRtl ? 'left-4' : 'right-4'} z-50`}>
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
            role="status"
          >
            <span className={`ti ${toast.type === 'success' ? 'ti-check' : 'ti-x'} text-lg`} />
            <span className="font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-beige bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Dify Discovery Flow</h1>
            <p className="mt-1 text-sm text-stone">
              Recent Dify workflow runs and the products they produced.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleTrigger();
            }}
            disabled={triggering}
            className="flex items-center gap-2 rounded-lg bg-sage px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage/90 disabled:opacity-50"
          >
            <span
              className={`ti ${triggering ? 'ti-loader-2 animate-spin' : 'ti-player-play'}`}
              aria-hidden="true"
            />
            {triggering ? 'Triggering…' : 'Trigger Run'}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone">
            <span className="ti ti-loader-2 animate-spin text-3xl" aria-hidden="true" />
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-beige bg-white p-12 text-center">
            <span className="ti ti-flow-merge text-4xl text-stone/40" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-charcoal">No runs yet</h2>
            <p className="mt-1 text-sm text-stone">
              Click &ldquo;Trigger Run&rdquo; to start the Dify discovery workflow.
            </p>
          </div>
        ) : (
          <>
            {/* Recent Runs */}
            <section className="rounded-2xl border border-beige bg-white overflow-hidden">
              <div className="border-b border-beige px-6 py-4">
                <h2 className="font-semibold text-charcoal">Recent Runs</h2>
                <p className="mt-1 text-xs text-stone">
                  Latest {runs.length} Dify workflow run{runs.length === 1 ? '' : 's'}. Click a
                  row to see products.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <th className="px-4 py-3 text-left font-medium text-stone">ID</th>
                      <th className="px-4 py-3 text-left font-medium text-stone">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-stone">Started</th>
                      <th className="px-4 py-3 text-left font-medium text-stone">Finished</th>
                      <th className="px-4 py-3 text-left font-medium text-stone">Triggered By</th>
                      <th className="px-4 py-3 text-right font-medium text-stone">Candidates</th>
                      <th className="px-4 py-3 text-right font-medium text-stone">Succeeded</th>
                      <th className="px-4 py-3 text-right font-medium text-stone">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {runs.map((run) => {
                      const isExpanded = expandedRunId === run.id;
                      const expandedProducts = runProducts[run.id];
                      return (
                        <>
                          <tr
                            key={run.id}
                            onClick={() => {
                              void toggleRun(run.id);
                            }}
                            className="cursor-pointer hover:bg-linen/30 transition-colors"
                            aria-expanded={isExpanded}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-charcoal">
                              {shortId(run.id)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles(run.status)}`}
                              >
                                {run.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-stone">
                              {formatDate(run.started_at, locale)}
                            </td>
                            <td className="px-4 py-3 text-xs text-stone">
                              {run.finished_at ? formatDate(run.finished_at, locale) : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-charcoal">
                              {run.triggered_by}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-charcoal">
                              {run.total_candidates}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-green-700">
                              {run.succeeded}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-red-700">
                              {run.failed}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${run.id}-products`} className="bg-linen/20">
                              <td colSpan={8} className="px-4 py-3">
                                {!expandedProducts ? (
                                  <div className="text-xs text-stone py-2">
                                    <span
                                      className="ti ti-loader-2 animate-spin"
                                      aria-hidden="true"
                                    />{' '}
                                    Loading products…
                                  </div>
                                ) : expandedProducts.length === 0 ? (
                                  <p className="text-xs text-stone py-2">
                                    No products attributed to this run.
                                  </p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {expandedProducts.map((product) => (
                                      <li
                                        key={product.id}
                                        className="flex items-center gap-3 text-xs"
                                      >
                                        <span className="font-mono text-stone/70">
                                          {shortId(product.id)}
                                        </span>
                                        <span className="font-medium text-charcoal flex-1 truncate">
                                          <bdi dir="auto">{product.name}</bdi>
                                        </span>
                                        {product.source && (
                                          <span className="rounded-full bg-sage/10 px-2 py-0.5 text-sage">
                                            {product.source}
                                          </span>
                                        )}
                                        {product.trend_score != null && (
                                          <span className="font-mono text-stone">
                                            score {product.trend_score}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Latest Products */}
            <section className="rounded-2xl border border-beige bg-white overflow-hidden">
              <div className="border-b border-beige px-6 py-4">
                <h2 className="font-semibold text-charcoal">Latest Products</h2>
                <p className="mt-1 text-xs text-stone">
                  Up to 10 products from the most recent run.
                </p>
              </div>
              {latestProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-stone">
                  <span className="ti ti-package text-3xl mb-2" aria-hidden="true" />
                  <p className="text-sm">No products from the latest run.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <th className="px-4 py-3 text-left font-medium text-stone">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-stone">Source</th>
                      <th className="px-4 py-3 text-right font-medium text-stone">Trend Score</th>
                      <th className="px-4 py-3 text-left font-medium text-stone">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {latestProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-linen/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-charcoal">
                          <bdi dir="auto">{product.name}</bdi>
                        </td>
                        <td className="px-4 py-3 text-xs text-stone">{product.source ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-charcoal">
                          {product.trend_score ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-stone">
                          {formatDate(product.created_at, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
