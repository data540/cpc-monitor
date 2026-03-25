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
      setCampaigns(j.metrics ?? [])
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

  // All fields already in correct units from CampaignMetrics
  const totalCost  = campaigns.reduce((s, m) => s + m.costEur, 0)
  const totalClics = campaigns.reduce((s, m) => s + m.clicks, 0)
  const totalImps  = campaigns.reduce((s, m) => s + m.impressions, 0)
  const globalCpc  = totalClics > 0 ? totalCost / totalClics : 0
  const roasCamps  = campaigns.filter(m => m.realRoas !== null)
  const globalRoas = roasCamps.length > 0
    ? roasCamps.reduce((s, m) => s + (m.realRoas ?? 0), 0) / roasCamps.length
    : 0
  const globalCtr  = totalImps > 0 ? totalClics / totalImps : 0

  // Chart data helpers
  const shortName = (n: string) => n.replace(/^AEU_[A-Z]{2}_[A-Z]{2}_/, '').slice(0, 20)

  const costChart = [...campaigns].sort((a, b) => b.costEur - a.costEur).slice(0, 12).map(m => ({
    name: shortName(m.campaignName),
    cost: +m.costEur.toFixed(2),
  }))

  const cpcChart = campaigns.filter(m => m.cpcUsagePct !== null).sort((a, b) => (b.cpcUsagePct ?? 0) - (a.cpcUsagePct ?? 0)).slice(0, 12).map(m => ({
    name: shortName(m.campaignName),
    cpc:  m.avgCpc,
    ceil: m.cpcCeiling ?? 0,
    color: (m.cpcUsagePct ?? 0) >= 90 ? '#EF4444' : (m.cpcUsagePct ?? 0) >= 70 ? '#F59E0B' : '#22C55E',
  }))

  const roasChart = campaigns.filter(m => m.realRoas !== null).sort((a, b) => (b.realRoas ?? 0) - (a.realRoas ?? 0)).slice(0, 12).map(m => ({
    name:   shortName(m.campaignName),
    roas:   m.realRoas!,
    target: m.targetRoas ?? undefined,
  }))

  const isChart = campaigns.filter(m => m.isActual !== null).map(m => ({
    name:       shortName(m.campaignName),
    is:         +((m.isActual ?? 0) * 100).toFixed(1),
    lostBudget: +((m.isLostBudget ?? 0) * 100).toFixed(1),
    lostRank:   +((m.isLostRank ?? 0) * 100).toFixed(1),
  }))

  // CSV exports
  const exportSummary = () => {
    const header = ['Campaña', 'Coste (€)', 'Clics', 'Impresiones', 'CTR', 'CPC Medio (€)', 'ROAS']
    const rows = campaigns.map(m => [
      m.campaignName,
      fmt(m.costEur),
      String(m.clicks),
      String(m.impressions),
      fmtPct(m.ctr / 100),
      fmt(m.avgCpc),
      m.realRoas !== null ? fmt(m.realRoas) : '—',
    ])
    downloadCSV(`reporte-resumen-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const exportCpc = () => {
    const header = ['Campaña', 'CPC Medio (€)', 'Techo CPC (€)', 'Uso (%)', 'Estado']
    const rows = campaigns.map(m => [
      m.campaignName,
      fmt(m.avgCpc),
      m.cpcCeiling !== null ? fmt(m.cpcCeiling) : '—',
      m.cpcUsagePct !== null ? `${m.cpcUsagePct.toFixed(1)}%` : '—',
      m.cpcUsagePct !== null ? (m.cpcUsagePct >= 90 ? 'CRÍTICO' : m.cpcUsagePct >= 70 ? 'AVISO' : 'OK') : '—',
    ])
    downloadCSV(`reporte-cpc-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const exportRoas = () => {
    const header = ['Campaña', 'ROAS', 'Target ROAS', 'Coste (€)']
    const rows = campaigns.map(m => [
      m.campaignName,
      m.realRoas !== null ? fmt(m.realRoas) : '—',
      m.targetRoas ? fmt(m.targetRoas) : '—',
      fmt(m.costEur),
    ])
    downloadCSV(`reporte-roas-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  const exportIs = () => {
    const header = ['Campaña', 'IS (%)', 'IS Perdido Presupuesto (%)', 'IS Perdido Ranking (%)']
    const rows = campaigns.map(m => [
      m.campaignName,
      m.isActual !== null ? fmtPct(m.isActual) : '—',
      m.isLostBudget !== null ? fmtPct(m.isLostBudget) : '—',
      m.isLostRank !== null ? fmtPct(m.isLostRank) : '—',
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
                  <p className="num text-[10px] text-text-tertiary tracking-widest uppercase">Resumen General — {campaigns.length} campañas</p>
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
                      {[...campaigns].sort((a, b) => b.costEur - a.costEur).map(m => (
                        <tr key={m.campaignId} className="border-t border-bg-border hover:bg-bg-hover">
                          <td className="num text-xs text-text-primary px-3 py-2 max-w-[200px] truncate">{m.campaignName}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{fmt(m.costEur)}€</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{m.clicks.toLocaleString('es-ES')}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{fmtPct(m.ctr / 100)}</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">{fmt(m.avgCpc)}€</td>
                          <td className="num text-xs text-text-secondary px-3 py-2 text-right">—</td>
                          <td className="num text-xs px-3 py-2 text-right" style={{ color: m.realRoas !== null ? (m.realRoas >= (m.targetRoas ?? 0) ? '#22C55E' : '#F59E0B') : '#666' }}>{m.realRoas !== null ? `${fmt(m.realRoas)}x` : '—'}</td>
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
