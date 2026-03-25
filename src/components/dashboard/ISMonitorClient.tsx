'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CampaignMetrics } from '@/types'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

const ENV_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''
function normalizeCustomerId(v: string) { return v.replace(/-/g, '').trim() }
function isValidCustomerId(v: string)   { return /^\d{10}$/.test(normalizeCustomerId(v)) }
const DEFAULT_ID = isValidCustomerId(ENV_CUSTOMER_ID) ? normalizeCustomerId(ENV_CUSTOMER_ID) : ''

// ── Helpers ───────────────────────────────────────────────────

function isStatus(is: number | null): 'ok' | 'warning' | 'alert' {
  if (is === null) return 'ok'
  if (is >= 0.8)  return 'ok'
  if (is >= 0.5)  return 'warning'
  return 'alert'
}

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'alert' }) {
  const styles = {
    ok:      'bg-green-DEFAULT/10 text-green-DEFAULT border-green-DEFAULT/30',
    warning: 'bg-amber-DEFAULT/10 text-amber-DEFAULT border-amber-DEFAULT/30',
    alert:   'bg-red-DEFAULT/10   text-red-DEFAULT   border-red-DEFAULT/30   pulse-alert',
  }[status]
  const labels = { ok: 'OK', warning: 'WARN', alert: 'ALERT' }
  return (
    <span className={`num text-[9px] px-2 py-0.5 rounded-sm border tracking-widest ${styles}`}>
      {labels[status]}
    </span>
  )
}

function ISBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="num text-[11px] text-text-secondary w-10 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

// ── Tooltip customizado ───────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs num shadow-lg">
      <p className="text-text-tertiary tracking-wider mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {Math.round(p.value * 100)}%
        </p>
      ))}
    </div>
  )
}

// ── IS Evolution histórica ────────────────────────────────────

function ISEvolutionChart({ campaignId, customerId }: { campaignId: string; customerId: string }) {
  const [data, setData] = useState<{ date: string; is: number | null }[]>([])

  useEffect(() => {
    if (!campaignId || !customerId) return
    fetch(`/api/campaigns/history?campaignId=${campaignId}&customerId=${customerId}`)
      .then(r => r.json())
      .then(d => {
        const points = (d.history ?? []).map((p: any) => ({
          date: new Date(p.capturedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
          is:   p.isActual ?? null,
        }))
        setData(points)
      })
      .catch(() => {})
  }, [campaignId, customerId])

  if (data.length === 0) return (
    <div className="h-24 flex items-center justify-center text-text-tertiary text-xs num tracking-wider">
      SIN HISTÓRICO
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#666' }} />
        <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 9, fill: '#666' }} domain={[0, 1]} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="is" stroke="#00D4FF" strokeWidth={1.5} dot={false} name="IS" />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Componente principal ──────────────────────────────────────

export function ISMonitorClient({ user }: Props) {
  const searchParams = useSearchParams()
  const urlCustomerId = searchParams.get('customerId') ?? ''

  const initialId = isValidCustomerId(urlCustomerId)
    ? normalizeCustomerId(urlCustomerId)
    : DEFAULT_ID

  const [metrics,       setMetrics]       = useState<CampaignMetrics[]>([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [lastUpdate,    setLastUpdate]    = useState<Date | null>(null)
  const [customerId,    setCustomerId]    = useState(initialId)
  const [inputId,       setInputId]       = useState(initialId)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [sortBy,        setSortBy]        = useState<'is' | 'lostBudget' | 'lostRank'>('is')

  const fetchMetrics = useCallback(async (cid: string) => {
    if (!isValidCustomerId(cid)) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/campaigns?customerId=${normalizeCustomerId(cid)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setMetrics(data.metrics)
      setLastUpdate(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isValidCustomerId(customerId)) fetchMetrics(customerId)
  }, [customerId, fetchMetrics])

  const handleLoad = () => {
    const norm = normalizeCustomerId(inputId)
    if (!isValidCustomerId(norm)) { setError('Customer ID inválido'); return }
    setInputId(norm); setCustomerId(norm)
  }

  // ── Métricas IS ───────────────────────────────────────────

  const withIS = metrics.filter(m => m.isActual !== null)
  const avgIS  = withIS.length > 0
    ? withIS.reduce((a, m) => a + (m.isActual ?? 0), 0) / withIS.length
    : null
  const avgLostBudget = withIS.length > 0
    ? withIS.reduce((a, m) => a + (m.isLostBudget ?? 0), 0) / withIS.length
    : null
  const avgLostRank = withIS.length > 0
    ? withIS.reduce((a, m) => a + (m.isLostRank ?? 0), 0) / withIS.length
    : null

  const alerts  = withIS.filter(m => isStatus(m.isActual) === 'alert').length
  const warnings = withIS.filter(m => isStatus(m.isActual) === 'warning').length

  // Ordenar campañas
  const sorted = [...metrics].sort((a, b) => {
    if (sortBy === 'is')         return (a.isActual ?? 0) - (b.isActual ?? 0)
    if (sortBy === 'lostBudget') return (b.isLostBudget ?? 0) - (a.isLostBudget ?? 0)
    return (b.isLostRank ?? 0) - (a.isLostRank ?? 0)
  })

  // Datos para el gráfico de barras IS breakdown
  const barData = sorted.map(m => ({
    name:       m.campaignName.replace(/^AEU_[A-Z]{2}_[A-Z]{2}_/, '').slice(0, 22),
    fullName:   m.campaignName,
    is:         m.isActual ?? 0,
    lostBudget: m.isLostBudget ?? 0,
    lostRank:   m.isLostRank ?? 0,
  }))

  const selectedCampaign = selectedId ? metrics.find(m => m.campaignId === selectedId) : null

  return (
    <div className="flex min-h-screen bg-bg-base">

      <AppSidebar
        activeSection="is-monitor"
        customerId={customerId}
        inputId={inputId}
        onInputChange={setInputId}
        onLoad={handleLoad}
        lastUpdate={lastUpdate}
        loading={loading}
        onRefresh={() => fetchMetrics(customerId)}
      />

      <div className="ml-[220px] flex-1 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="border-b border-bg-border bg-bg-surface sticky top-0 z-20">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="num text-sm font-bold text-text-primary tracking-widest">IS_MONITOR</span>
              {customerId && (
                <span className="num text-xs text-text-tertiary">#{customerId}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {alerts > 0 && (
                <span className="num text-[10px] bg-red-dim text-red-DEFAULT border border-red-DEFAULT/30 px-2 py-0.5 rounded-sm tracking-wider pulse-alert">
                  {alerts} ALERT{alerts > 1 ? 'S' : ''}
                </span>
              )}
              <span className="num text-[10px] px-2 py-0.5 rounded-sm border border-bg-border text-text-tertiary tracking-wider">
                IMPRESSION SHARE ANALYSIS
              </span>
            </div>
          </div>
        </header>

        <main className="px-6 py-6 flex-1">

          {error && (
            <div className="mb-5 bg-red-dim border border-red-DEFAULT/30 rounded px-4 py-3 text-sm text-red-DEFAULT">
              <span className="font-medium num tracking-wider">ERROR: </span>{error}
            </div>
          )}

          {!loading && metrics.length === 0 && !error && (
            <div className="text-center py-20 text-text-secondary">
              <p className="num text-sm tracking-wider">◎ IS MONITOR</p>
              <p className="text-xs mt-2 text-text-tertiary">Introduce un Customer ID y pulsa Cargar</p>
            </div>
          )}

          {(loading || metrics.length > 0) && (
            <>
              {/* ── KPI Summary ─────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {loading ? [1,2,3,4].map(i => (
                  <div key={i} className="bg-bg-card border border-bg-border rounded-md h-24 animate-pulse" />
                )) : (<>
                  {/* Avg IS */}
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">Avg IS</p>
                    <p className={`num text-2xl font-bold mb-1 ${
                      avgIS === null ? 'text-text-tertiary'
                      : avgIS >= 0.8 ? 'text-green-DEFAULT'
                      : avgIS >= 0.5 ? 'text-amber-DEFAULT'
                      : 'text-red-DEFAULT'
                    }`}>
                      {avgIS !== null ? `${Math.round(avgIS * 100)}%` : '—'}
                    </p>
                    <div className="progress-bar mt-2">
                      <div className="progress-bar-fill" style={{ width: `${(avgIS ?? 0) * 100}%` }} />
                    </div>
                  </div>
                  {/* IS Perdido Presupuesto */}
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">IS Perdido Presupuesto</p>
                    <p className="num text-2xl font-bold text-amber-DEFAULT mb-1">
                      {avgLostBudget !== null ? `${Math.round(avgLostBudget * 100)}%` : '—'}
                    </p>
                    <p className="num text-[10px] text-text-tertiary">Avg entre campañas</p>
                  </div>
                  {/* IS Perdido Ranking */}
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">IS Perdido Ranking</p>
                    <p className="num text-2xl font-bold text-red-DEFAULT mb-1">
                      {avgLostRank !== null ? `${Math.round(avgLostRank * 100)}%` : '—'}
                    </p>
                    <p className="num text-[10px] text-text-tertiary">Avg entre campañas</p>
                  </div>
                  {/* Estado campañas */}
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">Estado</p>
                    <p className="num text-2xl font-bold text-cyan-DEFAULT mb-1">{metrics.length}</p>
                    <div className="flex gap-2 flex-wrap">
                      {alerts > 0 && (
                        <span className="num text-[9px] text-red-DEFAULT">{alerts} alerta{alerts > 1 ? 's' : ''}</span>
                      )}
                      {warnings > 0 && (
                        <span className="num text-[9px] text-amber-DEFAULT">{warnings} warning{warnings > 1 ? 's' : ''}</span>
                      )}
                      {alerts === 0 && warnings === 0 && (
                        <span className="num text-[9px] text-green-DEFAULT">todo OK</span>
                      )}
                    </div>
                  </div>
                </>)}
              </div>

              {!loading && metrics.length > 0 && (
                <>
                  {/* ── IS Breakdown chart ──────────────────── */}
                  <div className="bg-bg-card border border-bg-border rounded-md p-4 mb-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase">IS Breakdown por Campaña</h3>
                      <div className="flex gap-3 text-[9px] num text-text-tertiary">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-DEFAULT inline-block" /> IS Real</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-DEFAULT inline-block" /> Lost Budget</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-DEFAULT inline-block" /> Lost Rank</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={barData} margin={{ top: 0, right: 10, bottom: 40, left: -15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fill: '#666' }}
                          angle={-35}
                          textAnchor="end"
                          interval={0}
                        />
                        <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 9, fill: '#666' }} domain={[0, 1]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="is"         name="IS Real"     fill="#00D4FF" stackId="a" radius={[0,0,0,0]} />
                        <Bar dataKey="lostBudget" name="Lost Budget" fill="#F59E0B" stackId="a" />
                        <Bar dataKey="lostRank"   name="Lost Rank"   fill="#EF4444" stackId="a" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* ── Tabla de campañas ────────────────────── */}
                  <div className="bg-bg-card border border-bg-border rounded-md overflow-hidden mb-5">
                    <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
                      <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase">Detalle IS por Campaña</h3>
                      <div className="flex gap-1">
                        {(['is', 'lostBudget', 'lostRank'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setSortBy(s)}
                            className={`num text-[9px] px-2 py-0.5 rounded border transition-colors tracking-wider ${
                              sortBy === s
                                ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-cyan-DEFAULT/30'
                                : 'text-text-tertiary border-bg-border hover:text-text-secondary'
                            }`}
                          >
                            {{ is: 'IS ↑', lostBudget: 'Lost Budget ↓', lostRank: 'Lost Rank ↓' }[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="divide-y divide-bg-border">
                      {sorted.map(m => {
                        const status = isStatus(m.isActual)
                        const isSelected = selectedId === m.campaignId
                        return (
                          <div
                            key={m.campaignId}
                            onClick={() => setSelectedId(isSelected ? null : m.campaignId)}
                            className={`px-4 py-3 cursor-pointer transition-colors ${
                              isSelected ? 'bg-cyan-DEFAULT/5' : 'hover:bg-bg-hover'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <StatusBadge status={status} />
                                <span className="num text-xs text-text-primary truncate">{m.campaignName}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {m.topImpressionPct !== null && (
                                  <span className="num text-[10px] text-text-tertiary hidden sm:block">
                                    Top: {Math.round((m.topImpressionPct ?? 0) * 100)}%
                                  </span>
                                )}
                                {m.absoluteTopImpressionPct !== null && (
                                  <span className="num text-[10px] text-text-tertiary hidden md:block">
                                    AbsTop: {Math.round((m.absoluteTopImpressionPct ?? 0) * 100)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                              <div>
                                <p className="num text-[9px] text-cyan-DEFAULT mb-0.5 tracking-wider">IS REAL</p>
                                <ISBar value={m.isActual ?? 0} color="#00D4FF" />
                              </div>
                              <div>
                                <p className="num text-[9px] text-amber-DEFAULT mb-0.5 tracking-wider">LOST BUDGET</p>
                                <ISBar value={m.isLostBudget ?? 0} color="#F59E0B" />
                              </div>
                              <div>
                                <p className="num text-[9px] text-red-DEFAULT mb-0.5 tracking-wider">LOST RANK</p>
                                <ISBar value={m.isLostRank ?? 0} color="#EF4444" />
                              </div>
                            </div>

                            {/* Histórico IS expandible */}
                            {isSelected && (
                              <div className="mt-3 pt-3 border-t border-bg-border">
                                <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">
                                  Evolución IS histórica
                                </p>
                                <ISEvolutionChart campaignId={m.campaignId} customerId={customerId} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Radar: IS vs Top IS vs AbsTop IS ──── */}
                  {metrics.length > 0 && (
                    <div className="bg-bg-card border border-bg-border rounded-md p-4">
                      <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-4">
                        Posicionamiento en SERP (Top IS / AbsTop IS)
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {metrics.map(m => (
                          <div key={m.campaignId} className="bg-bg-base border border-bg-border rounded p-3">
                            <p className="num text-[9px] text-text-secondary truncate mb-2">{m.campaignName}</p>
                            <div className="space-y-1.5">
                              <div>
                                <div className="flex justify-between num text-[9px] text-text-tertiary mb-0.5">
                                  <span>IS Real</span>
                                  <span>{m.isActual !== null ? `${Math.round(m.isActual * 100)}%` : '—'}</span>
                                </div>
                                <div className="h-1 bg-bg-border rounded-full overflow-hidden">
                                  <div className="h-full bg-cyan-DEFAULT rounded-full" style={{ width: `${(m.isActual ?? 0) * 100}%` }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between num text-[9px] text-text-tertiary mb-0.5">
                                  <span>Top IS</span>
                                  <span>{m.topImpressionPct !== null ? `${Math.round((m.topImpressionPct ?? 0) * 100)}%` : '—'}</span>
                                </div>
                                <div className="h-1 bg-bg-border rounded-full overflow-hidden">
                                  <div className="h-full bg-green-DEFAULT rounded-full" style={{ width: `${(m.topImpressionPct ?? 0) * 100}%` }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between num text-[9px] text-text-tertiary mb-0.5">
                                  <span>Abs Top IS</span>
                                  <span>{m.absoluteTopImpressionPct !== null ? `${Math.round((m.absoluteTopImpressionPct ?? 0) * 100)}%` : '—'}</span>
                                </div>
                                <div className="h-1 bg-bg-border rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-DEFAULT rounded-full" style={{ width: `${(m.absoluteTopImpressionPct ?? 0) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
