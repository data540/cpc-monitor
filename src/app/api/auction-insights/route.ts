import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getValidAccessToken } from '@/lib/refresh-token'
import { getAuctionInsights } from '@/lib/google-ads'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)

  const customerId = searchParams.get('customerId')?.replace(/-/g, '') ?? ''
  if (!customerId || !/^\d{10}$/.test(customerId)) {
    return NextResponse.json({ error: 'customerId inválido o requerido' }, { status: 400 })
  }

  const campaignId = searchParams.get('campaignId') ?? undefined

  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const startDate = searchParams.get('startDate') ?? fmt(thirtyDaysAgo)
  const endDate   = searchParams.get('endDate')   ?? fmt(yesterday)

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(userId)
  } catch (e: any) {
    if (e.name === 'REAUTH_REQUIRED') {
      return NextResponse.json(
        { error: 'Sesión de Google Ads expirada. Vuelve a conectar tu cuenta.', reauth: true },
        { status: 401 }
      )
    }
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    return NextResponse.json({ error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' }, { status: 500 })
  }

  try {
    const result = await getAuctionInsights(
      {
        accessToken,
        customerId,
        mccCustomerId:  process.env.GOOGLE_ADS_MCC_CUSTOMER_ID,
        developerToken,
      },
      { start: startDate, end: endDate },
      campaignId
    )
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[api/auction-insights]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
