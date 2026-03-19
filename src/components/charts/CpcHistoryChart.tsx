'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { HistoryPoint } from '@/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
  campaignName: string
  cpcCeiling:   number | null
}

export function CpcHistoryChart({ campaignName, cpcCeiling }: Props) {
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/campaigns/history?campaignName=${encodeURIComponent(campaignName)}&days=30`)
      .then(r => r.json())
      .then(d => {
        setHistory(d.history ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [campaignName])

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center">
        <span className="num text-xs text-text-tertiary animate-pulse">Cargando historial...</span>
      </div>
    )
  }

  if (history.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center">
        <span className="num text-xs text-text-tertiary">
          Historial disponible tras la segunda ejecución
        </span>
      </div>
    )
  }

  const chartData = history.map(h => ({
    date:       format(new Date(h.capturedAt), 'd MMM HH:mm', { locale: es }),
    cpc:        h.avgCpc,
    techo:      h.cpcCeiling ?? cpcCeiling,
    clicks:     h.clicks,
    is:         h.isActual !== null ? Math.round(h.isActual * 100) : null,
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-bg-card border border-bg-border rounded px-3 py-2 text-xs">
        <p className="num text-text-tertiary mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="num" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
            {p.dataKey === 'is' ? '%' : ' €'}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="h-48 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242424" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#444', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: '#242424' }}
          />
          <YAxis
            tick={{ fill: '#444', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: '#242424' }}
            tickFormatter={v => `${v}€`}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Línea de referencia del techo */}
          {cpcCeiling && (
            <ReferenceLine
              y={cpcCeiling}
              stroke="#ef4444"
              strokeDasharray="4 2"
              strokeOpacity={0.5}
              label={{ value: 'techo', fill: '#ef4444', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            />
          )}

          {/* Línea de umbral de alerta (85% del techo) */}
          {cpcCeiling && (
            <ReferenceLine
              y={Math.round(cpcCeiling * 0.85 * 100) / 100}
              stroke="#f59e0b"
              strokeDasharray="4 2"
              strokeOpacity={0.4}
            />
          )}

          <Line
            type="monotone"
            dataKey="cpc"
            name="CPC medio"
            stroke="#22c55e"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: '#22c55e' }}
          />
          <Line
            type="monotone"
            dataKey="techo"
            name="Techo"
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="4 2"
            dot={false}
            strokeOpacity={0.6}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
