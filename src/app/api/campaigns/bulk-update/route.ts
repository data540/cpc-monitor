import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bulkUpdateSchema, customerIdSchema } from '@/lib/validators'
import { getValidAccessToken } from '@/lib/refresh-token'
import { resolveLoginCustomerId, AccountAccessError } from '@/lib/account-access'

export interface BulkUpdatePayload {
  customerId:  string
  campaigns:   { campaignName: string; newCpcCeiling: number }[]
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const body = await request.json()

  // Validar input
  const result = bulkUpdateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { customerId, campaigns } = result.data

  // Validar customerId
  const customerIdResult = customerIdSchema.safeParse(customerId)
  if (!customerIdResult.success) {
    return NextResponse.json(
      { error: 'customerId inválido: debe tener 10 dígitos' },
      { status: 400 }
    )
  }

  // Solo cuentas a las que el usuario tiene acceso en Google Ads
  try {
    await resolveLoginCustomerId(userId, await getValidAccessToken(userId), customerIdResult.data)
  } catch (e: any) {
    if (e instanceof AccountAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    if (e?.name === 'REAUTH_REQUIRED') {
      return NextResponse.json({ error: 'Sesión expirada', reauth: true }, { status: 401 })
    }
    return NextResponse.json({ error: e.message }, { status: 502 })
  }

  // En desarrollo sólo actualizamos los techos manuales en BD y devolvemos mock OK
  if (process.env.NODE_ENV === 'development') {
    await prisma.$transaction(
      campaigns.map(c =>
        prisma.cpcConfig.upsert({
          where:  { userId_campaignName: { userId, campaignName: c.campaignName } },
          create: { userId, campaignName: c.campaignName, cpcCeiling: c.newCpcCeiling },
          update: { cpcCeiling: c.newCpcCeiling },
        })
      )
    )
    return NextResponse.json({
      ok:      true,
      updated: campaigns.length,
      mode:    'mock — cambios guardados en BD local, no enviados a Google Ads',
    })
  }

  // ── Producción: actualizar vía Google Ads API ────────────────
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
    orderBy: { expires_at: 'desc' },
  })

  if (!account?.access_token) {
    return NextResponse.json({ error: 'Token de Google no encontrado' }, { status: 401 })
  }

  // TODO: llamar a mutate en Google Ads para actualizar cpc_bid_ceiling_micros
  // Por ahora guarda en BD como fallback
  await prisma.$transaction(
    campaigns.map(c =>
      prisma.cpcConfig.upsert({
        where:  { userId_campaignName: { userId, campaignName: c.campaignName } },
        create: { userId, campaignName: c.campaignName, cpcCeiling: c.newCpcCeiling },
        update: { cpcCeiling: c.newCpcCeiling },
      })
    )
  )

  return NextResponse.json({ ok: true, updated: campaigns.length })
}
