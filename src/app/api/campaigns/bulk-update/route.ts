import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

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
  const body: BulkUpdatePayload = await request.json()

  if (!body.campaigns?.length) {
    return NextResponse.json({ error: 'Sin campañas seleccionadas' }, { status: 400 })
  }

  // En desarrollo sólo actualizamos los techos manuales en BD y devolvemos mock OK
  if (process.env.NODE_ENV === 'development') {
    await prisma.$transaction(
      body.campaigns.map(c =>
        prisma.cpcConfig.upsert({
          where:  { userId_campaignName: { userId, campaignName: c.campaignName } },
          create: { userId, campaignName: c.campaignName, cpcCeiling: c.newCpcCeiling },
          update: { cpcCeiling: c.newCpcCeiling },
        })
      )
    )
    return NextResponse.json({
      ok:      true,
      updated: body.campaigns.length,
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
    body.campaigns.map(c =>
      prisma.cpcConfig.upsert({
        where:  { userId_campaignName: { userId, campaignName: c.campaignName } },
        create: { userId, campaignName: c.campaignName, cpcCeiling: c.newCpcCeiling },
        update: { cpcCeiling: c.newCpcCeiling },
      })
    )
  )

  return NextResponse.json({ ok: true, updated: body.campaigns.length })
}
