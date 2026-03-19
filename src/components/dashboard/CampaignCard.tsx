'use client'

import { useState } from 'react'
import { CampaignMetrics } from '@/types'
import { CpcHistoryChart } from '@/components/charts/CpcHistoryChart'
import { MetricGauge } from './MetricGauge'

interface Props {
  metrics: CampaignMetrics
}

const LEVEL_STYLES = {
  ok:      { border: 'border-bg-border',           badge: 'bg-green-dim text-green-DEFAULT border-green-DEFAULT/30',  dot: 'bg-green-DEFAULT' },
  info:    { border: 'border-blue-DEFAULT/30',      badge: 'bg-blue-dim text-blue-DEFAULT border-blue-DEFAULT/30',     dot: 'bg-blue-DEFAULT'  },
  warning: { border: 'border-amber-DEFAULT/40',     badge: 'bg-amber-dim text-amber-DEFAULT border-amber-DEFAULT/30',  dot: 'bg-amber-DEFAULT' },
  alert:   { border: 'border-red-DEFAULT/50',       badge: 'bg-red-dim text-red-DEFAULT border-red-DEFAULT/30',        dot: 'bg-red-DEFAULT'   },
}

export function CampaignCard({ metrics: m }: Props) {
  const [showHistory, setShowHistory] = useState(false)
  const style = LEVEL_STYLES[m.recommendation.level]

  return (
    <div className={`
      bg-bg-card border rounded-lg overflow-hidden
      transition-all duration-200
      ${style.border}
      ${m.recommendation.level === 'alert' ? 'pulse-alert' : ''}
    `}>

      {/* Header de la card */}
      <div className="px-5 pt-5 pb-4 border-b border-bg-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="num text-xs text-text-tertiary uppercase tracking-wider mb-1">Campaña</p>
            <h3 className="text-sm font-semibold text-text-primary truncate">{m.campaignName}</h3>
          </div>
          <span className={`flex-shrink-0 num text-xs border px-2 py-0.5 rounded-sm ${style.badge}`}>
            {m.recommendation.level === 'ok'      && 'OK'}
            {m.recommendation.level === 'info'    && 'INFO'}
            {m.recommendation.level === 'warning' && 'AVISO'}
            {m.recommendation.level === 'alert'   && 'ALERTA'}
          </span>
        </div>
      </div>

      {/* Gauge CPC */}
      <div className="px-5 py-4">
        <MetricGauge
          cpcCeiling={m.cpcCeiling}
          avgCpc={m.avgCpc}
          cpcUsagePct={m.cpcUsagePct}
        />
      </div>

      {/* Métricas secundarias */}
      <div className="px-5 pb-4 grid grid-cols-3 gap-3">
        <Metric label="Clics" value={m.clicks.toLocaleString('es-ES')} />
        <Metric label="IS" value={m.isActual !== null ? `${Math.round(m.isActual * 100)}%` : 'N/D'} />
        <Metric label="CTR" value={`${m.ctr}%`} />
        <Metric label="Coste" value={`${m.costEur} €`} />
        <Metric label="ROAS obj" value={m.targetRoas ? `${m.targetRoas}x` : '—'} />
        <Metric
          label="ROAS real"
          value={m.realRoas ? `${m.realRoas}x` : '—'}
          highlight={
            m.realRoas && m.targetRoas
              ? m.realRoas >= m.targetRoas ? 'green' : 'red'
              : undefined
          }
        />
      </div>

      {/* Recomendación */}
      {m.recommendation.parts.length > 0 && (
        <div className="mx-5 mb-4 bg-bg-surface border border-bg-border rounded px-3 py-2">
          {m.recommendation.parts.map((p, i) => (
            <p key={i} className="text-xs text-text-secondary leading-relaxed">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${style.dot}`} />
              {p}
            </p>
          ))}
        </div>
      )}

      {/* Toggle historial */}
      <div className="border-t border-bg-border">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="w-full px-5 py-3 num text-xs text-text-tertiary hover:text-text-secondary flex items-center justify-between transition-colors"
        >
          <span>Evolución histórica</span>
          <span>{showHistory ? '▲' : '▼'}</span>
        </button>
        {showHistory && (
          <div className="px-5 pb-5">
            <CpcHistoryChart campaignName={m.campaignName} cpcCeiling={m.cpcCeiling} />
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'red' }) {
  const color = highlight === 'green'
    ? 'text-green-DEFAULT'
    : highlight === 'red'
    ? 'text-red-DEFAULT'
    : 'text-text-primary'

  return (
    <div>
      <p className="text-xs text-text-tertiary uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`num text-sm font-medium ${color}`}>{value}</p>
    </div>
  )
}
