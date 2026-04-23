'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import clsx from 'clsx'
import { CampaignCard } from './CampaignCard'
import { CampaignTable } from './CampaignTable'
import { CampaignDetailView } from './CampaignDetailView'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CampaignMetrics } from '@/types'
import { useAccountContext } from '@/contexts/AccountContext'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

const ENV_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''
function normalizeCustomerId(value: string): string { return value.replace(/-/g, '').trim() }
function isValidCustomerId(value: string): boolean { return /^\d{10}$/.test(normalizeCustomerId(value)) }
const DEFAULT_CUSTOMER_ID = isValidCustomerId(ENV_CUSTOMER_ID) ? normalizeCustomerId(ENV_CUSTOMER_ID) : ''

// ── Filtro de fecha ───────────────────────────────────────────

type DatePreset = '7days' | '30days' | '90days' | 'custom'

function getPresetDays(p: Exclude<DatePreset, 'custom'>) {
  return p === '7days' ? 7 : p === '30days' ? 30 : 90
}

// ── Summary Card ──────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon, barPct, highlight,
}: {
  label: string; value: string; sub?: string; icon?: string
  barPct?: number; highlight?: 'cyan' | 'green' | 'red' | 'amber'
}) {
  const accentColor = {
    cyan:  'text-cyan-DEFAULT',
    green: 'text-green-DEFAULT',
    red:   'text-red-DEFAULT',
    amber: 'text-amber-DEFAULT',
  }[highlight ?? 'cyan']

  return (
    <div className="bg-bg-card border border-bg-border rounded-md px-4 pt-4 pb-3 relative overflow-hidden">
      {/* Ghost icon watermark */}
      {icon && (
        <span className="absolute right-3 top-3 text-3xl opacity-[0.06] select-none pointer-events-none">
          {icon}
        </span>
      )}
      <p className="num text-[9px] text-white uppercase tracking-[0.2em] mb-2">{label}</p>
      <p className={`num text-2xl font-bold ${accentColor} mb-1`}>{value}</p>
      {sub && <p className="num text-[10px] text-text-tertiary">{sub}</p>}
      {/* Progress bar */}
      {barPct !== undefined && (
        <div className="progress-bar mt-3">
          <div className="progress-bar-fill" style={{ width: `${Math.min(100, barPct)}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────

export function DashboardClient({ user }: Props) {
  const { selectedIds } = useAccountContext()
  const [metrics,          setMetrics]          = useState<CampaignMetrics[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [needsReauth,      setNeedsReauth]      = useState(false)
  const [lastUpdate,       setLastUpdate]       = useState<Date | null>(null)
  const [view,             setView]             = useState<'cards' | 'table'>('table')
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignMetrics | null>(null)
  const [datePreset,       setDatePreset]       = useState<DatePreset>('30days')
  const [customStart,      setCustomStart]      = useState('')
  const [customEnd,        setCustomEnd]        = useState('')
  const [numDays,          setNumDays]          = useState(30)

  // Refs para que el auto-refresh use siempre los valores actuales del filtro
  const datePresetRef  = useRef(datePreset)
  const customStartRef = useRef(customStart)
  const customEndRef   = useRef(customEnd)
  useEffect(() => { datePresetRef.current  = datePreset  }, [datePreset])
  useEffect(() => { customStartRef.current = customStart }, [customStart])
  useEffect(() => { customEndRef.current   = customEnd   }, [customEnd])

  const fetchMetrics = useCallback(async (
    cids:   string[],
    preset: DatePreset,
    cStart: string,
    cEnd:   string,
  ) => {
    const valid = cids.filter(isValidCustomerId)
    if (!valid.length) return
    setLoading(true); setError(null); setNeedsReauth(false)

    let dateParam: string
    if (preset === 'custom' && cStart && cEnd) {
      dateParam = `startDate=${cStart}&endDate=${cEnd}`
    } else {
      dateParam = `days=${getPresetDays(preset as Exclude<DatePreset, 'custom'>)}`
    }

    try {
      const results = await Promise.all(
        valid.map(async cid => {
          const res  = await fetch(`/api/campaigns?customerId=${normalizeCustomerId(cid)}&${dateParam}`)
          const data = await res.json()
          if (!res.ok) {
            if (data.reauth) setNeedsReauth(true)
            throw new Error(data.error ?? 'Error desconocido')
          }
          if (typeof data.numDays === 'number') setNumDays(data.numDays)
          return data.metrics as CampaignMetrics[]
        })
      )
      setMetrics(results.flat())
      setLastUpdate(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Disparar fetch cuando cambia la selección de cuentas o el filtro de fecha
  useEffect(() => {
    if (!selectedIds.length) { setMetrics([]); return }
    if (datePreset === 'custom' && (!customStart || !customEnd)) return
    fetchMetrics(selectedIds, datePreset, customStart, customEnd)
  }, [selectedIds, datePreset, customStart, customEnd, fetchMetrics])

  // Auto-refresh cada 6 horas usando siempre el filtro activo en ese momento
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedIds.length > 0) {
        fetchMetrics(selectedIds, datePresetRef.current, customStartRef.current, customEndRef.current)
      }
    }, 6 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedIds, fetchMetrics])

  const alertCount = metrics.filter(m => m.recommendation.level === 'alert').length
  const avgIs = metrics.filter(m => m.isActual !== null).length > 0
    ? metrics.reduce((a, m) => a + (m.isActual ?? 0), 0) / metrics.filter(m => m.isActual !== null).length
    : null

  const periodLabel = datePreset === 'custom' && customStart && customEnd
    ? `${customStart} → ${customEnd}`
    : `últimos ${numDays} días`

  return (
    <div className="flex min-h-screen bg-bg-base">

      {/* Sidebar */}
      <AppSidebar
        activeSection="overview"
        lastUpdate={lastUpdate}
        loading={loading}
        onRefresh={() => fetchMetrics(selectedIds, datePreset, customStart, customEnd)}
      />

      {/* Contenido principal */}
      <div className="ml-[240px] flex-1 flex flex-col min-h-screen">

        {/* ── Vista de detalle ─────────────────────────────────── */}
        {selectedCampaign ? (
          <CampaignDetailView
            campaign={selectedCampaign}
            customerId={selectedIds[0] ?? ''}
            onBack={() => setSelectedCampaign(null)}
          />
        ) : (
          <>
            {/* ── Top bar ──────────────────────────────────────── */}
            <header className="border-b border-bg-border bg-bg-surface sticky top-0 z-20">
              <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="num text-sm font-bold text-text-primary tracking-widest">AD_MONITOR</span>
                  {selectedIds.length > 0 && (
                    <span className="num text-xs text-text-tertiary">
                      {selectedIds.length === 1 ? `#${selectedIds[0]}` : `${selectedIds.length} cuentas`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {alertCount > 0 && (
                    <span className="num text-[10px] bg-red-dim text-red-DEFAULT border border-red-DEFAULT/30 px-2 py-0.5 rounded-sm tracking-wider pulse-alert">
                      {alertCount} ALERT{alertCount > 1 ? 'S' : ''}
                    </span>
                  )}
                  <span className="num text-[10px] px-2 py-0.5 rounded-sm border border-bg-border text-text-tertiary tracking-wider hidden sm:flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-DEFAULT pulse-cyan inline-block" />
                    SYSTEM_STABLE
                  </span>
                  {lastUpdate && (
                    <span className="num text-[10px] px-2 py-0.5 rounded-sm border border-bg-border text-text-tertiary tracking-wider hidden md:block">
                      LAST_SYNC: {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {/* Toggle vista */}
                  <div className="flex border border-bg-border rounded overflow-hidden">
                    <button
                      onClick={() => setView('table')}
                      className={`num text-[10px] px-3 py-1.5 transition-colors tracking-widest ${view === 'table' ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT' : 'text-text-tertiary hover:text-text-secondary'}`}
                    >
                      ☰ LIST
                    </button>
                    <button
                      onClick={() => setView('cards')}
                      className={`num text-[10px] px-3 py-1.5 border-l border-bg-border transition-colors tracking-widest ${view === 'cards' ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT' : 'text-text-tertiary hover:text-text-secondary'}`}
                    >
                      ⊞ GRID
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <main className="px-6 py-6 flex-1">

              {error && (
                <div className="mb-5 bg-red-dim border border-red-DEFAULT/30 rounded px-4 py-3 text-sm text-red-DEFAULT flex items-center justify-between gap-4">
                  <span><span className="font-medium num tracking-wider">ERROR: </span>{error}</span>
                  {needsReauth && (
                    <a
                      href="/api/auth/google-ads"
                      className="num text-[10px] shrink-0 px-3 py-1.5 rounded border border-red-DEFAULT/50 text-red-DEFAULT hover:bg-red-DEFAULT/10 transition-colors tracking-widest uppercase whitespace-nowrap"
                    >
                      Reconectar cuenta
                    </a>
                  )}
                </div>
              )}

              {/* ── Summary cards ─────────────────────────────── */}
              {(loading || metrics.length > 0) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {loading ? (
                    [1,2,3,4].map(i => (
                      <div key={i} className="bg-bg-card border border-bg-border rounded-md h-24 animate-pulse" />
                    ))
                  ) : (
                    <>
                      <SummaryCard
                        label="Campaigns"
                        value={metrics.length.toString()}
                        sub={`${alertCount} alerts`}
                        icon="▦"
                        highlight="cyan"
                      />
                      <SummaryCard
                        label="Total Clicks"
                        value={metrics.reduce((a, m) => a + m.clicks, 0).toLocaleString('es-ES')}
                        sub={periodLabel}
                        icon="↗"
                        highlight="cyan"
                      />
                      <SummaryCard
                        label="Total Cost"
                        value={`${metrics.reduce((a, m) => a + m.costEur, 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`}
                        sub="budget utilization"
                        icon="€"
                        highlight={alertCount > 0 ? 'amber' : 'cyan'}
                      />
                      <SummaryCard
                        label="Avg IS"
                        value={avgIs !== null ? `${Math.round(avgIs * 100)}%` : '—'}
                        sub="Impression Share"
                        icon="◎"
                        barPct={avgIs !== null ? avgIs * 100 : undefined}
                        highlight={avgIs !== null && avgIs < 0.5 ? 'red' : avgIs !== null && avgIs < 0.75 ? 'amber' : 'green'}
                      />
                    </>
                  )}
                </div>
              )}

              {!loading && !error && metrics.length === 0 && (
                <div className="text-center py-20 text-text-secondary">
                  <p className="num text-sm tracking-wider">SIN CAMPAÑAS TARGET_ROAS</p>
                  <p className="text-xs mt-2 text-text-tertiary">Comprueba el Customer ID e inténtalo de nuevo</p>
                </div>
              )}

              {!loading && metrics.length > 0 && (
                <>
                  {/* ── Filtro de fecha ───────────────────────── */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {(['7days', '30days', '90days'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setDatePreset(p)}
                        className={clsx(
                          'num text-xs px-3 py-1.5 rounded transition-colors',
                          datePreset === p
                            ? 'bg-cyan-DEFAULT/15 border border-cyan-DEFAULT/40 text-cyan-DEFAULT'
                            : 'bg-bg-card border border-bg-border text-text-tertiary hover:text-text-secondary'
                        )}
                      >
                        {p === '7days' ? '7 días' : p === '30days' ? '30 días' : '90 días'}
                      </button>
                    ))}
                    <button
                      onClick={() => setDatePreset('custom')}
                      className={clsx(
                        'num text-xs px-3 py-1.5 rounded transition-colors',
                        datePreset === 'custom'
                          ? 'bg-cyan-DEFAULT/15 border border-cyan-DEFAULT/40 text-cyan-DEFAULT'
                          : 'bg-bg-card border border-bg-border text-text-tertiary hover:text-text-secondary'
                      )}
                    >
                      Personalizado
                    </button>
                    {datePreset === 'custom' && (
                      <div className="flex items-center gap-2 ml-1">
                        <input
                          type="date"
                          value={customStart}
                          onChange={e => setCustomStart(e.target.value)}
                          className="num text-xs bg-bg-card border border-bg-border rounded px-2 py-1.5 text-text-primary outline-none focus:border-cyan-DEFAULT/40"
                        />
                        <span className="text-text-tertiary text-xs">→</span>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={e => setCustomEnd(e.target.value)}
                          className="num text-xs bg-bg-card border border-bg-border rounded px-2 py-1.5 text-text-primary outline-none focus:border-cyan-DEFAULT/40"
                        />
                      </div>
                    )}
                  </div>

                  {view === 'table' ? (
                    <CampaignTable
                      metrics={metrics}
                      customerId={selectedIds[0] ?? ''}
                      numDays={numDays}
                      onRefresh={() => fetchMetrics(selectedIds, datePreset, customStart, customEnd)}
                      onSelectCampaign={setSelectedCampaign}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {metrics.map((m, i) => (
                        <div key={m.campaignId} className="fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                          <CampaignCard metrics={m} onSelect={setSelectedCampaign} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  )
}
