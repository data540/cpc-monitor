'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { CpcDistributionData, CampaignMetrics, ExpertRecommendation } from '@/types'
import clsx from 'clsx'

interface CampaignDetailModalProps {
  campaign:    CampaignMetrics | null
  customerId:  string
  onClose:     () => void
  initialTab?: ActiveTab
}

type DatePreset = '7days' | '30days' | '90days' | 'custom'
type ActiveTab  = 'distribution' | 'hourly' | 'expert'

// ── Helpers de presentación ───────────────────────────────────

const SCENARIO_LABEL: Record<ExpertRecommendation['scenario'], string> = {
  raise_losing_traffic:  'Subir — tráfico rentable perdido',
  raise_constrained:     'Subir — techo saturado',
  lower_underperforming: 'Bajar — ROAS por debajo del objetivo',
  hold_no_ceiling:       'Sin techo — propuesta inicial',
  hold_stable:            'Mantener — situación equilibrada',
  hold_budget_bottleneck: 'Mantener — cuello de botella es el presupuesto',
  is_below_threshold:    '⚠ Alerta — IS por debajo del umbral',
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

export function CampaignDetailModal({
  campaign,
  customerId,
  onClose,
  initialTab = 'distribution',
}: CampaignDetailModalProps) {
  const [activeTab,    setActiveTab]    = useState<ActiveTab>(initialTab)
  const [datePreset,   setDatePreset]   = useState<DatePreset>('30days')
  const [customStart,  setCustomStart]  = useState('')
  const [customEnd,    setCustomEnd]    = useState('')
  const [data,         setData]         = useState<CpcDistributionData | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Estado del panel experto
  const [expert,        setExpert]        = useState<ExpertRecommendation | null>(null)
  const [expertLoading, setExpertLoading] = useState(false)
  const [expertError,   setExpertError]   = useState<string | null>(null)
  const [applying,      setApplying]      = useState(false)
  const [applied,       setApplied]       = useState(false)
  const [confirming,    setConfirming]    = useState(false)

  // Calcular rango de fechas
  const getDateRange = () => {
    const end   = new Date()
    let   start = new Date()

    switch (datePreset) {
      case '7days':  start.setDate(start.getDate() - 7);  break
      case '30days': start.setDate(start.getDate() - 30); break
      case '90days': start.setDate(start.getDate() - 90); break
      case 'custom':
        if (!customStart || !customEnd) return null
        start = new Date(customStart)
        end.setDate(new Date(customEnd).getDate() + 1)
        break
    }

    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return { start: fmt(start), end: fmt(end) }
  }

  // Fetch distribución de CPC
  useEffect(() => {
    if (!campaign) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const dateRange = getDateRange()
        if (!dateRange) {
          setError('Selecciona rango de fechas válido')
          setLoading(false)
          return
        }

        const params = new URLSearchParams({
          customerId,
          startDate: dateRange.start,
          endDate:   dateRange.end,
        })

        const res = await fetch(
          `/api/campaigns/${campaign.campaignId}/cpc-distribution?${params}`
        )

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error ?? `HTTP ${res.status}`)
        }

        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error fetching data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [campaign, customerId, datePreset, customStart, customEnd])

  // Reset estado al cambiar de campaña
  useEffect(() => {
    setExpert(null)
    setExpertError(null)
    setApplied(false)
    setActiveTab(initialTab)
  }, [campaign?.campaignId])

  // Fetch recomendación experta
  const fetchExpert = async () => {
    if (!campaign) return
    try {
      setExpertLoading(true)
      setExpertError(null)
      setApplied(false)

      const dateRange = getDateRange()
      const params = new URLSearchParams({ customerId })
      if (dateRange) {
        params.set('startDate', dateRange.start)
        params.set('endDate',   dateRange.end)
      }

      const res = await fetch(
        `/api/campaigns/${campaign.campaignId}/expert-recommendation?${params}`
      )

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }

      const json = await res.json()
      setExpert(json.recommendation)
    } catch (err) {
      setExpertError(err instanceof Error ? err.message : 'Error al calcular recomendación')
    } finally {
      setExpertLoading(false)
    }
  }

  // Aplicar recomendación → guarda en BD vía bulk-update
  const applyRecommendation = async () => {
    if (!campaign || !expert) return
    try {
      setApplying(true)
      const res = await fetch('/api/campaigns/bulk-update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          campaigns: [{
            campaignName:  campaign.campaignName,
            newCpcCeiling: expert.suggestedCeiling,
          }],
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }

      setApplied(true)
    } catch (err) {
      setExpertError(err instanceof Error ? err.message : 'Error al aplicar')
    } finally {
      setApplying(false)
    }
  }

  if (!campaign) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={clsx(
        'fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#0f0f0f] shadow-lg',
        'transform transition-transform duration-300 overflow-hidden flex flex-col',
        'translate-x-0'
      )}>

        {/* Header */}
        <div className="border-b border-[#2a2a2a] p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">{campaign.campaignName}</h2>
            <p className="text-xs text-[#999] mt-1">Análisis de distribución de CPC por hora</p>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-white transition text-xl">
            ✕
          </button>
        </div>

        {/* Date Range Selector */}
        <div className="border-b border-[#2a2a2a] p-6 space-y-3">
          <div className="flex gap-2">
            {(['7days', '30days', '90days'] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => { setDatePreset(preset); setCustomStart(''); setCustomEnd('') }}
                className={clsx(
                  'px-3 py-1 rounded text-xs font-medium transition',
                  datePreset === preset
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#2a2a2a] text-[#ccc] hover:bg-[#333]'
                )}
              >
                {preset === '7days' ? '7 días' : preset === '30days' ? '30 días' : '90 días'}
              </button>
            ))}
            <button
              onClick={() => setDatePreset('custom')}
              className={clsx(
                'px-3 py-1 rounded text-xs font-medium transition',
                datePreset === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2a2a2a] text-[#ccc] hover:bg-[#333]'
              )}
            >
              Personalizado
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex gap-2 mt-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {loading && (
            <div className="flex items-center justify-center h-64">
              <p className="text-[#999]">Cargando análisis...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Estadísticas Resumen */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Estadísticas</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Min CPC',       `€${data.stats.minCpc.toFixed(3)}`],
                    ['Max CPC',       `€${data.stats.maxCpc.toFixed(3)}`],
                    ['Promedio',      `€${data.stats.avgCpc.toFixed(3)}`],
                    ['Mediana (p50)', `€${data.stats.medianCpc.toFixed(3)}`],
                    ['P10',           `€${data.stats.p10.toFixed(3)}`],
                    ['P25',           `€${data.stats.p25.toFixed(3)}`],
                    ['P75',           `€${data.stats.p75.toFixed(3)}`],
                    ['P90',           `€${data.stats.p90.toFixed(3)}`],
                    ['Desv. Estándar',`€${data.stats.stdDev.toFixed(3)}`],
                    ['Total Clics',   `${data.stats.totalClicks}`],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                      <p className="text-[#999] mb-1">{label}</p>
                      <p className="text-white font-mono">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div>
                <div className="flex gap-2 border-b border-[#2a2a2a] mb-4">
                  <TabBtn label="Distribución"    tab="distribution" active={activeTab} onClick={setActiveTab} />
                  <TabBtn
                    label={data.temporalMode === 'weekly' ? 'Análisis Semanal' : 'Análisis Horario'}
                    tab="hourly"
                    active={activeTab}
                    onClick={setActiveTab}
                  />
                  <TabBtn label="✦ Recomendación Experto" tab="expert" active={activeTab} onClick={setActiveTab} highlight />
                </div>

                {/* Distribución */}
                {activeTab === 'distribution' && (
                  <div className="h-80 -mx-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.distribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis
                          dataKey="priceRangeMin"
                          tickFormatter={(v) => `€${Number(v).toFixed(2)}`}
                          stroke="#999"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke="#999" tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                          formatter={(v: any) => [v, 'Clics']}
                          labelFormatter={(l) => `€${Number(l).toFixed(3)}`}
                        />
                        <Legend wrapperStyle={{ color: '#ccc' }} />
                        <Bar dataKey="clickCount" fill="#3b82f6" name="Clics" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Horario / Semanal */}
                {activeTab === 'hourly' && (
                  <div className="h-80 -mx-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis dataKey="label" stroke="#999" tick={{ fontSize: 12 }} />
                        <YAxis stroke="#999" tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                          formatter={(v: any) => [`€${Number(v).toFixed(3)}`, 'CPC Promedio']}
                        />
                        <Legend wrapperStyle={{ color: '#ccc' }} />
                        <Line
                          type="monotone"
                          dataKey="avgCpc"
                          stroke="#10b981"
                          name="CPC Promedio"
                          strokeWidth={2}
                          dot={data.temporalMode === 'weekly'}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recomendación Experto */}
                {activeTab === 'expert' && (
                  <ExpertPanel
                    campaign={campaign}
                    expert={expert}
                    loading={expertLoading}
                    error={expertError}
                    applying={applying}
                    applied={applied}
                    confirming={confirming}
                    onFetch={fetchExpert}
                    onRequestApply={() => setConfirming(true)}
                    onConfirmApply={() => { setConfirming(false); applyRecommendation() }}
                    onCancelApply={() => setConfirming(false)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Subcomponente: botón de tab ────────────────────────────────

function TabBtn({
  label, tab, active, onClick, highlight = false,
}: {
  label:     string
  tab:       ActiveTab
  active:    ActiveTab
  onClick:   (t: ActiveTab) => void
  highlight?: boolean
}) {
  const isActive = active === tab
  return (
    <button
      onClick={() => onClick(tab)}
      className={clsx(
        'px-4 py-2 text-sm font-medium transition border-b-2',
        isActive
          ? highlight
            ? 'text-amber-400 border-amber-400'
            : 'text-white border-blue-500'
          : highlight
            ? 'text-amber-500/70 border-transparent hover:text-amber-400'
            : 'text-[#999] border-transparent hover:text-white'
      )}
    >
      {label}
    </button>
  )
}

// ── Subcomponente: panel experto ──────────────────────────────

function ExpertPanel({
  campaign,
  expert,
  loading,
  error,
  applying,
  applied,
  confirming,
  onFetch,
  onRequestApply,
  onConfirmApply,
  onCancelApply,
}: {
  campaign:       CampaignMetrics
  expert:         ExpertRecommendation | null
  loading:        boolean
  error:          string | null
  applying:       boolean
  applied:        boolean
  confirming:     boolean
  onFetch:        () => void
  onRequestApply: () => void
  onConfirmApply: () => void
  onCancelApply:  () => void
}) {
  if (!expert && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-[#999] text-sm text-center max-w-xs">
          El motor analiza ROAS, techo de CPC, Impression Share y la distribución
          estadística para proponer el precio óptimo.
        </p>
        <button
          onClick={onFetch}
          className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition"
        >
          ✦ Calcular recomendación
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-[#999] text-sm animate-pulse">Calculando recomendación…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="bg-red-900/20 border border-red-800 rounded p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
        <button
          onClick={onFetch}
          className="text-xs text-[#999] hover:text-white underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!expert) return null

  const isRaise = expert.scenario.startsWith('raise')
  const isLower = expert.scenario.startsWith('lower')
  const noChange = expert.delta === 0

  const deltaColor = isRaise ? 'text-green-400' : isLower ? 'text-red-400' : 'text-[#999]'
  const deltaArrow = isRaise ? '↑' : isLower ? '↓' : '→'
  const deltaSuffix = expert.deltaPercent !== null
    ? ` (${expert.delta >= 0 ? '+' : ''}${expert.deltaPercent}%)`
    : ''

  return (
    <div className="space-y-5">

      {/* Precio recomendado */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5">
        <p className="text-xs text-[#999] mb-1">Techo CPC recomendado</p>
        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold text-white font-mono">
            €{expert.suggestedCeiling.toFixed(2)}
          </span>
          {!noChange && (
            <span className={clsx('text-sm font-mono mb-1', deltaColor)}>
              {deltaArrow} {expert.delta >= 0 ? '+' : ''}€{Math.abs(expert.delta).toFixed(2)}{deltaSuffix}
            </span>
          )}
        </div>
        {expert.currentCeiling !== null && (
          <p className="text-xs text-[#666] mt-1">
            Techo actual: €{expert.currentCeiling.toFixed(2)}
          </p>
        )}
      </div>

      {/* Escenario + confianza */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#ccc] bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1">
          {SCENARIO_LABEL[expert.scenario]}
        </span>
        <span className={clsx('text-xs rounded px-2 py-1', CONFIDENCE_STYLE[expert.confidence])}>
          {CONFIDENCE_LABEL[expert.confidence]}
        </span>
      </div>

      {/* Razonamiento */}
      <div>
        <p className="text-xs font-semibold text-[#999] mb-2 uppercase tracking-wider">Razonamiento</p>
        <ul className="space-y-1.5">
          {expert.reasoning.map((line, i) => (
            <li key={i} className="flex gap-2 text-sm text-[#ccc]">
              <span className="text-amber-500 mt-0.5 shrink-0">›</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Acciones */}
      <div className="flex gap-3 pt-2">
        {applied ? (
          <div className="flex-1 py-2.5 rounded-lg bg-green-900/30 border border-green-700/40 text-green-400 text-sm text-center">
            ✓ Techo actualizado correctamente
          </div>
        ) : (
          <>
            <button
              onClick={onRequestApply}
              disabled={applying || noChange}
              className={clsx(
                'flex-1 py-2.5 rounded-lg text-sm font-semibold transition',
                noChange
                  ? 'bg-[#2a2a2a] text-[#666] cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-black'
              )}
            >
              {applying ? 'Aplicando…' : noChange ? 'Sin cambios' : 'Aplicar recomendación'}
            </button>
            <button
              onClick={onFetch}
              className="px-4 py-2.5 rounded-lg bg-[#2a2a2a] text-[#ccc] hover:bg-[#333] text-sm transition"
            >
              Recalcular
            </button>
          </>
        )}
      </div>

      {/* Modal de confirmación */}
      {confirming && expert && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={onCancelApply} />
          <div className="relative z-10 bg-[#1a1a1a] border border-[#333] rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-white font-semibold text-base mb-1">
              Confirmar cambio de techo CPC
            </h3>
            <p className="text-[#999] text-sm mb-4">
              Esta acción actualizará el techo en Google Ads y guardará el cambio en el sistema.
            </p>

            <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-4 mb-5 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[#999]">Campaña</span>
                <span className="text-white truncate max-w-[180px] text-right">{campaign.campaignName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999]">Techo actual</span>
                <span className="text-white font-mono">
                  {expert.currentCeiling !== null ? `€${expert.currentCeiling.toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999]">Nuevo techo</span>
                <span className="text-amber-400 font-mono font-semibold">€{expert.suggestedCeiling.toFixed(2)}</span>
              </div>
              {expert.deltaPercent !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#999]">Variación</span>
                  <span className={clsx('font-mono', isRaise ? 'text-green-400' : 'text-red-400')}>
                    {expert.delta >= 0 ? '+' : ''}€{Math.abs(expert.delta).toFixed(2)} ({expert.delta >= 0 ? '+' : ''}{expert.deltaPercent}%)
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCancelApply}
                className="flex-1 py-2.5 rounded-lg bg-[#2a2a2a] text-[#ccc] hover:bg-[#333] text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmApply}
                className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
