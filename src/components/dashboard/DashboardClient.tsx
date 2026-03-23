'use client'

import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { CampaignCard } from './CampaignCard'
import { CampaignTable } from './CampaignTable'
import { CampaignDetailView } from './CampaignDetailView'
import { CampaignMetrics } from '@/types'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

const DEFAULT_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''

// ── Sidebar ───────────────────────────────────────────────────

function NavItem({
  icon, label, active, href, onClick, cta,
}: {
  icon: string; label: string; active?: boolean; href?: string
  onClick?: () => void; cta?: boolean
}) {
  const base = cta
    ? 'flex items-center gap-2.5 px-3 py-2 rounded text-xs num font-semibold tracking-widest uppercase transition-all bg-cyan-DEFAULT/10 text-cyan-DEFAULT border border-cyan-DEFAULT/30 hover:bg-cyan-DEFAULT/20 w-full'
    : `flex items-center gap-2.5 px-3 py-2 rounded text-xs num font-medium tracking-widest uppercase transition-all w-full ${
        active
          ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-l-2 border-cyan-DEFAULT'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border-l-2 border-transparent'
      }`

  if (href) return (
    <a href={href} className={base}>
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </a>
  )
  return (
    <button onClick={onClick} className={base}>
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function Sidebar({ activeView, onViewChange, lastUpdate, loading, onRefresh, customerId, inputId, onInputChange, onLoad }: {
  activeView: 'table' | 'cards'
  onViewChange: (v: 'table' | 'cards') => void
  lastUpdate: Date | null
  loading: boolean
  onRefresh: () => void
  customerId: string
  inputId: string
  onInputChange: (v: string) => void
  onLoad: () => void
}) {
  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-bg-surface border-r border-bg-border flex flex-col z-30">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-bg-border">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="CPC Monitor" className="w-7 h-7 rounded" />
          <div>
            <p className="num text-[11px] font-bold text-cyan-DEFAULT tracking-[0.15em]">CPC_MONITOR</p>
            <p className="num text-[9px] text-text-tertiary tracking-wider mt-0.5">V0.1_ACTIVE</p>
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="num text-[9px] text-text-tertiary tracking-[0.2em] uppercase px-3 mb-2">Workspace</p>

        <NavItem
          icon="▦"
          label="Overview"
          active={activeView === 'table'}
          onClick={() => onViewChange('table')}
        />
        <NavItem
          icon="⊞"
          label="Campaigns"
          active={activeView === 'cards'}
          onClick={() => onViewChange('cards')}
        />
        <NavItem
          icon="⚙"
          label="Config"
          href="/dashboard/config"
        />

        {/* Customer ID en sidebar */}
        <div className="pt-4">
          <p className="num text-[9px] text-text-tertiary tracking-[0.2em] uppercase px-3 mb-2">Account</p>
          <div className="px-3 space-y-2">
            <input
              type="text"
              value={inputId}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onLoad()}
              placeholder="726-526-1105"
              className="num text-xs bg-bg-card border border-bg-border focus:border-cyan-DEFAULT/60 rounded px-2.5 py-1.5 text-text-primary placeholder-text-tertiary outline-none transition-colors w-full"
            />
            <button
              onClick={onLoad}
              className="num text-[10px] w-full py-1.5 rounded border border-cyan-DEFAULT/30 text-cyan-DEFAULT hover:bg-cyan-DEFAULT/10 transition-colors tracking-widest uppercase"
            >
              Cargar
            </button>
          </div>
        </div>
      </nav>

      {/* Footer sidebar */}
      <div className="px-3 py-4 border-t border-bg-border space-y-3">
        {lastUpdate && (
          <p className="num text-[9px] text-text-secondary px-3 tracking-wider">
            SYNC {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="num text-[10px] w-full py-1.5 rounded border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition-colors tracking-widest uppercase disabled:opacity-40"
        >
          {loading ? '↻ Cargando...' : '↻ Actualizar'}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="num text-[10px] w-full py-1 text-[#888] hover:text-[#ccc] transition-colors tracking-wider"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
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
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)
  const [lastUpdate,       setLastUpdate]       = useState<Date | null>(null)
  const [customerId,       setCustomerId]       = useState(DEFAULT_CUSTOMER_ID)
  const [inputId,          setInputId]          = useState(DEFAULT_CUSTOMER_ID)
  const [view,             setView]             = useState<'cards' | 'table'>('table')
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignMetrics | null>(null)

  const fetchMetrics = useCallback(async (cid: string) => {
    if (!cid) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/campaigns?customerId=${cid.replace(/-/g, '')}`)
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

  useEffect(() => { if (customerId) fetchMetrics(customerId) }, [customerId, fetchMetrics])

  // Auto-refresh cada 6 horas
  useEffect(() => {
    const interval = setInterval(() => { if (customerId) fetchMetrics(customerId) }, 6 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [customerId, fetchMetrics])

  const alertCount = metrics.filter(m => m.recommendation.level === 'alert').length
  const avgIs = metrics.filter(m => m.isActual !== null).length > 0
    ? metrics.reduce((a, m) => a + (m.isActual ?? 0), 0) / metrics.filter(m => m.isActual !== null).length
    : null

  const handleLoad = () => setCustomerId(inputId)

  return (
    <div className="flex min-h-screen bg-bg-base">

      {/* Sidebar */}
      <Sidebar
        activeView={view}
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
                <div className="mb-5 bg-red-dim border border-red-DEFAULT/30 rounded px-4 py-3 text-sm text-red-DEFAULT">
                  <span className="font-medium num tracking-wider">ERROR: </span>{error}
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
