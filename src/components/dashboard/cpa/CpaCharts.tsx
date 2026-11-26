'use client'

import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import type { CampaignSimulation, CampaignView, HeatCell, SegmentRow, WasteRow } from '@/lib/cpa/types'
import { type ConvMode, type DailyPoint, conv, fmtMoney, fmtNum, fmtPct, safeDiv } from '@/lib/cpa/metrics'

export const C = { cyan: '#00D4FF', amber: '#f59e0b', green: '#22c55e', red: '#ef4444', blue: '#3b82f6', grid: '#1e1e1e', axis: '#6b7280' }
const axisProps = { tick: { fill: C.axis, fontSize: 10 }, stroke: '#2a2a2a' }

function Box({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg-surface border border-bg-border rounded px-3 py-2 text-[11px] num text-text-primary shadow-lg">{children}</div>
}

// ── Tendencia diaria: conversiones (barras) + CPA diario y media móvil 7 d + referencia ──
export function TrendChart({ data, currency, ref: refCpa }: { data: DailyPoint[]; currency: string; ref: number | null }) {
  if (!data.length) return <Empty text="Sin datos diarios en el periodo" />
  const maxCpa = Math.max(...data.map(d => Math.max(d.cpa7 ?? 0, refCpa ?? 0)), 1)
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)} minTickGap={16} />
        <YAxis yAxisId="cpa" {...axisProps} width={56} domain={[0, Math.ceil(maxCpa * 1.6)]} allowDataOverflow
          tickFormatter={(v: number) => fmtMoney(v, currency, 0)} />
        <YAxis yAxisId="conv" orientation="right" {...axisProps} width={36} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null
          const p = payload[0].payload as DailyPoint
          return <Box>
            <p className="text-text-tertiary mb-1">{String(label)}</p>
            <p>Coste: {fmtMoney(p.cost, currency)}</p>
            <p>Conversiones: {fmtNum(p.conversions, 1)}</p>
            <p>CPA del día: {fmtMoney(p.cpa, currency)}</p>
            <p style={{ color: C.cyan }}>CPA 7 días: {fmtMoney(p.cpa7, currency)}</p>
            {refCpa !== null && <p style={{ color: C.amber }}>Referencia: {fmtMoney(refCpa, currency)}</p>}
          </Box>
        }} />
        <Bar yAxisId="conv" dataKey="conversions" fill={C.blue} fillOpacity={0.35} name="Conversiones" />
        <Line yAxisId="cpa" type="monotone" dataKey="cpa" stroke="#9ca3af" strokeWidth={1} dot={false} strokeOpacity={0.5} connectNulls name="CPA día" />
        <Line yAxisId="cpa" type="monotone" dataKey="cpa7" stroke={C.cyan} strokeWidth={2} dot={false} connectNulls name="CPA 7 d" />
        {refCpa !== null && <ReferenceLine yAxisId="cpa" y={refCpa} stroke={C.amber} strokeDasharray="5 3"
          label={{ value: 'Referencia', fill: C.amber, fontSize: 9, position: 'insideTopRight' }} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Cuadrantes: gasto (X) frente a desviación del CPA (Y) ──
export function QuadrantChart({ views, currency }: { views: CampaignView[]; currency: string }) {
  const pts = views.filter(v => v.deviation !== null && v.cost > 0)
    .map(v => ({ x: v.cost, y: Math.max(-1, Math.min(2, v.deviation!)) * 100, z: Math.max(v.conversions, 1), v }))
  if (!pts.length) return <Empty text="Sin campañas con CPA y referencia" />
  const sorted = [...pts].map(p => p.x).sort((a, b) => a - b)
  const midX = sorted[Math.floor(sorted.length / 2)]
  const maxX = Math.max(...sorted) * 1.05
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
          <ReferenceArea x1={midX} x2={maxX} y1={-100} y2={0} fill={C.green} fillOpacity={0.05} />
          <ReferenceArea x1={midX} x2={maxX} y1={20} y2={200} fill={C.red} fillOpacity={0.06} />
          <XAxis type="number" dataKey="x" name="Coste" {...axisProps} domain={[0, maxX]} tickFormatter={(v: number) => fmtMoney(v, currency, 0)} />
          <YAxis type="number" dataKey="y" name="Desviación" {...axisProps} width={48} domain={[-100, 200]} tickFormatter={(v: number) => `${v}%`} />
          <ZAxis type="number" dataKey="z" range={[40, 400]} />
          <ReferenceLine y={0} stroke={C.amber} strokeDasharray="5 3" />
          <ReferenceLine y={20} stroke={C.red} strokeDasharray="2 4" strokeOpacity={0.6} />
          <ReferenceLine x={midX} stroke="#374151" strokeDasharray="2 4" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const v = (payload[0].payload as any).v as CampaignView
            return <Box>
              <p className="font-bold mb-1">{v.name}</p>
              <p>Coste: {fmtMoney(v.cost, currency)} · Conv.: {fmtNum(v.conversions, 1)}</p>
              <p>CPA: {fmtMoney(v.cpa, currency)} · Ref.: {fmtMoney(v.refCpa, currency)}{v.refIsAverage ? ' (media)' : ''}</p>
              <p>Desviación: {v.deviation! > 0 ? '+' : ''}{fmtPct(v.deviation, 0)}</p>
            </Box>
          }} />
          <Scatter data={pts}>
            {pts.map((p, i) => <Cell key={i} fill={p.y > 50 ? C.red : p.y > 20 ? C.amber : p.y < -10 ? C.green : C.cyan} fillOpacity={0.75} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 mt-2 num text-[10px] text-text-tertiary">
        <p><span className="text-green-DEFAULT">▲ Abajo a la derecha:</span> mucho gasto y CPA bajo la referencia → escalar</p>
        <p><span className="text-red-DEFAULT">▲ Arriba a la derecha:</span> mucho gasto y CPA alto → prioridad para optimizar</p>
        <p><span className="text-cyan-DEFAULT">● Abajo a la izquierda:</span> poco gasto y buen CPA → probar más presupuesto</p>
        <p><span className="text-amber-DEFAULT">● Arriba a la izquierda:</span> poco gasto y CPA alto → vigilar o recortar</p>
      </div>
    </div>
  )
}

// ── CPA por segmento (barras horizontales) ──
export function SegmentChart({ rows, mode, currency, refCpa }: { rows: SegmentRow[]; mode: ConvMode; currency: string; refCpa: number | null }) {
  const data = rows.filter(r => r.cost > 0).slice(0, 10).map(r => {
    const c = conv(r, mode)
    return { label: r.label, cost: r.cost, conv: c, cpa: safeDiv(r.cost, c), noConv: c === 0 }
  })
  if (!data.length) return <Empty text="Sin datos" />
  const maxCpa = Math.max(...data.map(d => d.cpa ?? 0), refCpa ?? 0, 1)
  const plot = data.map(d => ({ ...d, bar: d.cpa ?? maxCpa * 1.1 }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, plot.length * 30 + 30)}>
      <BarChart data={plot} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v: number) => fmtMoney(v, currency, 0)} domain={[0, Math.ceil(maxCpa * 1.15)]} />
        <YAxis type="category" dataKey="label" {...axisProps} width={120} tickFormatter={(s: string) => (s.length > 18 ? s.slice(0, 17) + '…' : s)} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          const d = payload[0].payload as typeof plot[0]
          return <Box>
            <p className="font-bold mb-1">{d.label}</p>
            <p>Coste: {fmtMoney(d.cost, currency)}</p>
            <p>Conversiones: {fmtNum(d.conv, 1)}</p>
            <p>CPA: {d.noConv ? 'sin conversiones' : fmtMoney(d.cpa, currency)}</p>
          </Box>
        }} />
        {refCpa !== null && <ReferenceLine x={refCpa} stroke={C.amber} strokeDasharray="5 3" />}
        <Bar dataKey="bar" radius={[0, 3, 3, 0]}>
          {plot.map((d, i) => <Cell key={i}
            fill={d.noConv ? '#4b5563' : refCpa && d.cpa! > refCpa * 1.5 ? C.red : refCpa && d.cpa! > refCpa * 1.2 ? C.amber : C.green}
            fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Mapa de calor hora × día ──
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export type HeatMetric = 'cpa' | 'conversions' | 'cost'

export function Heatmap({ cells, mode, currency, refCpa, metric }: { cells: HeatCell[]; mode: ConvMode; currency: string; refCpa: number | null; metric: HeatMetric }) {
  if (!cells.length) return <Empty text="Sin datos por hora" />
  const grid = new Map(cells.map(c => [`${c.dow}-${c.hour}`, c]))
  const convOf = (c: HeatCell) => (mode === 'all' ? c.allConv : c.conversions)
  const maxConv = Math.max(...cells.map(convOf), 1)
  const maxCost = Math.max(...cells.map(c => c.cost), 1)

  const color = (c: HeatCell | undefined) => {
    if (!c || c.cost === 0) return 'rgba(255,255,255,0.03)'
    if (metric === 'conversions') return `rgba(59,130,246,${0.1 + 0.85 * convOf(c) / maxConv})`
    if (metric === 'cost') return `rgba(0,212,255,${0.1 + 0.85 * c.cost / maxCost})`
    const cv = convOf(c)
    if (!refCpa) return 'rgba(255,255,255,0.08)'
    if (cv === 0) return c.cost >= refCpa ? 'rgba(239,68,68,0.75)' : 'rgba(107,114,128,0.35)'
    const ratio = c.cost / cv / refCpa
    if (ratio <= 0.8) return 'rgba(34,197,94,0.75)'
    if (ratio <= 1.0) return 'rgba(34,197,94,0.4)'
    if (ratio <= 1.2) return 'rgba(245,158,11,0.45)'
    if (ratio <= 1.5) return 'rgba(245,158,11,0.75)'
    return 'rgba(239,68,68,0.7)'
  }
  const title = (c: HeatCell | undefined, d: number, h: number) => {
    if (!c) return `${DAYS[d]} ${h}h · sin datos`
    return `${DAYS[d]} ${String(h).padStart(2, '0')}h · coste ${fmtMoney(c.cost, currency)} · conv. ${fmtNum(convOf(c), 1)} · CPA ${fmtMoney(safeDiv(c.cost, convOf(c)), currency)}`
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-[2px] min-w-[640px]" style={{ gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))' }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="num text-[9px] text-text-tertiary text-center">{h}</div>)}
        {DAYS.map((dn, d) => [
          <div key={`l${d}`} className="num text-[10px] text-text-tertiary flex items-center">{dn}</div>,
          ...Array.from({ length: 24 }, (_, h) => {
            const c = grid.get(`${d}-${h}`)
            return <div key={`${d}-${h}`} title={title(c, d, h)} className="h-6 rounded-[2px]" style={{ background: color(c) }} />
          }),
        ])}
      </div>
      {metric === 'cpa' && (
        <div className="flex flex-wrap gap-3 mt-3 num text-[10px] text-text-tertiary">
          <span><i className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: 'rgba(34,197,94,0.75)' }} />≤ 80 % ref.</span>
          <span><i className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: 'rgba(34,197,94,0.4)' }} />≤ ref.</span>
          <span><i className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: 'rgba(245,158,11,0.45)' }} />≤ 120 %</span>
          <span><i className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: 'rgba(245,158,11,0.75)' }} />≤ 150 %</span>
          <span><i className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: 'rgba(239,68,68,0.7)' }} />&gt; 150 % o gasto sin conv.</span>
          <span><i className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: 'rgba(107,114,128,0.35)' }} />poco gasto sin conv.</span>
        </div>
      )}
    </div>
  )
}

// ── Pareto del gasto sin conversiones ──
export function ParetoChart({ rows, currency }: { rows: WasteRow[]; currency: string }) {
  const noConv = rows.filter(r => r.conversions === 0).slice(0, 20)
  if (!noConv.length) return <Empty text="No hay gasto sin conversiones" />
  const total = noConv.reduce((s, r) => s + r.cost, 0)
  let acc = 0
  const data = noConv.map(r => { acc += r.cost; return { label: r.text, cost: r.cost, cum: (acc / total) * 100 } })
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 50, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval={0} angle={-35} textAnchor="end" height={60}
          tickFormatter={(s: string) => (s.length > 16 ? s.slice(0, 15) + '…' : s)} />
        <YAxis yAxisId="c" {...axisProps} width={56} tickFormatter={(v: number) => fmtMoney(v, currency, 0)} />
        <YAxis yAxisId="p" orientation="right" {...axisProps} width={36} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          const d = payload[0].payload as typeof data[0]
          return <Box><p className="font-bold mb-1">{d.label}</p><p>Coste sin conv.: {fmtMoney(d.cost, currency)}</p><p>Acumulado: {fmtNum(d.cum, 0)} %</p></Box>
        }} />
        <Bar yAxisId="c" dataKey="cost" fill={C.red} fillOpacity={0.6} />
        <Line yAxisId="p" type="monotone" dataKey="cum" stroke={C.amber} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Simulador de Google ──
export function SimulationChart({ sim, currency }: { sim: CampaignSimulation; currency: string }) {
  const isCpa = sim.type === 'TARGET_CPA'
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={sim.points} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
        <XAxis type="number" dataKey="x" {...axisProps} domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtMoney(v, currency, 0)} />
        <YAxis yAxisId="conv" {...axisProps} width={44} />
        <YAxis yAxisId="cost" orientation="right" {...axisProps} width={60} tickFormatter={(v: number) => fmtMoney(v, currency, 0)} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          const p = payload[0].payload as CampaignSimulation['points'][0]
          return <Box>
            <p className="font-bold mb-1">{isCpa ? 'CPA objetivo' : 'Presupuesto diario'}: {fmtMoney(p.x, currency)}</p>
            <p style={{ color: C.blue }}>Conversiones: {fmtNum(p.conversions, 1)}</p>
            <p style={{ color: C.cyan }}>Coste: {fmtMoney(p.cost, currency)}</p>
            <p>CPA resultante: {fmtMoney(safeDiv(p.cost, p.conversions), currency)}</p>
          </Box>
        }} />
        <Line yAxisId="conv" type="monotone" dataKey="conversions" stroke={C.blue} strokeWidth={2} dot={{ r: 3 }} />
        <Line yAxisId="cost" type="monotone" dataKey="cost" stroke={C.cyan} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
        {sim.current !== null && <ReferenceLine yAxisId="conv" x={sim.current} stroke={C.amber} strokeDasharray="5 3"
          label={{ value: 'Actual', fill: C.amber, fontSize: 9, position: 'insideTopLeft' }} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="h-24 flex items-center justify-center num text-[11px] text-text-tertiary">{text}</div>
}
