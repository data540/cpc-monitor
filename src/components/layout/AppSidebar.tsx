'use client'

import { signOut } from 'next-auth/react'

// ── Nav item ──────────────────────────────────────────────────

export function NavItem({
  icon, label, active, href, onClick,
}: {
  icon: string; label: string; active?: boolean
  href?: string; onClick?: () => void
}) {
  const base = `flex items-center gap-2.5 px-3 py-2 rounded text-xs num font-medium tracking-widest uppercase transition-all w-full ${
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

// ── Sidebar ───────────────────────────────────────────────────

export interface AppSidebarProps {
  activeSection: 'overview' | 'campaigns' | 'is-monitor' | 'cpc-analysis' | 'roas-tracker' | 'auction-insights' | 'alerts' | 'reports' | 'config'
  customerId:    string
  inputId:       string
  onInputChange: (v: string) => void
  onLoad:        () => void
  lastUpdate:    Date | null
  loading:       boolean
  onRefresh:     () => void
  // Para vista tabla/cards en overview
  view?:         'table' | 'cards'
  onViewChange?: (v: 'table' | 'cards') => void
}

export function AppSidebar({
  activeSection, customerId, inputId, onInputChange, onLoad,
  lastUpdate, loading, onRefresh, view, onViewChange,
}: AppSidebarProps) {

  const cid = customerId ? `?customerId=${customerId}` : ''

  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-bg-surface border-r border-bg-border flex flex-col z-30">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-bg-border">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="CPC Monitor" className="w-7 h-7 rounded" />
          <div>
            <p className="num text-[11px] font-bold text-cyan-DEFAULT tracking-[0.15em]">CPC_MONITOR</p>
            <p className="num text-[9px] text-text-tertiary tracking-wider mt-0.5">V0.2_ACTIVE</p>
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">

        <p className="num text-[9px] text-text-tertiary tracking-[0.2em] uppercase px-3 mb-2">Workspace</p>

        <NavItem icon="▦" label="Overview"    active={activeSection === 'overview'}   href={`/dashboard${cid}`} />
        <NavItem icon="⊞" label="Campaigns"   active={activeSection === 'campaigns'}  href={`/dashboard${cid}`}
          onClick={onViewChange ? () => { onViewChange('cards') } : undefined}
        />

        <div className="pt-3 pb-1">
          <p className="num text-[9px] text-text-tertiary tracking-[0.2em] uppercase px-3 mb-2">Analytics</p>
        </div>

        <NavItem icon="◎" label="IS Monitor"      active={activeSection === 'is-monitor'}       href={`/dashboard/is-monitor${cid}`} />
        <NavItem icon="💰" label="CPC Analysis"   active={activeSection === 'cpc-analysis'}     href={`/dashboard/cpc-analysis${cid}`} />
        <NavItem icon="🎯" label="ROAS Tracker"   active={activeSection === 'roas-tracker'}     href={`/dashboard/roas-tracker${cid}`} />
        <NavItem icon="📉" label="Auction Insights" active={activeSection === 'auction-insights'} href={`/dashboard/auction-insights${cid}`} />

        <div className="pt-3 pb-1">
          <p className="num text-[9px] text-text-tertiary tracking-[0.2em] uppercase px-3 mb-2">System</p>
        </div>

        <NavItem icon="🔔" label="Alerts"   active={activeSection === 'alerts'}  href={`/dashboard/alerts${cid}`} />
        <NavItem icon="📅" label="Reports"  active={activeSection === 'reports'} href={`/dashboard/reports${cid}`} />
        <NavItem icon="⚙"  label="Config"   active={activeSection === 'config'}  href="/dashboard/config" />

        {/* Customer ID */}
        <div className="pt-4">
          <p className="num text-[9px] text-cyan-DEFAULT tracking-[0.2em] uppercase px-3 mb-2">Account</p>
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

      {/* Footer */}
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
