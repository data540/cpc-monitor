import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getValidAccessToken } from '@/lib/refresh-token'
import { getUserAdsAccounts } from '@/lib/account-access'

// Devuelve solo las cuentas de Google Ads a las que tiene acceso el usuario
// que ha iniciado sesión (según sus propios permisos en Google Ads).
export async function GET(request: Request) {
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

  const force = new URL(request.url).searchParams.get('refresh') === '1'

  try {
    const accounts = await getUserAdsAccounts(userId, accessToken, { force })
    // loginCustomerId es interno del servidor: no se envía al cliente
    return NextResponse.json({
      accounts: accounts.map(({ loginCustomerId, ...a }) => a),
    })
  } catch (e: any) {
    console.error('[api/accounts]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
