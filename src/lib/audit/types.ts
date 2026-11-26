// ── Tipos de la sección Audit ─────────────────────────────────
// Compartidos entre servidor (recogida, reglas, IA) y cliente (informe).

export type Severity = 'ok' | 'warning' | 'critical'

export type AuditArea =
  | 'cuenta'
  | 'conversiones'
  | 'campanas'
  | 'pujas'
  | 'presupuesto'
  | 'palabras_clave'
  | 'terminos'
  | 'anuncios'
  | 'extensiones'
  | 'segmentos'

export const AREA_LABELS: Record<AuditArea, string> = {
  cuenta:         'Cuenta',
  conversiones:   'Seguimiento de conversiones',
  campanas:       'Estructura de campañas',
  pujas:          'Estrategia de puja',
  presupuesto:    'Presupuesto e Impression Share',
  palabras_clave: 'Palabras clave y Nivel de Calidad',
  terminos:       'Términos de búsqueda',
  anuncios:       'Anuncios',
  extensiones:    'Recursos (extensiones)',
  segmentos:      'Dispositivos, horarios y ubicaciones',
}

// Hallazgo objetivo de una regla fija (sin IA)
export interface Finding {
  id:       string
  area:     AuditArea
  severity: Severity
  title:    string
  detail:   string
  scope?:   string   // campaña / elemento afectado
}

// ── Datos recogidos de Google Ads (por cuenta) ────────────────

export interface CampaignData {
  id:              string
  name:            string
  channel:         string
  biddingStrategy: string
  targetRoas:      number | null
  targetCpa:       number | null   // EUR
  dailyBudget:     number | null   // EUR
  cost:            number
  clicks:          number
  impressions:     number
  conversions:     number
  convValue:       number
  ctr:             number | null   // 0-1
  avgCpc:          number | null
  isShare:         number | null   // 0-1
  isLostBudget:    number | null   // 0-1
  isLostRank:      number | null   // 0-1
}

export interface KeywordData {
  campaign:      string
  adGroup:       string
  text:          string
  matchType:     string
  qualityScore:  number | null
  expectedCtr:   string | null
  adRelevance:   string | null
  landingPage:   string | null
  cost:          number
  clicks:        number
  impressions:   number
  conversions:   number
}

export interface SearchTermData {
  term:        string
  campaign:    string
  cost:        number
  clicks:      number
  impressions: number
  conversions: number
  convValue:   number
}

export interface AdData {
  campaign:       string
  adGroup:        string
  type:           string
  adStrength:     string | null
  approvalStatus: string | null
}

export interface SegmentRow {
  segment:     string
  cost:        number
  clicks:      number
  conversions: number
  convValue:   number
}

export interface ConversionActionData {
  name:              string
  category:          string
  primary:           boolean
  countingType:      string
  inConversions:     boolean
}

export interface AccountAuditData {
  customerId:   string
  name:         string
  currency:     string
  period:       { start: string; end: string; days: number }
  optimizationScore: number | null   // 0-1
  autoTagging:  boolean | null
  campaigns:    CampaignData[]
  keywords:     KeywordData[]        // top por coste
  searchTerms:  SearchTermData[]     // top por coste
  ads:          AdData[]
  assetTypes:   { account: string[]; byCampaign: Record<string, string[]> }
  negatives:    { campaignKeywords: number; campaignsWithSharedLists: number; campaignsWithoutNegatives: string[] }
  devices:      SegmentRow[]
  hours:        SegmentRow[]
  geo:          SegmentRow[]
  conversionActions: ConversionActionData[]
  googleRecommendations: { type: string; count: number }[]
  unavailable:  string[]             // bloques que no se pudieron descargar
}

// ── Resultado de la IA ────────────────────────────────────────

export interface AuditItem {
  area:   AuditArea
  title:  string
  detail: string
}

export interface AuditRecommendation {
  priority: 'alta' | 'media' | 'baja'
  area:     AuditArea
  title:    string
  action:   string
  impact:   string
  effort:   'bajo' | 'medio' | 'alto'
}

export interface AccountAnalysis {
  score:           number          // 0-100
  summary:         string
  strengths:       AuditItem[]
  issues:          (AuditItem & { severity: 'warning' | 'critical' })[]
  recommendations: AuditRecommendation[]
}

export interface GlobalAnalysis {
  summary:         string
  commonIssues:    string[]
  priorities:      string[]
}

// ── Informe completo (lo que se pinta y se descarga) ──────────

export interface AccountKpis {
  cost:        number
  clicks:      number
  impressions: number
  conversions: number
  convValue:   number
  roas:        number | null
  cpa:         number | null
  ctr:         number | null
  avgCpc:      number | null
}

export interface AccountAuditResult {
  customerId: string
  name:       string
  currency:   string
  kpis:       AccountKpis
  findings:   Finding[]
  analysis:   AccountAnalysis | null   // null si la IA falló
  analysisError?: string
  unavailable: string[]
}

export interface AuditReport {
  generatedAt: string
  period:      { start: string; end: string; days: number }
  model:       string | null
  accounts:    AccountAuditResult[]
  global:      GlobalAnalysis | null
}
