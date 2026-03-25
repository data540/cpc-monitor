// ── Endpoint diagnóstico: resolución de CPC techo por campaña ─
// GET /api/debug/bidding?customerId=XXXXXXXXXX
// Muestra exactamente cómo se resuelve (o no) el CPC techo para cada campaña.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getValidAccessToken } from '@/lib/refresh-token'

const ADS_API_BASE   = 'https://googleads.googleapis.com/v23'
const DEV_TOKEN      = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
const MCC_ID         = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!

function headers(token: string) {
  return {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   DEV_TOKEN,
    'Content-Type':      'application/json',
    'login-customer-id': MCC_ID,
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')?.replace(/-/g, '')
  if (!customerId) {
    return NextResponse.json({ error: 'customerId requerido. Uso: /api/debug/bidding?customerId=XXXXXXXXXX' }, { status: 400 })
  }

  const userId = (session.user as any).id
  let token: string
  try {
    token = await getValidAccessToken(userId)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const h = headers(token)

  // ── 1. Cargar estrategias de cartera (MCC + hija) ─────────────
  const portfolioCeilings: Record<string, { name: string; cpcCeiling: number; targetRoas: number; sourceAccount: string }> = {}
  const strategyQueryLog: Record<string, any> = {}

  const strategyQuery = `
    SELECT
      bidding_strategy.resource_name,
      bidding_strategy.name,
      bidding_strategy.type,
      bidding_strategy.target_roas.target_roas,
      bidding_strategy.target_roas.cpc_bid_ceiling_micros
    FROM bidding_strategy
    WHERE bidding_strategy.type = 'TARGET_ROAS'
  `

  for (const account of [MCC_ID, customerId]) {
    try {
      const res = await fetch(`${ADS_API_BASE}/customers/${account}/googleAds:search`, {
        method: 'POST', headers: h, body: JSON.stringify({ query: strategyQuery }),
      })
      const data = await res.json()
      strategyQueryLog[account] = { status: res.status, rowCount: data.results?.length ?? 0, error: data.error ?? null }

      for (const row of data.results ?? []) {
        const rn     = row.biddingStrategy?.resourceName as string
        const micros = Number(row.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0)
        const troas  = Number(row.biddingStrategy?.targetRoas?.targetRoas ?? 0)
        const name   = row.biddingStrategy?.name ?? rn

        const entry = {
          name,
          cpcCeiling: micros > 0 ? Math.round(micros / 1e4) / 100 : 0,
          targetRoas: troas,
          sourceAccount: account,
          rawMicros: micros,
        }

        // Indexar siempre (incluso con micros=0, para ver si existe pero sin techo)
        portfolioCeilings[rn] = entry as any
        const idMatch = rn.match(/(biddingStrategies\/\d+)$/)
        if (idMatch) portfolioCeilings[idMatch[1]] = entry as any
      }
    } catch (e: any) {
      strategyQueryLog[account] = { error: e.message }
    }
  }

  // ── 2. Cargar campañas con campo bidding_strategy ─────────────
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.bidding_strategy_type,
      campaign.bidding_strategy,
      campaign.target_roas.target_roas,
      campaign.target_roas.cpc_bid_ceiling_micros,
      metrics.average_cpc,
      metrics.clicks
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.bidding_strategy_type = 'TARGET_ROAS'
      AND campaign.advertising_channel_type = 'SEARCH'
      AND metrics.impressions > 0
      AND segments.date DURING LAST_30_DAYS
  `

  let campaignRows: any[] = []
  let campaignQueryLog: any = {}
  try {
    const res = await fetch(`${ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
      method: 'POST', headers: h, body: JSON.stringify({ query: campaignQuery }),
    })
    const data = await res.json()
    campaignQueryLog = { status: res.status, rowCount: data.results?.length ?? 0, error: data.error ?? null }
    campaignRows = data.results ?? []
  } catch (e: any) {
    campaignQueryLog = { error: e.message }
  }

  // ── 3. Resolver techo para cada campaña y documentar ──────────
  const campaigns = campaignRows.map((row: any) => {
    const name         = row.campaign?.name ?? ''
    const portfolioRef = row.campaign?.biddingStrategy as string | undefined
    const campaignMicros = Number(row.campaign?.targetRoas?.cpcBidCeilingMicros ?? 0)

    let resolvedCeiling: number | null = null
    let resolvedFrom  = 'ninguno'
    let portfolioMatch: any = null

    // Nivel 1: ceiling a nivel campaña
    if (campaignMicros > 0) {
      resolvedCeiling = Math.round(campaignMicros / 1e4) / 100
      resolvedFrom = 'campaign_level'
    }

    // Nivel 2: portfolio strategy
    if (!resolvedCeiling && portfolioRef) {
      let entry = portfolioCeilings[portfolioRef]
      let matchKey = portfolioRef

      if (!entry) {
        const idMatch = portfolioRef.match(/(biddingStrategies\/\d+)$/)
        if (idMatch) {
          entry = portfolioCeilings[idMatch[1]]
          matchKey = idMatch[1]
        }
      }

      portfolioMatch = entry
        ? { found: true, matchedKey: matchKey, entry }
        : { found: false, triedKeys: [portfolioRef, portfolioRef.match(/(biddingStrategies\/\d+)$/)?.[1] ?? 'n/a'] }

      if (entry && entry.cpcCeiling > 0) {
        resolvedCeiling = entry.cpcCeiling
        resolvedFrom = `portfolio (${matchKey})`
      } else if (entry && entry.cpcCeiling === 0) {
        resolvedFrom = `portfolio encontrada PERO cpcCeiling=0 (sin techo configurado)`
      }
    }

    return {
      name,
      biddingStrategyType: row.campaign?.biddingStrategyType,
      portfolioRef:        portfolioRef ?? null,
      campaignLevelCeilingMicros: campaignMicros,
      avgCpcEur:           Math.round(Number(row.metrics?.averageCpc ?? 0) / 1e4) / 100,
      clicks:              Number(row.metrics?.clicks ?? 0),
      resolvedCeiling,
      resolvedFrom,
      portfolioMatch,
    }
  })

  return NextResponse.json({
    mccId:            MCC_ID,
    customerId,
    strategyQueryLog,
    portfolioCeilingsCount: Object.keys(portfolioCeilings).length,
    portfolioCeilings,
    campaignQueryLog,
    campaigns,
  }, { status: 200 })
}
