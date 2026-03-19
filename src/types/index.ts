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
  topImpressionPct:        number | null   // 0-1  Primera posición
  absoluteTopImpressionPct:number | null   // 0-1  Primera posición absoluta
  targetRoas:              number | null
  realRoas:                number | null
  recommendation:          Recommendation
  capturedAt?:             string
}

export interface Recommendation {
  level:   'ok' | 'info' | 'warning' | 'alert'
  message: string
  parts:   string[]
}

export interface CpcConfig {
  campaignName: string
  cpcCeiling:   number
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
