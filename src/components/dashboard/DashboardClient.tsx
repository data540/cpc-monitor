'use client'

import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { CampaignCard } from './CampaignCard'
import { CampaignTable } from './CampaignTable'
import { CampaignDetailModal } from './CampaignDetailModal'
import { CampaignMetrics } from '@/types'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

// Customer ID de la cuenta — en producción esto vendría de un selector
// Por ahora se lee del env o se puede cambiar aquí
const DEFAULT_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''

export function DashboardClient({ user }: Props) {
  const [metrics, setMetrics]           = useState<CampaignMetrics[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [lastUpdate, setLastUpdate]     = useState<Date | null>(null)
  const [customerId, setCustomerId]     = useState(DEFAULT_CUSTOMER_ID)
  const [inputId, setInputId]           = useState(DEFAULT_CUSTOMER_ID)
  const [view, setView]                 = useState<'cards' | 'table'>('table')
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignMetrics | null>(null)

  const fetchMetrics = useCallback(async (cid: string) => {
    if (!cid) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns?customerId=${cid.replace(/-/g, '')}`)
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

  useEffect(() => {
    if (customerId) fetchMetrics(customerId)
  }, [customerId, fetchMetrics])

  // Auto-refresh cada 6 horas
  useEffect(() => {
    const interval = setInterval(() => {
      if (customerId) fetchMetrics(customerId)
    }, 6 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [customerId, fetchMetrics])

  const alertCount = metrics.filter(m => m.recommendation.level === 'alert').length

  return (
    <div className="min-h-screen bg-bg-base">

      {/* Header */}
      <header className="border-b border-bg-border bg-bg-surface sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-DEFAULT" />
            <span className="num text-sm font-medium tracking-wider text-text-primary uppercase">
              CPC Monitor
            </span>
            {alertCount > 0 && (
              <span className="num text-xs bg-red-dim text-red-DEFAULT border border-red-DEFAULT/30 px-2 py-0.5 rounded-sm">
                {alertCount} alerta{alertCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="num text-xs text-text-tertiary hidden sm:block">
                Actualizado {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            {/* Toggle vista */}
            <div className="flex border border-bg-border rounded overflow-hidden">
              <button
                onClick={() => setView('table')}
                className={`num text-xs px-3 py-1.5 transition-colors ${view === 'table' ? 'bg-bg-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="Vista lista"
              >
                ☰ Lista
              </button>
              <button
                onClick={() => setView('cards')}
                className={`num text-xs px-3 py-1.5 border-l border-bg-border transition-colors ${view === 'cards' ? 'bg-bg-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="Vista tarjetas"
              >
                ⊞ Cards
              </button>
            </div>

            <button
              onClick={() => fetchMetrics(customerId)}
              disabled={loading}
              className="num text-xs text-text-secondary hover:text-text-primary border border-bg-border hover:border-text-tertiary px-3 py-1.5 rounded transition-colors disabled:opacity-40"
            >
              {loading ? '↻ Cargando...' : '↻ Actualizar'}
            </button>
            <a
              href="/dashboard/config"
              className="num text-xs text-text-secondary hover:text-text-primary border border-bg-border hover:border-text-tertiary px-3 py-1.5 rounded transition-colors"
            >
              ⚙ Config
            </a>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="num text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Selector de Customer ID */}
        <div className="mb-8 flex items-center gap-3">
          <label className="num text-xs text-text-secondary uppercase tracking-wider whitespace-nowrap">
            Customer ID
          </label>
          <input
            type="text"
            value={inputId}
            onChange={e => setInputId(e.target.value)}
            placeholder="ej: 368170355"
            className="num text-sm bg-bg-card border border-bg-border focus:border-text-tertiary rounded px-3 py-1.5 text-text-primary placeholder-text-tertiary outline-none transition-colors w-48"
          />
          <button
            onClick={() => setCustomerId(inputId)}
            className="num text-xs bg-bg-surface hover:bg-bg-hover border border-bg-border text-text-secondary hover:text-text-primary px-3 py-1.5 rounded transition-colors"
          >
            Cargar
          </button>
        </div>

        {/* Estados */}
        {error && (
          <div className="mb-6 bg-red-dim border border-red-DEFAULT/30 rounded-md px-4 py-3 text-sm text-red-DEFAULT">
            <span className="font-medium">Error: </span>{error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="bg-bg-card border border-bg-border rounded-lg h-64 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !error && metrics.length === 0 && (
          <div className="text-center py-20 text-text-secondary">
            <p className="num text-sm">Sin campañas TARGET_ROAS encontradas</p>
            <p className="text-xs mt-1 text-text-tertiary">Comprueba el Customer ID e inténtalo de nuevo</p>
          </div>
        )}

        {/* Grid de campañas */}
        {!loading && metrics.length > 0 && (
          <>
            {/* Resumen superior */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <SummaryCard label="Campañas" value={metrics.length.toString()} />
              <SummaryCard
                label="Clics totales"
                value={metrics.reduce((a, m) => a + m.clicks, 0).toLocaleString('es-ES')}
              />
              <SummaryCard
                label="Coste total"
                value={`${metrics.reduce((a, m) => a + m.costEur, 0).toFixed(2)} €`}
              />
              <SummaryCard
                label="IS media"
                value={`${Math.round(metrics.reduce((a, m) => a + (m.isActual ?? 0), 0) / metrics.filter(m => m.isActual !== null).length * 100)}%`}
              />
            </div>

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

      {/* Modal de detalle */}
      <CampaignDetailModal
        campaign={selectedCampaign}
        customerId={customerId}
        onClose={() => setSelectedCampaign(null)}
      />
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-md px-4 py-3">
      <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <p className="num text-lg font-semibold text-text-primary">{value}</p>
    </div>
  )
}
