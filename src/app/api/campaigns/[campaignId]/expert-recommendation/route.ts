import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getCpcDistribution } from '@/lib/google-ads'
import { computeOptimalCeiling } from '@/lib/expert-cpc'
import { getValidAccessToken } from '@/lib/refresh-token'
import { CampaignMetrics } from '@/types'

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const startDate  = searchParams.get('startDate')
    const endDate    = searchParams.get('endDate')

    if (!customerId) {
      return Response.json({ error: 'customerId requerido' }, { status: 400 })
    }

    // ── Rango de fechas (default: 30 días) ───────────────────────
    let dateRangeStart: string
    let dateRangeEnd:   string

    if (startDate && endDate) {
      dateRangeStart = startDate
      dateRangeEnd   = endDate
    } else {
      const end   = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      const fmt = (d: Date) => d.toISOString().split('T')[0]
      dateRangeStart = fmt(start)
      dateRangeEnd   = fmt(end)
    }

    // ── Último snapshot de la campaña (métricas agregadas) ───────
    const snapshot = await prisma.campaignSnapshot.findFirst({
      where:   { userId, campaignId: params.campaignId },
      orderBy: { capturedAt: 'desc' },
    })

    if (!snapshot) {
      return Response.json(
        { error: 'No hay datos de campaña. Recarga el dashboard primero.' },
        { status: 404 }
      )
    }

    // Reconstruir métricas desde el snapshot
    const metrics: CampaignMetrics = {
      campaignId:               snapshot.campaignId,
      campaignName:             snapshot.campaignName,
      cpcCeiling:               snapshot.cpcCeiling,
      avgCpc:                   snapshot.avgCpc,
      cpcUsagePct:              snapshot.cpcUsagePct,
      clicks:                   snapshot.clicks,
      impressions:              snapshot.impressions,
      ctr:                      snapshot.ctr,
      costEur:                  snapshot.costEur,
      isActual:                 snapshot.isActual,
      topImpressionPct:         null,
      absoluteTopImpressionPct: null,
      targetRoas:               snapshot.targetRoas,
      realRoas:                 snapshot.realRoas,
      recommendation:           { level: 'ok', message: '', parts: [] },
    }

    // ── Distribución de CPC (para p90, mediana, etc.) ────────────
    let distribution = null
    try {
      const accessToken    = await getValidAccessToken(userId)
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
      const mccCustomerId  = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID

      distribution = await getCpcDistribution(
        { accessToken, customerId, mccCustomerId, developerToken },
        params.campaignId,
        { start: dateRangeStart, end: dateRangeEnd }
      )
    } catch (e) {
      // Si falla la distribución, el motor trabaja solo con métricas del snapshot
      console.warn('[expert-recommendation] No se pudo obtener distribución:', e)
    }

    // ── Calcular recomendación ────────────────────────────────────
    const recommendation = computeOptimalCeiling({ metrics, distribution })

    return Response.json({ recommendation, metrics, distributionAvailable: distribution !== null })
  } catch (error) {
    console.error('[expert-recommendation]', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
