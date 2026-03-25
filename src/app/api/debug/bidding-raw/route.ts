// ENDPOINT TEMPORAL DE DIAGNÓSTICO — SIN AUTH — BORRAR TRAS USO
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken } from '@/lib/refresh-token'

const ADS_API_BASE = 'https://googleads.googleapis.com/v23'
const DEV_TOKEN    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
const MCC_ID       = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')?.replace(/-/g, '')
  if (!customerId) {
    return NextResponse.json({ error: 'customerId requerido' }, { status: 400 })
  }

  // Obtener token del primer usuario en BD
  const account = await prisma.account.findFirst({
    where: { provider: 'google' },
    orderBy: { expires_at: 'desc' },
  })
  if (!account) return NextResponse.json({ error: 'No hay cuenta en BD' }, { status: 500 })

  const user = await prisma.user.findFirst()
  if (!user) return NextResponse.json({ error: 'No hay usuario en BD' }, { status: 500 })

  let token: string
  try {
    token = await getValidAccessToken(user.id)
  } catch (e: any) {
    return NextResponse.json({ error: 'Token inválido: ' + e.message }, { status: 500 })
  }

  const h = {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   DEV_TOKEN,
    'Content-Type':      'application/json',
    'login-customer-id': MCC_ID,
  }

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

  const results: any = { mccId: MCC_ID, customerId, strategies: {}, campaigns: [] }

  // Estrategias de MCC
  for (const account of [MCC_ID, customerId]) {
    const res  = await fetch(`${ADS_API_BASE}/customers/${account}/googleAds:search`, {
      method: 'POST', headers: h, body: JSON.stringify({ query: strategyQuery }),
    })
    const data = await res.json()
    results.strategies[account] = {
      status: res.status,
      rows: (data.results ?? []).map((r: any) => ({
        resourceName: r.biddingStrategy?.resourceName,
        name:         r.biddingStrategy?.name,
        cpcCeilingMicros: r.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0,
        cpcCeilingEur:    Math.round(Number(r.biddingStrategy?.targetRoas?.cpcBidCeilingMicros ?? 0) / 1e4) / 100,
        targetRoas:       r.biddingStrategy?.targetRoas?.targetRoas,
      })),
      error: data.error ?? null,
    }
  }

  // Campañas
  const campRes  = await fetch(`${ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
    method: 'POST', headers: h, body: JSON.stringify({ query: campaignQuery }),
  })
  const campData = await campRes.json()
  results.campaigns = (campData.results ?? []).map((r: any) => ({
    name:                    r.campaign?.name,
    biddingStrategyType:     r.campaign?.biddingStrategyType,
    portfolioRef:            r.campaign?.biddingStrategy ?? null,
    campaignCeilingMicros:   r.campaign?.targetRoas?.cpcBidCeilingMicros ?? 0,
    campaignCeilingEur:      Math.round(Number(r.campaign?.targetRoas?.cpcBidCeilingMicros ?? 0) / 1e4) / 100,
    avgCpcEur:               Math.round(Number(r.metrics?.averageCpc ?? 0) / 1e4) / 100,
    clicks:                  Number(r.metrics?.clicks ?? 0),
  }))
  results.campaignQueryError = campData.error ?? null

  return NextResponse.json(results, { status: 200 })
}
