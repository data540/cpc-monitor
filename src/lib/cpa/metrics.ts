// ── Cálculos derivados de CPA Analysis (puros: cliente y servidor) ──
import type { CampaignView, CpaKpis, CpaOverview, Metrics } from './types'

export type ConvMode = 'primary' | 'all'

export const CPA_STRATEGIES = new Set(['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'])
export const isCpaStrategy = (t: string) => CPA_STRATEGIES.has(t)

export const STRATEGY_LABEL: Record<string, string> = {
  TARGET_CPA: 'CPA objetivo', MAXIMIZE_CONVERSIONS: 'Maximizar conversiones',
  MAXIMIZE_CONVERSION_VALUE: 'Maximizar valor', TARGET_ROAS: 'ROAS objetivo',
  MANUAL_CPC: 'CPC manual', ENHANCED_CPC: 'CPC mejorado', TARGET_SPEND: 'Maximizar clics',
  TARGET_IMPRESSION_SHARE: 'Cuota de impresiones', MANUAL_CPM: 'CPM manual', TARGET_CPM: 'CPM objetivo',
}
export const strategyLabel = (t: string, target: number | null) =>
  t === 'MAXIMIZE_CONVERSIONS' && target ? 'Max. conversiones + CPA obj.' : STRATEGY_LABEL[t] ?? t

export const conv = (m: Pick<Metrics, 'conversions' | 'allConv'>, mode: ConvMode) => mode === 'all' ? m.allConv : m.conversions
export const safeDiv = (a: number, b: number): number | null => (b > 0 ? a / b : null)

// "Media de la cuenta": coste / conversiones de las campañas con puja por CPA en el periodo.
// Si la cuenta no tiene ninguna con conversiones, se usan todas las campañas.
// (Excluir marca o ROAS evita que un CPA muy bajo de marca abarate la referencia.)
export function accountAvgCpa(o: CpaOverview, mode: ConvMode): number | null {
  const sum = (list: CpaOverview['campaigns']) => {
    let cost = 0, c = 0
    for (const x of list) { cost += x.cost; c += conv(x, mode) }
    return safeDiv(cost, c)
  }
  return sum(o.campaigns.filter(x => isCpaStrategy(x.biddingType))) ?? sum(o.campaigns)
}

export function buildCampaignViews(o: CpaOverview, mode: ConvMode): CampaignView[] {
  const avg = accountAvgCpa(o, mode)
  return o.campaigns.map(c => {
    const cv = conv(c, mode)
    const cpa = safeDiv(c.cost, cv)
    const refCpa = c.targetCpa ?? avg
    const avgDaily = c.cost / o.period.days
    return {
      accountId: o.customerId, account: o.name, currency: o.currency,
      id: c.id, name: c.name, biddingType: c.biddingType, portfolioName: c.portfolioName,
      systemStatus: c.systemStatus, targetCpa: c.targetCpa, refCpa, refIsAverage: c.targetCpa === null,
      cost: c.cost, conversions: cv, cpa,
      cpa7:    safeDiv(c.last7.cost, conv(c.last7, mode)),
      prevCpa: safeDiv(c.prev.cost, conv(c.prev, mode)),
      deviation: cpa !== null && refCpa ? (cpa - refCpa) / refCpa : null,
      convRate: safeDiv(cv, c.clicks), cpc: safeDiv(c.cost, c.clicks),
      dailyBudget: c.dailyBudget, budgetUse: c.dailyBudget ? avgDaily / c.dailyBudget : null,
      isShare: c.isShare, isLostBudget: c.isLostBudget, isLostRank: c.isLostRank,
      clicks: c.clicks, impressions: c.impressions,
    }
  })
}

// Media ponderada por impresiones de una cuota (solo filas con dato)
function weighted(views: CampaignView[], key: 'isShare' | 'isLostBudget' | 'isLostRank'): number | null {
  let w = 0, s = 0
  for (const v of views) { const x = v[key]; if (x !== null && v.impressions > 0) { w += v.impressions; s += x * v.impressions } }
  return w > 0 ? s / w : null
}

// KPIs de un conjunto de campañas (de UNA moneda) + sus overviews para el periodo anterior
export function computeKpis(views: CampaignView[], overviews: CpaOverview[], mode: ConvMode): CpaKpis {
  const ids = new Set(views.map(v => `${v.accountId}:${v.id}`))
  let prevCost = 0, prevConv = 0
  for (const o of overviews) for (const c of o.campaigns) {
    if (ids.has(`${o.customerId}:${c.id}`)) { prevCost += c.prev.cost; prevConv += conv(c.prev, mode) }
  }
  const cost = views.reduce((s, v) => s + v.cost, 0)
  const conversions = views.reduce((s, v) => s + v.conversions, 0)
  const clicks = views.reduce((s, v) => s + v.clicks, 0)
  const impressions = views.reduce((s, v) => s + v.impressions, 0)
  // Referencia ponderada por gasto
  let refW = 0, refS = 0
  for (const v of views) if (v.refCpa) { refW += v.cost; refS += v.refCpa * v.cost }
  return {
    cost, conversions, cpa: safeDiv(cost, conversions), refCpa: refW > 0 ? refS / refW : null,
    convRate: safeDiv(conversions, clicks), cpc: safeDiv(cost, clicks), ctr: safeDiv(clicks, impressions),
    clicks, impressions,
    isShare: weighted(views, 'isShare'), isLostBudget: weighted(views, 'isLostBudget'), isLostRank: weighted(views, 'isLostRank'),
    prevCost, prevConversions: prevConv, prevCpa: safeDiv(prevCost, prevConv),
  }
}

export interface DailyPoint { date: string; cost: number; conversions: number; cpa: number | null; ref: number | null; cpa7: number | null }

// Serie diaria agregada de las campañas elegidas, con media móvil de 7 días
export function dailySeries(overviews: CpaOverview[], campaignKeys: Set<string>, mode: ConvMode, ref: number | null): DailyPoint[] {
  const acc = new Map<string, { cost: number; conversions: number }>()
  for (const o of overviews) for (const d of o.daily) {
    if (!campaignKeys.has(`${o.customerId}:${d.campaignId}`)) continue
    const a = acc.get(d.date) ?? { cost: 0, conversions: 0 }
    a.cost += d.cost; a.conversions += conv(d, mode)
    acc.set(d.date, a)
  }
  const days = [...acc.entries()].sort(([a], [b]) => a.localeCompare(b))
  return days.map(([date, a], i) => {
    const win = days.slice(Math.max(0, i - 6), i + 1)
    const wc = win.reduce((s, [, x]) => s + x.cost, 0), wv = win.reduce((s, [, x]) => s + x.conversions, 0)
    return {
      date, cost: Math.round(a.cost * 100) / 100, conversions: Math.round(a.conversions * 100) / 100,
      cpa: safeDiv(a.cost, a.conversions), ref, cpa7: safeDiv(wc, wv),
    }
  })
}

// ── Formato es-ES ──────────────────────────────────────────────
export const fmtMoney = (n: number | null | undefined, currency = 'EUR', digits = 2) =>
  n === null || n === undefined || !isFinite(n) ? '—'
    : n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !isFinite(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !isFinite(n) ? '—' : `${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
export const fmtDelta = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev === 0 ? null : (cur - prev) / prev

export const SYSTEM_STATUS_LABEL: Record<string, string> = {
  ENABLED: 'Activa', LEARNING_NEW: 'Aprendizaje (nueva)', LEARNING_SETTING_CHANGE: 'Aprendizaje (cambio de ajustes)',
  LEARNING_BUDGET_CHANGE: 'Aprendizaje (cambio de presupuesto)', LEARNING_COMPOSITION_CHANGE: 'Aprendizaje (cambio de composición)',
  LEARNING_CONVERSION_TYPE_CHANGE: 'Aprendizaje (cambio de conversiones)', LEARNING_CONVERSION_SETTING_CHANGE: 'Aprendizaje (ajustes de conversión)',
  LIMITED_BY_CPC_BID_CEILING: 'Limitada por CPC máximo', LIMITED_BY_CPC_BID_FLOOR: 'Limitada por CPC mínimo',
  LIMITED_BY_DATA: 'Limitada por pocos datos', LIMITED_BY_BUDGET: 'Limitada por presupuesto',
  LIMITED_BY_LOW_PRIORITY_SPEND: 'Limitada (gasto de baja prioridad)', LIMITED_BY_LOW_QUALITY: 'Limitada por calidad baja',
  LIMITED_BY_INVENTORY: 'Limitada por inventario', MISCONFIGURED_ZERO_ELIGIBILITY: 'Mal configurada (sin elegibilidad)',
  MISCONFIGURED_CONVERSION_TYPES: 'Mal configurada (tipos de conversión)', MISCONFIGURED_CONVERSION_SETTINGS: 'Mal configurada (ajustes de conversión)',
  MISCONFIGURED_SHARED_BUDGET: 'Mal configurada (presupuesto compartido)', MISCONFIGURED_STRATEGY_TYPE: 'Mal configurada (tipo de estrategia)',
  PAUSED: 'Pausada', UNAVAILABLE: 'Sin estado', MULTIPLE_LEARNING: 'Varias en aprendizaje',
  MULTIPLE_LIMITED: 'Varias limitadas', MULTIPLE_MISCONFIGURED: 'Varias mal configuradas', MULTIPLE: 'Varios estados',
}
export const systemStatusLabel = (s: string | null) => (s ? SYSTEM_STATUS_LABEL[s] ?? s : '—')

// Referencia de CPA de la cuenta para segmentos y desperdicio:
// objetivos de las campañas CPA ponderados por gasto; si no hay, la media de la cuenta.
export function referenceCpa(o: CpaOverview, mode: ConvMode): number | null {
  const views = buildCampaignViews(o, mode).filter(v => isCpaStrategy(v.biddingType))
  return computeKpis(views, [o], mode).refCpa ?? accountAvgCpa(o, mode)
}
