'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccountContext } from '@/contexts/AccountContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import { AppSidebar } from '@/components/layout/AppSidebar'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

const ENV_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''
function normalizeCustomerId(v: string) { return v.replace(/-/g, '').trim() }
function isValidCustomerId(v: string)   { return /^\d{10}$/.test(normalizeCustomerId(v)) }
const DEFAULT_ID = isValidCustomerId(ENV_CUSTOMER_ID) ? normalizeCustomerId(ENV_CUSTOMER_ID) : ''

interface AuctionRow {
  domain: string
  impressionShare: number
  overlapRate: number
  outrankedRate: number
  positionAboveRate: number
  topOfPageRate: number
  absTopOfPageRate: number
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }

function MetricBar({ value, color = '#67E8F9' }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
      <span className="num text-[10px] text-text-secondary w-10 text-right">{pct(value)}</span>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs num shadow-lg">
      <p className="text-text-tertiary tracking-wider mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill ?? p.color }}>{p.name}: {pct(p.value)}</p>
      ))}
    </div>
  )
}

export function AuctionInsightsClient({ user }: Props) {
  const { selectedIds } = useAccountContext()
  const [loading,    setLoading]    = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [data,       setData]       = useState<AuctionRow[]>([])
  const [noData,     setNoData]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const load = useCallback(async (cids: string[]) => {
    const valid = cids.filter(isValidCustomerId)
    if (!valid.length) return
    setLoading(true); setError(null); setNoData(false)
    try {
      // Use first selected account for auction insights
      const cid = valid[0]
      const res = await fetch(`/api/auction-insights?customerId=${cid}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.reauth
          ? 'Sesión expirada. Vuelve a conectar tu cuenta de Google Ads.'
          : (body.error ?? `Error ${res.status}`)
        )
        return
      }
      const json = await res.json()
      if (json.noData || !json.entries?.length) {
        setNoData(true); setData([])
      } else {
        setData(json.entries.map((e: any) => ({
          domain:            e.isOwnAccount ? 'Tu cuenta' : e.domain,
          impressionShare:   e.impressionShare,
          overlapRate:       e.overlapRate,
          outrankedRate:     e.outrankedRate,
          positionAboveRate: e.positionAboveRate,
          topOfPageRate:     e.topOfPageRate,
          absTopOfPageRate:  e.absTopOfPageRate,
        })))
      }
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message ?? 'Error de red')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedIds.length > 0) load(selectedIds)
    else { setData([]); setNoData(false) }
  }, [selectedIds, load])

  const isData = data.length > 0
  const myRow = data[0]

  const isChartData = data.map(d => ({ name: d.domain === 'Tu cuenta' ? 'TU CUENTA' : d.domain, is: d.impressionShare }))
  const overlapData = data.filter(d => d.domain !== 'Tu cuenta').map(d => ({ name: d.domain, overlap: d.overlapRate, outranked: d.outrankedRate }))

  const radarData = myRow ? [
    { metric: 'Imp. Share', value: myRow.impressionShare * 100 },
    { metric: 'Top Page', value: myRow.topOfPageRate * 100 },
    { metric: 'Abs Top', value: myRow.absTopOfPageRate * 100 },
    { metric: 'vs Competition', value: (1 - (myRow.outrankedRate ?? 0)) * 100 },
    { metric: 'Overlap', value: 50 },
  ] : []

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <AppSidebar
        activeSection="auction-insights"
        lastUpdate={lastUpdate}
        loading={loading}
        onRefresh={() => load(selectedIds)}
      />

      <main className="ml-[240px] flex-1 overflow-y-auto px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="num text-[10px] text-text-tertiary tracking-[0.2em] uppercase mb-1">Analytics › Auction Insights</p>
            <h1 className="num text-xl font-bold text-text-primary tracking-wide">Auction Insights</h1>
          </div>
          <div className="flex items-center gap-3">
            {noData
              ? <span className="num text-[9px] bg-amber-DEFAULT/10 text-amber-DEFAULT border border-amber-DEFAULT/30 px-2 py-1 rounded tracking-widest">SIN DATOS</span>
              : data.length > 0
                ? <span className="num text-[9px] bg-green-DEFAULT/10 text-green-DEFAULT border border-green-DEFAULT/30 px-2 py-1 rounded tracking-widest">LIVE</span>
                : null
            }
            {lastUpdate && (
              <p className="num text-[10px] text-text-tertiary tracking-wider">
                SYNC {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
          </div>
        </div>

        {isData && myRow && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Impression Share', value: pct(myRow.impressionShare), color: 'text-cyan-DEFAULT' },
                { label: 'Top of Page Rate', value: pct(myRow.topOfPageRate), color: 'text-green-DEFAULT' },
                { label: 'Abs. Top of Page', value: pct(myRow.absTopOfPageRate), color: 'text-text-primary' },
                { label: 'Competidores', value: String(data.length - 1), color: 'text-amber-DEFAULT' },
              ].map(k => (
                <div key={k.label} className="bg-bg-card border border-bg-border rounded-lg p-4">
                  <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">{k.label}</p>
                  <p className={`num text-2xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* IS Comparison Chart */}
              <div className="bg-bg-card border border-bg-border rounded-lg p-5">
                <p className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-4">Impression Share — Comparativa</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={isChartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#666', fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#888', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="is" name="IS" radius={[0, 2, 2, 0]}>
                      {isChartData.map((e, i) => (
                        <Cell key={i} fill={i === 0 ? '#67E8F9' : '#555'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Radar Chart */}
              <div className="bg-bg-card border border-bg-border rounded-lg p-5">
                <p className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-4">Perfil de Competitividad</p>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#888', fontSize: 10 }} />
                    <Radar name="Tu cuenta" dataKey="value" stroke="#67E8F9" fill="#67E8F9" fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Competitor Table */}
            <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-bg-border">
                <p className="num text-[10px] text-text-tertiary tracking-widest uppercase">Detalle por Competidor</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bg-border">
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-4 py-2 text-left">Dominio</th>
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-4 py-2 text-left">Imp. Share</th>
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-4 py-2 text-left">Overlap Rate</th>
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-4 py-2 text-left">Outranked By</th>
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-4 py-2 text-left">Top Page Rate</th>
                    <th className="num text-[9px] text-text-tertiary tracking-widest uppercase px-4 py-2 text-left">Abs. Top</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.domain} className="border-b border-bg-border hover:bg-bg-hover transition-colors"
                      style={{ borderLeft: `2px solid ${i === 0 ? '#67E8F9' : '#333'}` }}>
                      <td className="px-4 py-3">
                        <span className={`num text-xs ${i === 0 ? 'text-cyan-DEFAULT font-bold' : 'text-text-primary'}`}>{row.domain}</span>
                      </td>
                      <td className="px-4 py-3 min-w-[120px]"><MetricBar value={row.impressionShare} color={i === 0 ? '#67E8F9' : '#888'} /></td>
                      <td className="px-4 py-3 min-w-[120px]"><MetricBar value={row.overlapRate} color="#F59E0B" /></td>
                      <td className="px-4 py-3 min-w-[120px]"><MetricBar value={row.outrankedRate} color="#EF4444" /></td>
                      <td className="px-4 py-3 min-w-[120px]"><MetricBar value={row.topOfPageRate} color="#22C55E" /></td>
                      <td className="px-4 py-3 min-w-[120px]"><MetricBar value={row.absTopOfPageRate} color="#A78BFA" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {noData && (
              <div className="bg-bg-card border border-amber-DEFAULT/20 rounded-lg p-4">
                <p className="num text-[10px] text-amber-DEFAULT tracking-wider">
                  ⚠ Sin datos de Auction Insights para este período. Ocurre cuando el tráfico es insuficiente o los datos aún no están disponibles (retardo de 24-48h). Prueba con un rango de fechas más amplio.
                </p>
              </div>
            )}
            {error && (
              <div className="bg-bg-card border border-red-500/20 rounded-lg p-4">
                <p className="num text-[10px] text-red-400 tracking-wider">⚠ {error}</p>
              </div>
            )}
          </>
        )}

        {selectedIds.length === 0 && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-text-tertiary text-sm tracking-wider">Selecciona una cuenta en el panel izquierdo</p>
          </div>
        )}

        {selectedIds.length > 0 && noData && !loading && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-text-tertiary text-sm tracking-wider">Sin datos de Auction Insights para este período o cuenta.</p>
          </div>
        )}

        {selectedIds.length > 0 && error && !loading && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-red-400 text-sm tracking-wider">{error}</p>
          </div>
        )}
      </main>
    </div>
  )
}
