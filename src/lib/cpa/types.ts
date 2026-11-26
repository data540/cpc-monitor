// ── Tipos de CPA Analysis ─────────────────────────────────────
// Compartidos por servidor (recogida, IA) y cliente (gráficas, reglas, informe).

export type CpaPeriod = 7 | 14 | 30 | 90 | 180 | 365

export interface DateRange { start: string; end: string }

// Métricas base (las conversiones "todas" se guardan aparte para el selector)
export interface Metrics {
  cost:        number
  clicks:      number
  impressions: number
  conversions: number
  allConv:     number
  convValue:   number
}

export interface CpaCampaign extends Metrics {
  id:              string
  name:            string
  channel:         string
  status:          string
  biddingType:     string            // TARGET_CPA, MAXIMIZE_CONVERSIONS, …
  portfolioName:   string | null
  targetCpa:       number | null     // en la moneda de la cuenta
  targetSource:    'campana' | 'cartera' | null
  systemStatus:    string | null     // campaign.bidding_strategy_system_status
  dailyBudget:     number | null
  isShare:         number | null
  isLostBudget:    number | null
  isLostRank:      number | null
  last7:           Metrics
  prev:            Metrics           // periodo anterior de la misma duración
}

export interface DailyRow extends Metrics { date: string; campaignId: string }

export interface ChangeRow {
  date:       string                 // ISO
  campaignId: string | null
  campaign:   string | null
  kind:       'cpa_objetivo' | 'presupuesto' | 'estrategia' | 'estado' | 'otro'
  detail:     string
  oldValue:   number | null
  newValue:   number | null
}

export interface ConversionActionRow {
  name:      string
  category:  string
  primary:   boolean
  countingType: string
}

export interface CpaOverview {
  customerId:  string
  name:        string
  currency:    string
  period:      DateRange & { days: number }
  prevPeriod:  DateRange
  campaigns:   CpaCampaign[]
  daily:       DailyRow[]
  changes:     ChangeRow[]
  conversionActions: ConversionActionRow[]
  unavailable: string[]
}

export interface SegmentRow extends Metrics { segment: string; label: string }

export interface HeatCell { dow: number; hour: number; cost: number; conversions: number; allConv: number; clicks: number }

export interface CpaSegments {
  customerId:  string
  devices:     SegmentRow[]
  networks:    SegmentRow[]
  geo:         SegmentRow[]
  ages:        SegmentRow[]
  genders:     SegmentRow[]
  audiences:   SegmentRow[]
  heatmap:     HeatCell[]
  conversionsByAction: { name: string; conversions: number; allConv: number }[]
  unavailable: string[]
}

export interface WasteRow {
  kind:        'keyword' | 'term'
  text:        string
  matchType:   string | null
  campaign:    string
  adGroup:     string | null
  status:      string | null     // palabra clave: ENABLED, PAUSED, AD_GROUP_PAUSED, CAMPAIGN_PAUSED, REMOVED · término: ADDED, EXCLUDED, ADDED_EXCLUDED, NONE
  cost:        number
  clicks:      number
  impressions: number
  conversions: number
}

export interface CpaWaste {
  customerId:  string
  keywords:    WasteRow[]        // todas las devueltas (orden coste desc)
  terms:       WasteRow[]
  totals:      { keywordCost: number; keywordCostNoConv: number; termCost: number; termCostNoConv: number }
  unavailable: string[]
}

export interface SimPoint {
  x:           number            // CPA objetivo o presupuesto diario
  cost:        number
  conversions: number
  clicks:      number
  impressions: number
}

export interface CampaignSimulation {
  campaignId:  string
  campaign:    string
  type:        'TARGET_CPA' | 'BUDGET'
  current:     number | null     // CPA objetivo / presupuesto actual
  startDate:   string
  endDate:     string
  points:      SimPoint[]
}

export interface CpaSimulations {
  customerId:  string
  simulations: CampaignSimulation[]
  unavailable: string[]
}

// ── Alertas (reglas fijas) ────────────────────────────────────
export type AlertLevel = 'critical' | 'warning' | 'info'

export interface CpaAlert {
  id:          string
  level:       AlertLevel
  title:       string
  description: string
  account?:    string
  campaign?:   string
  value?:      string
}

// ── Análisis IA ───────────────────────────────────────────────
export type Verdict = 'escalar' | 'mantener' | 'optimizar' | 'reducir' | 'pausar'

export interface CpaAiAnalysis {
  score:     number
  summary:   string
  alerts:    { severity: 'warning' | 'critical'; title: string; detail: string }[]
  campaigns: { campaign: string; verdict: Verdict; diagnosis: string; action: string }[]
  targets:   { campaign: string; currentTarget: number | null; suggestedTarget: number | null; rationale: string }[]
  recommendations: {
    priority: 'alta' | 'media' | 'baja'; title: string; action: string; impact: string; confidence: 'alta' | 'media' | 'baja'
  }[]
  doNotTouch: string[]
}

export interface CpaReport {
  generatedAt: string
  model:       string | null
  account:     { customerId: string; name: string; currency: string }
  period:      DateRange & { days: number }
  conversionsMode: 'primary' | 'all'
  kpis:        CpaKpis
  campaigns:   CampaignView[]
  alerts:      CpaAlert[]
  analysis:    CpaAiAnalysis | null
  usage?:      import('@/lib/ai/usage').AiUsage | null
}

// ── Vistas derivadas (cliente) ────────────────────────────────
export interface CpaKpis {
  cost: number; conversions: number; cpa: number | null; refCpa: number | null
  convRate: number | null; cpc: number | null; ctr: number | null
  clicks: number; impressions: number
  isShare: number | null; isLostBudget: number | null; isLostRank: number | null
  prevCost: number; prevConversions: number; prevCpa: number | null
}

export interface CampaignView {
  accountId:   string
  account:     string
  currency:    string
  id:          string
  name:        string
  status:      string
  biddingType: string
  portfolioName: string | null
  systemStatus:  string | null
  targetCpa:   number | null
  refCpa:      number | null      // objetivo o, si no hay, CPA medio de la cuenta
  refIsAverage: boolean
  cost:        number
  conversions: number
  cpa:         number | null
  cpa7:        number | null
  prevCpa:     number | null
  deviation:   number | null      // (cpa - ref) / ref
  convRate:    number | null
  cpc:         number | null
  dailyBudget: number | null
  budgetUse:   number | null      // gasto diario medio / presupuesto
  isShare:     number | null
  isLostBudget: number | null
  isLostRank:  number | null
  clicks:      number
  impressions: number
}
