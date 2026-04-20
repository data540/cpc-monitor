import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getValidAccessToken } from '@/lib/refresh-token'
import { getAccountsWithNames } from '@/lib/google-ads'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as any).id

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(userId)
  } catch (e: any) {
    if (e.name === 'REAUTH_REQUIRED') {
      return NextResponse.json({ error: 'Sesión expirada', reauth: true }, { status: 401 })
    }
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const mccCustomerId  = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID

  if (!developerToken) {
    return NextResponse.json({ error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' }, { status: 500 })
  }

  try {
    const accounts = await getAccountsWithNames({ accessToken, developerToken, mccCustomerId })
    return NextResponse.json({ accounts })
  } catch (e: any) {
    console.error('[api/accounts]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
