// ── Tipos compartidos — CPC Monitor ──────────────────────────

export interface CampaignMetrics {
  campaignId:              string
  campaignName:            string
  cpcCeiling:              number | null   // EUR — null si no hay límite
  avgCpc:                  number          // EUR
  cpcUsagePct:             number | null   // 0-100
  clicks:                  number
  impressions:             number
  ctr:                     number          // porcentaje
  costEur:                 number
  isActual:                number | null   // 0-1  Search Impression Share
  isLostBudget:            number | null   // 0-1  IS perdida por presupuesto
  isLostRank:              number | null   // 0-1  IS perdida por ranking de puja
  topImpressionPct:        number | null   // 0-1  Primera posición
  absoluteTopImpressionPct:number | null   // 0-1  Primera posición absoluta
  targetRoas:              number | null
  realRoas:                number | null
  recommendation:          Recommendation
  capturedAt?:             string
  _debug?:                 Record<string, any>
}

export interface Recommendation {
  level:   'ok' | 'info' | 'warning' | 'alert'
  message: string
  parts:   string[]
}

export interface CpcConfig {
  campaignName: string
  cpcCeiling:   number
  isThreshold?: number | null
}

export interface HistoryPoint {
  capturedAt:  string
  avgCpc:      number
  cpcCeiling:  number | null
  cpcUsagePct: number | null
  clicks:      number
  isActual:    number | null
}

// Respuesta de la Google Ads API para campañas
export interface GoogleAdsCampaignRow {
  'campaign.id':                                    string
  'campaign.name':                                  string
  'campaign.bidding_strategy_type':                 string
  'campaign.bidding_strategy':                      string
  'campaign.target_roas.target_roas':               string
  'campaign.target_roas.cpc_bid_ceiling_micros':    string
  'metrics.average_cpc':                            string
  'metrics.clicks':                                 string
  'metrics.impressions':                            string
  'metrics.ctr':                                    string
  'metrics.cost_micros':                            string
  'metrics.search_impression_share':                string
  'metrics.conversions_value':                      string
  'metrics.conversions':                            string
}

// Recomendación experta de techo CPC
export interface ExpertRecommendation {
  suggestedCeiling: number
  currentCeiling:   number | null
  delta:            number
  deltaPercent:     number | null
  confidence:       'high' | 'medium' | 'low'
  scenario:         'raise_constrained' | 'raise_losing_traffic' | 'lower_underperforming' | 'hold_no_ceiling' | 'hold_stable' | 'hold_budget_bottleneck' | 'is_below_threshold'
  reasoning:        string[]
}

// Tendencia histórica de métricas clave
export interface TrendData {
  direction:    'up' | 'down' | 'stable'   // tendencia del avgCpc
  cpcChangePct: number                      // % cambio primer→último snapshot
  isDirection:  'up' | 'down' | 'stable' | null
  isChangePct:  number | null
  dataPoints:   number                      // nº snapshots usados
  periodDays:   number                      // días cubiertos
}

// Distribución de CPC por hora para una campaña
export interface CpcDistributionData {
  campaignId: string
  campaignName: string
  period: { startDate: string; endDate: string }
  temporalMode: 'hourly' | 'weekly'   // 'hourly' = 24h, 'weekly' = 7 días
  stats: {
    minCpc: number
    maxCpc: number
    avgCpc: number
    medianCpc: number
    p10: number
    p25: number
    p75: number
    p90: number
    stdDev: number
    totalClicks: number
  }
  hourlyData: Array<{
    hour: number
    label: string     // '0:00'–'23:00' en modo horario, 'Lun'–'Dom' en modo semanal
    avgCpc: number
    clicks: number
    cost: number
  }>
  distribution: Array<{
    priceRangeMin: number
    priceRangeMax: number
    clickCount: number
    percentage: number
  }>
}
