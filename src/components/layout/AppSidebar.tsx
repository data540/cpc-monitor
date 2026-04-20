'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { useAccountContext } from '@/contexts/AccountContext'

// ── Nav item ──────────────────────────────────────────────────

export function NavItem({
  icon, label, active, href, onClick,
}: {
  icon: string; label: string; active?: boolean
  href?: string; onClick?: () => void
}) {
  const base = `flex items-center gap-3 px-3 py-2.5 rounded text-[13px] num font-medium tracking-wide transition-all w-full ${
    active
      ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-l-2 border-cyan-DEFAULT'
      : 'text-[#bbb] hover:text-white hover:bg-bg-hover border-l-2 border-transparent'
  }`

  if (href) return (
    <a href={href} className={base}>
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </a>
  )
  return (
    <button onClick={onClick} className={base}>
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ── Account Selector ──────────────────────────────────────────

function AccountSelector() {
  const { accounts, selectedIds, accountsLoading, toggleAccount, clearSelection, refreshAccounts } = useAccountContext()
  const [open,   setOpen]   = useState(false)
  const [filter, setFilter] = useState('')

  const filtered = accounts.filter(a =>
    a.name.toLowerCase().includes(filter.toLowerCase()) ||
    a.id.includes(filter)
  )

  const selectedCount = selectedIds.length

  return (
    <div className="px-3 pt-3">
      <p className="num text-[10px] text-cyan-DEFAULT tracking-[0.2em] uppercase px-1 mb-2 flex items-center justify-between">
        <span>Account</span>
        {selectedCount > 0 && (
          <span className="bg-cyan-DEFAULT/20 text-cyan-DEFAULT rounded px-1.5 py-0.5 text-[9px]">
            {selectedCount} sel.
          </span>
        )}
      </p>

      {/* Selected accounts chips */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 px-1">
          {selectedIds.map(id => (
            <span
              key={id}
              className="num text-[9px] bg-cyan-DEFAULT/10 text-cyan-DEFAULT border border-cyan-DEFAULT/30 rounded px-1.5 py-0.5 flex items-center gap-1 max-w-full"
            >
              <span className="truncate max-w-[120px]">
                {accounts.find(a => a.id === id)?.name ?? id}
              </span>
              <button
                onClick={() => toggleAccount(id)}
                className="text-cyan-DEFAULT/60 hover:text-cyan-DEFAULT leading-none flex-shrink-0"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) refreshAccounts() }}
        className="num text-[11px] w-full py-1.5 rounded border border-cyan-DEFAULT/30 text-cyan-DEFAULT hover:bg-cyan-DEFAULT/10 transition-colors tracking-wider flex items-center justify-center gap-2"
      >
        <span>{open ? '▲' : '▼'}</span>
        <span>{open ? 'Cerrar' : 'Seleccionar cuenta'}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="mt-2 bg-bg-card border border-bg-border rounded-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-bg-border">
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Buscar cuenta..."
              className="num text-[11px] w-full bg-bg-base border border-bg-border focus:border-cyan-DEFAULT/60 rounded px-2 py-1.5 text-text-primary placeholder-text-tertiary outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Account list */}
          <div className="max-h-[220px] overflow-y-auto">
            {accountsLoading && (
              <p className="num text-[10px] text-text-tertiary px-3 py-3 tracking-wider">Cargando cuentas...</p>
            )}
            {!accountsLoading && filtered.length === 0 && (
              <p className="num text-[10px] text-text-tertiary px-3 py-3 tracking-wider">Sin resultados</p>
            )}
            {!accountsLoading && filtered.map(account => {
              const selected = selectedIds.includes(account.id)
              return (
                <button
                  key={account.id}
                  onClick={() => toggleAccount(account.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-bg-border/50 last:border-0 ${
                    selected ? 'bg-cyan-DEFAULT/5' : 'hover:bg-bg-hover'
                  }`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected
                      ? 'bg-cyan-DEFAULT border-cyan-DEFAULT text-bg-base'
                      : 'border-[#444] text-transparent'
                  }`}>
                    <span className="text-[9px] font-bold leading-none">✓</span>
                  </span>
                  <div className="min-w-0">
                    <p className={`num text-[11px] font-medium truncate ${selected ? 'text-cyan-DEFAULT' : 'text-text-primary'}`}>
                      {account.name}
                    </p>
                    <p className="num text-[9px] text-text-tertiary">{account.id} · {account.currency}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer actions */}
          {selectedCount > 0 && (
            <div className="p-2 border-t border-bg-border">
              <button
                onClick={() => { clearSelection(); setOpen(false) }}
                className="num text-[10px] w-full py-1 text-text-tertiary hover:text-text-primary transition-colors tracking-wider"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────

export interface AppSidebarProps {
  activeSection: 'overview' | 'is-monitor' | 'cpc-analysis' | 'roas-tracker' | 'auction-insights' | 'alerts' | 'reports' | 'config'
  lastUpdate:    Date | null
  loading:       boolean
  onRefresh:     () => void
}

export function AppSidebar({
  activeSection, lastUpdate, loading, onRefresh,
}: AppSidebarProps) {

  return (
    <aside className="fixed top-0 left-0 h-full w-[240px] bg-bg-surface border-r border-bg-border flex flex-col z-30">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-bg-border">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="CPC Monitor" className="w-7 h-7 rounded" />
          <div>
            <p className="num text-[12px] font-bold text-cyan-DEFAULT tracking-[0.15em]">CPC_MONITOR</p>
            <p className="num text-[9px] text-text-tertiary tracking-wider mt-0.5">V0.2_ACTIVE</p>
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">

        <p className="num text-[10px] text-[#666] tracking-[0.2em] uppercase px-3 mb-2 font-semibold">Workspace</p>

        <NavItem icon="▦" label="Overview" active={activeSection === 'overview'} href="/dashboard" />

        <div className="pt-3 pb-1">
          <p className="num text-[10px] text-[#666] tracking-[0.2em] uppercase px-3 mb-2 font-semibold">Analytics</p>
        </div>

        <NavItem icon="◎" label="IS Monitor"       active={activeSection === 'is-monitor'}       href="/dashboard/is-monitor" />
        <NavItem icon="💰" label="CPC Analysis"    active={activeSection === 'cpc-analysis'}     href="/dashboard/cpc-analysis" />
        <NavItem icon="🎯" label="ROAS Tracker"    active={activeSection === 'roas-tracker'}     href="/dashboard/roas-tracker" />
        <NavItem icon="📉" label="Auction Insights" active={activeSection === 'auction-insights'} href="/dashboard/auction-insights" />

        <div className="pt-3 pb-1">
          <p className="num text-[10px] text-[#666] tracking-[0.2em] uppercase px-3 mb-2 font-semibold">System</p>
        </div>

        <NavItem icon="🔔" label="Alerts"  active={activeSection === 'alerts'}  href="/dashboard/alerts" />
        <NavItem icon="📅" label="Reports" active={activeSection === 'reports'} href="/dashboard/reports" />
        <NavItem icon="⚙"  label="Config"  active={activeSection === 'config'}  href="/dashboard/config" />

        {/* Account selector */}
        <AccountSelector />

      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-bg-border space-y-2">
        {lastUpdate && (
          <p className="num text-[10px] text-[#777] px-1 tracking-wider">
            SYNC {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="num text-[11px] w-full py-2 rounded border border-[#333] text-[#bbb] hover:text-white hover:border-[#555] transition-colors tracking-widest uppercase disabled:opacity-40"
        >
          {loading ? '↻ Cargando...' : '↻ Actualizar'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="num text-[11px] flex-1 py-1 text-[#888] hover:text-[#ccc] transition-colors tracking-wider"
          >
            Cerrar sesión
          </button>
          <a
            href="/help.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Ayuda — Guía de la aplicación"
            className="w-7 h-7 rounded-full border-2 border-cyan-DEFAULT/60 text-cyan-DEFAULT bg-cyan-DEFAULT/10 hover:bg-cyan-DEFAULT/25 hover:border-cyan-DEFAULT transition-all flex items-center justify-center num text-[13px] font-bold flex-shrink-0 shadow-[0_0_8px_rgba(0,200,200,0.3)]"
          >
            ?
          </a>
        </div>
      </div>
    </aside>
  )
}
