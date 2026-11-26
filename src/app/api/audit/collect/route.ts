// POST /api/audit/collect  { customerId, days }
// Descarga los datos de auditoría de UNA cuenta y aplica las reglas fijas.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { customerIdSchema } from '@/lib/validators'
import { getUserAdsAccounts } from '@/lib/account-access'
import { collectAccountData } from '@/lib/audit/collect'
import { computeKpis, runRules } from '@/lib/audit/rules'
import { requireAdsSession } from '@/lib/audit/route-helpers'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  customerId: customerIdSchema,
  days:       z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]).default(30),
})

export async function POST(request: Request) {
  const auth = await requireAdsSession()
  if (auth instanceof NextResponse) return auth

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { customerId, days } = parsed.data

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) return NextResponse.json({ error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' }, { status: 500 })

  // Solo cuentas a las que el usuario tiene acceso
  let account
  try {
    const accounts = await getUserAdsAccounts(auth.userId, auth.accessToken)
    account = accounts.find(a => a.id === customerId)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudieron obtener las cuentas' }, { status: 502 })
  }
  if (!account) return NextResponse.json({ error: 'No tienes acceso a esta cuenta de Google Ads' }, { status: 403 })

  try {
    const data = await collectAccountData({
      accessToken:     auth.accessToken,
      developerToken,
      customerId,
      loginCustomerId: account.loginCustomerId,
      accountName:     account.name,
      currency:        account.currency,
      days,
    })
    if (data.unavailable.includes('Campañas')) {
      return NextResponse.json({ error: `No se pudieron leer las campañas de ${account.name}` }, { status: 502 })
    }
    return NextResponse.json({ data, kpis: computeKpis(data), findings: runRules(data) })
  } catch (e: any) {
    console.error('[api/audit/collect]', e)
    return NextResponse.json({ error: e?.message ?? 'Error al descargar los datos' }, { status: 500 })
  }
}
