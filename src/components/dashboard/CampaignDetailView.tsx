'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { CampaignMetrics, CpcDistributionData, ExpertRecommendation, HistoryPoint } from '@/types'
import clsx from 'clsx'

interface Props {
  campaign:   CampaignMetrics
  customerId: string
  onBack:     () => void
}

type DatePreset = '7days' | '30days' | '90days'

const SCENARIO_LABEL: Record<ExpertRecommendation['scenario'], string> = {
  raise_losing_traffic:  'Subir — tráfico rentable perdido',
  raise_constrained:     'Subir — techo saturado',
  lower_underperforming: 'Bajar — ROAS por debajo del objetivo',
  hold_no_ceiling:       'Sin techo — propuesta inicial',
  hold_stable:           'Mantener — situación equilibrada',
}

const CONFIDENCE_STYLE: Record<ExpertRecommendation['confidence'], string> = {
  high:   'bg-green-900/40 text-green-400 border border-green-700/40',
  medium: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40',
  low:    'bg-[#2a2a2a] text-[#999] border border-[#333]',
}

const CONFIDENCE_LABEL: Record<ExpertRecommendation['confidence'], string> = {
  high:   'Confianza alta',
  medium: 'Confianza media',
  low:    'Datos limitados',
}

function fmtDate(d: Date) { return d.toISOString().split('T')[0] }

function getRange(preset: DatePreset) {
  const end   = new Date()
  const start = new Date()
  const days  = preset === '7days' ? 7 : preset === '30days' ? 30 : 90
  start.setDate(start.getDate() - days)
  return { start: fmtDate(start), end: fmtDate(end), days }
}

function StatCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: 'warn' | 'ok'
}) {
  return (
    <div className="bg-[#141414] border border-[#232323] rounded-lg p-4">
      <p className="text-xs text-[#666] mb-1">{label}</p>
      <p className={clsx(
        'text-lg font-mono font-semibold',
        highlight === 'warn' ? 'text-amber-400' :
        highlight === 'ok'   ? 'text-green-400' :
        'text-white'
      )}>{value}</p>
      {sub && <p className="text-xs text-[#555] mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-[#555] uppercase tracking-[0.12em] mb-3">
      {children}
    </h2>
  )
}

export function CampaignDetailView({ campaign: m, customerId, onBack }: Props) {
  const [datePreset, setDatePreset] = useState<DatePreset>('30days')

  // Histórico
  const [history,        setHistory]        = useState<HistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError,   setHistoryError]   = useState<string | null>(null)

  // Distribución
  const [dist,        setDist]        = useState<CpcDistributionData | null>(null)
  const [distLoading, setDistLoading] = useState(true)
  const [distError,   setDistError]   = useState<string | null>(null)
  const [distTab,     setDistTab]     = useState<'bars' | 'temporal'>('bars')

  // Experto
  const [expert,        setExpert]        = useState<ExpertRecommendation | null>(null)
  const [expertLoading, setExpertLoading] = useState(true)
  const [expertError,   setExpertError]   = useState<string | null>(null)

  // Aplicar
  const [confirming, setConfirming] = useState(false)
  const [applying,   setApplying]   = useState(false)
  const [applied,    setApplied]    = useState(false)

  const fetchAll = useCallback(async (preset: DatePreset) => {
    const range  = getRange(preset)
    const params = new URLSearchParams({ customerId, startDate: range.start, endDate: range.end })

    setHistoryLoading(true); setHistoryError(null)
    fetch(`/api/campaigns/history?campaignName=${encodeURIComponent(m.campaignName)}&days=${range.days}`)
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .catch(e => setHistoryError(e.message))
      .finally(() => setHistoryLoading(false))

    setDistLoading(true); setDistError(null)
    fetch(`/api/campaigns/${m.campaignId}/cpc-distribution?${params}`)
      .then(r => r.json())
      .then(d => setDist(d))
      .catch(e => setDistError(e.message))
      .finally(() => setDistLoading(false))

    setExpertLoading(true); setExpertError(null); setApplied(false)
    fetch(`/api/campaigns/${m.campaignId}/expert-recommendation?${params}`)
      .then(r => r.json())
      .then(d => setExpert(d.recommendation))
      .catch(e => setExpertError(e.message))
      .finally(() => setExpertLoading(false))
  }, [m.campaignId, m.campaignName, customerId])

  useEffect(() => { fetchAll(datePreset) }, [datePreset, fetchAll])

  const applyRecommendation = async () => {
    if (!expert) return
    setApplying(true)
    try {
      const res = await fetch('/api/campaigns/bulk-update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          campaigns: [{ campaignName: m.campaignName, newCpcCeiling: expert.suggestedCeiling }],
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setApplied(true)
      setConfirming(false)
    } catch (e: any) {
      setExpertError(e.message)
    } finally {
      setApplying(false)
    }
  }

  const isRaise = expert?.scenario.startsWith('raise')
  const isLower = expert?.scenario.startsWith('lower')

  return (
    <div className="min-h-screen bg-[#0a0a0a]">

      {/* ── Header sticky ──────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1e1e1e] px-6 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#777] hover:text-white transition-colors shrink-0"
        >
          ← Volver
        </button>
        <div className="w-px h-4 bg-[#2a2a2a]" />
        <h1 className="text-sm font-semibold text-white truncate">{m.campaignName}</h1>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {(['7days', '30days', '90days'] as const).map(p => (
            <button
              key={p}
              onClick={() => setDatePreset(p)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-medium transition',
                datePreset === p ? 'bg-blue-600 text-white' : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222]'
              )}
            >
              {p === '7days' ? '7 días' : p === '30days' ? '30 días' : '90 días'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 space-y-8 max-w-5xl mx-auto pb-16">

        {/* ── Sección 1: Métricas actuales ───────────────────────── */}
        <section>
          <SectionTitle>Métricas actuales</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            <StatCard
              label="CPC Techo"
              value={m.cpcCeiling !== null ? `€${m.cpcCeiling.toFixed(2)}` : '—'}
            />
            <StatCard
              label="CPC Actual"
              value={`€${m.avgCpc.toFixed(2)}`}
            />
            <StatCard
              label="Uso del Techo"
              value={m.cpcUsagePct !== null ? `${m.cpcUsagePct.toFixed(1)}%` : '—'}
              highlight={m.cpcUsagePct !== null ? (m.cpcUsagePct >= 85 ? 'warn' : 'ok') : undefined}
              sub={m.cpcUsagePct !== null && m.cpcUsagePct >= 85 ? '⚠ Saturado' : undefined}
            />
            <StatCard label="Clics"        value={m.clicks.toLocaleString('es-ES')} />
            <StatCard label="Impresiones"  value={m.impressions.toLocaleString('es-ES')} />
            <StatCard label="CTR"          value={`${m.ctr.toFixed(2)}%`} />
            <StatCard label="Coste"        value={`€${m.costEur.toFixed(2)}`} />
            <StatCard
              label="Impression Share"
              value={m.isActual !== null ? `${Math.round(m.isActual * 100)}%` : '—'}
              highlight={m.isActual !== null ? (m.isActual < 0.75 ? 'warn' : 'ok') : undefined}
            />
            <StatCard
              label="Top IS"
              value={m.topImpressionPct !== null ? `${Math.round(m.topImpressionPct * 100)}%` : '—'}
            />
            <StatCard
              label="Abs Top IS"
              value={m.absoluteTopImpressionPct !== null ? `${Math.round(m.absoluteTopImpressionPct * 100)}%` : '—'}
            />
            <StatCard
              label="ROAS Real"
              value={m.realRoas !== null ? m.realRoas.toFixed(2) : '—'}
              highlight={m.realRoas !== null && m.targetRoas !== null
                ? (m.realRoas >= m.targetRoas ? 'ok' : 'warn')
                : undefined}
              sub={m.targetRoas !== null ? `Objetivo: ${m.targetRoas.toFixed(2)}` : undefined}
            />
            <StatCard
              label="ROAS Objetivo"
              value={m.targetRoas !== null ? m.targetRoas.toFixed(2) : '—'}
            />
          </div>
        </section>

        {/* ── Sección 2: Evolución histórica ─────────────────────── */}
        <section>
          <SectionTitle>Evolución histórica</SectionTitle>
          <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg p-4">
            {historyLoading ? (
              <div className="h-56 flex items-center justify-center text-[#555] text-sm animate-pulse">
                Cargando histórico…
              </div>
            ) : historyError ? (
              <div className="h-56 flex items-center justify-center text-red-400/70 text-sm">{historyError}</div>
            ) : history.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-[#555] text-sm">Sin datos históricos</div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={history.map(h => ({
                  ...h,
                  label: new Date(h.capturedAt).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="label" stroke="#444" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis stroke="#444" tick={{ fontSize: 11 }} tickFormatter={v => `€${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#161616', border: '1px solid #2a2a2a' }}
                    formatter={(v: any, name: string) => [`€${Number(v).toFixed(3)}`, name]}
                  />
                  <Legend wrapperStyle={{ color: '#888', fontSize: 12 }} />
                  <Line type="monotone" dataKey="avgCpc"     stroke="#3b82f6" name="CPC Real"  strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cpcCeiling" stroke="#f59e0b" name="CPC Techo" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ── Sección 3: Distribución de CPC ─────────────────────── */}
        <section>
          <SectionTitle>Distribución de CPC</SectionTitle>
          <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg p-4">
            {distLoading ? (
              <div className="h-56 flex items-center justify-center text-[#555] text-sm animate-pulse">
                Cargando distribución…
              </div>
            ) : distError ? (
              <div className="h-56 flex items-center justify-center text-red-400/70 text-sm">{distError}</div>
            ) : dist ? (
              <>
                {/* Mini stats */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {[
                    ['Min',     `€${dist.stats.minCpc.toFixed(3)}`],
                    ['Mediana', `€${dist.stats.medianCpc.toFixed(3)}`],
                    ['Prom.',   `€${dist.stats.avgCpc.toFixed(3)}`],
                    ['P90',     `€${dist.stats.p90.toFixed(3)}`],
                    ['Max',     `€${dist.stats.maxCpc.toFixed(3)}`],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-[#141414] border border-[#1e1e1e] rounded p-2 text-center">
                      <p className="text-[10px] text-[#555] mb-0.5">{l}</p>
                      <p className="text-xs text-white font-mono">{v}</p>
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <div className="flex gap-3 border-b border-[#1e1e1e] mb-4">
                  {(['bars', 'temporal'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setDistTab(t)}
                      className={clsx(
                        'px-3 py-1.5 text-xs font-medium border-b-2 transition -mb-px',
                        distTab === t ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#aaa]'
                      )}
                    >
                      {t === 'bars' ? 'Distribución' : dist.temporalMode === 'weekly' ? 'Análisis Semanal' : 'Análisis Horario'}
                    </button>
                  ))}
                </div>

                {distTab === 'bars' ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dist.distribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="priceRangeMin" tickFormatter={v => `€${Number(v).toFixed(2)}`} stroke="#444" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#444" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#161616', border: '1px solid #2a2a2a' }}
                        formatter={(v: any) => [v, 'Clics']}
                        labelFormatter={l => `€${Number(l).toFixed(3)}`}
                      />
                      <Bar dataKey="clickCount" fill="#3b82f6" name="Clics" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dist.hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="label" stroke="#444" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#444" tick={{ fontSize: 11 }} tickFormatter={v => `€${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#161616', border: '1px solid #2a2a2a' }}
                        formatter={(v: any) => [`€${Number(v).toFixed(3)}`, 'CPC Medio']}
                      />
                      <Line type="monotone" dataKey="avgCpc" stroke="#10b981" name="CPC Medio" strokeWidth={2} dot={dist.temporalMode === 'weekly'} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </>
            ) : null}
          </div>
        </section>

        {/* ── Sección 4: Recomendación Experto ───────────────────── */}
        <section>
          <SectionTitle>✦ Recomendación Experto</SectionTitle>
          <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg p-5">
            {expertLoading ? (
              <div className="h-20 flex items-center justify-center text-[#555] text-sm animate-pulse">
                Calculando recomendación…
              </div>
            ) : expertError ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-red-400/80 text-sm">{expertError}</p>
                <button onClick={() => fetchAll(datePreset)} className="text-xs text-[#666] hover:text-white underline shrink-0">
                  Reintentar
                </button>
              </div>
            ) : expert ? (
              <div className="space-y-5">
                {/* Precio + delta */}
                <div className="flex items-end gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-[#555] mb-0.5">Techo CPC recomendado</p>
                    <span className="text-4xl font-bold font-mono text-white">
                      €{expert.suggestedCeiling.toFixed(2)}
                    </span>
                    {expert.delta !== 0 && (
                      <span className={clsx(
                        'ml-3 text-sm font-mono',
                        isRaise ? 'text-green-400' : isLower ? 'text-red-400' : 'text-[#888]'
                      )}>
                        {isRaise ? '↑' : '↓'} {expert.delta >= 0 ? '+' : ''}€{Math.abs(expert.delta).toFixed(2)}
                        {expert.deltaPercent !== null && ` (${expert.delta >= 0 ? '+' : ''}${expert.deltaPercent}%)`}
                      </span>
                    )}
                    {expert.currentCeiling !== null && (
                      <p className="text-xs text-[#444] mt-0.5">Techo actual: €{expert.currentCeiling.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap pb-1">
                    <span className="text-xs bg-[#1a1a1a] border border-[#252525] rounded px-2 py-1 text-[#bbb]">
                      {SCENARIO_LABEL[expert.scenario]}
                    </span>
                    <span className={clsx('text-xs rounded px-2 py-1', CONFIDENCE_STYLE[expert.confidence])}>
                      {CONFIDENCE_LABEL[expert.confidence]}
                    </span>
                  </div>
                </div>

                {/* Razonamiento */}
                <ul className="space-y-1.5">
                  {expert.reasoning.map((line, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#aaa]">
                      <span className="text-amber-500 shrink-0 mt-0.5">›</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                {/* Botones */}
                {applied ? (
                  <div className="py-2.5 rounded-lg bg-green-900/30 border border-green-700/40 text-green-400 text-sm text-center">
                    ✓ Techo actualizado correctamente
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirming(true)}
                      disabled={expert.delta === 0}
                      className={clsx(
                        'flex-1 py-2.5 rounded-lg text-sm font-semibold transition',
                        expert.delta === 0
                          ? 'bg-[#1a1a1a] text-[#444] cursor-not-allowed'
                          : 'bg-amber-500 hover:bg-amber-400 text-black'
                      )}
                    >
                      Aplicar recomendación
                    </button>
                    <button
                      onClick={() => fetchAll(datePreset)}
                      className="px-4 py-2.5 rounded-lg bg-[#1a1a1a] border border-[#252525] text-[#888] hover:bg-[#1e1e1e] text-sm transition"
                    >
                      Recalcular
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* ── Modal de confirmación ─────────────────────────────────── */}
      {confirming && expert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/75" onClick={() => setConfirming(false)} />
          <div className="relative z-10 bg-[#161616] border border-[#2a2a2a] rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-white font-semibold text-base mb-1">Confirmar cambio de techo CPC</h3>
            <p className="text-[#777] text-sm mb-4">
              Esta acción actualizará el techo en Google Ads y guardará el cambio en el sistema.
            </p>
            <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#666]">Campaña</span>
                <span className="text-white truncate max-w-[180px] text-right text-xs">{m.campaignName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#666]">Techo actual</span>
                <span className="text-white font-mono">
                  {expert.currentCeiling !== null ? `€${expert.currentCeiling.toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#666]">Nuevo techo</span>
                <span className="text-amber-400 font-mono font-semibold">€{expert.suggestedCeiling.toFixed(2)}</span>
              </div>
              {expert.deltaPercent !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">Variación</span>
                  <span className={clsx('font-mono', isRaise ? 'text-green-400' : 'text-red-400')}>
                    {expert.delta >= 0 ? '+' : ''}€{Math.abs(expert.delta).toFixed(2)} ({expert.delta >= 0 ? '+' : ''}{expert.deltaPercent}%)
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-lg bg-[#1e1e1e] text-[#aaa] hover:bg-[#252525] text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={applyRecommendation}
                disabled={applying}
                className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition disabled:opacity-60"
              >
                {applying ? 'Aplicando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
