'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Cell,
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

type ReportType = 'summary' | 'cpc' | 'roas' | 'is'

function fmt(n: number, decimals = 2) { return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) }
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%` }

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs num shadow-lg">
      <p className="text-text-tertiary tracking-wider mb-1 truncate max-w-[200px]">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: {typeof p.value === 'number' ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="num text-[10px] px-3 py-1.5 rounded border border-bg-border text-text-tertiary hover:text-text-primary hover:border-cyan-DEFAULT/40 transition-colors tracking-widest uppercase"
    >
      {label}
    </button>
  )
}

function downloadCSV(filename: string, rows: string[][]) {
  const content = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function ReportsClient({ user }: Props) {
  const params = useSearchParams()
  const [customerId, setCustomerId] = useState(() => {
    const p = params.get('customerId')
    return p ? normalizeCustomerId(p) : DEFAULT_ID
  })
  const [inputId, setInputId] = useState(customerId)
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [activeReport, setActiveReport] = useState<ReportType>('summary')

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

  // Derived metrics
  const enriched = campaigns.map(c => {
    const cost = c.costMicros ? c.costMicros / 1_000_000 : 0
    const cpc  = c.averageCpc ? c.averageCpc / 1_000_000 : null
    const ceil = c.cpcBidCeilingMicros ? c.cpcBidCeilingMicros / 1_000_000 : null
    const roas = cost > 0 && c.conversionsValue ? +(c.conversionsValue / cost).toFixed(2) : null
    const cpcUsage = cpc !== null && ceil !== null && ceil > 0 ? cpc / ceil : null
    return { ...c, cost, cpc, ceil, roas, cpcUsage }
  })

  const totalCost  = enriched.reduce((s, c) => s + c.cost, 0)
  const totalClics = enriched.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const totalImps  = enriched.reduce((s, c) => s + (c.impressions ?? 0), 0)
  const totalConv  = enriched.reduce((s, c) => s + (c.conversions ?? 0), 0)
  const totalValue = enriched.reduce((s, c) => s + (c.conversionsValue ?? 0), 0)
  const globalCpc  = totalClics > 0 ? totalCost / totalClics : 0
  const globalRoas = totalCost > 0 ? totalValue / totalCost : 0
  const globalCtr  = totalImps > 0 ? totalClics / totalImps : 0

  // Chart data helpers
  const costChart = [...enriched].sort((a, b) => b.cost - a.cost).slice(0, 12).map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    cost: +c.cost.toFixed(2),
  }))

  const cpcChart = enriched.filter(c => c.cpc !== null).sort((a, b) => (b.cpcUsage ?? 0) - (a.cpcUsage ?? 0)).slice(0, 12).map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    cpc: c.cpc!,
    ceil: c.ceil ?? 0,
    color: (c.cpcUsage ?? 0) >= 0.9 ? '#EF4444' : (c.cpcUsage ?? 0) >= 0.7 ? '#F59E0B' : '#22C55E',
  }))

  const roasChart = enriched.filter(c => c.roas !== null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0)).slice(0, 12).map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    roas: c.roas!,
    target: c.targetRoas ?? undefined,
  }))

  const isChart = enriched.filter(c => c.searchImpressionShare !== undefined).map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    is: +((c.searchImpressionShare ?? 0) * 100).toFixed(1),
    lostBudget: +((c.searchBudgetLostImpressionShare ?? 0) * 100).toFixed(1),
    lostRank: +((c.searchRankLostImpressionShare ?? 0) * 100).toFixed(1),
  }))

  // CSV exports
  const exportSummary = () => {
    const header = ['Campaña', 'Coste (€)', 'Clics', 'Impresiones', 'CTR', 'CPC Medio (€)', 'Conversiones', 'Valor Conv. (€)', 'ROAS']
    const rows = enriched.map(c => [
      c.name,
      fmt(c.cost),
      String(c.clicks ?? 0),
      String(c.impressions ?? 0),
      fmtPct(c.impressions ? (c.clicks ?? 0) / c.impressions : 0),
      c.cpc !== null ? fmt(c.cpc) : '—',
      String(c.conversions?.toFixed(1) ?? '—'),
      c.conversionsValue ? fmt(c.conversionsValue) : '—',
      c.roas !== null ? fmt(c.roas) : '—',
    ])
    downloadCSV(`reporte-resumen-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const exportCpc = () => {
    const header = ['Campaña', 'CPC Medio (€)', 'Techo CPC (€)', 'Uso (%)', 'Estado']
    const rows = enriched.map(c => [
      c.name,
      c.cpc !== null ? fmt(c.cpc) : '—',
      c.ceil !== null ? fmt(c.ceil) : '—',
      c.cpcUsage !== null ? fmtPct(c.cpcUsage) : '—',
      c.cpcUsage !== null ? (c.cpcUsage >= 0.9 ? 'CRÍTICO' : c.cpcUsage >= 0.7 ? 'AVISO' : 'OK') : '—',
    ])
    downloadCSV(`reporte-cpc-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const exportRoas = () => {
    const header = ['Campaña', 'ROAS', 'Target ROAS', 'Coste (€)', 'Valor Conv. (€)', 'Conversiones']
    const rows = enriched.map(c => [
      c.name,
      c.roas !== null ? fmt(c.roas) : '—',
      c.targetRoas ? fmt(c.targetRoas) : '—',
      fmt(c.cost),
      c.conversionsValue ? fmt(c.conversionsValue) : '—',
      c.conversions?.toFixed(1) ?? '—',
    ])
    downloadCSV(`reporte-roas-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const exportIs = () => {
    const header = ['Campaña', 'IS (%)', 'IS Perdido Presupuesto (%)', 'IS Perdido Ranking (%)']
    const rows = enriched.map(c => [
      c.name,
      c.searchImpressionShare !== undefined ? fmtPct(c.searchImpressionShare) : '—',
      c.searchBudgetLostImpressionShare !== undefined ? fmtPct(c.searchBudgetLostImpressionShare) : '—',
      c.searchRankLostImpressionShare !== undefined ? fmtPct(c.searchRankLostImpressionShare) : '—',
    ])
    downloadCSV(`reporte-is-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const reports: { key: ReportType; label: string; desc: string }[] = [
    { key: 'summary', label: 'Resumen General', desc: 'Coste, clics, CTR y conversiones por campaña' },
    { key: 'cpc',     label: 'Análisis CPC',    desc: 'CPC medio vs techo y nivel de uso' },
    { key: 'roas',    label: 'ROAS Tracker',    desc: 'ROAS actual vs objetivo por campaña' },
    { key: 'is',      label: 'IS Monitor',      desc: 'Impression Share y causas de pérdida' },
  ]

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <AppSidebar
        activeSection="reports"
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
            <p className="num text-[10px] text-text-tertiary tracking-[0.2em] uppercase mb-1">System › Reportes</p>
            <h1 className="num text-xl font-bold text-text-primary tracking-wide">Reportes</h1>
          </div>
          {lastUpdate && (
            <p className="num text-[10px] text-text-tertiary tracking-wider">
              SYNC {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>

        {campaigns.length > 0 && (
          <>
            {/* Global KPIs */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Coste Total',  value: `${fmt(totalCost, 0)}€`,        color: 'text-text-primary' },
                { label: 'Clics',        value: totalClics.toLocaleString('es-ES'), color: 'text-cyan-DEFAULT' },
                { label: 'CTR',          value: fmtPct(globalCtr),              color: 'text-text-primary' },
                { label: 'CPC Medio',    value: `${fmt(globalCpc)}€`,           color: 'text-text-primary' },
                { label: 'ROAS Global',  value: `${fmt(globalRoas)}x`,          color: globalRoas >= 1 ? 'text-green-DEFAULT' : 'text-amber-DEFAULT' },
              ].map(k => (
                <div key={k.label} className="bg-bg-card border border-bg-border rounded-lg p-3">
                  <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-1">{k.label}</p>
                  <p className={`num text-lg font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Report Selector */}
            <div className="grid grid-cols-4 gap-3">
              {reports.map(r => (
                <button
                  key={r.key}
                  onClick={() => setActiveReport(r.key)}
                  className={`bg-bg-card border rounded-lg p-4 text-left transition-all hover:bg-bg-hover ${
                    activeReport === r.key ? 'border-cyan-DEFAULT/50' : 'border-bg-border'
                  }`}
                >
                  <p className={`num text-xs font-bold mb-1 ${activeReport === r.key ? 'text-cyan-DEFAULT' : 'text-text-primary'}`}>{r.label}</p>
                  <p className="num text-[10px] text-text-tertiary">{r.desc}</p>
                </button>
              ))}
            </div>

            {/* Report Content */}
            {activeReport === 'summary' && (
              <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-bg-border flex items-center justify-between">
                  <p className="num text-[10px] text-text-tertiary tracking-widest uppercase">Resumen General — {enriched.length} campañas</p>
                  <ExportButton label="Exportar CSV" onClick={exportSummary} />
                </div>
                <div className="p-5">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={costChart} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fill: '#666', fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="cost" name="Coste (€)" fill="#67E8F9" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-t border-bg-border">
                        {['Campaña', 'Coste', 'Clics', 'CTR', 'CPC Medio', 'Conv.', 'ROAS'].map(h => (
                          <th key={h} className="num text-[9px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-right first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enriched.sort((a, b) => b.cost - a.cost).map(c => (
                        <tr key={c.id} className="border-t border-bg-border hover:bg-bg-hover">
                          <td className="num text-xs text-text-primary px-3 py-2 max-w-[200px] truncate">{c.name}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{fmt(c.cost)}€</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{(c.clicks ?? 0).toLocaleString('es-ES')}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{fmtPct(c.impressions ? (c.clicks ?? 0) / c.impressions : 0)}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{c.cpc !== null ? `${fmt(c.cpc)}€` : '—'}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{c.conversions?.toFixed(1) ?? '—'}</td>
                          <td className="num text-xs px-3 py-2 text-right" style={{ color: c.roas !== null ? (c.roas >= (c.targetRoas ?? 0) ? '#22C55E' : '#F59E0B') : '#666' }}>{c.roas !== null ? `${fmt(c.roas)}x` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeReport === 'cpc' && (
              <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-bg-border flex items-center justify-between">
                  <p className="num text-[10px] text-text-tertiary tracking-widest uppercase">Análisis CPC — Uso vs Techo</p>
                  <ExportButton label="Exportar CSV" onClick={exportCpc} />
                </div>
                <div className="p-5">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cpcChart} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: '#666', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={180} tick={{ fill: '#888', fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="cpc" name="CPC Medio (€)" radius={[0, 2, 2, 0]}>
                        {cpcChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Bar>
                      <Bar dataKey="ceil" name="Techo CPC (€)" fill="#333" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeReport === 'roas' && (
              <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-bg-border flex items-center justify-between">
                  <p className="num text-[10px] text-text-tertiary tracking-widest uppercase">ROAS por Campaña</p>
                  <ExportButton label="Exportar CSV" onClick={exportRoas} />
                </div>
                <div className="p-5">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={roasChart} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: '#666', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={180} tick={{ fill: '#888', fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="roas" name="ROAS" fill="#22C55E" radius={[0, 2, 2, 0]}>
                        {roasChart.map((e, i) => (
                          <Cell key={i} fill={e.target ? (e.roas >= e.target ? '#22C55E' : e.roas >= e.target * 0.8 ? '#F59E0B' : '#EF4444') : '#67E8F9'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeReport === 'is' && (
              <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-bg-border flex items-center justify-between">
                  <p className="num text-[10px] text-text-tertiary tracking-widest uppercase">Impression Share — Desglose</p>
                  <ExportButton label="Exportar CSV" onClick={exportIs} />
                </div>
                <div className="p-5">
                  {isChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={isChart} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={{ fill: '#666', fontSize: 10 }} unit="%" />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="is"          name="IS"              fill="#67E8F9" stackId="a" />
                        <Bar dataKey="lostBudget"  name="Perdido Presup." fill="#EF4444" stackId="a" />
                        <Bar dataKey="lostRank"    name="Perdido Ranking" fill="#F59E0B" stackId="a" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="num text-text-tertiary text-xs text-center py-8">Sin datos de IS disponibles</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && campaigns.length === 0 && customerId && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-text-tertiary text-sm tracking-wider">Carga datos con el Customer ID del panel izquierdo</p>
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
