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

function roasColor(roas: number | null, target: number | null) {
  if (roas === null) return '#444'
  if (target === null) return '#67E8F9'
  const ratio = roas / target
  if (ratio >= 1)   return '#22C55E'
  if (ratio >= 0.8) return '#F59E0B'
  return '#EF4444'
}

function roasStatus(roas: number | null, target: number | null): 'above' | 'near' | 'below' | 'none' {
  if (roas === null || target === null) return 'none'
  const ratio = roas / target
  if (ratio >= 1)   return 'above'
  if (ratio >= 0.8) return 'near'
  return 'below'
}

function StatusBadge({ status }: { status: 'above' | 'near' | 'below' | 'none' }) {
  if (status === 'none') return null
  const cfg = {
    above: { cls: 'bg-green-DEFAULT/10 text-green-DEFAULT border-green-DEFAULT/30',              lbl: 'OK' },
    near:  { cls: 'bg-amber-DEFAULT/10 text-amber-DEFAULT border-amber-DEFAULT/30',              lbl: 'NEAR' },
    below: { cls: 'bg-red-DEFAULT/10 text-red-DEFAULT border-red-DEFAULT/30 pulse-alert',        lbl: 'BAJO' },
  }[status]
  return <span className={`num text-[9px] px-2 py-0.5 rounded-sm border tracking-widest shrink-0 ${cfg.cls}`}>{cfg.lbl}</span>
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs num shadow-lg">
      <p className="text-text-tertiary tracking-wider mb-1 truncate max-w-[200px]">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: {typeof p.value === 'number' ? `${p.value.toFixed(2)}x` : p.value}
        </p>
      ))}
    </div>
  )
}

function RoasHistoryMini({ campaignName, targetRoas }: { campaignName: string; targetRoas: number | null }) {
  const [data, setData] = useState<Array<{ date: string; roas: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignName) return
    setLoading(true)
    fetch(`/api/campaigns/history?campaignName=${encodeURIComponent(campaignName)}&days=30`)
      .then(r => r.json())
      .then(json => {
        const rows = (json.history ?? [])
          .map((h: any) => ({
            date: new Date(h.capturedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            roas: h.avgCpc && h.costEur ? 0 : 0, // placeholder until history has realRoas
          }))
          .filter((r: any) => r.date)
        setData(rows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [campaignName])

  if (loading) return <div className="h-[90px] flex items-center justify-center text-text-tertiary num text-xs">Cargando...</div>
  if (!data.length) return <div className="h-[90px] flex items-center justify-center text-text-tertiary num text-xs">Sin datos históricos de ROAS</div>

  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 9 }} />
        <YAxis tick={{ fill: '#666', fontSize: 9 }} />
        <Tooltip content={<CustomTooltip />} />
        {targetRoas && (
          <ReferenceLine y={targetRoas} stroke="#F59E0B" strokeDasharray="4 4"
            label={{ value: `Target ${targetRoas}x`, fill: '#F59E0B', fontSize: 9, position: 'insideTopRight' }} />
        )}
        <Line type="monotone" dataKey="roas" name="ROAS" stroke="#67E8F9" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  )
}

type SortKey = 'roas' | 'target' | 'cost'

export function RoasTrackerClient({ user }: Props) {
  const params = useSearchParams()
  const [customerId, setCustomerId] = useState(() => {
    const p = params.get('customerId')
    return p ? normalizeCustomerId(p) : DEFAULT_ID
  })
  const [inputId,    setInputId]    = useState(customerId)
  const [metrics,    setMetrics]    = useState<CampaignMetrics[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [sortKey,    setSortKey]    = useState<SortKey>('roas')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchMetrics = useCallback(async (cid: string) => {
    if (!isValidCustomerId(cid)) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/campaigns?customerId=${normalizeCustomerId(cid)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setMetrics(data.metrics ?? [])
      setLastUpdate(new Date())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (customerId) fetchMetrics(customerId) }, [customerId, fetchMetrics])

  const handleLoad = () => {
    const n = normalizeCustomerId(inputId)
    if (!isValidCustomerId(n)) { setError('Customer ID inválido'); return }
    setInputId(n); setCustomerId(n)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // All campaigns — show — for those without ROAS data
  const roasCampaigns = metrics

  const sorted = [...roasCampaigns].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'roas')   return ((a.realRoas ?? -Infinity) - (b.realRoas ?? -Infinity)) * dir
    if (sortKey === 'target') return ((a.targetRoas ?? -Infinity) - (b.targetRoas ?? -Infinity)) * dir
    if (sortKey === 'cost')   return (a.costEur - b.costEur) * dir
    return 0
  })

  // KPIs
  const totalCost   = metrics.reduce((s, m) => s + m.costEur, 0)
  const withRoas    = metrics.filter(m => m.realRoas !== null)
  const belowTarget = metrics.filter(m => roasStatus(m.realRoas, m.targetRoas) === 'below').length
  const aboveTarget = metrics.filter(m => roasStatus(m.realRoas, m.targetRoas) === 'above').length
  const avgRoas     = withRoas.length > 0
    ? withRoas.reduce((s, m) => s + (m.realRoas ?? 0), 0) / withRoas.length
    : null

  // Bar chart — top 15 by cost
  const chartData = [...roasCampaigns]
    .sort((a, b) => b.costEur - a.costEur)
    .slice(0, 15)
    .map(m => ({
      name:  m.campaignName.replace(/^AEU_[A-Z]{2}_[A-Z]{2}_/, '').slice(0, 22),
      roas:  m.realRoas ?? 0,
      target: m.targetRoas ?? undefined,
      color: roasColor(m.realRoas, m.targetRoas),
    }))

  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="num text-[9px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-right cursor-pointer hover:text-text-primary select-none"
      onClick={() => handleSort(col)}
    >
      {label}{sortKey === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="flex min-h-screen bg-bg-base">
      <AppSidebar
        activeSection="roas-tracker"
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
              <span className="num text-sm font-bold text-text-primary tracking-widest">ROAS_TRACKER</span>
              {customerId && <span className="num text-xs text-text-tertiary">#{customerId}</span>}
            </div>
            <div className="flex items-center gap-3">
              {belowTarget > 0 && (
                <span className="num text-[10px] bg-red-DEFAULT/10 text-red-DEFAULT border border-red-DEFAULT/30 px-2 py-0.5 rounded-sm tracking-wider pulse-alert">
                  {belowTarget} POR DEBAJO
                </span>
              )}
              <span className="num text-[10px] px-2 py-0.5 rounded-sm border border-bg-border text-text-tertiary tracking-wider">
                ROAS ANALYSIS
              </span>
            </div>
          </div>
        </header>

        <main className="px-6 py-6 flex-1 space-y-6">
          {error && (
            <div className="bg-red-DEFAULT/10 border border-red-DEFAULT/30 rounded-lg px-4 py-3">
              <p className="num text-xs text-red-DEFAULT">{error}</p>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              {
                label: 'ROAS Medio',
                value: avgRoas !== null ? `${avgRoas.toFixed(2)}x` : '—',
                sub:   `${roasCampaigns.length} campañas`,
                color: 'text-cyan-DEFAULT',
              },
              {
                label: 'Por Encima Target',
                value: String(aboveTarget),
                sub:   'Rindiendo bien',
                color: 'text-green-DEFAULT',
              },
              {
                label: 'Por Debajo Target',
                value: String(belowTarget),
                sub:   belowTarget > 0 ? 'Revisar urgente' : 'Sin alertas',
                color: belowTarget > 0 ? 'text-red-DEFAULT' : 'text-text-secondary',
              },
              {
                label: 'Coste Total',
                value: `${totalCost.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`,
                sub:   `${metrics.length} campañas activas`,
                color: 'text-text-primary',
              },
            ].map(k => (
              <div key={k.label} className="bg-bg-card border border-bg-border rounded-lg p-4">
                <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">{k.label}</p>
                <p className={`num text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="num text-[10px] text-text-tertiary mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          {chartData.length > 0 && (
            <div className="bg-bg-card border border-bg-border rounded-lg p-5">
              <p className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-4">ROAS por Campaña (Top 15 por Coste)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: '#666', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fill: '#888', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="roas" name="ROAS" radius={[0, 2, 2, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          {sorted.length > 0 && (
            <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bg-border">
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left">Campaña</th>
                    <Th col="roas"   label="ROAS" />
                    <Th col="target" label="Target" />
                    <Th col="cost"   label="Coste" />
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(m => {
                    const status      = roasStatus(m.realRoas, m.targetRoas)
                    const borderColor = { above: '#22C55E', near: '#F59E0B', below: '#EF4444', none: '#333' }[status]
                    const expanded    = expandedId === m.campaignId
                    return (
                      <>
                        <tr
                          key={m.campaignId}
                          className="border-b border-bg-border hover:bg-bg-hover cursor-pointer transition-colors"
                          style={{ borderLeft: `2px solid ${borderColor}` }}
                          onClick={() => setExpandedId(expanded ? null : m.campaignId)}
                        >
                          <td className="px-3 py-2.5">
                            <p className="num text-xs text-text-primary truncate max-w-[280px]">{m.campaignName}</p>
                            <p className="num text-[10px] text-text-tertiary">{m.recommendation?.level ?? '—'}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="num text-sm font-bold" style={{ color: roasColor(m.realRoas, m.targetRoas) }}>
                              {m.realRoas !== null ? `${m.realRoas.toFixed(2)}x` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="num text-xs text-text-secondary">
                              {m.targetRoas !== null ? `${m.targetRoas}x` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="num text-xs text-text-secondary">
                              {m.costEur.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${m.campaignId}-exp`} className="border-b border-bg-border bg-bg-base">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="grid grid-cols-3 gap-3 mb-4">
                                {[
                                  { label: 'ROAS Actual',  value: m.realRoas   !== null ? `${m.realRoas.toFixed(2)}x`   : '—', color: roasColor(m.realRoas, m.targetRoas) },
                                  { label: 'Target ROAS',  value: m.targetRoas !== null ? `${m.targetRoas}x`             : '—', color: '#F59E0B' },
                                  { label: 'Coste',        value: `${m.costEur.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€`, color: '#67E8F9' },
                                ].map(card => (
                                  <div key={card.label} className="bg-bg-card border border-bg-border rounded p-3 text-center">
                                    <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-1">{card.label}</p>
                                    <p className="num text-base font-bold" style={{ color: card.color }}>{card.value}</p>
                                  </div>
                                ))}
                              </div>
                              <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">Evolución ROAS (histórico)</p>
                              <RoasHistoryMini campaignName={m.campaignName} targetRoas={m.targetRoas} />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && metrics.length === 0 && customerId && (
            <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
              <p className="num text-text-tertiary text-sm tracking-wider">No hay datos disponibles para este Customer ID</p>
            </div>
          )}

          {!customerId && (
            <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
              <p className="num text-text-tertiary text-sm tracking-wider">Introduce un Customer ID en el panel izquierdo</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
