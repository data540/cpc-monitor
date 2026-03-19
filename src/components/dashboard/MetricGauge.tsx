'use client'

interface Props {
  cpcCeiling:  number | null
  avgCpc:      number
  cpcUsagePct: number | null
}

export function MetricGauge({ cpcCeiling, avgCpc, cpcUsagePct }: Props) {
  const pct = cpcUsagePct ?? 0

  const barColor =
    pct >= 85 ? '#ef4444' :
    pct >= 70 ? '#f59e0b' :
    pct > 0   ? '#22c55e' :
    '#444444'

  const label =
    pct >= 85 ? 'Cerca del límite' :
    pct >= 70 ? 'Atención' :
    pct > 0   ? 'Margen disponible' :
    'Sin límite configurado'

  return (
    <div>
      {/* Valores numéricos */}
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <p className="text-xs text-text-tertiary uppercase tracking-wider mb-0.5">CPC Medio</p>
          <p className="num text-2xl font-semibold text-text-primary">
            {avgCpc.toFixed(2)}<span className="text-sm text-text-secondary ml-1">€</span>
          </p>
        </div>
        {cpcCeiling && (
          <div className="text-right">
            <p className="text-xs text-text-tertiary uppercase tracking-wider mb-0.5">Techo</p>
            <p className="num text-lg font-medium text-text-secondary">
              {cpcCeiling.toFixed(2)}<span className="text-sm ml-1">€</span>
            </p>
          </div>
        )}
      </div>

      {/* Barra de progreso */}
      <div className="relative h-2 bg-bg-border rounded-full overflow-hidden mb-1">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
        />
        {/* Línea de umbral al 85% */}
        <div
          className="absolute top-0 h-full w-px bg-text-tertiary opacity-50"
          style={{ left: '85%' }}
        />
      </div>

      {/* Etiqueta de uso */}
      <div className="flex items-center justify-between">
        <p className="num text-xs" style={{ color: barColor }}>{label}</p>
        {cpcUsagePct !== null && (
          <p className="num text-xs text-text-secondary">
            <span style={{ color: barColor }} className="font-medium">{pct}%</span>
            {' '}del límite
          </p>
        )}
      </div>
    </div>
  )
}
