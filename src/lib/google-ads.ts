// ── Google Ads API client ─────────────────────────────────────
// Toda la lógica de llamadas a la API, portada directamente del script
// que ya funciona en producción.

import { CampaignMetrics, GoogleAdsCampaignRow, CpcDistributionData } from '@/types'
import { buildRecommendation } from './recommendations'

// ── Mock data para desarrollo (sin scope adwords) ─────────────

const MOCK_CAMPAIGNS: CampaignMetrics[] = [
  { campaignId: 'mock-1', campaignName: 'Brand - Exact',         cpcCeiling: 0.80, avgCpc: 0.62, cpcUsagePct: 77.5,  clicks: 1240, impressions: 18500, ctr: 6.70, costEur: 769.0,  isActual: 0.82, isLostBudget: 0.03, isLostRank: 0.15, topImpressionPct: 0.71, absoluteTopImpressionPct: 0.48, targetRoas: 4.5, realRoas: 5.1,  recommendation: buildRecommendation({ cpcUsagePct: 77.5,  isActual: 0.82, cpcCeiling: 0.80, realRoas: 5.1,  targetRoas: 4.5 }) },
  { campaignId: 'mock-2', campaignName: 'Competencia - BMM',     cpcCeiling: 1.20, avgCpc: 1.15, cpcUsagePct: 95.8,  clicks:  430, impressions:  9200, ctr: 4.67, costEur: 494.5,  isActual: 0.41, isLostBudget: 0.12, isLostRank: 0.47, topImpressionPct: 0.38, absoluteTopImpressionPct: 0.21, targetRoas: 3.0, realRoas: 2.8,  recommendation: buildRecommendation({ cpcUsagePct: 95.8,  isActual: 0.41, cpcCeiling: 1.20, realRoas: 2.8,  targetRoas: 3.0 }) },
  { campaignId: 'mock-3', campaignName: 'Genérico - Amplia',     cpcCeiling: 0.60, avgCpc: 0.38, cpcUsagePct: 63.3,  clicks:  870, impressions: 24100, ctr: 3.61, costEur: 330.6,  isActual: 0.67, isLostBudget: 0.28, isLostRank: 0.05, topImpressionPct: 0.54, absoluteTopImpressionPct: 0.31, targetRoas: 5.0, realRoas: 6.2,  recommendation: buildRecommendation({ cpcUsagePct: 63.3,  isActual: 0.67, cpcCeiling: 0.60, realRoas: 6.2,  targetRoas: 5.0 }) },
  { campaignId: 'mock-4', campaignName: 'Remarketing - Dinámico',cpcCeiling: null, avgCpc: 0.29, cpcUsagePct: null,   clicks:  310, impressions:  5400, ctr: 5.74, costEur:  89.9,  isActual: 0.91, isLostBudget: 0.04, isLostRank: 0.05, topImpressionPct: 0.88, absoluteTopImpressionPct: 0.72, targetRoas: 8.0, realRoas: 9.4,  recommendation: buildRecommendation({ cpcUsagePct: null,   isActual: 0.91, cpcCeiling: null, realRoas: 9.4,  targetRoas: 8.0 }) },
  { campaignId: 'mock-5', campaignName: 'Shopping - Max ROAS',   cpcCeiling: 1.50, avgCpc: 1.49, cpcUsagePct: 99.3,  clicks:  205, impressions:  3100, ctr: 6.61, costEur: 305.5,  isActual: 0.55, isLostBudget: 0.09, isLostRank: 0.36, topImpressionPct: 0.44, absoluteTopImpressionPct: 0.29, targetRoas: 6.0, realRoas: 4.1,  recommendation: buildRecommendation({ cpcUsagePct: 99.3,  isActual: 0.55, cpcCeiling: 1.50, realRoas: 4.1,  targetRoas: 6.0 }) },
]

const ADS_API_BASE = 'https://googleads.googleapis.com/v23'

interface FetchOptions {
  accessToken:     string
  customerId:      string       // cuenta hija sin guiones
  mccCustomerId?:  string       // MCC sin guiones
  developerToken:  string
  manualCeilings?: Record<string, number>
  dateRangeDays?:  number
}

// ── Headers base para todas las llamadas ─────────────────────

function buildHeaders(opts: FetchOptions) {
  const headers: Record<string, string> = {
    'Authorization':          `Bearer ${opts.accessToken}`,
    'developer-token':        opts.developerToken,
    'Content-Type':           'application/json',
  }
  // login-customer-id resuelve el problema de estrategias de cartera del MCC
  if (opts.mccCustomerId) {
    headers['login-customer-id'] = opts.mccCustomerId
  }
  return headers
}

// ── Fecha en formato GAQL ─────────────────────────────────────

function buildDateRange(days: number): { start: string; end: string } {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(start), end: fmt(end) }
}

// ── Lee CPC techo de estrategias de cartera ──────────────────
// Con login-customer-id del MCC esto ya devuelve los datos correctos,
// resolviendo el problema que teníamos en el script de Google Ads.

async function loadPortfolioCeilings(
  opts: FetchOptions
): Promise<Record<string, { name: string; cpcCeiling: number; targetRoas: number }>> {
  const query = `
    SELECT
      bidding_strategy.resource_name,
      bidding_strategy.name,
      bidding_strategy.type,
      bidding_strategy.target_roas.target_roas,
      bidding_strategy.target_roas.cpc_bid_ceiling_micros
    FROM bidding_strategy
    WHERE bidding_strategy.type = 'TARGET_ROAS'
  `

  const sourceCustomers = Array.from(new Set([opts.mccCustomerId, opts.customerId].filter(Boolean))) as string[]

  const ceilings: Record<string, { name: string; cpcCeiling: number; targetRoas: number }> = {}

  for (const sourceCustomerId of sourceCustomers) {
    try {
      const res = await fetch(
        `${ADS_API_BASE}/customers/${sourceCustomerId}/googleAds:search`,
        {
          method: 'POST',
          headers: buildHeaders(opts),
          body: JSON.stringify({ query }),
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        console.warn(`[google-ads] Estrategias de cartera HTTP ${res.status} desde ${sourceCustomerId}:`, errText.slice(0, 200))
        continue
      }

      const data = await res.json()
      const count = data.results?.length ?? 0
      console.log(`[google-ads] Estrategias TARGET_ROAS cargadas desde ${sourceCustomerId}: ${count}`)

      for (const row of data.results ?? []) {
        const rn         = row.biddingStrategy?.resourceName as string | undefined
        const strategyId = rn?.split('/').pop()
        const micros     = Number(row.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0)
        const troas      = Number(row.biddingStrategy?.targetRoas?.targetRoas ?? 0)
        const normalized = {
          name:       row.biddingStrategy?.name ?? rn ?? '',
          cpcCeiling: Math.round(micros / 1e4) / 100,
          targetRoas: troas,
        }
        if (rn)         ceilings[rn] = normalized
        if (strategyId) ceilings[`biddingStrategies/${strategyId}`] = normalized
      }
    } catch (e) {
      console.error(`[google-ads] Error cargando estrategias desde ${sourceCustomerId}:`, e)
    }
  }

  console.log(`[google-ads] Total claves en portfolioCeilings: ${Object.keys(ceilings).length}`)
  return ceilings
}

// ── Query principal de métricas de campaña ───────────────────

async function fetchCampaignRows(
  opts: FetchOptions,
  dateRange: { start: string; end: string }
): Promise<GoogleAdsCampaignRow[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.bidding_strategy_type,
      campaign.bidding_strategy,
      campaign.target_roas.target_roas,
      campaign.target_roas.cpc_bid_ceiling_micros,
      bidding_strategy.name,
      bidding_strategy.target_roas.target_roas,
      bidding_strategy.target_roas.cpc_bid_ceiling_micros,
      metrics.average_cpc,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.cost_micros,
      metrics.search_impression_share,
      metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.conversions_value,
      metrics.conversions,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.bidding_strategy_type = 'TARGET_ROAS'
      AND campaign.advertising_channel_type = 'SEARCH'
      AND metrics.impressions > 0
      AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  `

  const res = await fetch(
    `${ADS_API_BASE}/customers/${opts.customerId}/googleAds:search`,
    {
      method: 'POST',
      headers: buildHeaders(opts),
      body: JSON.stringify({ query }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Ads API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.results ?? []
}

// ── Función principal exportada ───────────────────────────────

export async function getCampaignMetrics(opts: FetchOptions): Promise<CampaignMetrics[]> {
  const days      = opts.dateRangeDays ?? 30
  const dateRange = buildDateRange(days)

  // Cargar techos de cartera
  const portfolioCeilings = await loadPortfolioCeilings(opts)
  const manualCeilings    = opts.manualCeilings ?? {}

  // Obtener filas de métricas
  const rows = await fetchCampaignRows(opts, dateRange)

  return rows.map((row: any) => {
    const campaignName = row.campaign?.name ?? ''

    // CPC techo: nivel campaña → portfolio inline (JOIN en GAQL) → lookup cartera → manual
    let cpcCeiling: number | null = null

    // Nivel 1: ceiling a nivel campaña
    const campaignMicros = Number(row.campaign?.targetRoas?.cpcBidCeilingMicros ?? 0)
    if (campaignMicros > 0) {
      cpcCeiling = Math.round(campaignMicros / 1e4) / 100
    }

    // Nivel 2a: ceiling del portfolio resuelto inline por la API (bidding_strategy.* en la query)
    // Cubre estrategias de MCC sin necesidad de cross-account lookup
    if (!cpcCeiling) {
      const inlineMicros = Number(row.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0)
      if (inlineMicros > 0) {
        cpcCeiling = Math.round(inlineMicros / 1e4) / 100
      }
    }

    // Nivel 2b: fallback — lookup en el diccionario de carteras cargado previamente
    const portfolioRef = row.campaign?.biddingStrategy as string | undefined
    const strategyId   = portfolioRef?.split('/').pop()
    const portfolioMatch = portfolioRef
      ? (
          portfolioCeilings[portfolioRef] ??
          (strategyId ? portfolioCeilings[`biddingStrategies/${strategyId}`] : undefined)
        )
      : undefined

    if (!cpcCeiling && portfolioMatch?.cpcCeiling) {
      cpcCeiling = portfolioMatch.cpcCeiling
    }

    if (!cpcCeiling && manualCeilings[campaignName]) {
      cpcCeiling = manualCeilings[campaignName]
    }

    // Métricas
    const avgCpc     = Math.round(Number(row.metrics?.averageCpc ?? 0) / 1e4) / 100
    const costEur    = Math.round(Number(row.metrics?.costMicros ?? 0) / 1e4) / 100
    const convValue  = Number(row.metrics?.conversionsValue ?? 0)
    const targetRoas = Number(row.campaign?.targetRoas?.targetRoas ?? 0) ||
                       Number(row.biddingStrategy?.targetRoas?.targetRoas ?? 0) ||
                       (portfolioMatch?.targetRoas ?? null)

    const cpcUsagePct = cpcCeiling && cpcCeiling > 0
      ? Math.round((avgCpc / cpcCeiling) * 1000) / 10
      : null

    const isRaw    = row.metrics?.searchImpressionShare
    const isActual = isRaw && isRaw !== '--' ? Number(isRaw) : null

    const budgetLostRaw = row.metrics?.searchBudgetLostImpressionShare
    const isLostBudget = budgetLostRaw && budgetLostRaw !== '--' ? Number(budgetLostRaw) : null

    const rankLostRaw = row.metrics?.searchRankLostImpressionShare
    const isLostRank = rankLostRaw && rankLostRaw !== '--' ? Number(rankLostRaw) : null

    const topRaw = row.metrics?.searchTopImpressionShare
    const topImpressionPct = topRaw && topRaw !== '--' ? Number(topRaw) : null

    const absTopRaw = row.metrics?.searchAbsoluteTopImpressionShare
    const absoluteTopImpressionPct = absTopRaw && absTopRaw !== '--' ? Number(absTopRaw) : null

    const realRoas = costEur > 0 ? Math.round((convValue / costEur) * 100) / 100 : null

    return {
      campaignId:               row.campaign?.id ?? '',
      campaignName,
      cpcCeiling,
      avgCpc,
      cpcUsagePct,
      clicks:                   Number(row.metrics?.clicks ?? 0),
      impressions:              Number(row.metrics?.impressions ?? 0),
      ctr:                      Math.round(Number(row.metrics?.ctr ?? 0) * 10000) / 100,
      costEur,
      isActual,
      isLostBudget,
      isLostRank,
      topImpressionPct,
      absoluteTopImpressionPct,
      targetRoas:               targetRoas || null,
      realRoas,
      recommendation:           buildRecommendation({ cpcUsagePct, isActual, cpcCeiling, realRoas, targetRoas }),
      _debug: {
        portfolioRef,
        campaignCeilingMicros:  Number(row.campaign?.targetRoas?.cpcBidCeilingMicros ?? 0),
        inlineCeilingMicros:    Number(row.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0),
        inlineTargetRoas:       row.biddingStrategy?.targetRoas?.targetRoas,
        portfolioCeilingsCount: Object.keys(portfolioCeilings).length,
        portfolioMatchFound:    !!portfolioMatch,
        portfolioMatchCeiling:  portfolioMatch?.cpcCeiling ?? null,
        resolvedFrom:           campaignMicros > 0 ? 'campaign'
                                : Number(row.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0) > 0 ? 'inline'
                                : portfolioMatch?.cpcCeiling ? 'portfolio_lookup'
                                : manualCeilings[campaignName] ? 'manual'
                                : 'none',
      },
    }
  })
}

// ── Lista de cuentas accesibles (para selector de cuenta) ────

export async function getAccessibleAccounts(opts: Pick<FetchOptions, 'accessToken' | 'developerToken' | 'mccCustomerId'>) {
  const res = await fetch(
    `${ADS_API_BASE}/customers:listAccessibleCustomers`,
    {
      headers: {
        'Authorization':   `Bearer ${opts.accessToken}`,
        'developer-token': opts.developerToken,
        ...(opts.mccCustomerId ? { 'login-customer-id': opts.mccCustomerId } : {}),
      },
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.resourceNames ?? []).map((rn: string) => rn.replace('customers/', ''))
}

// ── Distribución de CPC por hora ──────────────────────────────────

// Mapeo de day_of_week de Google Ads → índice 0-6 (0=Dom, 1=Lun ... 6=Sáb)
const DAY_OF_WEEK_INDEX: Record<string, number> = {
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
  THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
}
const DAY_OF_WEEK_LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export async function getCpcDistribution(
  opts: FetchOptions,
  campaignId: string,
  dateRange: { start: string; end: string }
): Promise<CpcDistributionData> {

  // ── Intento 1: keyword_view con segments.hour_of_day ─────────
  const hourlyQuery = `
    SELECT
      segments.hour_of_day,
      metrics.average_cpc,
      metrics.clicks,
      metrics.cost_micros
    FROM keyword_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND metrics.clicks > 0
  `

  const hourlyRes = await fetch(
    `${ADS_API_BASE}/customers/${opts.customerId}/googleAds:search`,
    {
      method: 'POST',
      headers: buildHeaders(opts),
      body: JSON.stringify({ query: hourlyQuery }),
    }
  )

  // Detectar si hour_of_day no está soportado → fallback a day_of_week
  let rows: any[]
  let temporalMode: 'hourly' | 'weekly' = 'hourly'

  if (!hourlyRes.ok) {
    const errText = await hourlyRes.text()
    const isUnrecognized = errText.includes('UNRECOGNIZED_FIELD') ||
                           errText.includes('hour_of_day')
    if (!isUnrecognized) {
      throw new Error(`Google Ads API error ${hourlyRes.status}: ${errText}`)
    }

    // ── Fallback: campaign con segments.day_of_week ───────────
    console.warn('[google-ads] hour_of_day no soportado, usando day_of_week')
    temporalMode = 'weekly'

    const weeklyQuery = `
      SELECT
        segments.day_of_week,
        metrics.average_cpc,
        metrics.clicks,
        metrics.cost_micros
      FROM campaign
      WHERE campaign.id = ${campaignId}
        AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        AND metrics.clicks > 0
    `
    const weeklyRes = await fetch(
      `${ADS_API_BASE}/customers/${opts.customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: buildHeaders(opts),
        body: JSON.stringify({ query: weeklyQuery }),
      }
    )
    if (!weeklyRes.ok) {
      const err = await weeklyRes.text()
      throw new Error(`Google Ads API error ${weeklyRes.status}: ${err}`)
    }
    const weeklyData = await weeklyRes.json()
    rows = weeklyData.results ?? []
  } else {
    const hourlyData = await hourlyRes.json()
    rows = hourlyData.results ?? []
  }

  // ── Procesar filas según modo ─────────────────────────────────
  const slotMap: Record<number, { avgCpc: number[]; clicks: number; cost: number }> = {}

  for (const row of rows) {
    const slot = temporalMode === 'hourly'
      ? Number(row.segments?.hourOfDay ?? 0)
      : (DAY_OF_WEEK_INDEX[row.segments?.dayOfWeek ?? 'MONDAY'] ?? 0)

    const cpcEur = Number(row.metrics?.averageCpc ?? 0) / 1e6
    const clicks = Number(row.metrics?.clicks ?? 0)
    const costEur = Number(row.metrics?.costMicros ?? 0) / 1e6

    if (!slotMap[slot]) slotMap[slot] = { avgCpc: [], clicks: 0, cost: 0 }
    if (cpcEur > 0) slotMap[slot].avgCpc.push(cpcEur)
    slotMap[slot].clicks += clicks
    slotMap[slot].cost += costEur
  }

  // Construir hourlyData con 24 slots (hourly) o 7 slots (weekly)
  const slotCount = temporalMode === 'hourly' ? 24 : 7
  const hourlyData = []
  for (let i = 0; i < slotCount; i++) {
    const d = slotMap[i]
    const avgCpc = d && d.avgCpc.length > 0
      ? Math.round((d.avgCpc.reduce((a, b) => a + b, 0) / d.avgCpc.length) * 100) / 100
      : 0
    hourlyData.push({
      hour: i,
      label: temporalMode === 'weekly' ? DAY_OF_WEEK_LABEL[i] : `${i}:00`,
      avgCpc,
      clicks: d?.clicks ?? 0,
      cost: d ? Math.round(d.cost * 100) / 100 : 0,
    })
  }

  // Stats y distribución desde todos los CPCs
  const allCpcs: number[] = []
  for (const d of Object.values(slotMap)) allCpcs.push(...d.avgCpc)

  const stats = calculateStats(allCpcs)
  const distribution = generateDistribution(allCpcs, stats.minCpc, stats.maxCpc)

  // Nombre de campaña
  let campaignName = campaignId
  try {
    const nameQuery = `SELECT campaign.name FROM campaign WHERE campaign.id = ${campaignId}`
    const nameRes = await fetch(
      `${ADS_API_BASE}/customers/${opts.customerId}/googleAds:search`,
      { method: 'POST', headers: buildHeaders(opts), body: JSON.stringify({ query: nameQuery }) }
    )
    if (nameRes.ok) {
      const nd = await nameRes.json()
      if (nd.results?.[0]?.campaign?.name) campaignName = nd.results[0].campaign.name
    }
  } catch (_) { /* usar ID como fallback */ }

  return {
    campaignId,
    campaignName,
    temporalMode,
    period: { startDate: dateRange.start, endDate: dateRange.end },
    stats: {
      ...stats,
      totalClicks: Object.values(slotMap).reduce((sum, d) => sum + d.clicks, 0),
    },
    hourlyData,
    distribution,
  }
}

// ── Helpers para cálculos estadísticos ────────────────────────────

function calculateStats(values: number[]) {
  if (values.length === 0) {
    return {
      minCpc: 0,
      maxCpc: 0,
      avgCpc: 0,
      medianCpc: 0,
      p10: 0,
      p25: 0,
      p75: 0,
      p90: 0,
      stdDev: 0,
    }
  }

  const sorted = values.slice().sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const sum = sorted.reduce((a, b) => a + b, 0)
  const avg = Math.round((sum / sorted.length) * 100) / 100

  // Percentiles
  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return Math.round(sorted[Math.max(0, idx)] * 100) / 100
  }

  const median = percentile(50)
  const p10 = percentile(10)
  const p25 = percentile(25)
  const p75 = percentile(75)
  const p90 = percentile(90)

  // Desviación estándar
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / sorted.length
  const stdDev = Math.round(Math.sqrt(variance) * 100) / 100

  return {
    minCpc: Math.round(min * 100) / 100,
    maxCpc: Math.round(max * 100) / 100,
    avgCpc: avg,
    medianCpc: median,
    p10,
    p25,
    p75,
    p90,
    stdDev,
  }
}

function generateDistribution(
  values: number[],
  minCpc: number,
  maxCpc: number,
  buckets: number = 10
) {
  if (values.length === 0) return []

  const range = maxCpc - minCpc || 0.1
  const bucketSize = range / buckets

  const distribution = Array.from({ length: buckets }).map((_, i) => ({
    priceRangeMin: Math.round((minCpc + i * bucketSize) * 100) / 100,
    priceRangeMax: Math.round((minCpc + (i + 1) * bucketSize) * 100) / 100,
    clickCount: 0,
    percentage: 0,
  }))

  // Contar clics en cada rango
  for (const value of values) {
    const bucketIdx = Math.min(
      buckets - 1,
      Math.floor((value - minCpc) / bucketSize)
    )
    if (bucketIdx >= 0 && bucketIdx < buckets) {
      distribution[bucketIdx].clickCount++
    }
  }

  // Calcular porcentajes
  const total = values.length
  for (const bucket of distribution) {
    bucket.percentage = total > 0 ? Math.round((bucket.clickCount / total) * 1000) / 10 : 0
  }

  return distribution
}
