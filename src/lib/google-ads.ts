// ── Google Ads API client ─────────────────────────────────────
// Toda la lógica de llamadas a la API, portada directamente del script
// que ya funciona en producción.

import { CampaignMetrics, GoogleAdsCampaignRow } from '@/types'
import { buildRecommendation } from './recommendations'

// ── Mock data para desarrollo (sin scope adwords) ─────────────

const MOCK_CAMPAIGNS: CampaignMetrics[] = [
  { campaignId: 'mock-1', campaignName: 'Brand - Exact',         cpcCeiling: 0.80, avgCpc: 0.62, cpcUsagePct: 77.5,  clicks: 1240, impressions: 18500, ctr: 6.70, costEur: 769.0,  isActual: 0.82, topImpressionPct: 0.71, absoluteTopImpressionPct: 0.48, targetRoas: 4.5, realRoas: 5.1,  recommendation: buildRecommendation({ cpcUsagePct: 77.5,  isActual: 0.82, cpcCeiling: 0.80, realRoas: 5.1,  targetRoas: 4.5 }) },
  { campaignId: 'mock-2', campaignName: 'Competencia - BMM',     cpcCeiling: 1.20, avgCpc: 1.15, cpcUsagePct: 95.8,  clicks:  430, impressions:  9200, ctr: 4.67, costEur: 494.5,  isActual: 0.41, topImpressionPct: 0.38, absoluteTopImpressionPct: 0.21, targetRoas: 3.0, realRoas: 2.8,  recommendation: buildRecommendation({ cpcUsagePct: 95.8,  isActual: 0.41, cpcCeiling: 1.20, realRoas: 2.8,  targetRoas: 3.0 }) },
  { campaignId: 'mock-3', campaignName: 'Genérico - Amplia',     cpcCeiling: 0.60, avgCpc: 0.38, cpcUsagePct: 63.3,  clicks:  870, impressions: 24100, ctr: 3.61, costEur: 330.6,  isActual: 0.67, topImpressionPct: 0.54, absoluteTopImpressionPct: 0.31, targetRoas: 5.0, realRoas: 6.2,  recommendation: buildRecommendation({ cpcUsagePct: 63.3,  isActual: 0.67, cpcCeiling: 0.60, realRoas: 6.2,  targetRoas: 5.0 }) },
  { campaignId: 'mock-4', campaignName: 'Remarketing - Dinámico',cpcCeiling: null, avgCpc: 0.29, cpcUsagePct: null,   clicks:  310, impressions:  5400, ctr: 5.74, costEur:  89.9,  isActual: 0.91, topImpressionPct: 0.88, absoluteTopImpressionPct: 0.72, targetRoas: 8.0, realRoas: 9.4,  recommendation: buildRecommendation({ cpcUsagePct: null,   isActual: 0.91, cpcCeiling: null, realRoas: 9.4,  targetRoas: 8.0 }) },
  { campaignId: 'mock-5', campaignName: 'Shopping - Max ROAS',   cpcCeiling: 1.50, avgCpc: 1.49, cpcUsagePct: 99.3,  clicks:  205, impressions:  3100, ctr: 6.61, costEur: 305.5,  isActual: 0.55, topImpressionPct: 0.44, absoluteTopImpressionPct: 0.29, targetRoas: 6.0, realRoas: 4.1,  recommendation: buildRecommendation({ cpcUsagePct: 99.3,  isActual: 0.55, cpcCeiling: 1.50, realRoas: 4.1,  targetRoas: 6.0 }) },
]

const ADS_API_BASE = 'https://googleads.googleapis.com/v18'

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

  try {
    const res = await fetch(
      `${ADS_API_BASE}/customers/${opts.customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: buildHeaders(opts),
        body: JSON.stringify({ query }),
      }
    )

    if (!res.ok) {
      console.warn('[google-ads] No se pudieron leer estrategias de cartera:', res.status)
      return {}
    }

    const data = await res.json()
    const ceilings: Record<string, { name: string; cpcCeiling: number; targetRoas: number }> = {}

    for (const row of data.results ?? []) {
      const rn      = row.biddingStrategy?.resourceName
      const micros  = Number(row.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0)
      const troas   = Number(row.biddingStrategy?.targetRoas?.targetRoas ?? 0)
      if (rn) {
        ceilings[rn] = {
          name:       row.biddingStrategy?.name ?? rn,
          cpcCeiling: Math.round(micros / 1e4) / 100,
          targetRoas: troas,
        }
      }
    }

    return ceilings
  } catch (e) {
    console.error('[google-ads] Error cargando carteras:', e)
    return {}
  }
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
      metrics.average_cpc,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.cost_micros,
      metrics.search_impression_share,
      metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.conversions_value,
      metrics.conversions
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
  if (process.env.NODE_ENV === 'development') {
    return MOCK_CAMPAIGNS
  }

  const days      = opts.dateRangeDays ?? 30
  const dateRange = buildDateRange(days)

  // Cargar techos de cartera
  const portfolioCeilings = await loadPortfolioCeilings(opts)
  const manualCeilings    = opts.manualCeilings ?? {}

  // Obtener filas de métricas
  const rows = await fetchCampaignRows(opts, dateRange)

  return rows.map((row: any) => {
    const campaignName = row.campaign?.name ?? ''

    // CPC techo: nivel campaña → cartera → manual
    let cpcCeiling: number | null = null
    const campaignMicros = Number(row.campaign?.targetRoas?.cpcBidCeilingMicros ?? 0)
    if (campaignMicros > 0) {
      cpcCeiling = Math.round(campaignMicros / 1e4) / 100
    }

    const portfolioRef = row.campaign?.biddingStrategy
    if (!cpcCeiling && portfolioRef && portfolioCeilings[portfolioRef]) {
      cpcCeiling = portfolioCeilings[portfolioRef].cpcCeiling
    }

    if (!cpcCeiling && manualCeilings[campaignName]) {
      cpcCeiling = manualCeilings[campaignName]
    }

    // Métricas
    const avgCpc     = Math.round(Number(row.metrics?.averageCpc ?? 0) / 1e4) / 100
    const costEur    = Math.round(Number(row.metrics?.costMicros ?? 0) / 1e4) / 100
    const convValue  = Number(row.metrics?.conversionsValue ?? 0)
    const targetRoas = Number(row.campaign?.targetRoas?.targetRoas ?? 0) ||
                       (portfolioRef ? portfolioCeilings[portfolioRef]?.targetRoas : null)

    const cpcUsagePct = cpcCeiling && cpcCeiling > 0
      ? Math.round((avgCpc / cpcCeiling) * 1000) / 10
      : null

    const isRaw    = row.metrics?.searchImpressionShare
    const isActual = isRaw && isRaw !== '--' ? Number(isRaw) : null

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
      topImpressionPct,
      absoluteTopImpressionPct,
      targetRoas:               targetRoas || null,
      realRoas,
      recommendation:           buildRecommendation({ cpcUsagePct, isActual, cpcCeiling, realRoas, targetRoas }),
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
