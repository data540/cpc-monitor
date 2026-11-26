'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccountContext } from '@/contexts/AccountContext'
import { AppSidebar } from '@/components/layout/AppSidebar'
import type {
  CampaignView, CpaAiAnalysis, CpaAlert, CpaOverview, CpaPeriod, CpaReport, CpaSegments, CpaSimulations, CpaWaste,
} from '@/lib/cpa/types'
import {
  type ConvMode, buildCampaignViews, computeKpis, dailySeries, fmtDelta, fmtMoney, fmtNum, fmtPct,
  isCpaStrategy, referenceCpa, strategyLabel, systemStatusLabel,
} from '@/lib/cpa/metrics'
import { runOverviewRules, runSegmentRules, runWasteRules, sortAlerts } from '@/lib/cpa/rules'
import { renderCpaReportHtml } from '@/lib/cpa/report'
import { ModelPicker, useModelChoice } from './ModelPicker'
import { SortTh, useSort } from './cpa/useSort'
import { type AiUsage, formatUsage } from '@/lib/ai/usage'
import {
  type HeatMetric, Empty, Heatmap, ParetoChart, QuadrantChart, SegmentChart, SimulationChart, TrendChart,
} from './cpa/CpaCharts'

type Tab = 'resumen' | 'campanas' | 'segmentos' | 'desperdicio' | 'simulador' | 'alertas' | 'ia'
type StrategyFilter = 'cpa' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' }, { id: 'campanas', label: 'Campañas' },
  { id: 'segmentos', label: 'Segmentos' }, { id: 'desperdicio', label: 'Desperdicio' },
  { id: 'simulador', label: 'Simulador' }, { id: 'alertas', label: 'Alertas' }, { id: 'ia', label: 'Análisis IA' },
]
const PERIODS: CpaPeriod[] = [7, 14, 30, 90, 180, 365]
const CONCURRENCY = 4
const EMPTY_CONV: CpaSegments['conversionsByAction'] = []
const EMPTY_TARGETS: CpaAiAnalysis['targets'] = []

type CampStatusFilter = 'all' | 'enabled' | 'paused' | 'learning' | 'limited' | 'misconfigured' | 'over' | 'noconv'
const CAMP_STATUS_OPTIONS: { v: CampStatusFilter; l: string }[] = [
  { v: 'all', l: 'Todos los estados' }, { v: 'enabled', l: 'Activas' }, { v: 'paused', l: 'Pausadas' },
  { v: 'learning', l: 'En aprendizaje' }, { v: 'limited', l: 'Limitadas' }, { v: 'misconfigured', l: 'Mal configuradas' },
  { v: 'over', l: 'CPA > referencia +20 %' }, { v: 'noconv', l: 'Gasto sin conversiones' },
]
function matchCampStatus(v: CampaignView, f: CampStatusFilter): boolean {
  const s = v.systemStatus ?? ''
  switch (f) {
    case 'enabled': return v.status === 'ENABLED'
    case 'paused': return v.status === 'PAUSED'
    case 'learning': return v.status === 'ENABLED' && (s.startsWith('LEARNING') || s === 'MULTIPLE_LEARNING')
    case 'limited': return v.status === 'ENABLED' && (s.startsWith('LIMITED') || s === 'MULTIPLE_LIMITED')
    case 'misconfigured': return s.startsWith('MISCONFIGURED') || s === 'MULTIPLE_MISCONFIGURED'
    case 'over': return v.deviation !== null && v.deviation > 0.2
    case 'noconv': return v.cost > 0 && v.conversions === 0
    default: return true
  }
}

const KW_STATUS: Record<string, string> = {
  ENABLED: 'Activa', PAUSED: 'Pausada', AD_GROUP_PAUSED: 'Grupo pausado', CAMPAIGN_PAUSED: 'Campaña pausada', REMOVED: 'Eliminada',
}
const TERM_STATUS: Record<string, string> = {
  ADDED: 'Añadido como palabra clave', EXCLUDED: 'Excluido (negativa)', ADDED_EXCLUDED: 'Añadido y excluido', NONE: 'Sin añadir',
}
const statusLabel = (kind: 'term' | 'keyword', s: string | null) => (s ? (kind === 'term' ? TERM_STATUS : KW_STATUS)[s] ?? s : '—')
const statusClass = (s: string | null) =>
  s === 'ENABLED' ? 'text-green-DEFAULT' : s === 'EXCLUDED' ? 'text-cyan-DEFAULT' : s === 'REMOVED' ? 'text-red-DEFAULT'
    : s === 'ADDED' || s === 'ADDED_EXCLUDED' ? 'text-text-primary' : 'text-amber-DEFAULT'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
  return json as T
}

// ── Piezas de UI ──────────────────────────────────────────────
function Card({ title, children, right, className = '' }: { title?: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-bg-card border border-bg-border rounded-lg p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-4 gap-3">
          {title && <h2 className="num text-[12px] font-bold text-text-secondary tracking-[0.15em] uppercase">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

function Kpi({ label, value, delta, inverse, hint }: { label: string; value: string; delta?: number | null; inverse?: boolean; hint?: string }) {
  const good = delta === null || delta === undefined ? null : inverse ? delta < 0 : delta > 0
  return (
    <div className="bg-bg-card border border-bg-border rounded-lg p-4" title={hint}>
      <p className="num text-[10px] text-text-soft tracking-widest uppercase mb-2">{label}</p>
      <p className="num text-xl font-bold text-text-primary">{value}</p>
      {delta !== null && delta !== undefined && (
        <p className={`num text-[11px] mt-1 ${good ? 'text-green-DEFAULT' : 'text-red-DEFAULT'}`}>
          {delta > 0 ? '▲' : '▼'} {fmtPct(Math.abs(delta), 0)} <span className="text-text-soft">vs anterior</span>
        </p>
      )}
    </div>
  )
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex border border-bg-line rounded-md overflow-hidden divide-x divide-bg-line">
      {options.map(o => (
        <button key={String(o.v)} onClick={() => onChange(o.v)}
          className={`num text-[12px] px-3.5 py-2 tracking-wide transition-colors ${value === o.v ? 'bg-cyan-DEFAULT/20 text-cyan-DEFAULT font-bold' : 'text-text-soft hover:text-text-primary hover:bg-bg-hover'}`}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

function deviationClass(d: number | null) {
  if (d === null) return 'text-text-soft'
  if (d > 0.5) return 'text-red-DEFAULT font-bold'
  if (d > 0.2) return 'text-amber-DEFAULT'
  if (d < -0.1) return 'text-green-DEFAULT'
  return 'text-text-primary'
}

const LEVEL_CFG = {
  critical: { cls: 'bg-red-DEFAULT/10 border-red-DEFAULT/30', text: 'text-red-DEFAULT', badge: 'CRÍTICO' },
  warning:  { cls: 'bg-amber-DEFAULT/10 border-amber-DEFAULT/30', text: 'text-amber-DEFAULT', badge: 'AVISO' },
  info:     { cls: 'bg-cyan-DEFAULT/10 border-cyan-DEFAULT/30', text: 'text-cyan-DEFAULT', badge: 'INFO' },
}

function AlertList({ alerts, showAccount }: { alerts: CpaAlert[]; showAccount: boolean }) {
  if (!alerts.length) return <Empty text="Sin alertas. Todo dentro de lo esperado." />
  return (
    <div className="space-y-2">
      {alerts.map(a => {
        const c = LEVEL_CFG[a.level]
        return (
          <div key={`${a.account}-${a.id}`} className={`border rounded-lg p-3 ${c.cls}`}>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`num text-[10px] px-2 py-0.5 rounded-sm border tracking-widest ${c.cls} ${c.text}`}>{c.badge}</span>
              <p className="num text-xs font-bold text-text-primary">{a.title}</p>
              {a.value && <span className={`num text-[11px] ml-auto ${c.text}`}>{a.value}</span>}
            </div>
            <p className="num text-[12px] text-text-secondary">{a.description}</p>
            {(a.campaign || (showAccount && a.account)) && (
              <p className="num text-[11px] text-text-soft mt-1">
                {showAccount && a.account && <><span className="text-text-secondary">Cuenta:</span> {a.account}{a.campaign ? ' · ' : ''}</>}
                {a.campaign && <><span className="text-text-secondary">Campaña:</span> {a.campaign}</>}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export function CpaAnalysisClient() {
  const { selectedIds, getAccountName } = useAccountContext()
  const aiModel = useModelChoice()

  const [tab, setTab] = useState<Tab>('resumen')
  const [days, setDays] = useState<CpaPeriod>(30)
  const [mode, setMode] = useState<ConvMode>('primary')
  const [strategy, setStrategy] = useState<StrategyFilter>('cpa')
  const [search, setSearch] = useState('')

  const [overviews, setOverviews] = useState<Record<string, CpaOverview>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Cuenta en foco (segmentos, desperdicio, simulador, IA) y campaña opcional
  const [focusId, setFocusId] = useState<string>('')
  const [focusCampaign, setFocusCampaign] = useState<string>('')

  const [detail, setDetail] = useState<Record<string, unknown>>({})         // caché cliente de segmentos/desperdicio/simulador
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({})
  const [detailError, setDetailError] = useState<Record<string, string>>({})

  const [heatMetric, setHeatMetric] = useState<HeatMetric>('cpa')
  const [simId, setSimId] = useState('')
  const [wasteKind, setWasteKind] = useState<'term' | 'keyword'>('term')
  const [campStatus, setCampStatus] = useState<CampStatusFilter>('all')
  const [wasteQuery, setWasteQuery] = useState('')
  const [wasteStatus, setWasteStatus] = useState('all')
  const [wasteOnlyNoConv, setWasteOnlyNoConv] = useState(false)
  const [alertFilter, setAlertFilter] = useState<'all' | CpaAlert['level']>('all')

  const [ai, setAi] = useState<Record<string, { analysis: CpaAiAnalysis; model: string; usage?: AiUsage | null; alerts: CpaAlert[] }>>({})
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Carga del resumen de todas las cuentas seleccionadas ──
  const loadSeq = useRef(0)
  const loadOverviews = useCallback(async (ids: string[], period: CpaPeriod, force = false) => {
    const seq = ++loadSeq.current
    setLoading(true)
    setErrors({})
    const next: Record<string, CpaOverview> = {}
    const errs: Record<string, string> = {}
    const queue = [...ids]
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift()!
        try {
          next[id] = await getJson<CpaOverview>(`/api/cpa/overview?customerId=${id}&days=${period}${force ? '&refresh=1' : ''}`)
        } catch (e) { errs[id] = (e as Error).message }
        if (seq === loadSeq.current) { setOverviews({ ...next }); setErrors({ ...errs }) }
      }
    }))
    if (seq !== loadSeq.current) return
    setLoading(false)
    setLastUpdate(new Date())
  }, [])

  useEffect(() => {
    setOverviews({})
    setDetail({})
    if (selectedIds.length) loadOverviews(selectedIds, days)
  }, [selectedIds, days, loadOverviews])

  useEffect(() => {
    if (!selectedIds.includes(focusId)) setFocusId(selectedIds[0] ?? '')
  }, [selectedIds, focusId])
  useEffect(() => { setFocusCampaign('') }, [focusId])

  // ── Vistas derivadas ──
  const allViews = useMemo(() => {
    const out: CampaignView[] = []
    for (const id of selectedIds) { const o = overviews[id]; if (o) out.push(...buildCampaignViews(o, mode)) }
    return out
  }, [overviews, selectedIds, mode])

  const views = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allViews.filter(v => (strategy === 'all' || isCpaStrategy(v.biddingType)) && (!q || v.name.toLowerCase().includes(q)))
  }, [allViews, strategy, search])

  const byCurrency = useMemo(() => {
    const m = new Map<string, CampaignView[]>()
    for (const v of views) m.set(v.currency, [...(m.get(v.currency) ?? []), v])
    return [...m.entries()]
  }, [views])

  const loadedOverviews = useMemo(() => selectedIds.map(id => overviews[id]).filter(Boolean) as CpaOverview[], [overviews, selectedIds])

  const overviewAlerts = useMemo(() => sortAlerts(loadedOverviews.flatMap(o => runOverviewRules(o, mode))), [loadedOverviews, mode])

  // ── Cuenta en foco ──
  const focus = overviews[focusId]
  const focusViews = useMemo(() => views.filter(v => v.accountId === focusId), [views, focusId])
  const scopeIds = useMemo(() => {
    if (focusCampaign) return [focusCampaign]
    if (strategy === 'all' && !search.trim()) return undefined
    return focusViews.map(v => v.id)
  }, [focusCampaign, strategy, search, focusViews])
  const scopeKey = scopeIds ? scopeIds.join(',') : ''
  const focusRef = focus ? referenceCpa(focus, mode) : null
  const focusCampaignRef = focusCampaign ? focusViews.find(v => v.id === focusCampaign)?.refCpa ?? focusRef : focusRef

  const detailKey = (kind: string) => `${kind}:${focusId}:${days}:${scopeKey}`
  const loadDetail = useCallback(async <T,>(kind: 'segments' | 'waste' | 'simulation', force = false): Promise<T | null> => {
    if (!focusId) return null
    if (scopeIds && scopeIds.length === 0) return null
    const key = `${kind}:${focusId}:${days}:${scopeKey}`
    if (!force && detail[key]) return detail[key] as T
    setDetailLoading(s => ({ ...s, [key]: true }))
    setDetailError(s => { const n = { ...s }; delete n[key]; return n })
    try {
      const qs = new URLSearchParams({ customerId: focusId, days: String(days) })
      if (scopeKey) qs.set('campaignIds', scopeKey)
      if (force) qs.set('refresh', '1')
      const data = await getJson<T>(`/api/cpa/${kind}?${qs}`)
      setDetail(s => ({ ...s, [key]: data }))
      return data
    } catch (e) {
      setDetailError(s => ({ ...s, [key]: (e as Error).message }))
      return null
    } finally {
      setDetailLoading(s => ({ ...s, [key]: false }))
    }
  }, [focusId, days, scopeKey, scopeIds, detail])

  useEffect(() => {
    if (!focus) return
    if (tab === 'segmentos') loadDetail('segments')
    if (tab === 'desperdicio') loadDetail('waste')
    if (tab === 'simulador') loadDetail('simulation')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, focusId, days, scopeKey, !!focus])

  const segments = detail[detailKey('segments')] as CpaSegments | undefined
  const waste = detail[detailKey('waste')] as CpaWaste | undefined
  const sims = detail[detailKey('simulation')] as CpaSimulations | undefined

  const focusDetailAlerts = useMemo(() => {
    if (!focus) return []
    return [
      ...(segments ? runSegmentRules(segments, focusCampaignRef, focus.currency, focus.name, mode) : []),
      ...(waste ? runWasteRules(waste, focusCampaignRef, focus.currency, focus.name) : []),
    ]
  }, [focus, segments, waste, focusCampaignRef, mode])

  const allAlerts = useMemo(() => sortAlerts([...overviewAlerts, ...focusDetailAlerts]), [overviewAlerts, focusDetailAlerts])

  const aiKey = `${focusId}:${days}:${mode}:${scopeKey}:${aiModel.family}`
  const aiResult = ai[aiKey]

  // ── Desperdicio: filtros y ordenación ──
  const wasteRef = focusCampaignRef ?? 0
  const wasteAll = useMemo(() => (waste ? (wasteKind === 'term' ? waste.terms : waste.keywords) : []), [waste, wasteKind])
  const wasteRows = useMemo(() => {
    const q = wasteQuery.trim().toLowerCase()
    return wasteAll
      .map(r => ({ ...r, cpa: r.conversions > 0 ? r.cost / r.conversions : null, flagged: r.conversions === 0 && wasteRef > 0 && r.cost >= 2 * wasteRef }))
      .filter(r => (!q || r.text.toLowerCase().includes(q))
        && (wasteStatus === 'all' || r.status === wasteStatus)
        && (!wasteOnlyNoConv || r.conversions === 0))
  }, [wasteAll, wasteQuery, wasteStatus, wasteOnlyNoConv, wasteRef])
  const wasteStatuses = useMemo(() => [...new Set(wasteAll.map(r => r.status).filter((s): s is string => !!s))], [wasteAll])
  const wasteSort = useSort(wasteRows, 'cost')
  useEffect(() => { setWasteStatus('all') }, [wasteKind])

  // ── Segmentos, simulador e IA: tablas ordenables ──
  const convSort = useSort(segments?.conversionsByAction ?? EMPTY_CONV, 'allConv')
  const sim = sims?.simulations.find(s => `${s.campaignId}:${s.type}` === simId) ?? sims?.simulations[0] ?? null
  const simRows = useMemo(() => {
    if (!sim) return []
    const base = sim.current !== null
      ? sim.points.reduce((b, p) => (Math.abs(p.x - sim.current!) < Math.abs(b.x - sim.current!) ? p : b), sim.points[0])
      : null
    return sim.points.map(p => {
      const dc = base ? p.conversions - base.conversions : null
      const dk = base ? p.cost - base.cost : null
      return {
        ...p, isBase: base === p, cpaRes: p.conversions > 0 ? p.cost / p.conversions : null, dc, dk,
        marginal: base !== p && dc && dk !== null && Math.abs(dc) > 0.01 ? dk / dc : null,
      }
    })
  }, [sim])
  const simSort = useSort(simRows, 'x', 1)
  const targetsSort = useSort(aiResult?.analysis.targets ?? EMPTY_TARGETS, 'campaign', 1)

  // ── IA ──
  async function runAi() {
    if (!focus) return
    setAiBusy(true); setAiError('')
    try {
      const [s, w, sm] = await Promise.all([
        loadDetail<CpaSegments>('segments'), loadDetail<CpaWaste>('waste'), loadDetail<CpaSimulations>('simulation'),
      ])
      // Solo las campañas del filtro actual
      const ids = new Set(focusViews.map(v => v.id))
      const ov: CpaOverview = scopeIds
        ? { ...focus, campaigns: focus.campaigns.filter(c => ids.has(c.id) && (!focusCampaign || c.id === focusCampaign)),
            daily: focus.daily.filter(d => ids.has(d.campaignId) && (!focusCampaign || d.campaignId === focusCampaign)) }
        : focus
      const res = await fetch('/api/cpa/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: focusId, mode, model: aiModel.model, overview: ov, segments: s, waste: w, simulations: sm }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      setAi(prev => ({ ...prev, [aiKey]: json }))
    } catch (e) {
      setAiError((e as Error).message)
    } finally {
      setAiBusy(false)
    }
  }

  function buildReport(): CpaReport | null {
    if (!focus) return null
    const fv = focusCampaign ? focusViews.filter(v => v.id === focusCampaign) : focusViews
    return {
      generatedAt: new Date().toISOString(),
      model: aiResult?.model ?? null,
      account: { customerId: focus.customerId, name: focus.name, currency: focus.currency },
      period: focus.period, conversionsMode: mode,
      kpis: computeKpis(fv, [focus], mode),
      campaigns: [...fv].sort((a, b) => b.cost - a.cost),
      alerts: aiResult?.alerts ?? sortAlerts([...runOverviewRules(focus, mode), ...focusDetailAlerts]),
      analysis: aiResult?.analysis ?? null,
      usage: aiResult?.usage ?? null,
    }
  }
  function download() {
    const r = buildReport(); if (!r) return
    const blob = new Blob([renderCpaReportHtml(r)], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cpa-analysis-${r.account.name.replace(/[^\w-]+/g, '_')}-${r.period.end}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  function openTab() {
    const r = buildReport(); if (!r) return
    const url = URL.createObjectURL(new Blob([renderCpaReportHtml(r)], { type: 'text/html;charset=utf-8' }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  // ── Tablas ordenables ──
  const campaignRows = useMemo(() => views.filter(v => matchCampStatus(v, campStatus)), [views, campStatus])
  const campSort = useSort(campaignRows, 'cost')

  const multiAccount = selectedIds.length > 1
  const firstOverview = loadedOverviews[0]

  // ── Selector de cuenta/campaña para pestañas de detalle ──
  const focusBar = (
    <div className="flex items-center gap-2 flex-wrap">
      {multiAccount && (
        <select value={focusId} onChange={e => setFocusId(e.target.value)}
          className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary placeholder:text-text-soft max-w-[240px]">
          {selectedIds.map(id => <option key={id} value={id}>{getAccountName(id)}</option>)}
        </select>
      )}
      <select value={focusCampaign} onChange={e => setFocusCampaign(e.target.value)}
        className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary placeholder:text-text-soft max-w-[280px]">
        <option value="">{strategy === 'cpa' ? 'Todas las campañas CPA' : 'Todas las campañas'}{search ? ' (filtradas)' : ''}</option>
        {focusViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    </div>
  )

  const detailState = (kind: string) => {
    const key = detailKey(kind)
    if (detailLoading[key]) return <Empty text="Cargando datos de Google Ads…" />
    if (detailError[key]) return <p className="num text-[12px] text-red-DEFAULT">{detailError[key]}</p>
    if (scopeIds && scopeIds.length === 0) return <Empty text="No hay campañas en el filtro actual" />
    return null
  }

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <AppSidebar activeSection="cpa-analysis" lastUpdate={lastUpdate} loading={loading}
        onRefresh={() => { setDetail({}); loadOverviews(selectedIds, days, true) }} />

      <main className="ml-[240px] flex-1 overflow-y-auto px-8 py-8 space-y-6">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="num text-[11px] text-text-soft tracking-[0.2em] uppercase mb-1">Análisis › CPA</p>
            <h1 className="num text-xl font-bold text-text-primary tracking-wide">CPA Analysis</h1>
            {firstOverview && (
              <p className="num text-[11px] text-text-soft mt-1">
                {firstOverview.period.start} → {firstOverview.period.end} · comparado con {firstOverview.prevPeriod.start} → {firstOverview.prevPeriod.end}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Seg value={days} onChange={setDays} options={PERIODS.map(p => ({ v: p, l: `${p} d` }))} />
            <Seg value={mode} onChange={setMode} options={[{ v: 'primary', l: 'Conv. principales' }, { v: 'all', l: 'Todas las conv.' }]} />
            <Seg value={strategy} onChange={setStrategy} options={[{ v: 'cpa', l: 'Solo CPA' }, { v: 'all', l: 'Todas' }]} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar campaña…"
              className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary placeholder:text-text-soft w-44" />
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-bg-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`num text-[13px] px-4 py-2.5 tracking-wide border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.id ? 'border-cyan-DEFAULT text-cyan-DEFAULT font-bold' : 'border-transparent text-text-soft hover:text-text-primary'}`}>
              {t.label}{t.id === 'alertas' && allAlerts.length ? ` (${allAlerts.length})` : ''}
            </button>
          ))}
        </div>

        {selectedIds.length === 0 && <Card><Empty text="Selecciona una o varias cuentas en el panel izquierdo" /></Card>}

        {Object.entries(errors).map(([id, e]) => (
          <p key={id} className="num text-[12px] text-red-DEFAULT">{getAccountName(id)}: {e}</p>
        ))}

        {selectedIds.length > 0 && !loadedOverviews.length && loading && <Card><Empty text="Cargando campañas…" /></Card>}

        {loadedOverviews.length > 0 && views.length === 0 && tab !== 'alertas' && (
          <Card><Empty text={strategy === 'cpa' ? 'No hay campañas con CPA objetivo o Maximizar conversiones. Cambia el filtro a "Todas".' : 'No hay campañas que coincidan.'} /></Card>
        )}

        {/* ── RESUMEN ── */}
        {tab === 'resumen' && byCurrency.map(([currency, vs]) => {
          const k = computeKpis(vs, loadedOverviews, mode)
          const keys = new Set(vs.map(v => `${v.accountId}:${v.id}`))
          const series = dailySeries(loadedOverviews, keys, mode, k.refCpa)
          const withRef = vs.filter(v => v.deviation !== null)
          const counts = {
            ok: withRef.filter(v => v.deviation! <= 0.2).length,
            warn: withRef.filter(v => v.deviation! > 0.2 && v.deviation! <= 0.5).length,
            crit: withRef.filter(v => v.deviation! > 0.5).length + vs.filter(v => v.conversions === 0 && v.cost > 0).length,
          }
          return (
            <div key={currency} className="space-y-4">
              {byCurrency.length > 1 && <p className="num text-[12px] text-text-secondary tracking-widest uppercase">Cuentas en {currency}</p>}
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                <Kpi label="Coste" value={fmtMoney(k.cost, currency)} delta={fmtDelta(k.cost, k.prevCost)} />
                <Kpi label="Conversiones" value={fmtNum(k.conversions, 1)} delta={fmtDelta(k.conversions, k.prevConversions)} />
                <Kpi label="CPA real" value={fmtMoney(k.cpa, currency)} delta={fmtDelta(k.cpa, k.prevCpa)} inverse />
                <Kpi label="CPA referencia" value={fmtMoney(k.refCpa, currency)}
                  hint="Objetivos de las campañas ponderados por gasto; si no tienen objetivo, la media de la cuenta" />
                <Kpi label="Desviación"
                  value={k.cpa !== null && k.refCpa ? `${k.cpa > k.refCpa ? '+' : ''}${fmtPct((k.cpa - k.refCpa) / k.refCpa, 0)}` : '—'} />
                <Kpi label="Tasa de conversión" value={fmtPct(k.convRate, 2)} />
                <Kpi label="CPC medio" value={fmtMoney(k.cpc, currency)} />
                <Kpi label="CTR" value={fmtPct(k.ctr, 2)} />
                <Kpi label="Cuota de impresiones" value={fmtPct(k.isShare, 0)} />
                <Kpi label="IS perdida (ppto / ranking)" value={`${fmtPct(k.isLostBudget, 0)} / ${fmtPct(k.isLostRank, 0)}`} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card title="Evolución del CPA" className="xl:col-span-2">
                  <TrendChart data={series} currency={currency} refCpa={k.refCpa} />
                  <p className="num text-[11px] text-text-soft mt-2">Barras: conversiones diarias · Línea azul: CPA medio de 7 días · Línea discontinua: referencia. Los últimos días pueden estar incompletos por el retraso de las conversiones.</p>
                </Card>
                <Card title="Semáforo de campañas">
                  <div className="space-y-3">
                    {[
                      { l: 'En objetivo (≤ +20 %)', n: counts.ok, c: 'text-green-DEFAULT' },
                      { l: 'Por encima (+20 % a +50 %)', n: counts.warn, c: 'text-amber-DEFAULT' },
                      { l: 'Muy por encima o sin conversiones', n: counts.crit, c: 'text-red-DEFAULT' },
                    ].map(x => (
                      <div key={x.l} className="flex items-center justify-between">
                        <span className="num text-[12px] text-text-secondary">{x.l}</span>
                        <span className={`num text-2xl font-bold ${x.c}`}>{x.n}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 pt-4 border-t border-bg-border">
                    <p className="num text-[11px] text-text-soft tracking-widest uppercase mb-2">Alertas principales</p>
                    {overviewAlerts.filter(a => a.level !== 'info').slice(0, 4).map(a => (
                      <p key={`${a.account}-${a.id}`} className={`num text-[12px] mb-1 ${LEVEL_CFG[a.level].text}`}>● {a.title}{a.campaign ? ` · ${a.campaign}` : ''}</p>
                    ))}
                    {overviewAlerts.length > 0 && <button onClick={() => setTab('alertas')} className="num text-[11px] text-cyan-DEFAULT mt-1">Ver todas →</button>}
                    {!overviewAlerts.length && <p className="num text-[12px] text-text-soft">Sin alertas.</p>}
                  </div>
                </Card>
              </div>
            </div>
          )
        })}

        {/* ── CAMPAÑAS ── */}
        {tab === 'campanas' && views.length > 0 && (
          <>
            {byCurrency.map(([currency, vs]) => (
              <Card key={currency} title={`Gasto frente a desviación del CPA${byCurrency.length > 1 ? ` · ${currency}` : ''}`}>
                <QuadrantChart views={vs} currency={currency} />
              </Card>
            ))}
            <Card title={`Campañas (${campaignRows.length}${campaignRows.length !== views.length ? ` de ${views.length}` : ''})`} right={
              <div className="flex items-center gap-2 flex-wrap">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar por nombre…"
                  className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary placeholder:text-text-soft w-52" />
                <select value={campStatus} onChange={e => setCampStatus(e.target.value as CampStatusFilter)}
                  className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary">
                  {CAMP_STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l} ({views.filter(v => matchCampStatus(v, o.v)).length})</option>)}
                </select>
              </div>
            }>
              <div className="overflow-x-auto">
                <table className="w-full num text-[12px]">
                  <thead>
                    <tr className="text-text-soft text-[10px] tracking-widest uppercase border-b border-bg-border">
                      {([
                        ['name', 'Campaña', 'left'], ['biddingType', 'Estrategia / estado', 'left'], ['refCpa', 'Referencia', 'right'],
                        ['cost', 'Coste', 'right'], ['conversions', 'Conv.', 'right'], ['cpa', 'CPA', 'right'],
                        ['deviation', 'Desv.', 'right'], ['cpa7', 'CPA 7 d', 'right'], ['prevCpa', 'CPA ant.', 'right'],
                        ['convRate', 'Tasa conv.', 'right'], ['budgetUse', 'Uso ppto.', 'right'], ['isShare', 'IS', 'right'],
                        ['isLostBudget', 'IS perd. ppto.', 'right'], ['isLostRank', 'IS perd. rank.', 'right'],
                      ] as [keyof CampaignView, string, 'left' | 'right'][]).map(([k, l, align]) => (
                        <SortTh key={k} s={campSort} k={k} label={l} align={align} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRows.length === 0 && (
                      <tr><td colSpan={14} className="py-6 text-center text-text-soft">Ninguna campaña coincide con los filtros</td></tr>
                    )}
                    {campSort.sorted.map(v => (
                      <tr key={`${v.accountId}-${v.id}`} className="border-b border-bg-border/50 hover:bg-bg-hover">
                        <td className="py-2 px-2 max-w-[280px]">
                          <p className="text-text-primary truncate" title={v.name}>{v.name}</p>
                          {multiAccount && <p className="text-[10px] text-text-soft truncate">{v.account}</p>}
                        </td>
                        <td className="py-2 px-2">
                          <p className="text-text-secondary whitespace-nowrap">{strategyLabel(v.biddingType, v.targetCpa)}</p>
                          <p className={`text-[10px] whitespace-nowrap ${v.status === 'PAUSED' ? 'text-text-soft' : v.systemStatus?.startsWith('LIMITED') || v.systemStatus?.startsWith('MISCONF') ? 'text-amber-DEFAULT' : v.systemStatus?.startsWith('LEARNING') ? 'text-cyan-DEFAULT' : 'text-green-DEFAULT'}`}>
                            {v.portfolioName ? `Cartera · ` : ''}{v.status === 'PAUSED' ? 'Pausada' : systemStatusLabel(v.systemStatus)}
                          </p>
                        </td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          {fmtMoney(v.refCpa, v.currency)}
                          {v.refIsAverage && <p className="text-[10px] text-text-soft">media cuenta</p>}
                        </td>
                        <td className="py-2 px-2 text-right">{fmtMoney(v.cost, v.currency, 0)}</td>
                        <td className="py-2 px-2 text-right">{fmtNum(v.conversions, 1)}</td>
                        <td className="py-2 px-2 text-right font-bold">{fmtMoney(v.cpa, v.currency)}</td>
                        <td className={`py-2 px-2 text-right ${deviationClass(v.deviation)}`}>
                          {v.deviation === null ? (v.cost > 0 && v.conversions === 0 ? <span className="text-red-DEFAULT">sin conv.</span> : '—') : `${v.deviation > 0 ? '+' : ''}${fmtPct(v.deviation, 0)}`}
                        </td>
                        <td className="py-2 px-2 text-right">{fmtMoney(v.cpa7, v.currency)}</td>
                        <td className="py-2 px-2 text-right text-text-soft">{fmtMoney(v.prevCpa, v.currency)}</td>
                        <td className="py-2 px-2 text-right">{fmtPct(v.convRate, 2)}</td>
                        <td className={`py-2 px-2 text-right ${v.budgetUse !== null && v.budgetUse >= 0.95 ? 'text-amber-DEFAULT' : ''}`}>{fmtPct(v.budgetUse, 0)}</td>
                        <td className="py-2 px-2 text-right">{fmtPct(v.isShare, 0)}</td>
                        <td className={`py-2 px-2 text-right ${(v.isLostBudget ?? 0) > 0.1 ? 'text-amber-DEFAULT' : ''}`}>{fmtPct(v.isLostBudget, 0)}</td>
                        <td className={`py-2 px-2 text-right ${(v.isLostRank ?? 0) > 0.4 ? 'text-amber-DEFAULT' : ''}`}>{fmtPct(v.isLostRank, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {loadedOverviews.some(o => o.changes.length) && (
              <Card title="Cambios recientes (últimos 30 días)">
                <div className="space-y-1">
                  {loadedOverviews.flatMap(o => o.changes.map(c => ({ ...c, account: o.name, currency: o.currency })))
                    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25).map((c, i) => (
                      <p key={i} className="num text-[12px] text-text-secondary">
                        <span className="text-text-soft">{c.date.slice(0, 10)}</span> · {c.detail}
                        {c.oldValue !== null || c.newValue !== null ? <> ({fmtMoney(c.oldValue, c.currency)} → <span className="text-text-primary">{fmtMoney(c.newValue, c.currency)}</span>)</> : null}
                        {c.campaign && <span className="text-text-soft"> · {c.campaign}</span>}
                        {multiAccount && <span className="text-text-soft"> · {c.account}</span>}
                      </p>
                    ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── SEGMENTOS ── */}
        {tab === 'segmentos' && focus && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {focusBar}
              <p className="num text-[11px] text-text-soft">Referencia: <span className="text-amber-DEFAULT">{fmtMoney(focusCampaignRef, focus.currency)}</span></p>
            </div>
            {detailState('segments') ?? (segments && (
              <>
                <Card title="CPA por hora y día de la semana" right={
                  <Seg value={heatMetric} onChange={setHeatMetric} options={[{ v: 'cpa', l: 'CPA' }, { v: 'conversions', l: 'Conversiones' }, { v: 'cost', l: 'Coste' }]} />
                }>
                  <Heatmap cells={segments.heatmap} mode={mode} currency={focus.currency} refCpa={focusCampaignRef} metric={heatMetric} />
                </Card>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {([
                    ['Dispositivo', segments.devices], ['Red', segments.networks], ['Ubicación (región)', segments.geo],
                    ['Edad', segments.ages], ['Sexo', segments.genders], ['Audiencias', segments.audiences],
                  ] as const).map(([t, rows]) => (
                    <Card key={t} title={`CPA por ${t.toLowerCase()}`}>
                      <SegmentChart rows={[...rows]} mode={mode} currency={focus.currency} refCpa={focusCampaignRef} />
                    </Card>
                  ))}
                </div>
                {segments.conversionsByAction.length > 0 && (
                  <Card title="Conversiones por acción">
                    <table className="w-full num text-[12px]">
                      <thead><tr className="text-text-soft text-[10px] tracking-widest uppercase border-b border-bg-border">
                        <SortTh s={convSort} k="name" label="Acción" align="left" />
                        <SortTh s={convSort} k="conversions" label="Conv. principales" />
                        <SortTh s={convSort} k="allConv" label="Todas" />
                      </tr></thead>
                      <tbody>{convSort.sorted.map(a => (
                        <tr key={a.name} className="border-b border-bg-border/50">
                          <td className="py-1.5 px-2 text-text-primary">{a.name}</td>
                          <td className="py-1.5 px-2 text-right">{fmtNum(a.conversions, 1)}</td>
                          <td className="py-1.5 px-2 text-right text-text-soft">{fmtNum(a.allConv, 1)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </Card>
                )}
                {segments.unavailable.length > 0 && <p className="num text-[11px] text-text-soft">Sin datos disponibles: {segments.unavailable.join(', ')}</p>}
              </>
            ))}
          </>
        )}

        {/* ── DESPERDICIO ── */}
        {tab === 'desperdicio' && focus && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {focusBar}
              <Seg value={wasteKind} onChange={setWasteKind} options={[{ v: 'term', l: 'Términos de búsqueda' }, { v: 'keyword', l: 'Palabras clave' }]} />
            </div>
            {detailState('waste') ?? (waste && (() => {
              const total = wasteKind === 'term' ? waste.totals.termCost : waste.totals.keywordCost
              const noConv = wasteKind === 'term' ? waste.totals.termCostNoConv : waste.totals.keywordCostNoConv
              const ref = wasteRef
              const flagged = wasteRows.filter(r => r.flagged)
              return (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Kpi label="Gasto analizado" value={fmtMoney(total, focus.currency, 0)} />
                    <Kpi label="Gasto sin conversiones" value={fmtMoney(noConv, focus.currency, 0)} />
                    <Kpi label="% sin conversiones" value={fmtPct(total ? noConv / total : null, 0)} />
                    <Kpi label="Con gasto ≥ 2 × ref. sin conv." value={String(wasteAll.filter(r => r.conversions === 0 && ref > 0 && r.cost >= 2 * ref).length)} />
                  </div>
                  <Card title="Dónde se concentra el gasto sin conversiones">
                    <ParetoChart rows={wasteAll} currency={focus.currency} />
                  </Card>
                  <Card title={`${wasteKind === 'term' ? 'Términos de búsqueda' : 'Palabras clave'} (${wasteRows.length}${wasteRows.length !== wasteAll.length ? ` de ${wasteAll.length}` : ''})`} right={flagged.length > 0 && wasteKind === 'term' ? (
                    <button onClick={() => {
                      navigator.clipboard.writeText(flagged.map(r => `[${r.text}]`).join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                    }} className="num text-[12px] px-3 py-2 rounded-md border border-cyan-DEFAULT/40 text-cyan-DEFAULT hover:bg-cyan-DEFAULT/10">
                      {copied ? '✓ Copiadas' : `Copiar ${flagged.length} negativas [exacta]`}
                    </button>
                  ) : undefined}>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <input value={wasteQuery} onChange={e => setWasteQuery(e.target.value)}
                        placeholder={wasteKind === 'term' ? 'Filtrar términos por texto…' : 'Filtrar palabras clave por texto…'}
                        className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary placeholder:text-text-soft w-64" />
                      <select value={wasteStatus} onChange={e => setWasteStatus(e.target.value)}
                        className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary">
                        <option value="all">Todos los estados</option>
                        {wasteStatuses.map(s => <option key={s} value={s}>{statusLabel(wasteKind, s)} ({wasteAll.filter(r => r.status === s).length})</option>)}
                      </select>
                      <label className="num text-[12px] text-text-soft flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={wasteOnlyNoConv} onChange={e => setWasteOnlyNoConv(e.target.checked)} />
                        Solo sin conversiones
                      </label>
                      {(wasteQuery || wasteStatus !== 'all' || wasteOnlyNoConv) && (
                        <button onClick={() => { setWasteQuery(''); setWasteStatus('all'); setWasteOnlyNoConv(false) }}
                          className="num text-[12px] px-3 py-2 rounded-md border border-bg-line text-text-primary hover:bg-bg-hover">Limpiar filtros</button>
                      )}
                    </div>
                    <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                      <table className="w-full num text-[12px]">
                        <thead className="sticky top-0 bg-bg-card"><tr className="text-text-soft text-[10px] tracking-widest uppercase border-b border-bg-border">
                          <SortTh s={wasteSort} k="text" label={wasteKind === 'term' ? 'Término' : 'Palabra clave'} align="left" />
                          <SortTh s={wasteSort} k="status" label="Estado" align="left" />
                          <SortTh s={wasteSort} k="campaign" label="Campaña / grupo" align="left" />
                          <SortTh s={wasteSort} k="cost" label="Coste" />
                          <SortTh s={wasteSort} k="clicks" label="Clics" />
                          <SortTh s={wasteSort} k="conversions" label="Conv." />
                          <SortTh s={wasteSort} k="cpa" label="CPA" />
                        </tr></thead>
                        <tbody>
                          {wasteRows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-soft">Nada coincide con los filtros</td></tr>}
                          {wasteSort.sorted.slice(0, 300).map((r, i) => (
                            <tr key={i} className={`border-b border-bg-border/50 ${r.flagged ? 'bg-red-DEFAULT/5' : ''}`}>
                              <td className="py-1.5 px-2 text-text-primary">{r.text}{r.matchType && <span className="text-[10px] text-text-soft ml-1">{r.matchType.toLowerCase()}</span>}</td>
                              <td className={`py-1.5 px-2 whitespace-nowrap ${statusClass(r.status)}`}>{statusLabel(wasteKind, r.status)}</td>
                              <td className="py-1.5 px-2 text-text-soft max-w-[240px] truncate" title={`${r.campaign} / ${r.adGroup ?? ''}`}>{r.campaign}{r.adGroup ? ` / ${r.adGroup}` : ''}</td>
                              <td className={`py-1.5 px-2 text-right ${r.flagged ? 'text-red-DEFAULT font-bold' : ''}`}>{fmtMoney(r.cost, focus.currency)}</td>
                              <td className="py-1.5 px-2 text-right">{fmtNum(r.clicks)}</td>
                              <td className="py-1.5 px-2 text-right">{fmtNum(r.conversions, 1)}</td>
                              <td className={`py-1.5 px-2 text-right ${r.cpa && ref && r.cpa > ref * 1.5 ? 'text-amber-DEFAULT' : ''}`}>{fmtMoney(r.cpa, focus.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="num text-[11px] text-text-soft mt-2">Se analizan los 500 elementos con más gasto del periodo (se muestran hasta 300 tras filtrar). En rojo: gasto de al menos 2 veces la referencia ({fmtMoney(ref || null, focus.currency)}) sin conversiones.</p>
                  </Card>
                </>
              )
            })())}
          </>
        )}

        {/* ── SIMULADOR ── */}
        {tab === 'simulador' && focus && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">{focusBar}</div>
            {detailState('simulation') ?? (sims && (!sim ? (
              <Card><Empty text="Google no ofrece simulaciones para estas campañas (necesitan historial suficiente con puja por CPA o presupuesto)." /></Card>
            ) : (() => {
              const isCpa = sim.type === 'TARGET_CPA'
              return (
                <>
                  <Card title="Simulación de Google" right={
                    <select value={`${sim.campaignId}:${sim.type}`} onChange={e => setSimId(e.target.value)}
                      className="num text-[12px] bg-bg-surface border border-bg-line rounded-md px-2.5 py-2 text-text-primary max-w-[360px]">
                      {sims.simulations.map(s => (
                        <option key={`${s.campaignId}:${s.type}`} value={`${s.campaignId}:${s.type}`}>
                          {s.campaign} · {s.type === 'TARGET_CPA' ? 'CPA objetivo' : 'Presupuesto'}
                        </option>
                      ))}
                    </select>
                  }>
                    <SimulationChart sim={sim} currency={focus.currency} />
                    <p className="num text-[11px] text-text-soft mt-2">
                      Estimación de Google para {sim.startDate} → {sim.endDate}. Línea azul: conversiones · Línea discontinua: coste · Vertical: valor actual ({fmtMoney(sim.current, focus.currency)}).
                    </p>
                  </Card>
                  <Card title="Escenarios">
                    <table className="w-full num text-[12px]">
                      <thead><tr className="text-text-soft text-[10px] tracking-widest uppercase border-b border-bg-border">
                        <SortTh s={simSort} k="x" label={isCpa ? 'CPA objetivo' : 'Presupuesto diario'} align="left" />
                        <SortTh s={simSort} k="cost" label="Coste" />
                        <SortTh s={simSort} k="conversions" label="Conversiones" />
                        <SortTh s={simSort} k="cpaRes" label="CPA resultante" />
                        <SortTh s={simSort} k="dc" label="Δ conv." />
                        <SortTh s={simSort} k="dk" label="Δ coste" />
                        <SortTh s={simSort} k="marginal" label="CPA marginal" title="Coste de cada conversión adicional frente al escenario actual" />
                      </tr></thead>
                      <tbody>{simSort.sorted.map((p, i) => (
                        <tr key={i} className={`border-b border-bg-border/50 ${p.isBase ? 'bg-amber-DEFAULT/10' : ''}`}>
                          <td className="py-1.5 px-2 text-text-primary">{fmtMoney(p.x, focus.currency)}{p.isBase && <span className="text-amber-DEFAULT text-[10px] ml-1">actual</span>}</td>
                          <td className="py-1.5 px-2 text-right">{fmtMoney(p.cost, focus.currency, 0)}</td>
                          <td className="py-1.5 px-2 text-right">{fmtNum(p.conversions, 1)}</td>
                          <td className="py-1.5 px-2 text-right">{fmtMoney(p.cpaRes, focus.currency)}</td>
                          <td className={`py-1.5 px-2 text-right ${p.dc && p.dc > 0 ? 'text-green-DEFAULT' : p.dc && p.dc < 0 ? 'text-red-DEFAULT' : ''}`}>{p.dc === null || p.isBase ? '—' : `${p.dc > 0 ? '+' : ''}${fmtNum(p.dc, 1)}`}</td>
                          <td className="py-1.5 px-2 text-right">{p.dk === null || p.isBase ? '—' : `${p.dk > 0 ? '+' : ''}${fmtMoney(p.dk, focus.currency, 0)}`}</td>
                          <td className="py-1.5 px-2 text-right">{p.isBase ? '—' : fmtMoney(p.marginal, focus.currency)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <p className="num text-[11px] text-text-soft mt-2">El CPA marginal indica cuánto cuesta cada conversión extra al subir el objetivo: si es mucho mayor que el valor de una conversión para el negocio, no compensa.</p>
                  </Card>
                </>
              )
            })()))}
          </>
        )}

        {/* ── ALERTAS ── */}
        {tab === 'alertas' && (
          <Card title="Alertas automáticas" right={
            <Seg value={alertFilter} onChange={setAlertFilter} options={[
              { v: 'all', l: `Todas (${allAlerts.length})` },
              { v: 'critical', l: `Críticas (${allAlerts.filter(a => a.level === 'critical').length})` },
              { v: 'warning', l: `Avisos (${allAlerts.filter(a => a.level === 'warning').length})` },
              { v: 'info', l: `Info (${allAlerts.filter(a => a.level === 'info').length})` },
            ]} />
          }>
            <AlertList alerts={alertFilter === 'all' ? allAlerts : allAlerts.filter(a => a.level === alertFilter)} showAccount={multiAccount} />
            {focus && (!segments || !waste) && (
              <p className="num text-[11px] text-text-soft mt-3">
                Las alertas de segmentos y desperdicio de {focus.name} aparecen al abrir esas pestañas o al lanzar el análisis IA.
              </p>
            )}
          </Card>
        )}

        {/* ── ANÁLISIS IA ── */}
        {tab === 'ia' && focus && (
          <>
            <Card title="Modelo de IA"><ModelPicker choice={aiModel} disabled={aiBusy} /></Card>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {focusBar}
              <div className="flex gap-2">
                <button onClick={runAi} disabled={aiBusy}
                  className="num text-[12px] px-4 py-2 rounded bg-cyan-DEFAULT/15 border border-cyan-DEFAULT/40 text-cyan-DEFAULT hover:bg-cyan-DEFAULT/25 disabled:opacity-50">
                  {aiBusy ? 'Analizando…' : aiResult ? '↻ Volver a analizar' : '✦ Analizar con IA'}
                </button>
                <button onClick={openTab} className="num text-[12px] px-3 py-2 rounded border border-bg-line text-text-primary hover:bg-bg-hover">Abrir informe</button>
                <button onClick={download} className="num text-[12px] px-3 py-2 rounded border border-bg-line text-text-primary hover:bg-bg-hover">⬇ Descargar HTML</button>
              </div>
            </div>
            {aiBusy && <Card><Empty text="Descargando segmentos, desperdicio y simulador, y analizando con IA (puede tardar uno o dos minutos)…" /></Card>}
            {aiError && <p className="num text-[12px] text-red-DEFAULT">{aiError}</p>}
            {!aiResult && !aiBusy && (
              <Card><Empty text="Pulsa «Analizar con IA» para obtener el diagnóstico experto de esta cuenta con el filtro actual." /></Card>
            )}
            {aiResult && !aiBusy && (() => {
              const a = aiResult.analysis
              const color = a.score >= 80 ? 'text-green-DEFAULT' : a.score >= 60 ? 'text-amber-DEFAULT' : 'text-red-DEFAULT'
              const VERDICT_CLS: Record<string, string> = {
                escalar: 'text-green-DEFAULT border-green-DEFAULT/40', mantener: 'text-cyan-DEFAULT border-cyan-DEFAULT/40',
                optimizar: 'text-amber-DEFAULT border-amber-DEFAULT/40', reducir: 'text-amber-DEFAULT border-amber-DEFAULT/40',
                pausar: 'text-red-DEFAULT border-red-DEFAULT/40',
              }
              return (
                <>
                  <Card>
                    <div className="flex gap-6 items-start">
                      <div className="text-center shrink-0">
                        <p className={`num text-5xl font-bold ${color}`}>{a.score}</p>
                        <p className="num text-[10px] text-text-soft tracking-widest uppercase mt-1">Salud CPA</p>
                      </div>
                      <div>
                        <p className="text-sm text-text-primary leading-relaxed">{a.summary}</p>
                        <p className="num text-[11px] text-text-soft mt-2">Modelo: {aiResult.model}</p>
                      </div>
                    </div>
                  </Card>
                  {a.alerts.length > 0 && (
                    <Card title="Avisos del experto">
                      <AlertList alerts={a.alerts.map((x, i) => ({ id: `ai-${i}`, level: x.severity, title: x.title, description: x.detail }))} showAccount={false} />
                    </Card>
                  )}
                  {a.campaigns.length > 0 && (
                    <Card title="Diagnóstico por campaña">
                      <div className="space-y-3">
                        {a.campaigns.map((c, i) => (
                          <div key={i} className="border border-bg-border rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`num text-[10px] px-2 py-0.5 rounded-sm border tracking-widest uppercase ${VERDICT_CLS[c.verdict]}`}>{c.verdict}</span>
                              <p className="num text-xs font-bold text-text-primary">{c.campaign}</p>
                            </div>
                            <p className="num text-[12px] text-text-secondary">{c.diagnosis}</p>
                            <p className="num text-[12px] text-cyan-DEFAULT mt-1">→ {c.action}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  {a.targets.length > 0 && (
                    <Card title="CPA objetivo sugerido">
                      <table className="w-full num text-[12px]">
                        <thead><tr className="text-text-soft text-[10px] tracking-widest uppercase border-b border-bg-border">
                          <SortTh s={targetsSort} k="campaign" label="Campaña" align="left" />
                          <SortTh s={targetsSort} k="currentTarget" label="Actual" />
                          <SortTh s={targetsSort} k="suggestedTarget" label="Sugerido" />
                          <SortTh s={targetsSort} k="rationale" label="Motivo" align="left" />
                        </tr></thead>
                        <tbody>{targetsSort.sorted.map((t, i) => (
                          <tr key={i} className="border-b border-bg-border/50 align-top">
                            <td className="py-2 px-2 text-text-primary">{t.campaign}</td>
                            <td className="py-2 px-2 text-right">{fmtMoney(t.currentTarget, focus.currency)}</td>
                            <td className="py-2 px-2 text-right font-bold text-cyan-DEFAULT">{fmtMoney(t.suggestedTarget, focus.currency)}</td>
                            <td className="py-2 px-2 text-text-secondary">{t.rationale}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </Card>
                  )}
                  {a.recommendations.length > 0 && (
                    <Card title="Recomendaciones">
                      <div className="space-y-2">
                        {[...a.recommendations].sort((x, y) => ({ alta: 0, media: 1, baja: 2 }[x.priority] - { alta: 0, media: 1, baja: 2 }[y.priority])).map((r, i) => (
                          <div key={i} className="border border-bg-border rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`num text-[10px] px-2 py-0.5 rounded-sm border tracking-widest uppercase ${r.priority === 'alta' ? 'text-red-DEFAULT border-red-DEFAULT/40' : r.priority === 'media' ? 'text-amber-DEFAULT border-amber-DEFAULT/40' : 'text-cyan-DEFAULT border-cyan-DEFAULT/40'}`}>{r.priority}</span>
                              <p className="num text-xs font-bold text-text-primary">{r.title}</p>
                              <span className="num text-[10px] text-text-soft ml-auto">confianza {r.confidence}</span>
                            </div>
                            <p className="num text-[12px] text-text-secondary">{r.action}</p>
                            <p className="num text-[11px] text-green-DEFAULT mt-1">Impacto: {r.impact}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  {a.doNotTouch.length > 0 && (
                    <Card title="Qué no tocar por ahora">
                      <ul className="space-y-1">{a.doNotTouch.map((x, i) => <li key={i} className="num text-[12px] text-text-secondary">• {x}</li>)}</ul>
                    </Card>
                  )}
                  <Card title="Coste del análisis">
                    <p className="num text-[13px] text-text-primary">
                      {aiResult.usage?.costUsd !== null && aiResult.usage?.costUsd !== undefined
                        ? <>≈ <span className="font-bold text-cyan-DEFAULT">{aiResult.usage.costUsd.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} $</span></>
                        : 'Coste no disponible'}
                    </p>
                    <p className="num text-[11px] text-text-soft mt-1">
                      {formatUsage(aiResult.usage)} · modelo {aiResult.model}. Importe facturado por OpenRouter para esta llamada (o estimado con su tarifa pública si no lo informa).
                    </p>
                  </Card>
                </>
              )
            })()}
          </>
        )}
      </main>
    </div>
  )
}
