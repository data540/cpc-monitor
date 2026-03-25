'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine, Cell,
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

function usageColor(pct: number | null) {
  if (pct === null) return '#444'
  if (pct >= 90)   return '#EF4444'
  if (pct >= 70)   return '#F59E0B'
  return '#22C55E'
}

function usageLevel(pct: number | null): 'alert' | 'warning' | 'ok' | 'none' {
  if (pct === null) return 'none'
  if (pct >= 90)   return 'alert'
  if (pct >= 70)   return 'warning'
  return 'ok'
}

function StatusBadge({ level }: { level: 'alert' | 'warning' | 'ok' | 'none' }) {
  if (level === 'none') return null
  const s = {
    alert:   'bg-red-DEFAULT/10 text-red-DEFAULT border-red-DEFAULT/30 pulse-alert',
    warning: 'bg-amber-DEFAULT/10 text-amber-DEFAULT border-amber-DEFAULT/30',
    ok:      'bg-green-DEFAULT/10 text-green-DEFAULT border-green-DEFAULT/30',
  }[level]
  const t = { alert: 'ALERT', warning: 'WARN', ok: 'OK' }[level]
  return <span className={`num text-[9px] px-2 py-0.5 rounded-sm border tracking-widest shrink-0 ${s}`}>{t}</span>
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs num shadow-lg">
      <p className="text-text-tertiary tracking-wider mb-1 truncate max-w-[180px]">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: {typeof p.value === 'number' && p.value < 2 ? `${p.value.toFixed(2)}€` : `${p.value}%`}
        </p>
      ))}
    </div>
  )
}

// ── Histórico CPC de una campaña ──────────────────────────────

function CpcHistoryMini({ campaignName, cpcCeiling }: { campaignName: string; cpcCeiling: number | null }) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!campaignName) return
    fetch(`/api/campaigns/history?campaignName=${encodeURIComponent(campaignName)}&days=30`)
      .then(r => r.json())
      .then(d => {
        setData((d.history ?? []).map((p: any) => ({
          date:   new Date(p.capturedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
          cpc:    p.avgCpc,
          techo:  p.cpcCeiling ?? cpcCeiling,
        })))
      })
      .catch(() => {})
  }, [campaignName, cpcCeiling])

  if (data.length === 0) return (
    <div className="h-20 flex items-center justify-center text-text-tertiary text-[10px] num tracking-wider">
      SIN HISTÓRICO
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }} />
        <YAxis tickFormatter={v => `${v}€`} tick={{ fontSize: 9, fill: '#555' }} />
        <Tooltip content={<CustomTooltip />} />
        {cpcCeiling && (
          <ReferenceLine y={cpcCeiling} stroke="#EF4444" strokeDasharray="4 2" strokeWidth={1} />
        )}
        <Line type="monotone" dataKey="cpc"   stroke="#00D4FF" strokeWidth={1.5} dot={false} name="CPC" />
        <Line type="monotone" dataKey="techo" stroke="#EF4444" strokeWidth={1} dot={false} strokeDasharray="4 2" name="Techo" />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Componente principal ──────────────────────────────────────

export function CpcAnalysisClient({ user }: Props) {
  const searchParams  = useSearchParams()
  const urlCid        = searchParams.get('customerId') ?? ''
  const initialId     = isValidCustomerId(urlCid) ? normalizeCustomerId(urlCid) : DEFAULT_ID

  const [metrics,    setMetrics]    = useState<CampaignMetrics[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [customerId, setCustomerId] = useState(initialId)
  const [inputId,    setInputId]    = useState(initialId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortBy,     setSortBy]     = useState<'usage' | 'cpc' | 'cost'>('usage')

  const fetchMetrics = useCallback(async (cid: string) => {
    if (!isValidCustomerId(cid)) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/campaigns?customerId=${normalizeCustomerId(cid)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setMetrics(data.metrics)
      setLastUpdate(new Date())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (isValidCustomerId(customerId)) fetchMetrics(customerId) }, [customerId, fetchMetrics])

  const handleLoad = () => {
    const norm = normalizeCustomerId(inputId)
    if (!isValidCustomerId(norm)) { setError('Customer ID inválido'); return }
    setInputId(norm); setCustomerId(norm)
  }

  // ── KPIs ──────────────────────────────────────────────────

  const withCeiling  = metrics.filter(m => m.cpcCeiling !== null && m.cpcUsagePct !== null)
  const alerts       = withCeiling.filter(m => (m.cpcUsagePct ?? 0) >= 90).length
  const warnings     = withCeiling.filter(m => (m.cpcUsagePct ?? 0) >= 70 && (m.cpcUsagePct ?? 0) < 90).length
  const totalClicks  = metrics.reduce((a, m) => a + m.clicks, 0)
  const totalCost    = metrics.reduce((a, m) => a + m.costEur, 0)
  const weightedCpc  = totalClicks > 0
    ? metrics.reduce((a, m) => a + m.avgCpc * m.clicks, 0) / totalClicks
    : null

  // Ordenar
  const sorted = [...metrics].sort((a, b) => {
    if (sortBy === 'usage') return (b.cpcUsagePct ?? -1) - (a.cpcUsagePct ?? -1)
    if (sortBy === 'cpc')   return b.avgCpc - a.avgCpc
    return b.costEur - a.costEur
  })

  // Datos para gráfico de uso
  const chartData = sorted.slice(0, 12).map(m => ({
    name:  m.campaignName.replace(/^AEU_[A-Z]{2}_[A-Z]{2}_/, '').slice(0, 20),
    usage: m.cpcUsagePct ?? 0,
    pct:   m.cpcUsagePct ?? 0,
  }))

  return (
    <div className="flex min-h-screen bg-bg-base">
      <AppSidebar
        activeSection="cpc-analysis"
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
              <span className="num text-sm font-bold text-text-primary tracking-widest">CPC_ANALYSIS</span>
              {customerId && <span className="num text-xs text-text-tertiary">#{customerId}</span>}
            </div>
            <div className="flex items-center gap-3">
              {alerts > 0 && (
                <span className="num text-[10px] bg-red-dim text-red-DEFAULT border border-red-DEFAULT/30 px-2 py-0.5 rounded-sm tracking-wider pulse-alert">
                  {alerts} AL TECHO
                </span>
              )}
              <span className="num text-[10px] px-2 py-0.5 rounded-sm border border-bg-border text-text-tertiary tracking-wider">
                CPC CEILING ANALYSIS
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
              <p className="num text-sm tracking-wider">💰 CPC ANALYSIS</p>
              <p className="text-xs mt-2 text-text-tertiary">Introduce un Customer ID y pulsa Cargar</p>
            </div>
          )}

          {(loading || metrics.length > 0) && (
            <>
              {/* ── KPI Cards ──────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {loading ? [1,2,3,4].map(i => (
                  <div key={i} className="bg-bg-card border border-bg-border rounded-md h-24 animate-pulse" />
                )) : (<>
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">CPC Medio Ponderado</p>
                    <p className="num text-2xl font-bold text-cyan-DEFAULT mb-1">
                      {weightedCpc !== null ? `${weightedCpc.toFixed(2)} €` : '—'}
                    </p>
                    <p className="num text-[10px] text-text-tertiary">ponderado por clics</p>
                  </div>
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">Al Techo (&gt;90%)</p>
                    <p className={`num text-2xl font-bold mb-1 ${alerts > 0 ? 'text-red-DEFAULT' : 'text-green-DEFAULT'}`}>
                      {alerts}
                    </p>
                    <p className="num text-[10px] text-text-tertiary">{warnings} en zona de aviso</p>
                  </div>
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">Coste Total</p>
                    <p className="num text-2xl font-bold text-cyan-DEFAULT mb-1">
                      {totalCost.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €
                    </p>
                    <p className="num text-[10px] text-text-tertiary">últimos 30 días</p>
                  </div>
                  <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3">
                    <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">Total Clics</p>
                    <p className="num text-2xl font-bold text-cyan-DEFAULT mb-1">
                      {totalClicks.toLocaleString('es-ES')}
                    </p>
                    <p className="num text-[10px] text-text-tertiary">{metrics.length} campañas</p>
                  </div>
                </>)}
              </div>

              {!loading && metrics.length > 0 && (
                <>
                  {/* ── Gráfico de uso CPC ─────────────────── */}
                  <div className="bg-bg-card border border-bg-border rounded-md p-5 mb-5">
                    <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-4">
                      Uso del CPC Techo por Campaña (%)
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 0, right: 50, bottom: 0, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" horizontal={false} />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tickFormatter={v => `${v}%`}
                          tick={{ fontSize: 9, fill: '#555' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 9, fill: '#888' }}
                          width={130}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine x={90} stroke="#EF4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: '90%', fill: '#EF4444', fontSize: 9 }} />
                        <ReferenceLine x={70} stroke="#F59E0B" strokeDasharray="4 2" strokeWidth={1} label={{ value: '70%', fill: '#F59E0B', fontSize: 9 }} />
                        <Bar dataKey="usage" name="Uso %" radius={[0, 3, 3, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={usageColor(entry.pct)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* ── Tabla detalle ─────────────────────── */}
                  <div className="bg-bg-card border border-bg-border rounded-md overflow-hidden">
                    <div className="px-5 py-3 border-b border-bg-border flex items-center justify-between">
                      <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase">
                        Detalle CPC por Campaña
                      </h3>
                      <div className="flex gap-1">
                        {(['usage', 'cpc', 'cost'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setSortBy(s)}
                            className={`num text-[9px] px-2 py-0.5 rounded border transition-colors tracking-wider ${
                              sortBy === s
                                ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-cyan-DEFAULT/30'
                                : 'text-text-tertiary border-bg-border hover:text-text-secondary'
                            }`}
                          >
                            {{ usage: 'Uso %', cpc: 'CPC', cost: 'Coste' }[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cabecera tabla */}
                    <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-bg-border bg-bg-base">
                      {['CAMPAÑA', 'TECHO', 'CPC ACT.', 'USO %', '', 'CLICS', 'COSTE'].map((h, i) => (
                        <p key={i} className={`num text-[9px] text-text-tertiary tracking-widest uppercase ${
                          i === 0 ? 'col-span-3' : i === 3 ? 'col-span-3' : 'col-span-1'
                        }`}>{h}</p>
                      ))}
                    </div>

                    <div className="divide-y divide-bg-border">
                      {sorted.map(m => {
                        const level    = usageLevel(m.cpcUsagePct)
                        const color    = usageColor(m.cpcUsagePct)
                        const isOpen   = selectedId === m.campaignId

                        return (
                          <div key={m.campaignId}>
                            <div
                              onClick={() => setSelectedId(isOpen ? null : m.campaignId)}
                              className={`grid grid-cols-12 gap-2 items-center px-5 py-3 cursor-pointer transition-colors ${
                                isOpen ? 'bg-cyan-DEFAULT/5' : 'hover:bg-bg-hover'
                              }`}
                            >
                              {/* Campaña */}
                              <div className="col-span-3 flex items-center gap-2 min-w-0">
                                <StatusBadge level={level} />
                                <span className="num text-xs text-text-primary truncate">{m.campaignName}</span>
                              </div>
                              {/* Techo */}
                              <p className="col-span-1 num text-xs text-text-secondary">
                                {m.cpcCeiling !== null ? `${m.cpcCeiling.toFixed(2)} €` : '—'}
                              </p>
                              {/* CPC actual */}
                              <p className="col-span-1 num text-xs font-medium" style={{ color }}>
                                {m.avgCpc.toFixed(2)} €
                              </p>
                              {/* Barra de uso */}
                              <div className="col-span-3 flex items-center gap-2">
                                <div className="flex-1 h-2 bg-bg-border rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(100, m.cpcUsagePct ?? 0)}%`,
                                      backgroundColor: color,
                                    }}
                                  />
                                </div>
                                <span className="num text-[11px] w-9 text-right shrink-0" style={{ color }}>
                                  {m.cpcUsagePct !== null ? `${m.cpcUsagePct.toFixed(0)}%` : '—'}
                                </span>
                              </div>
                              {/* Status */}
                              <div className="col-span-1" />
                              {/* Clics */}
                              <p className="col-span-1 num text-xs text-text-secondary">
                                {m.clicks.toLocaleString('es-ES')}
                              </p>
                              {/* Coste */}
                              <p className="col-span-1 num text-xs text-text-secondary">
                                {m.costEur.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €
                              </p>
                            </div>

                            {/* Panel expandido: histórico CPC */}
                            {isOpen && (
                              <div className="px-5 pb-4 bg-cyan-DEFAULT/5 border-t border-bg-border">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 mb-3">
                                  <div className="bg-bg-base border border-bg-border rounded p-3">
                                    <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-1">CPC Actual</p>
                                    <p className="num text-xl font-bold" style={{ color: usageColor(m.cpcUsagePct) }}>
                                      {m.avgCpc.toFixed(2)} €
                                    </p>
                                  </div>
                                  <div className="bg-bg-base border border-bg-border rounded p-3">
                                    <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-1">CPC Techo</p>
                                    <p className="num text-xl font-bold text-text-primary">
                                      {m.cpcCeiling !== null ? `${m.cpcCeiling.toFixed(2)} €` : '—'}
                                    </p>
                                  </div>
                                  <div className="bg-bg-base border border-bg-border rounded p-3">
                                    <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-1">Margen</p>
                                    <p className={`num text-xl font-bold ${
                                      m.cpcCeiling !== null && m.cpcCeiling - m.avgCpc < 0.05
                                        ? 'text-red-DEFAULT'
                                        : 'text-green-DEFAULT'
                                    }`}>
                                      {m.cpcCeiling !== null
                                        ? `${(m.cpcCeiling - m.avgCpc).toFixed(2)} €`
                                        : '—'}
                                    </p>
                                  </div>
                                </div>
                                <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">
                                  Evolución CPC — últimos 30 días
                                </p>
                                <CpcHistoryMini
                                  campaignName={m.campaignName}
                                  cpcCeiling={m.cpcCeiling}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
