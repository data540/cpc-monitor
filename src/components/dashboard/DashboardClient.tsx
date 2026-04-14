'use client'

import { useState, useEffect, useCallback } from 'react'
import { CampaignCard } from './CampaignCard'
import { CampaignTable } from './CampaignTable'
import { CampaignDetailView } from './CampaignDetailView'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CampaignMetrics } from '@/types'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

const ENV_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''
function normalizeCustomerId(value: string): string { return value.replace(/-/g, '').trim() }
function isValidCustomerId(value: string): boolean { return /^\d{10}$/.test(normalizeCustomerId(value)) }
const DEFAULT_CUSTOMER_ID = isValidCustomerId(ENV_CUSTOMER_ID) ? normalizeCustomerId(ENV_CUSTOMER_ID) : ''

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
      <p className="num text-[9px] text-text-tertiary uppercase tracking-[0.2em] mb-2">{label}</p>
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
  const [metrics,          setMetrics]          = useState<CampaignMetrics[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [needsReauth,      setNeedsReauth]      = useState(false)
  const [lastUpdate,       setLastUpdate]       = useState<Date | null>(null)
  const [customerId,       setCustomerId]       = useState(DEFAULT_CUSTOMER_ID)
  const [inputId,          setInputId]          = useState(DEFAULT_CUSTOMER_ID)
  const [view,             setView]             = useState<'cards' | 'table'>('table')
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignMetrics | null>(null)

  const fetchMetrics = useCallback(async (cid: string) => {
    if (!isValidCustomerId(cid)) return
    const normalizedCid = normalizeCustomerId(cid)
    setLoading(true); setError(null); setNeedsReauth(false)
    try {
      const res  = await fetch(`/api/campaigns?customerId=${normalizedCid}`)
      const data = await res.json()
      if (!res.ok) {
        if (data.reauth) setNeedsReauth(true)
        throw new Error(data.error ?? 'Error desconocido')
      }
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

  // Auto-refresh cada 6 horas
  useEffect(() => {
    const interval = setInterval(() => { if (customerId) fetchMetrics(customerId) }, 6 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [customerId, fetchMetrics])

  const alertCount = metrics.filter(m => m.recommendation.level === 'alert').length
  const avgIs = metrics.filter(m => m.isActual !== null).length > 0
    ? metrics.reduce((a, m) => a + (m.isActual ?? 0), 0) / metrics.filter(m => m.isActual !== null).length
    : null

  const handleLoad = () => {
    const normalized = normalizeCustomerId(inputId)
    if (!isValidCustomerId(normalized)) {
      setError('Introduce un Customer ID válido (10 dígitos, sin guiones).')
      setMetrics([])
      return
    }
    setInputId(normalized)
    setCustomerId(normalized)
  }

  return (
    <div className="flex min-h-screen bg-bg-base">

      {/* Sidebar */}
      <AppSidebar
        activeSection={view === 'cards' ? 'campaigns' : 'overview'}
        view={view}
        onViewChange={setView}
        lastUpdate={lastUpdate}
        loading={loading}
        onRefresh={() => fetchMetrics(customerId)}
        customerId={customerId}
        inputId={inputId}
        onInputChange={setInputId}
        onLoad={handleLoad}
      />

      {/* Contenido principal */}
      <div className="ml-[220px] flex-1 flex flex-col min-h-screen">

        {/* ── Vista de detalle ─────────────────────────────────── */}
        {selectedCampaign ? (
          <CampaignDetailView
            campaign={selectedCampaign}
            customerId={customerId}
            onBack={() => setSelectedCampaign(null)}
          />
        ) : (
          <>
            {/* ── Top bar ──────────────────────────────────────── */}
            <header className="border-b border-bg-border bg-bg-surface sticky top-0 z-20">
              <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="num text-sm font-bold text-text-primary tracking-widest">AD_MONITOR</span>
                  {customerId && (
                    <span className="num text-xs text-text-tertiary">
                      #{customerId.replace(/-/g, '')}
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
                        sub="últimos 30 días"
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
                  {view === 'table' ? (
                    <CampaignTable
                      metrics={metrics}
                      customerId={customerId}
                      onRefresh={() => fetchMetrics(customerId)}
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
