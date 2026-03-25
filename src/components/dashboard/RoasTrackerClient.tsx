'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, BarChart, Bar, Cell,
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
  if (ratio >= 1)    return '#22C55E'
  if (ratio >= 0.8)  return '#F59E0B'
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
    above: { cls: 'bg-green-DEFAULT/10 text-green-DEFAULT border-green-DEFAULT/30', lbl: 'OK' },
    near:  { cls: 'bg-amber-DEFAULT/10 text-amber-DEFAULT border-amber-DEFAULT/30',  lbl: 'NEAR' },
    below: { cls: 'bg-red-DEFAULT/10 text-red-DEFAULT border-red-DEFAULT/30 pulse-alert', lbl: 'BAJO' },
  }[status]
  return <span className={`num text-[9px] px-2 py-0.5 rounded-sm border tracking-widest shrink-0 ${cfg.cls}`}>{cfg.lbl}</span>
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs num shadow-lg">
      <p className="text-text-tertiary tracking-wider mb-1 truncate max-w-[180px]">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}x
        </p>
      ))}
    </div>
  )
}

function RoasHistoryMini({ campaignId, customerId, targetRoas }: { campaignId: string; customerId: string; targetRoas: number | null }) {
  const [data, setData] = useState<Array<{ date: string; roas: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId || !customerId) return
    setLoading(true)
    fetch(`/api/campaigns/history?customerId=${customerId}&campaignId=${campaignId}&days=30`)
      .then(r => r.json())
      .then(json => {
        const rows = (json.history ?? []).map((h: any) => ({
          date: h.date?.slice(5) ?? '',
          roas: h.conversionsValue && h.cost ? +(h.conversionsValue / h.cost).toFixed(2) : 0,
        })).filter((r: any) => r.roas > 0)
        setData(rows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [campaignId, customerId])

  if (loading) return <div className="h-[90px] flex items-center justify-center text-text-tertiary num text-xs">Cargando...</div>
  if (!data.length) return <div className="h-[90px] flex items-center justify-center text-text-tertiary num text-xs">Sin datos históricos</div>

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

type SortKey = 'roas' | 'target' | 'cost' | 'conversions'

export function RoasTrackerClient({ user }: Props) {
  const params = useSearchParams()
  const [customerId, setCustomerId] = useState(() => {
    const p = params.get('customerId')
    return p ? normalizeCustomerId(p) : DEFAULT_ID
  })
  const [inputId, setInputId] = useState(customerId)
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('roas')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async (cid: string) => {
    if (!isValidCustomerId(cid)) return
    setLoading(true)
    try {
      const r = await fetch(`/api/campaigns?customerId=${normalizeCustomerId(cid)}`)
      const j = await r.json()
      setCampaigns(j.campaigns ?? [])
      setLastUpdate(new Date())
    } catch { }
    setLoading(false)
  }, [])

  useEffect(() => { if (customerId) load(customerId) }, [customerId, load])

  const handleLoad = () => {
    const n = normalizeCustomerId(inputId)
    setCustomerId(n)
    load(n)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Campaigns with ROAS data
  const roasCampaigns = campaigns
    .filter(c => (c.conversionsValue ?? 0) > 0 || (c.conversions ?? 0) > 0)
    .map(c => {
      const cost = c.costMicros ? c.costMicros / 1_000_000 : 0
      const roas = cost > 0 && c.conversionsValue ? +(c.conversionsValue / cost).toFixed(2) : null
      const targetRoas = c.targetRoas ?? null
      return { ...c, roas, targetRoas, cost }
    })

  const sorted = [...roasCampaigns].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'roas')        return ((a.roas ?? -Infinity) - (b.roas ?? -Infinity)) * dir
    if (sortKey === 'target')      return ((a.targetRoas ?? -Infinity) - (b.targetRoas ?? -Infinity)) * dir
    if (sortKey === 'cost')        return (a.cost - b.cost) * dir
    if (sortKey === 'conversions') return ((a.conversions ?? 0) - (b.conversions ?? 0)) * dir
    return 0
  })

  // KPIs
  const totalCost = roasCampaigns.reduce((s, c) => s + c.cost, 0)
  const totalValue = roasCampaigns.reduce((s, c) => s + (c.conversionsValue ?? 0), 0)
  const globalRoas = totalCost > 0 ? +(totalValue / totalCost).toFixed(2) : null
  const belowTarget = roasCampaigns.filter(c => roasStatus(c.roas, c.targetRoas) === 'below').length
  const aboveTarget = roasCampaigns.filter(c => roasStatus(c.roas, c.targetRoas) === 'above').length

  // Bar chart data — top 15 by cost
  const chartData = [...roasCampaigns]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15)
    .map(c => ({
      name: c.name.length > 22 ? c.name.slice(0, 22) + '…' : c.name,
      roas: c.roas ?? 0,
      target: c.targetRoas ?? undefined,
      color: roasColor(c.roas, c.targetRoas),
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
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <AppSidebar
        activeSection="roas-tracker"
        customerId={customerId}
        inputId={inputId}
        onInputChange={setInputId}
        onLoad={handleLoad}
        lastUpdate={lastUpdate}
        loading={loading}
        onRefresh={() => load(customerId)}
      />

      <main className="ml-[220px] flex-1 overflow-y-auto px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="num text-[10px] text-text-tertiary tracking-[0.2em] uppercase mb-1">Analytics › ROAS Tracker</p>
            <h1 className="num text-xl font-bold text-text-primary tracking-wide">ROAS Tracker</h1>
          </div>
          {lastUpdate && (
            <p className="num text-[10px] text-text-tertiary tracking-wider">
              SYNC {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'ROAS Global',
              value: globalRoas !== null ? `${globalRoas}x` : '—',
              sub: `${roasCampaigns.length} campañas`,
              color: 'text-cyan-DEFAULT',
            },
            {
              label: 'Por Encima Target',
              value: String(aboveTarget),
              sub: 'Rindiendo bien',
              color: 'text-green-DEFAULT',
            },
            {
              label: 'Por Debajo Target',
              value: String(belowTarget),
              sub: belowTarget > 0 ? 'Revisar urgente' : 'Sin alertas',
              color: belowTarget > 0 ? 'text-red-DEFAULT' : 'text-text-secondary',
            },
            {
              label: 'Valor Total Conv.',
              value: `${totalValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`,
              sub: `Coste ${totalCost.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`,
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

        {/* ROAS Bar Chart */}
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
                  <Th col="roas"        label="ROAS" />
                  <Th col="target"      label="Target" />
                  <Th col="cost"        label="Coste" />
                  <Th col="conversions" label="Conv." />
                  <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const status = roasStatus(c.roas, c.targetRoas)
                  const borderColor = { above: '#22C55E', near: '#F59E0B', below: '#EF4444', none: '#333' }[status]
                  const expanded = expandedId === c.id
                  return (
                    <>
                      <tr
                        key={c.id}
                        className="border-b border-bg-border hover:bg-bg-hover cursor-pointer transition-colors"
                        style={{ borderLeft: `2px solid ${borderColor}` }}
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                      >
                        <td className="px-3 py-2.5">
                          <p className="num text-xs text-text-primary truncate max-w-[260px]">{c.name}</p>
                          <p className="num text-[10px] text-text-tertiary">{c.biddingStrategyType ?? '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="num text-sm font-bold" style={{ color: roasColor(c.roas, c.targetRoas) }}>
                            {c.roas !== null ? `${c.roas}x` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="num text-xs text-text-secondary">
                            {c.targetRoas !== null ? `${c.targetRoas}x` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="num text-xs text-text-secondary">
                            {c.cost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="num text-xs text-text-secondary">{c.conversions?.toFixed(1) ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <StatusBadge status={status} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${c.id}-exp`} className="border-b border-bg-border bg-bg-base">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              {[
                                { label: 'ROAS Actual', value: c.roas !== null ? `${c.roas}x` : '—', color: roasColor(c.roas, c.targetRoas) },
                                { label: 'Target ROAS', value: c.targetRoas !== null ? `${c.targetRoas}x` : '—', color: '#F59E0B' },
                                { label: 'Valor Conv.', value: c.conversionsValue ? `${c.conversionsValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` : '—', color: '#67E8F9' },
                              ].map(m => (
                                <div key={m.label} className="bg-bg-card border border-bg-border rounded p-3 text-center">
                                  <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-1">{m.label}</p>
                                  <p className="num text-base font-bold" style={{ color: m.color }}>{m.value}</p>
                                </div>
                              ))}
                            </div>
                            <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">Evolución ROAS (30 días)</p>
                            <RoasHistoryMini
                              campaignId={c.id}
                              customerId={customerId}
                              targetRoas={c.targetRoas}
                            />
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

        {!loading && roasCampaigns.length === 0 && customerId && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-text-tertiary text-sm tracking-wider">No hay datos de conversión disponibles</p>
          </div>
        )}

        {!customerId && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-text-tertiary text-sm tracking-wider">Introduce un Customer ID en el panel izquierdo</p>
          </div>
        )}
      </main>
    </div>
  )
}
