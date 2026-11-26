// ── Recogida de datos de Google Ads para la auditoría ─────────
// Solo lectura (consultas GAQL SELECT). Cada bloque se descarga por separado:
// si uno falla, se registra en `unavailable` y el resto continúa.

import { getCampaignMetrics } from '@/lib/google-ads'
import type {
  AccountAuditData, AdData, CampaignData, ConversionActionData,
  KeywordData, SearchTermData, SegmentRow,
} from './types'

const ADS_API_BASE = 'https://googleads.googleapis.com/v23'

interface CollectOptions {
  accessToken:     string
  developerToken:  string
  customerId:      string   // sin guiones
  loginCustomerId: string
  accountName:     string
  currency:        string
  days:            number
}

const num  = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v))
const numN = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))
const eur  = (micros: unknown) => num(micros) / 1_000_000
const r2   = (n: number) => Math.round(n * 100) / 100

function dateRange(days: number) {
  // Hasta ayer: el día en curso tiene datos incompletos
  const end = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setDate(start.getDate() - (days - 1))
  const f = (d: Date) => d.toISOString().slice(0, 10)
  return { start: f(start), end: f(end) }
}

export async function collectAccountData(o: CollectOptions): Promise<AccountAuditData> {
  const { start, end } = dateRange(o.days)
  const during = `segments.date BETWEEN '${start}' AND '${end}'`
  const unavailable: string[] = []

  async function gaql(label: string, query: string): Promise<any[]> {
    try {
      const res = await fetch(`${ADS_API_BASE}/customers/${o.customerId}/googleAds:search`, {
        method: 'POST',
        headers: {
          'Authorization':     `Bearer ${o.accessToken}`,
          'developer-token':   o.developerToken,
          'login-customer-id': o.loginCustomerId,
          'Content-Type':      'application/json',
        },
        body:  JSON.stringify({ query }),
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(`[audit/collect] ${label} ${res.status}: ${body.slice(0, 300)}`)
        unavailable.push(label)
        return []
      }
      const data = await res.json()
      return data.results ?? []
    } catch (e) {
      console.warn(`[audit/collect] ${label}`, e)
      unavailable.push(label)
      return []
    }
  }

  const [
    customerRows, campaignRows, keywordRows, termRows, adRows,
    campaignAssetRows, customerAssetRows, negativeRows, sharedSetRows,
    deviceRows, hourRows, geoRows, convActionRows, recRows,
  ] = await Promise.all([
    gaql('Datos de la cuenta', `
      SELECT customer.optimization_score, customer.auto_tagging_enabled
      FROM customer`),
    gaql('Campañas', `
      SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign.target_roas.target_roas,
        campaign.maximize_conversion_value.target_roas,
        campaign.target_cpa.target_cpa_micros,
        campaign.maximize_conversions.target_cpa_micros,
        campaign_budget.amount_micros,
        metrics.cost_micros, metrics.clicks, metrics.impressions,
        metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign
      WHERE campaign.status = 'ENABLED' AND ${during}`),
    gaql('Palabras clave', `
      SELECT campaign.name, ad_group.name,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score,
        metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
      FROM keyword_view
      WHERE ad_group_criterion.status = 'ENABLED' AND ad_group.status = 'ENABLED'
        AND campaign.status = 'ENABLED' AND ${during}
      ORDER BY metrics.cost_micros DESC
      LIMIT 300`),
    gaql('Términos de búsqueda', `
      SELECT search_term_view.search_term, campaign.name,
        metrics.cost_micros, metrics.clicks, metrics.impressions,
        metrics.conversions, metrics.conversions_value
      FROM search_term_view
      WHERE ${during}
      ORDER BY metrics.cost_micros DESC
      LIMIT 200`),
    gaql('Anuncios', `
      SELECT campaign.name, ad_group.name, ad_group_ad.ad.type,
        ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status
      FROM ad_group_ad
      WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED'
        AND campaign.status = 'ENABLED'
      LIMIT 3000`),
    gaql('Recursos de campaña', `
      SELECT campaign.name, campaign_asset.field_type
      FROM campaign_asset
      WHERE campaign_asset.status = 'ENABLED' AND campaign.status = 'ENABLED'
      LIMIT 5000`),
    gaql('Recursos de cuenta', `
      SELECT customer_asset.field_type
      FROM customer_asset
      WHERE customer_asset.status = 'ENABLED'
      LIMIT 2000`),
    gaql('Negativas de campaña', `
      SELECT campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'
        AND campaign.status = 'ENABLED'
      LIMIT 10000`),
    gaql('Listas de negativas', `
      SELECT campaign.name, shared_set.type
      FROM campaign_shared_set
      WHERE campaign_shared_set.status = 'ENABLED' AND campaign.status = 'ENABLED'
      LIMIT 2000`),
    gaql('Dispositivos', `
      SELECT segments.device, metrics.cost_micros, metrics.clicks,
        metrics.conversions, metrics.conversions_value
      FROM customer
      WHERE ${during}`),
    gaql('Horas', `
      SELECT segments.hour, metrics.cost_micros, metrics.clicks,
        metrics.conversions, metrics.conversions_value
      FROM customer
      WHERE ${during}`),
    gaql('Ubicaciones', `
      SELECT segments.geo_target_region, metrics.cost_micros, metrics.clicks,
        metrics.conversions, metrics.conversions_value
      FROM geographic_view
      WHERE ${during}
      ORDER BY metrics.cost_micros DESC
      LIMIT 500`),
    gaql('Acciones de conversión', `
      SELECT conversion_action.name, conversion_action.category,
        conversion_action.primary_for_goal, conversion_action.counting_type,
        conversion_action.include_in_conversions_metric
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
      LIMIT 200`),
    gaql('Recomendaciones de Google', `
      SELECT recommendation.type
      FROM recommendation
      LIMIT 2000`),
  ])

  // ── Cuenta ──
  const cust = customerRows[0]?.customer
  const optimizationScore = numN(cust?.optimizationScore)
  const autoTagging = cust ? !!cust.autoTaggingEnabled : null

  // ── Campañas (tROAS de estrategias de cartera vía getCampaignMetrics) ──
  let portfolioRoas: Record<string, number | null> = {}
  try {
    const metrics = await getCampaignMetrics({
      accessToken: o.accessToken, developerToken: o.developerToken,
      customerId: o.customerId, mccCustomerId: o.loginCustomerId,
      dateRangeDays: o.days,
    })
    portfolioRoas = Object.fromEntries(metrics.map(m => [m.campaignId, m.targetRoas]))
  } catch { /* opcional */ }

  const campaigns: CampaignData[] = campaignRows.map((r: any) => {
    const c = r.campaign ?? {}, m = r.metrics ?? {}
    const tRoas = numN(c.targetRoas?.targetRoas) ?? numN(c.maximizeConversionValue?.targetRoas)
      ?? portfolioRoas[String(c.id)] ?? null
    const tCpaMicros = numN(c.targetCpa?.targetCpaMicros) ?? numN(c.maximizeConversions?.targetCpaMicros)
    return {
      id:              String(c.id ?? ''),
      name:            String(c.name ?? ''),
      channel:         String(c.advertisingChannelType ?? ''),
      biddingStrategy: String(c.biddingStrategyType ?? ''),
      targetRoas:      tRoas,
      targetCpa:       tCpaMicros !== null ? r2(tCpaMicros / 1e6) : null,
      dailyBudget:     r.campaignBudget?.amountMicros ? r2(eur(r.campaignBudget.amountMicros)) : null,
      cost:            r2(eur(m.costMicros)),
      clicks:          num(m.clicks),
      impressions:     num(m.impressions),
      conversions:     r2(num(m.conversions)),
      convValue:       r2(num(m.conversionsValue)),
      ctr:             numN(m.ctr),
      avgCpc:          m.averageCpc ? r2(eur(m.averageCpc)) : null,
      isShare:         numN(m.searchImpressionShare),
      isLostBudget:    numN(m.searchBudgetLostImpressionShare),
      isLostRank:      numN(m.searchRankLostImpressionShare),
    }
  }).sort((a, b) => b.cost - a.cost)

  // ── Palabras clave ──
  const keywords: KeywordData[] = keywordRows.map((r: any) => {
    const k = r.adGroupCriterion ?? {}, q = k.qualityInfo ?? {}, m = r.metrics ?? {}
    return {
      campaign:     String(r.campaign?.name ?? ''),
      adGroup:      String(r.adGroup?.name ?? ''),
      text:         String(k.keyword?.text ?? ''),
      matchType:    String(k.keyword?.matchType ?? ''),
      qualityScore: numN(q.qualityScore),
      expectedCtr:  q.searchPredictedCtr ?? null,
      adRelevance:  q.creativeQualityScore ?? null,
      landingPage:  q.postClickQualityScore ?? null,
      cost:         r2(eur(m.costMicros)),
      clicks:       num(m.clicks),
      impressions:  num(m.impressions),
      conversions:  r2(num(m.conversions)),
    }
  })

  // ── Términos de búsqueda ──
  const searchTerms: SearchTermData[] = termRows.map((r: any) => {
    const m = r.metrics ?? {}
    return {
      term:        String(r.searchTermView?.searchTerm ?? ''),
      campaign:    String(r.campaign?.name ?? ''),
      cost:        r2(eur(m.costMicros)),
      clicks:      num(m.clicks),
      impressions: num(m.impressions),
      conversions: r2(num(m.conversions)),
      convValue:   r2(num(m.conversionsValue)),
    }
  })

  // ── Anuncios ──
  const ads: AdData[] = adRows.map((r: any) => ({
    campaign:       String(r.campaign?.name ?? ''),
    adGroup:        String(r.adGroup?.name ?? ''),
    type:           String(r.adGroupAd?.ad?.type ?? ''),
    adStrength:     r.adGroupAd?.adStrength ?? null,
    approvalStatus: r.adGroupAd?.policySummary?.approvalStatus ?? null,
  }))

  // ── Recursos (extensiones) ──
  const byCampaign: Record<string, string[]> = {}
  for (const r of campaignAssetRows) {
    const name = String(r.campaign?.name ?? ''), t = String(r.campaignAsset?.fieldType ?? '')
    if (!name || !t) continue
    ;(byCampaign[name] ??= [])
    if (!byCampaign[name].includes(t)) byCampaign[name].push(t)
  }
  const accountAssetTypes = Array.from(new Set(customerAssetRows.map((r: any) => String(r.customerAsset?.fieldType ?? '')).filter(Boolean)))

  // ── Negativas ──
  const negByCampaign = new Map<string, number>()
  for (const r of negativeRows) {
    const n = String(r.campaign?.name ?? ''); negByCampaign.set(n, (negByCampaign.get(n) ?? 0) + 1)
  }
  const sharedNeg = new Set(sharedSetRows
    .filter((r: any) => r.sharedSet?.type === 'NEGATIVE_KEYWORDS')
    .map((r: any) => String(r.campaign?.name ?? '')))
  const searchCampaigns = campaigns.filter(c => c.channel === 'SEARCH')
  const negatives = {
    campaignKeywords: negativeRows.length,
    campaignsWithSharedLists: sharedNeg.size,
    campaignsWithoutNegatives: unavailable.includes('Negativas de campaña') ? [] :
      searchCampaigns.filter(c => !negByCampaign.has(c.name) && !sharedNeg.has(c.name)).map(c => c.name),
  }

  // ── Segmentos ──
  const seg = (rows: any[], key: (r: any) => string): SegmentRow[] => {
    const acc = new Map<string, SegmentRow>()
    for (const r of rows) {
      const k = key(r); if (!k) continue
      const m = r.metrics ?? {}
      const row = acc.get(k) ?? { segment: k, cost: 0, clicks: 0, conversions: 0, convValue: 0 }
      row.cost += eur(m.costMicros); row.clicks += num(m.clicks)
      row.conversions += num(m.conversions); row.convValue += num(m.conversionsValue)
      acc.set(k, row)
    }
    return [...acc.values()].map(r => ({ ...r, cost: r2(r.cost), conversions: r2(r.conversions), convValue: r2(r.convValue) }))
  }
  const devices = seg(deviceRows, r => String(r.segments?.device ?? '')).sort((a, b) => b.cost - a.cost)
  const hours = seg(hourRows, r => r.segments?.hour === undefined ? '' : String(r.segments.hour).padStart(2, '0'))
    .sort((a, b) => a.segment.localeCompare(b.segment))
  let geo = seg(geoRows, r => String(r.segments?.geoTargetRegion ?? '')).sort((a, b) => b.cost - a.cost).slice(0, 15)

  // Nombres de las regiones (geoTargetConstants/NNN → nombre)
  if (geo.length) {
    const ids = geo.map(g => `'${g.segment}'`).join(',')
    const names = await gaql('Nombres de ubicaciones', `
      SELECT geo_target_constant.resource_name, geo_target_constant.name
      FROM geo_target_constant
      WHERE geo_target_constant.resource_name IN (${ids})`)
    const map = new Map(names.map((r: any) => [r.geoTargetConstant?.resourceName, r.geoTargetConstant?.name]))
    geo = geo.map(g => ({ ...g, segment: String(map.get(g.segment) ?? g.segment) }))
  }

  // ── Conversiones ──
  const conversionActions: ConversionActionData[] = convActionRows.map((r: any) => ({
    name:          String(r.conversionAction?.name ?? ''),
    category:      String(r.conversionAction?.category ?? ''),
    primary:       !!r.conversionAction?.primaryForGoal,
    countingType:  String(r.conversionAction?.countingType ?? ''),
    inConversions: !!r.conversionAction?.includeInConversionsMetric,
  }))

  // ── Recomendaciones de Google ──
  const recCount = new Map<string, number>()
  for (const r of recRows) {
    const t = String(r.recommendation?.type ?? ''); if (t) recCount.set(t, (recCount.get(t) ?? 0) + 1)
  }
  const googleRecommendations = [...recCount.entries()]
    .map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)

  return {
    customerId: o.customerId,
    name:       o.accountName,
    currency:   o.currency,
    period:     { start, end, days: o.days },
    optimizationScore,
    autoTagging,
    campaigns,
    keywords,
    searchTerms,
    ads,
    assetTypes: { account: accountAssetTypes, byCampaign },
    negatives,
    devices,
    hours,
    geo,
    conversionActions,
    googleRecommendations,
    unavailable,
  }
}
