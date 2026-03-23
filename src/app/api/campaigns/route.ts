import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getCampaignMetrics } from '@/lib/google-ads'
import { MANUAL_CPC_CEILINGS } from '@/lib/manual-ceilings'
import { getValidAccessToken } from '@/lib/refresh-token'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId') ?? ''

  if (!customerId) {
    return NextResponse.json({ error: 'customerId requerido' }, { status: 400 })
  }

  // Obtener access_token válido (refresca si ha caducado)
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(userId)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  // Techos manuales: combinar los del archivo con los guardados en BD
  const dbConfigs = await prisma.cpcConfig.findMany({ where: { userId } })
  const manualCeilings: Record<string, number> = { ...MANUAL_CPC_CEILINGS }
  for (const cfg of dbConfigs) {
    manualCeilings[cfg.campaignName] = cfg.cpcCeiling
  }

  try {
    const metrics = await getCampaignMetrics({
      accessToken,
      customerId:     customerId.replace(/-/g, ''),
      mccCustomerId:  process.env.GOOGLE_ADS_MCC_CUSTOMER_ID,
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      manualCeilings,
      dateRangeDays:  30,
    })

    // Guardar snapshot en BD para historial
    if (metrics.length > 0) {
      await prisma.campaignSnapshot.createMany({
        data: metrics.map(m => ({
          userId,
          campaignId:    m.campaignId,
          campaignName:  m.campaignName,
          cpcCeiling:    m.cpcCeiling,
          avgCpc:        m.avgCpc,
          cpcUsagePct:   m.cpcUsagePct,
          clicks:        m.clicks,
          impressions:   m.impressions,
          ctr:           m.ctr,
          costEur:       m.costEur,
          isActual:      m.isActual,
          isLostBudget:  m.isLostBudget,
          isLostRank:    m.isLostRank,
          targetRoas:    m.targetRoas,
          realRoas:      m.realRoas,
          recommendation: m.recommendation.message,
        })),
      })
    }

    return NextResponse.json({ metrics })
  } catch (e: any) {
    console.error('[api/campaigns]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
