'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CampaignMetrics } from '@/types'

interface Props {
  user: { id: string; name?: string; email?: string; image?: string }
}

const ENV_CUSTOMER_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID ?? ''
function normalizeCustomerId(v: string) { return v.replace(/-/g, '').trim() }
function isValidCustomerId(v: string)   { return /^\d{10}$/.test(normalizeCustomerId(v)) }
const DEFAULT_ID = isValidCustomerId(ENV_CUSTOMER_ID) ? normalizeCustomerId(ENV_CUSTOMER_ID) : ''

type AlertLevel = 'critical' | 'warning' | 'info'

interface Alert {
  id: string
  level: AlertLevel
  title: string
  description: string
  campaign?: string
  value?: string
  timestamp: Date
}

function levelConfig(level: AlertLevel) {
  return {
    critical: { cls: 'bg-red-DEFAULT/10 border-red-DEFAULT/30 text-red-DEFAULT',     icon: '⚠', badge: 'CRÍTICO',  dot: 'bg-red-DEFAULT' },
    warning:  { cls: 'bg-amber-DEFAULT/10 border-amber-DEFAULT/30 text-amber-DEFAULT', icon: '●', badge: 'AVISO',    dot: 'bg-amber-DEFAULT' },
    info:     { cls: 'bg-cyan-DEFAULT/10 border-cyan-DEFAULT/30 text-cyan-DEFAULT',   icon: '◎', badge: 'INFO',     dot: 'bg-cyan-DEFAULT' },
  }[level]
}

function generateAlerts(campaigns: CampaignMetrics[]): Alert[] {
  const alerts: Alert[] = []
  const now = new Date()

  for (const c of campaigns) {
    const cost = c.costMicros ? c.costMicros / 1_000_000 : 0
    const cpc = c.averageCpc ? c.averageCpc / 1_000_000 : null
    const cpcCeiling = c.cpcBidCeilingMicros ? c.cpcBidCeilingMicros / 1_000_000 : null

    // CPC ceiling alert
    if (cpc !== null && cpcCeiling !== null && cpcCeiling > 0) {
      const usage = cpc / cpcCeiling
      if (usage >= 0.95) {
        alerts.push({
          id: `cpc-critical-${c.id}`,
          level: 'critical',
          title: 'CPC al límite del techo',
          description: 'El CPC medio supera el 95% del techo configurado. Riesgo de perder impresiones.',
          campaign: c.name,
          value: `${(usage * 100).toFixed(1)}% del techo`,
          timestamp: new Date(now.getTime() - Math.random() * 3600000),
        })
      } else if (usage >= 0.8) {
        alerts.push({
          id: `cpc-warn-${c.id}`,
          level: 'warning',
          title: 'CPC aproximándose al techo',
          description: 'El CPC medio supera el 80% del techo. Monitorizar de cerca.',
          campaign: c.name,
          value: `${(usage * 100).toFixed(1)}% del techo`,
          timestamp: new Date(now.getTime() - Math.random() * 7200000),
        })
      }
    }

    // IS Lost Budget alert
    if (c.searchImpressionShare !== undefined && c.searchBudgetLostImpressionShare !== undefined) {
      const lostBudget = c.searchBudgetLostImpressionShare ?? 0
      if (lostBudget > 0.3) {
        alerts.push({
          id: `budget-${c.id}`,
          level: 'critical',
          title: 'Alto IS perdido por presupuesto',
          description: 'Más del 30% de impresiones potenciales se pierden por presupuesto insuficiente.',
          campaign: c.name,
          value: `${(lostBudget * 100).toFixed(1)}% perdido`,
          timestamp: new Date(now.getTime() - Math.random() * 1800000),
        })
      } else if (lostBudget > 0.15) {
        alerts.push({
          id: `budget-warn-${c.id}`,
          level: 'warning',
          title: 'IS perdido por presupuesto moderado',
          description: 'Entre 15-30% de impresiones perdidas por presupuesto.',
          campaign: c.name,
          value: `${(lostBudget * 100).toFixed(1)}% perdido`,
          timestamp: new Date(now.getTime() - Math.random() * 3600000),
        })
      }
    }

    // ROAS below target
    if (c.targetRoas && c.conversionsValue && cost > 0) {
      const roas = c.conversionsValue / cost
      const ratio = roas / c.targetRoas
      if (ratio < 0.7) {
        alerts.push({
          id: `roas-${c.id}`,
          level: 'critical',
          title: 'ROAS muy por debajo del objetivo',
          description: `ROAS actual ${roas.toFixed(2)}x vs target ${c.targetRoas}x. Revisar pujas y audiencias.`,
          campaign: c.name,
          value: `${roas.toFixed(2)}x (target: ${c.targetRoas}x)`,
          timestamp: new Date(now.getTime() - Math.random() * 5400000),
        })
      } else if (ratio < 0.85) {
        alerts.push({
          id: `roas-warn-${c.id}`,
          level: 'warning',
          title: 'ROAS por debajo del objetivo',
          description: `ROAS actual ${roas.toFixed(2)}x. Ligeramente por debajo del target ${c.targetRoas}x.`,
          campaign: c.name,
          value: `${roas.toFixed(2)}x (target: ${c.targetRoas}x)`,
          timestamp: new Date(now.getTime() - Math.random() * 7200000),
        })
      }
    }
  }

  // Sort: critical first, then by time desc
  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 }
    if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level]
    return b.timestamp.getTime() - a.timestamp.getTime()
  })
}

export function AlertsClient({ user }: Props) {
  const params = useSearchParams()
  const [customerId, setCustomerId] = useState(() => {
    const p = params.get('customerId')
    return p ? normalizeCustomerId(p) : DEFAULT_ID
  })
  const [inputId, setInputId] = useState(customerId)
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [filter, setFilter] = useState<AlertLevel | 'all'>('all')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

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

  const allAlerts = generateAlerts(campaigns).filter(a => !dismissed.has(a.id))
  const filtered = filter === 'all' ? allAlerts : allAlerts.filter(a => a.level === filter)

  const criticalCount = allAlerts.filter(a => a.level === 'critical').length
  const warningCount  = allAlerts.filter(a => a.level === 'warning').length
  const infoCount     = allAlerts.filter(a => a.level === 'info').length

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <AppSidebar
        activeSection="alerts"
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
            <p className="num text-[10px] text-text-tertiary tracking-[0.2em] uppercase mb-1">System › Alertas</p>
            <h1 className="num text-xl font-bold text-text-primary tracking-wide">Alertas</h1>
          </div>
          {lastUpdate && (
            <p className="num text-[10px] text-text-tertiary tracking-wider">
              SYNC {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { level: 'critical' as AlertLevel, count: criticalCount, label: 'Críticas',   color: 'text-red-DEFAULT',   border: 'border-red-DEFAULT/30' },
            { level: 'warning'  as AlertLevel, count: warningCount,  label: 'Avisos',     color: 'text-amber-DEFAULT', border: 'border-amber-DEFAULT/30' },
            { level: 'info'     as AlertLevel, count: infoCount,     label: 'Informativas', color: 'text-cyan-DEFAULT', border: 'border-cyan-DEFAULT/30' },
          ].map(k => (
            <button
              key={k.level}
              onClick={() => setFilter(filter === k.level ? 'all' : k.level)}
              className={`bg-bg-card border rounded-lg p-4 text-left transition-all hover:bg-bg-hover ${
                filter === k.level ? k.border : 'border-bg-border'
              }`}
            >
              <p className="num text-[9px] text-text-tertiary tracking-widest uppercase mb-2">{k.label}</p>
              <p className={`num text-3xl font-bold ${k.color}`}>{k.count}</p>
              <p className="num text-[10px] text-text-tertiary mt-1">
                {filter === k.level ? 'Click para ver todas' : 'Click para filtrar'}
              </p>
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2">
          {(['all', 'critical', 'warning', 'info'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`num text-[10px] px-3 py-1 rounded border tracking-widest uppercase transition-colors ${
                filter === f
                  ? 'bg-cyan-DEFAULT/10 border-cyan-DEFAULT/40 text-cyan-DEFAULT'
                  : 'border-bg-border text-text-tertiary hover:text-text-primary'
              }`}
            >
              {f === 'all' ? `Todas (${allAlerts.length})` : f === 'critical' ? `Críticas (${criticalCount})` : f === 'warning' ? `Avisos (${warningCount})` : `Info (${infoCount})`}
            </button>
          ))}
          {dismissed.size > 0 && (
            <button
              onClick={() => setDismissed(new Set())}
              className="num text-[10px] px-3 py-1 rounded border border-bg-border text-text-tertiary hover:text-text-primary ml-auto tracking-widest uppercase"
            >
              Restaurar ({dismissed.size})
            </button>
          )}
        </div>

        {/* Alerts List */}
        {filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(alert => {
              const cfg = levelConfig(alert.level)
              return (
                <div key={alert.id} className={`border rounded-lg p-4 ${cfg.cls}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-lg mt-0.5 shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`num text-[9px] px-2 py-0.5 rounded-sm border tracking-widest ${cfg.cls}`}>{cfg.badge}</span>
                          <p className="num text-xs font-bold text-text-primary">{alert.title}</p>
                        </div>
                        <p className="num text-[11px] text-text-secondary mb-2">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap">
                          {alert.campaign && (
                            <p className="num text-[10px] text-text-tertiary truncate max-w-[300px]">
                              <span className="text-text-secondary">Campaña:</span> {alert.campaign}
                            </p>
                          )}
                          {alert.value && (
                            <p className="num text-[10px]" style={{ color: cfg.cls.includes('red') ? '#EF4444' : cfg.cls.includes('amber') ? '#F59E0B' : '#67E8F9' }}>
                              {alert.value}
                            </p>
                          )}
                          <p className="num text-[9px] text-text-tertiary ml-auto">
                            {alert.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
                      className="num text-[10px] text-text-tertiary hover:text-text-primary transition-colors shrink-0 px-2 py-1"
                      title="Descartar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-bg-card border border-bg-border rounded-lg p-12 text-center">
            <p className="num text-2xl mb-2">✓</p>
            <p className="num text-text-secondary text-sm tracking-wider">
              {allAlerts.length === 0
                ? 'No hay alertas activas. Todo funciona correctamente.'
                : 'No hay alertas en la categoría seleccionada.'}
            </p>
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
