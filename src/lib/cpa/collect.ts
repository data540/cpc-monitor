// ── Recogida de datos de Google Ads para CPA Analysis ────────
// Solo lectura (GAQL SELECT). Cada consulta va protegida por separado:
// si falla, se anota en `unavailable` y el resto continúa.

import type {
  CampaignSimulation, ChangeRow, ConversionActionRow, CpaCampaign, CpaOverview, CpaSegments,
  CpaSimulations, CpaWaste, DailyRow, DateRange, HeatCell, Metrics, SegmentRow, SimPoint, WasteRow,
} from './types'

const ADS_API_BASE = 'https://googleads.googleapis.com/v23'
const MAX_PAGES = 5

export interface CollectCtx {
  accessToken:     string
  developerToken:  string
  customerId:      string   // sin guiones
  loginCustomerId: string
  accountName:     string
  currency:        string
}

const num  = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v))
const numN = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))
const money = (micros: unknown) => num(micros) / 1_000_000
const moneyN = (micros: unknown) => { const n = num(micros); return n > 0 ? n / 1_000_000 : null }
const r2   = (n: number) => Math.round(n * 100) / 100
const idOf = (resourceName: unknown) => String(resourceName ?? '').split('/').pop() ?? ''

const fmt = (d: Date) => d.toISOString().slice(0, 10)

// Periodo que termina ayer (hoy tiene datos incompletos) y el anterior de igual duración
export function periodRanges(days: number): { current: DateRange; previous: DateRange; last7: DateRange } {
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (days - 1))
  const pEnd = new Date(start); pEnd.setUTCDate(pEnd.getUTCDate() - 1)
  const pStart = new Date(pEnd); pStart.setUTCDate(pStart.getUTCDate() - (days - 1))
  const s7 = new Date(end); s7.setUTCDate(s7.getUTCDate() - 6)
  return {
    current:  { start: fmt(start), end: fmt(end) },
    previous: { start: fmt(pStart), end: fmt(pEnd) },
    last7:    { start: fmt(s7), end: fmt(end) },
  }
}

const between = (r: DateRange) => `segments.date BETWEEN '${r.start}' AND '${r.end}'`
const campaignFilter = (ids?: string[]) =>
  ids && ids.length ? ` AND campaign.id IN (${ids.filter(i => /^\d+$/.test(i)).join(',')})` : ''

// Error de Google Ads resumido: "CODIGO: mensaje" (o el texto recortado si no es JSON)
function describeAdsError(body: string): string {
  try {
    const j = JSON.parse(body)
    const errs = j?.error?.details?.flatMap((d: any) => d?.errors ?? []) ?? []
    if (errs.length) {
      return errs.slice(0, 3).map((e: any) => {
        const code = Object.entries(e.errorCode ?? {}).map(([k, v]) => `${k}.${v}`).join(',')
        const field = e.location?.fieldPathElements?.map((p: any) => p.fieldName).join('.')
        return `${code}${field ? ` [${field}]` : ''}: ${e.message ?? ''}`
      }).join(' | ')
    }
    return j?.error?.message ?? body.slice(0, 300)
  } catch {
    return body.slice(0, 300)
  }
}

// Ejecuta una consulta GAQL (con paginación). Si falla y hay `fallback`, reintenta con esa
// consulta alternativa; solo se marca como no disponible si fallan las dos.
function makeGaql(ctx: CollectCtx, unavailable: string[]) {
  async function run(label: string, query: string): Promise<{ ok: boolean; rows: any[] }> {
    const rows: any[] = []
    let pageToken: string | undefined
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(`${ADS_API_BASE}/customers/${ctx.customerId}/googleAds:search`, {
          method: 'POST',
          headers: {
            'Authorization':     `Bearer ${ctx.accessToken}`,
            'developer-token':   ctx.developerToken,
            'login-customer-id': ctx.loginCustomerId,
            'Content-Type':      'application/json',
          },
          body:  JSON.stringify(pageToken ? { query, pageToken } : { query }),
          cache: 'no-store',
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.warn(`[cpa/collect] ${label} ${res.status}: ${describeAdsError(body)}`)
          return { ok: false, rows }
        }
        const data = await res.json()
        rows.push(...(data.results ?? []))
        pageToken = data.nextPageToken
        if (!pageToken) break
      }
      return { ok: true, rows }
    } catch (e) {
      console.warn(`[cpa/collect] ${label}`, e)
      return { ok: false, rows }
    }
  }

  return async function gaql(label: string, query: string, fallback?: string): Promise<any[]> {
    const first = await run(label, query)
    if (first.ok) return first.rows
    if (fallback) {
      const second = await run(`${label} (alternativa)`, fallback)
      if (second.ok) return second.rows
    }
    unavailable.push(label)
    return first.rows
  }
}

const METRIC_FIELDS = `metrics.cost_micros, metrics.clicks, metrics.impressions,
  metrics.conversions, metrics.all_conversions, metrics.conversions_value`

function readMetrics(m: any = {}): Metrics {
  return {
    cost:        money(m.costMicros),
    clicks:      num(m.clicks),
    impressions: num(m.impressions),
    conversions: num(m.conversions),
    allConv:     num(m.allConversions),
    convValue:   num(m.conversionsValue),
  }
}
const emptyMetrics = (): Metrics => ({ cost: 0, clicks: 0, impressions: 0, conversions: 0, allConv: 0, convValue: 0 })
function addMetrics(a: Metrics, b: Metrics) {
  a.cost += b.cost; a.clicks += b.clicks; a.impressions += b.impressions
  a.conversions += b.conversions; a.allConv += b.allConv; a.convValue += b.convValue
}
function roundMetrics<T extends Metrics>(m: T): T {
  return { ...m, cost: r2(m.cost), conversions: r2(m.conversions), allConv: r2(m.allConv), convValue: r2(m.convValue) }
}

// ── Resumen: campañas, evolución diaria, cambios y acciones de conversión ──
export async function collectOverview(ctx: CollectCtx, days: number): Promise<CpaOverview> {
  const unavailable: string[] = []
  const gaql = makeGaql(ctx, unavailable)
  const { current, previous, last7 } = periodRanges(days)

  // change_event solo admite los últimos 30 días
  const chStart = new Date(); chStart.setUTCDate(chStart.getUTCDate() - 29)
  const chEnd = new Date(); chEnd.setUTCDate(chEnd.getUTCDate() + 1)

  const [attrRows, curRows, prevRows, l7Rows, dailyRows, strategyRows, changeRows, convRows] = await Promise.all([
    gaql('Campañas', `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.bidding_strategy_system_status,
        campaign.target_cpa.target_cpa_micros, campaign.maximize_conversions.target_cpa_micros,
        campaign.campaign_budget, campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'`),
    gaql('Métricas del periodo', `
      SELECT campaign.id, ${METRIC_FIELDS},
        metrics.search_impression_share, metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign WHERE ${between(current)}`),
    gaql('Periodo anterior', `
      SELECT campaign.id, ${METRIC_FIELDS} FROM campaign WHERE ${between(previous)}`),
    gaql('Últimos 7 días', `
      SELECT campaign.id, ${METRIC_FIELDS} FROM campaign WHERE ${between(last7)}`),
    gaql('Evolución diaria', `
      SELECT campaign.id, segments.date, ${METRIC_FIELDS} FROM campaign WHERE ${between(current)}`),
    gaql('Estrategias de cartera', `
      SELECT accessible_bidding_strategy.id, accessible_bidding_strategy.name,
        accessible_bidding_strategy.type,
        accessible_bidding_strategy.target_cpa.target_cpa_micros,
        accessible_bidding_strategy.maximize_conversions.target_cpa_micros
      FROM accessible_bidding_strategy`),
    gaql('Historial de cambios', `
      SELECT change_event.change_date_time, change_event.change_resource_type,
        change_event.change_resource_name, change_event.changed_fields, change_event.campaign,
        change_event.resource_change_operation, change_event.old_resource, change_event.new_resource
      FROM change_event
      WHERE change_event.change_date_time >= '${fmt(chStart)}'
        AND change_event.change_date_time <= '${fmt(chEnd)}'
        AND change_event.change_resource_type IN ('CAMPAIGN', 'CAMPAIGN_BUDGET')
      ORDER BY change_event.change_date_time DESC
      LIMIT 300`, `
      SELECT change_event.change_date_time, change_event.change_resource_type,
        change_event.change_resource_name, change_event.changed_fields, change_event.campaign
      FROM change_event
      WHERE change_event.change_date_time >= '${fmt(chStart)}'
        AND change_event.change_date_time <= '${fmt(new Date())}'
        AND change_event.change_resource_type IN ('CAMPAIGN', 'CAMPAIGN_BUDGET')
      ORDER BY change_event.change_date_time DESC
      LIMIT 300`),
    gaql('Acciones de conversión', `
      SELECT conversion_action.name, conversion_action.category,
        conversion_action.primary_for_goal, conversion_action.counting_type
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'`),
  ])

  // Estrategias de cartera por id
  const strategies = new Map<string, { name: string; target: number | null }>()
  for (const r of strategyRows) {
    const s = r.accessibleBiddingStrategy ?? {}
    strategies.set(String(s.id), {
      name: s.name ?? '',
      target: moneyN(s.maximizeConversions?.targetCpaMicros) ?? moneyN(s.targetCpa?.targetCpaMicros),
    })
  }

  const byId = <T>(rows: any[], read: (r: any) => T) => {
    const m = new Map<string, T>()
    for (const r of rows) m.set(String(r.campaign?.id), read(r))
    return m
  }
  const cur  = byId(curRows, r => ({ m: readMetrics(r.metrics), raw: r.metrics ?? {} }))
  const prev = byId(prevRows, r => readMetrics(r.metrics))
  const l7   = byId(l7Rows, r => readMetrics(r.metrics))

  const budgetToCampaigns = new Map<string, string[]>()
  const strategyToCampaigns = new Map<string, string[]>()
  const names = new Map<string, string>()

  const campaigns: CpaCampaign[] = []
  for (const r of attrRows) {
    const c = r.campaign ?? {}
    const id = String(c.id)
    names.set(id, c.name ?? id)
    if (c.campaignBudget) budgetToCampaigns.set(c.campaignBudget, [...(budgetToCampaigns.get(c.campaignBudget) ?? []), id])
    const stratId = c.biddingStrategy ? idOf(c.biddingStrategy) : null
    if (c.biddingStrategy) strategyToCampaigns.set(c.biddingStrategy, [...(strategyToCampaigns.get(c.biddingStrategy) ?? []), id])

    const cm = cur.get(id)
    // Solo campañas activas o con gasto/conversiones en el periodo
    if (c.status !== 'ENABLED' && !(cm && (cm.m.cost > 0 || cm.m.conversions > 0))) continue

    const own = moneyN(c.maximizeConversions?.targetCpaMicros) ?? moneyN(c.targetCpa?.targetCpaMicros)
    const portfolio = stratId ? strategies.get(stratId) : undefined
    const targetCpa = own ?? portfolio?.target ?? null
    const raw = cm?.raw ?? {}

    campaigns.push({
      id, name: c.name ?? id,
      channel:       c.advertisingChannelType ?? '',
      status:        c.status ?? '',
      biddingType:   c.biddingStrategyType ?? '',
      portfolioName: portfolio?.name || null,
      targetCpa:     targetCpa !== null ? r2(targetCpa) : null,
      targetSource:  own !== null ? 'campana' : portfolio?.target != null ? 'cartera' : null,
      systemStatus:  c.biddingStrategySystemStatus ?? null,
      dailyBudget:   moneyN(r.campaignBudget?.amountMicros),
      isShare:       numN(raw.searchImpressionShare),
      isLostBudget:  numN(raw.searchBudgetLostImpressionShare),
      isLostRank:    numN(raw.searchRankLostImpressionShare),
      ...roundMetrics(cm?.m ?? emptyMetrics()),
      last7:         roundMetrics(l7.get(id) ?? emptyMetrics()),
      prev:          roundMetrics(prev.get(id) ?? emptyMetrics()),
    })
  }
  campaigns.sort((a, b) => b.cost - a.cost)

  const daily: DailyRow[] = dailyRows.map((r: any) => ({
    date: String(r.segments?.date ?? ''), campaignId: String(r.campaign?.id ?? ''),
    ...roundMetrics(readMetrics(r.metrics)),
  })).filter(d => d.date)

  // Historial de cambios relevantes para la puja
  const changes: ChangeRow[] = []
  for (const r of changeRows) {
    const ev = r.changeEvent ?? {}
    const fields = String(ev.changedFields ?? '')
    const type = ev.changeResourceType
    let campaignIds: string[] = ev.campaign ? [idOf(ev.campaign)] : []
    let kind: ChangeRow['kind'] = 'otro'
    let oldValue: number | null = null, newValue: number | null = null
    let detail = ''

    if (type === 'CAMPAIGN') {
      const o = ev.oldResource?.campaign ?? {}, n = ev.newResource?.campaign ?? {}
      if (/targetCpaMicros/.test(fields)) {
        kind = 'cpa_objetivo'
        oldValue = moneyN(o.maximizeConversions?.targetCpaMicros) ?? moneyN(o.targetCpa?.targetCpaMicros)
        newValue = moneyN(n.maximizeConversions?.targetCpaMicros) ?? moneyN(n.targetCpa?.targetCpaMicros)
        detail = 'CPA objetivo modificado'
      } else if (/biddingStrategy|maximizeConversions|targetCpa|targetRoas|manualCpc|targetSpend/.test(fields)) {
        kind = 'estrategia'; detail = `Estrategia de puja cambiada${n.biddingStrategyType ? ` a ${n.biddingStrategyType}` : ''}`
      } else if (/(^|,)status/.test(fields)) {
        kind = 'estado'; detail = `Estado: ${o.status ?? '?'} → ${n.status ?? '?'}`
      } else continue
    } else if (type === 'CAMPAIGN_BUDGET') {
      if (!/amountMicros/.test(fields)) continue
      kind = 'presupuesto'
      oldValue = moneyN(ev.oldResource?.campaignBudget?.amountMicros)
      newValue = moneyN(ev.newResource?.campaignBudget?.amountMicros)
      detail = 'Presupuesto diario modificado'
      if (!campaignIds.length) campaignIds = budgetToCampaigns.get(ev.changeResourceName) ?? []
    } else if (type === 'BIDDING_STRATEGY') {
      if (!/targetCpaMicros/.test(fields)) continue
      kind = 'cpa_objetivo'
      const o = ev.oldResource?.biddingStrategy ?? {}, n = ev.newResource?.biddingStrategy ?? {}
      oldValue = moneyN(o.maximizeConversions?.targetCpaMicros) ?? moneyN(o.targetCpa?.targetCpaMicros)
      newValue = moneyN(n.maximizeConversions?.targetCpaMicros) ?? moneyN(n.targetCpa?.targetCpaMicros)
      detail = `CPA objetivo de la cartera${n.name ? ` "${n.name}"` : ''} modificado`
      if (!campaignIds.length) campaignIds = strategyToCampaigns.get(ev.changeResourceName) ?? []
    } else continue

    const date = String(ev.changeDateTime ?? '').replace(' ', 'T')
    for (const cid of campaignIds.length ? campaignIds : [null]) {
      changes.push({ date, campaignId: cid, campaign: cid ? names.get(cid) ?? cid : null, kind, detail, oldValue, newValue })
    }
  }

  const conversionActions: ConversionActionRow[] = convRows.map((r: any) => ({
    name:         r.conversionAction?.name ?? '',
    category:     r.conversionAction?.category ?? '',
    primary:      !!r.conversionAction?.primaryForGoal,
    countingType: r.conversionAction?.countingType ?? '',
  }))

  return {
    customerId: ctx.customerId, name: ctx.accountName, currency: ctx.currency,
    period: { ...current, days }, prevPeriod: previous,
    campaigns, daily, changes, conversionActions, unavailable,
  }
}

// ── Segmentos ──────────────────────────────────────────────────
const DEVICE: Record<string, string> = { MOBILE: 'Móvil', DESKTOP: 'Ordenador', TABLET: 'Tablet', CONNECTED_TV: 'TV conectada', OTHER: 'Otros' }
const NETWORK: Record<string, string> = {
  SEARCH: 'Búsqueda de Google', SEARCH_PARTNERS: 'Partners de búsqueda', CONTENT: 'Display',
  YOUTUBE: 'YouTube', YOUTUBE_SEARCH: 'YouTube (búsqueda)', YOUTUBE_WATCH: 'YouTube (vídeos)',
  MIXED: 'Mixta (PMax)', GOOGLE_TV: 'Google TV', GOOGLE_OWNED_CHANNELS: 'Canales de Google',
}
const GENDER: Record<string, string> = { MALE: 'Hombre', FEMALE: 'Mujer', UNDETERMINED: 'Desconocido' }
const DOW: Record<string, number> = { MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6 }
const ageLabel = (t: string) => {
  if (t === 'AGE_RANGE_UNDETERMINED') return 'Desconocida'
  const m = t.match(/AGE_RANGE_(\d+)_(\d+|UP)/)
  return m ? (m[2] === 'UP' ? `${m[1]}+` : `${m[1]}-${m[2]}`) : t
}

function groupRows(rows: any[], key: (r: any) => string, label: (k: string) => string): SegmentRow[] {
  const acc = new Map<string, Metrics>()
  for (const r of rows) {
    const k = key(r); if (!k) continue
    const m = acc.get(k) ?? emptyMetrics()
    addMetrics(m, readMetrics(r.metrics))
    acc.set(k, m)
  }
  return [...acc.entries()]
    .map(([segment, m]) => roundMetrics({ segment, label: label(segment), ...m }))
    .sort((a, b) => b.cost - a.cost)
}

export async function collectSegments(ctx: CollectCtx, days: number, campaignIds?: string[]): Promise<CpaSegments> {
  const unavailable: string[] = []
  const gaql = makeGaql(ctx, unavailable)
  const { current } = periodRanges(days)
  const where = `${between(current)}${campaignFilter(campaignIds)}`

  const [devRows, netRows, heatRows, geoRows, ageRows, genderRows, audRows, convRows] = await Promise.all([
    gaql('Dispositivos', `SELECT segments.device, ${METRIC_FIELDS} FROM campaign WHERE ${where}`),
    gaql('Redes', `SELECT segments.ad_network_type, ${METRIC_FIELDS} FROM campaign WHERE ${where}`),
    gaql('Hora y día', `SELECT segments.day_of_week, segments.hour, ${METRIC_FIELDS} FROM campaign WHERE ${where}`),
    gaql('Ubicaciones', `SELECT segments.geo_target_region, ${METRIC_FIELDS} FROM geographic_view WHERE ${where}`,
      `SELECT segments.geo_target_region, metrics.cost_micros, metrics.clicks, metrics.impressions,
        metrics.conversions, metrics.conversions_value FROM geographic_view WHERE ${where}`),
    gaql('Edad', `SELECT ad_group_criterion.age_range.type, ${METRIC_FIELDS} FROM age_range_view WHERE ${where}`),
    gaql('Sexo', `SELECT ad_group_criterion.gender.type, ${METRIC_FIELDS} FROM gender_view WHERE ${where}`),
    gaql('Audiencias', `SELECT ad_group_criterion.display_name, ${METRIC_FIELDS} FROM ad_group_audience_view WHERE ${where}`),
    gaql('Conversiones por acción', `
      SELECT segments.conversion_action_name, metrics.conversions, metrics.all_conversions
      FROM campaign WHERE ${where}`),
  ])

  const heat = new Map<string, HeatCell>()
  for (const r of heatRows) {
    const dow = DOW[r.segments?.dayOfWeek as string]
    const hour = r.segments?.hour
    if (dow === undefined || hour === undefined) continue
    const k = `${dow}-${hour}`
    const m = readMetrics(r.metrics)
    const c = heat.get(k) ?? { dow, hour: Number(hour), cost: 0, conversions: 0, allConv: 0, clicks: 0 }
    c.cost += m.cost; c.conversions += m.conversions; c.allConv += m.allConv; c.clicks += m.clicks
    heat.set(k, c)
  }

  let geo = groupRows(geoRows, r => String(r.segments?.geoTargetRegion ?? ''), k => k).slice(0, 20)
  if (geo.length) {
    const ids = geo.map(g => `'${g.segment}'`).join(',')
    const nameRows = await gaql('Nombres de ubicaciones', `
      SELECT geo_target_constant.resource_name, geo_target_constant.name
      FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${ids})`)
    const map = new Map(nameRows.map((r: any) => [r.geoTargetConstant?.resourceName, r.geoTargetConstant?.name]))
    geo = geo.map(g => ({ ...g, label: String(map.get(g.segment) ?? g.segment) }))
  }

  const convAcc = new Map<string, { conversions: number; allConv: number }>()
  for (const r of convRows) {
    const k = String(r.segments?.conversionActionName ?? ''); if (!k) continue
    const c = convAcc.get(k) ?? { conversions: 0, allConv: 0 }
    c.conversions += num(r.metrics?.conversions); c.allConv += num(r.metrics?.allConversions)
    convAcc.set(k, c)
  }

  return {
    customerId: ctx.customerId,
    devices:   groupRows(devRows, r => String(r.segments?.device ?? ''), k => DEVICE[k] ?? k),
    networks:  groupRows(netRows, r => String(r.segments?.adNetworkType ?? ''), k => NETWORK[k] ?? k),
    geo,
    ages:      groupRows(ageRows, r => String(r.adGroupCriterion?.ageRange?.type ?? ''), ageLabel),
    genders:   groupRows(genderRows, r => String(r.adGroupCriterion?.gender?.type ?? ''), k => GENDER[k] ?? k),
    audiences: groupRows(audRows, r => String(r.adGroupCriterion?.displayName ?? ''), k => k).slice(0, 20),
    heatmap:   [...heat.values()].map(c => ({ ...c, cost: r2(c.cost), conversions: r2(c.conversions), allConv: r2(c.allConv) })),
    conversionsByAction: [...convAcc.entries()]
      .map(([name, c]) => ({ name, conversions: r2(c.conversions), allConv: r2(c.allConv) }))
      .sort((a, b) => b.allConv - a.allConv),
    unavailable,
  }
}

// Estado efectivo de la palabra clave: la propia, o la del grupo/campaña si están pausados
function keywordStatus(r: any): string | null {
  const k = r.adGroupCriterion?.status, g = r.adGroup?.status, c = r.campaign?.status
  if (k === 'REMOVED' || g === 'REMOVED' || c === 'REMOVED') return 'REMOVED'
  if (k === 'PAUSED') return 'PAUSED'
  if (g === 'PAUSED') return 'AD_GROUP_PAUSED'
  if (c === 'PAUSED') return 'CAMPAIGN_PAUSED'
  return k ?? null
}

// ── Desperdicio: palabras clave y términos de búsqueda ─────────
export async function collectWaste(ctx: CollectCtx, days: number, campaignIds?: string[]): Promise<CpaWaste> {
  const unavailable: string[] = []
  const gaql = makeGaql(ctx, unavailable)
  const { current } = periodRanges(days)
  const where = `${between(current)}${campaignFilter(campaignIds)}`

  const [kwRows, termRows] = await Promise.all([
    gaql('Palabras clave', `
      SELECT campaign.name, campaign.status, ad_group.name, ad_group.status,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status,
        metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
      FROM keyword_view
      WHERE ${where} AND metrics.cost_micros > 0
      ORDER BY metrics.cost_micros DESC
      LIMIT 500`),
    gaql('Términos de búsqueda', `
      SELECT search_term_view.search_term, search_term_view.status, segments.search_term_match_type, campaign.name, ad_group.name,
        metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
      FROM search_term_view
      WHERE ${where} AND metrics.cost_micros > 0
      ORDER BY metrics.cost_micros DESC
      LIMIT 500`),
  ])

  const keywords: WasteRow[] = kwRows.map((r: any) => ({
    kind: 'keyword', text: r.adGroupCriterion?.keyword?.text ?? '',
    matchType: r.adGroupCriterion?.keyword?.matchType ?? null,
    campaign: r.campaign?.name ?? '', adGroup: r.adGroup?.name ?? null, status: keywordStatus(r),
    cost: r2(money(r.metrics?.costMicros)), clicks: num(r.metrics?.clicks),
    impressions: num(r.metrics?.impressions), conversions: r2(num(r.metrics?.conversions)),
  }))

  // Un término puede aparecer en varias filas (tipo de concordancia): se agrupa
  const termAcc = new Map<string, WasteRow>()
  for (const r of termRows) {
    const text = r.searchTermView?.searchTerm ?? ''
    const k = `${text}|${r.campaign?.name}|${r.adGroup?.name}`
    const t = termAcc.get(k) ?? { kind: 'term', text, matchType: r.segments?.searchTermMatchType ?? null,
      campaign: r.campaign?.name ?? '', adGroup: r.adGroup?.name ?? null, status: r.searchTermView?.status ?? null, cost: 0, clicks: 0, impressions: 0, conversions: 0 }
    t.cost += money(r.metrics?.costMicros); t.clicks += num(r.metrics?.clicks)
    t.impressions += num(r.metrics?.impressions); t.conversions += num(r.metrics?.conversions)
    termAcc.set(k, t)
  }
  const terms = [...termAcc.values()].map(t => ({ ...t, cost: r2(t.cost), conversions: r2(t.conversions) }))
    .sort((a, b) => b.cost - a.cost)

  const sum = (rows: WasteRow[], noConv: boolean) => r2(rows.filter(r => !noConv || r.conversions === 0).reduce((s, r) => s + r.cost, 0))
  return {
    customerId: ctx.customerId, keywords, terms,
    totals: {
      keywordCost: sum(keywords, false), keywordCostNoConv: sum(keywords, true),
      termCost: sum(terms, false), termCostNoConv: sum(terms, true),
    },
    unavailable,
  }
}

// ── Simulador de Google (CPA objetivo y presupuesto) ──────────
export async function collectSimulations(ctx: CollectCtx, campaignIds?: string[]): Promise<CpaSimulations> {
  const unavailable: string[] = []
  const gaql = makeGaql(ctx, unavailable)
  const filter = campaignIds && campaignIds.length
    ? ` AND campaign_simulation.campaign_id IN (${campaignIds.filter(i => /^\d+$/.test(i)).join(',')})` : ''

  const [cpaRows, budgetRows, attrRows] = await Promise.all([
    gaql('Simulador de CPA objetivo', `
      SELECT campaign_simulation.campaign_id, campaign_simulation.start_date, campaign_simulation.end_date,
        campaign_simulation.target_cpa_point_list.points
      FROM campaign_simulation
      WHERE campaign_simulation.type = 'TARGET_CPA'${filter}`),
    gaql('Simulador de presupuesto', `
      SELECT campaign_simulation.campaign_id, campaign_simulation.start_date, campaign_simulation.end_date,
        campaign_simulation.budget_point_list.points
      FROM campaign_simulation
      WHERE campaign_simulation.type = 'BUDGET'${filter}`),
    gaql('Campañas', `
      SELECT campaign.id, campaign.name, campaign.target_cpa.target_cpa_micros,
        campaign.maximize_conversions.target_cpa_micros, campaign_budget.amount_micros
      FROM campaign WHERE campaign.status = 'ENABLED'`),
  ])

  const info = new Map<string, { name: string; target: number | null; budget: number | null }>()
  for (const r of attrRows) {
    const c = r.campaign ?? {}
    info.set(String(c.id), {
      name: c.name ?? String(c.id),
      target: moneyN(c.maximizeConversions?.targetCpaMicros) ?? moneyN(c.targetCpa?.targetCpaMicros),
      budget: moneyN(r.campaignBudget?.amountMicros),
    })
  }

  const simulations: CampaignSimulation[] = []
  const build = (rows: any[], type: CampaignSimulation['type']) => {
    for (const r of rows) {
      const s = r.campaignSimulation ?? {}
      const id = String(s.campaignId)
      const i = info.get(id)
      if (!i) continue
      const raw = type === 'TARGET_CPA' ? s.targetCpaPointList?.points : s.budgetPointList?.points
      const points: SimPoint[] = (raw ?? []).map((p: any) => ({
        x:           r2(money(type === 'TARGET_CPA' ? p.targetCpaMicros : p.budgetAmountMicros)),
        cost:        r2(money(p.costMicros)),
        conversions: r2(num(p.biddableConversions)),
        clicks:      num(p.clicks),
        impressions: num(p.impressions),
      })).filter((p: SimPoint) => p.x > 0).sort((a: SimPoint, b: SimPoint) => a.x - b.x)
      if (points.length < 2) continue
      simulations.push({
        campaignId: id, campaign: i.name, type,
        current: type === 'TARGET_CPA' ? i.target : i.budget,
        startDate: s.startDate ?? '', endDate: s.endDate ?? '', points,
      })
    }
  }
  build(cpaRows, 'TARGET_CPA')
  build(budgetRows, 'BUDGET')

  return { customerId: ctx.customerId, simulations, unavailable }
}
