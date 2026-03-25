// ── Endpoint de diagnóstico Google Ads API ────────────────────
// GET /api/debug
// Solo lectura — únicamente queries SELECT, sin mutaciones.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken } from '@/lib/refresh-token'

const ADS_API_BASE = 'https://googleads.googleapis.com/v23'
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
const MCC_CUSTOMER_ID = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')

  // Obtener token de acceso válido (refresca si ha caducado)
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(userId)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
    orderBy: { expires_at: 'desc' },
  })

  const headers: Record<string, string> = {
    'Authorization':     `Bearer ${accessToken}`,
    'developer-token':   DEVELOPER_TOKEN,
    'Content-Type':      'application/json',
    'login-customer-id': MCC_CUSTOMER_ID,
  }

  const adsAccount = await prisma.account.findFirst({ where: { userId, provider: 'google-ads' } })

  const results: Record<string, any> = {
    token_info: {
      provider:          adsAccount ? 'google-ads (dedicado)' : 'google (login)',
      scopes:            account?.scope ?? 'no disponible',
      expires_at:        account?.expires_at ? new Date(account.expires_at * 1000).toISOString() : 'no disponible',
      has_refresh_token: !!account?.refresh_token,
      ads_token_exists:  !!adsAccount,
      ads_connect_url:   '/api/auth/google-ads',
    },
    mcc_customer_id: MCC_CUSTOMER_ID,
  }

  // ── 1. Cuentas accesibles ────────────────────────────────────
  try {
    const res = await fetch(`${ADS_API_BASE}/customers:listAccessibleCustomers`, {
      headers: {
        'Authorization':   `Bearer ${accessToken}`,
        'developer-token': DEVELOPER_TOKEN,
      },
    })
    results.accessible_customers = { status: res.status, data: await res.json() }
  } catch (e: any) {
    results.accessible_customers = { error: e.message }
  }

  // ── 2. Info del MCC ──────────────────────────────────────────
  try {
    const res = await fetch(
      `${ADS_API_BASE}/customers/${MCC_CUSTOMER_ID}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1`,
        }),
      }
    )
    results.mcc_info = { status: res.status, data: await res.json() }
  } catch (e: any) {
    results.mcc_info = { error: e.message }
  }

  // ── 3. Cuentas hijas del MCC ─────────────────────────────────
  try {
    const res = await fetch(
      `${ADS_API_BASE}/customers/${MCC_CUSTOMER_ID}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            SELECT
              customer_client.id,
              customer_client.descriptive_name,
              customer_client.currency_code,
              customer_client.manager,
              customer_client.status
            FROM customer_client
            WHERE customer_client.manager = false
          `,
        }),
      }
    )
    results.child_accounts = { status: res.status, data: await res.json() }
  } catch (e: any) {
    results.child_accounts = { error: e.message }
  }

  // ── 4. Campañas de la cuenta seleccionada ────────────────────
  if (customerId) {
    const cid = customerId.replace(/-/g, '')

    try {
      const res = await fetch(
        `${ADS_API_BASE}/customers/${cid}/googleAds:search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.bidding_strategy_type,
                campaign.target_roas.target_roas,
                campaign.target_roas.cpc_bid_ceiling_micros,
                metrics.average_cpc,
                metrics.clicks,
                metrics.impressions,
                metrics.ctr,
                metrics.cost_micros,
                metrics.conversions_value,
                metrics.conversions,
                metrics.search_impression_share
              FROM campaign
              WHERE campaign.status = 'ENABLED'
                AND metrics.impressions > 0
                AND segments.date DURING LAST_30_DAYS
              ORDER BY metrics.cost_micros DESC
              LIMIT 20
            `,
          }),
        }
      )
      results.campaigns = { status: res.status, customer_id: cid, data: await res.json() }
    } catch (e: any) {
      results.campaigns = { error: e.message }
    }

    // ── 5. Estrategias de cartera (MCC + hija) y detalle MARCA ───────────
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

    try {
      const [mccRes, childRes] = await Promise.all([
        fetch(`${ADS_API_BASE}/customers/${MCC_CUSTOMER_ID}/googleAds:search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: strategyQuery }),
        }),
        fetch(`${ADS_API_BASE}/customers/${cid}/googleAds:search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: strategyQuery }),
        }),
      ])
      results.portfolio_strategies_mcc   = { status: mccRes.status,   data: await mccRes.json() }
      results.portfolio_strategies_child = { status: childRes.status, data: await childRes.json() }
    } catch (e: any) {
      results.portfolio_strategies_mcc   = { error: e.message }
      results.portfolio_strategies_child = { error: e.message }
    }

    // ── 6. Detalle campañas MARCA ─────────────────────────────
    try {
      const res = await fetch(
        `${ADS_API_BASE}/customers/${cid}/googleAds:search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              SELECT
                campaign.id,
                campaign.name,
                campaign.bidding_strategy_type,
                campaign.bidding_strategy,
                campaign.target_roas.target_roas,
                campaign.target_roas.cpc_bid_ceiling_micros
              FROM campaign
              WHERE campaign.status = 'ENABLED'
                AND campaign.name LIKE '%MARCA%'
                AND segments.date DURING LAST_30_DAYS
            `,
          }),
        }
      )
      results.marca_campaigns_detail = { status: res.status, data: await res.json() }
    } catch (e: any) {
      results.marca_campaigns_detail = { error: e.message }
    }
  }

  return NextResponse.json(results, { status: 200 })
}
