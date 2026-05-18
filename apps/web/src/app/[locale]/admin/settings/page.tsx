'use client';

import { useState, useEffect, useCallback } from 'react';

interface AgentConfig {
  id: string;
  agentName: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
  createdAt: string;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'premium' | 'fast' | 'budget';
  costInput: number;
  costOutput: number;
}

interface SettingsData {
  configs: AgentConfig[];
  models: ModelInfo[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const AGENT_LABELS: Record<string, { ar: string; icon: string }> = {
  'verdict-engine': { ar: 'محرك الأحكام', icon: 'ti-scale' },
  'content-writer': { ar: 'كاتب المحتوى', icon: 'ti-pencil' },
  'review-analyzer': { ar: 'محلل المراجعات', icon: 'ti-analyze' },
  'quality-guard': { ar: 'حارس الجودة', icon: 'ti-shield-check' },
  'ai-extraction': { ar: 'استخراج البيانات', icon: 'ti-database-import' },
  'smart-scorer': { ar: 'المقيّم الذكي', icon: 'ti-brain' },
  'google-trends': { ar: 'جوجل ترندز', icon: 'ti-trending-up' },
  'competitor-scan': { ar: 'مسح المنافسين', icon: 'ti-radar-2' },
};

// Pipeline groups — defines agent flow + grouping
const PIPELINE_GROUPS = [
  {
    id: 'core',
    label: 'Pipeline الأساسي',
    agents: ['review-analyzer', 'verdict-engine', 'content-writer', 'quality-guard'],
  },
  {
    id: 'extraction',
    label: 'استخراج البيانات',
    agents: ['ai-extraction'],
    readonly: true,
    note: 'يُدار من الكود',
  },
  {
    id: 'discovery',
    label: 'الاكتشاف',
    agents: ['smart-scorer', 'google-trends', 'competitor-scan'],
  },
];

const TIER_BADGE: Record<string, string> = {
  premium: 'bg-terracotta/10 text-terracotta',
  fast: 'bg-sage/10 text-sage',
  budget: 'bg-lavender/10 text-lavender',
};

const TIER_LABEL: Record<string, string> = {
  premium: 'متميز',
  fast: 'سريع',
  budget: 'اقتصادي',
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track per-agent local edits before saving
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<AgentConfig>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveResult, setSaveResult] = useState<Record<string, 'ok' | 'error'>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/settings/agents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SettingsData = await res.json();
      setData(json);
      // Reset local edits on fresh fetch
      setLocalEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getEffectiveConfig = (agentName: string): AgentConfig | undefined => {
    const base = data?.configs.find((c) => c.agentName === agentName);
    if (!base) return undefined;
    const edits = localEdits[agentName] ?? {};
    return { ...base, ...edits };
  };

  const applyEdit = (agentName: string, patch: Partial<AgentConfig>) => {
    setLocalEdits((prev) => ({
      ...prev,
      [agentName]: { ...(prev[agentName] ?? {}), ...patch },
    }));
  };

  const handleSave = async (agentName: string) => {
    const edits = localEdits[agentName];
    if (!edits || Object.keys(edits).length === 0) return;

    setSaving((prev) => ({ ...prev, [agentName]: true }));
    setSaveResult((prev) => {
      const next = { ...prev };
      delete next[agentName];
      return next;
    });

    try {
      const res = await fetch(`${API_BASE}/admin/settings/agents/${agentName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: AgentConfig = await res.json();
      // Merge updated config into data
      setData((prev) =>
        prev
          ? {
              ...prev,
              configs: prev.configs.map((c) => (c.agentName === agentName ? updated : c)),
            }
          : prev,
      );
      setLocalEdits((prev) => {
        const next = { ...prev };
        delete next[agentName];
        return next;
      });
      setSaveResult((prev) => ({ ...prev, [agentName]: 'ok' }));
      setTimeout(() => {
        setSaveResult((prev) => {
          const next = { ...prev };
          delete next[agentName];
          return next;
        });
      }, 2000);
    } catch {
      setSaveResult((prev) => ({ ...prev, [agentName]: 'error' }));
    } finally {
      setSaving((prev) => ({ ...prev, [agentName]: false }));
    }
  };

  const getModelCostEstimate = (modelId: string, maxTokens: number): string => {
    const model = data?.models.find((m) => m.id === modelId);
    if (!model) return '—';
    const inputCost = (500 / 1000) * model.costInput;
    const outputCost = (maxTokens / 1000) * model.costOutput;
    const total = inputCost + outputCost;
    return `~$${total.toFixed(5)}/استدعاء`;
  };

  const hasEdits = (agentName: string) => {
    const edits = localEdits[agentName];
    return edits && Object.keys(edits).length > 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
          <h1 className="text-sm font-medium text-charcoal">إعدادات الذكاء الاصطناعي</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-stone">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
          <h1 className="text-sm font-medium text-charcoal">إعدادات الذكاء الاصطناعي</h1>
        </header>
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
          <span className="ti ti-alert-circle text-3xl text-terracotta" />
          <p className="text-sm text-stone">{error ?? 'خطأ في التحميل'}</p>
          <button
            onClick={fetchSettings}
            className="text-xs text-sage hover:text-charcoal underline"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">إعدادات الذكاء الاصطناعي</h1>
        <button
          onClick={fetchSettings}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors"
        >
          <span className="ti ti-refresh text-sm" />
          <span>تحديث</span>
        </button>
      </header>

      <div className="flex-1 px-6 py-8 space-y-10 overflow-auto">

        {/* Pipeline Flow Visualization */}
        <section>
          <h2 className="text-base font-medium text-charcoal mb-5">خط الإنتاج</h2>
          <div className="bg-white rounded-xl border border-beige p-6">
            <div className="flex flex-wrap items-center gap-2 justify-center">
              {['review-analyzer', 'verdict-engine', 'content-writer', 'quality-guard'].map((agentName, idx, arr) => {
                const cfg = getEffectiveConfig(agentName);
                const label = AGENT_LABELS[agentName];
                const model = data.models.find((m) => m.id === cfg?.model);
                const isEnabled = cfg?.enabled ?? true;

                return (
                  <div key={agentName} className="flex items-center gap-2">
                    {/* Agent node */}
                    <div
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 min-w-[120px] text-center transition-all ${
                        isEnabled
                          ? 'border-sage/30 bg-sage/5'
                          : 'border-beige bg-linen opacity-60'
                      }`}
                    >
                      <span className={`ti ${label?.icon ?? 'ti-robot'} text-xl ${isEnabled ? 'text-sage' : 'text-stone'}`} />
                      <p className="text-xs font-medium text-charcoal leading-tight">{label?.ar ?? agentName}</p>
                      {model && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${TIER_BADGE[model.tier] ?? 'bg-beige text-stone'}`}
                        >
                          {model.name.split(' ').slice(0, 2).join(' ')}
                        </span>
                      )}
                      {/* Gate indicator */}
                      <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-sage' : 'bg-stone/40'}`} />
                    </div>
                    {/* Arrow connector */}
                    {idx < arr.length - 1 && (
                      <div className={`flex items-center ${isEnabled ? 'text-sage' : 'text-stone/30'}`}>
                        <div className="h-px w-4 bg-current" />
                        <span className="ti ti-chevron-left text-xs" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-stone text-center mt-4">
              السهم يمثل تدفق البيانات من اليمين لليسار • الدائرة الخضراء = مفعّل
            </p>
          </div>
        </section>

        {/* Agent Groups */}
        {PIPELINE_GROUPS.map((group) => (
          <section key={group.id}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-medium text-charcoal">{group.label}</h2>
              {group.readonly && (
                <span className="text-[11px] bg-linen text-stone px-2 py-0.5 rounded-full border border-beige">
                  {group.note}
                </span>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {group.agents.map((agentName) => {
                const cfg = getEffectiveConfig(agentName);
                if (!cfg) return null;
                const label = AGENT_LABELS[agentName];
                const selectedModel = data.models.find((m) => m.id === cfg.model);
                const isDirty = hasEdits(agentName);
                const isSaving = saving[agentName];
                const result = saveResult[agentName];

                return (
                  <div
                    key={agentName}
                    className={`bg-white rounded-xl border p-5 space-y-4 transition-all ${
                      isDirty ? 'border-sage/50 shadow-sm' : 'border-beige'
                    }`}
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-sage/10 flex items-center justify-center flex-shrink-0">
                          <span className={`ti ${label?.icon ?? 'ti-robot'} text-sage text-base`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">{label?.ar ?? agentName}</p>
                          <p className="text-[11px] text-stone mt-0.5">{cfg.description ?? agentName}</p>
                        </div>
                      </div>
                      {/* Enabled toggle */}
                      <button
                        disabled={group.readonly}
                        onClick={() => applyEdit(agentName, { enabled: !cfg.enabled })}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                          cfg.enabled ? 'bg-sage' : 'bg-stone/30'
                        } ${group.readonly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={cfg.enabled ? 'تعطيل' : 'تفعيل'}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                            cfg.enabled ? 'right-0.5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Model dropdown */}
                    <div>
                      <label className="block text-xs text-stone mb-1.5">النموذج</label>
                      <select
                        disabled={group.readonly}
                        value={cfg.model}
                        onChange={(e) => applyEdit(agentName, { model: e.target.value })}
                        className={`w-full text-sm bg-cream border border-beige rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-sage/50 ${
                          group.readonly ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {data.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.provider}) — {TIER_LABEL[m.tier] ?? m.tier}
                          </option>
                        ))}
                      </select>
                      {selectedModel && (
                        <p className="text-[11px] text-stone mt-1">
                          {getModelCostEstimate(cfg.model, cfg.maxTokens)}
                          {' • '}
                          <span className={`inline-block px-1 py-0.5 rounded-full text-[10px] ${TIER_BADGE[selectedModel.tier]}`}>
                            {TIER_LABEL[selectedModel.tier]}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Temperature slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-stone">الحرارة (الإبداعية)</label>
                        <span className="text-xs font-medium text-charcoal tabular-nums">
                          {cfg.temperature.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        disabled={group.readonly}
                        min={0}
                        max={1}
                        step={0.1}
                        value={cfg.temperature}
                        onChange={(e) => applyEdit(agentName, { temperature: parseFloat(e.target.value) })}
                        className={`w-full accent-sage ${group.readonly ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <div className="flex justify-between text-[10px] text-stone mt-0.5">
                        <span>دقيق</span>
                        <span>إبداعي</span>
                      </div>
                    </div>

                    {/* Max tokens */}
                    <div>
                      <label className="block text-xs text-stone mb-1.5">الحد الأقصى للتوكنز</label>
                      <input
                        type="number"
                        disabled={group.readonly}
                        min={100}
                        max={32000}
                        step={100}
                        value={cfg.maxTokens}
                        onChange={(e) => applyEdit(agentName, { maxTokens: parseInt(e.target.value, 10) })}
                        className={`w-full text-sm bg-cream border border-beige rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-sage/50 tabular-nums ${
                          group.readonly ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>

                    {/* Save button */}
                    {!group.readonly && (
                      <div className="flex items-center justify-between pt-1">
                        <div className="text-xs">
                          {result === 'ok' && (
                            <span className="text-sage flex items-center gap-1">
                              <span className="ti ti-check" />
                              حُفظ
                            </span>
                          )}
                          {result === 'error' && (
                            <span className="text-terracotta flex items-center gap-1">
                              <span className="ti ti-x" />
                              خطأ في الحفظ
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleSave(agentName)}
                          disabled={!isDirty || isSaving}
                          className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
                            isDirty && !isSaving
                              ? 'bg-sage text-cream hover:bg-sage/90'
                              : 'bg-beige text-stone cursor-not-allowed'
                          }`}
                        >
                          {isSaving ? (
                            <>
                              <span className="ti ti-loader animate-spin text-sm" />
                              جارٍ الحفظ...
                            </>
                          ) : (
                            <>
                              <span className="ti ti-device-floppy text-sm" />
                              حفظ
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

      </div>
    </div>
  );
}
