import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getCpcDistribution } from '@/lib/google-ads'
import { computeOptimalCeiling } from '@/lib/expert-cpc'
import { getValidAccessToken } from '@/lib/refresh-token'
import { CampaignMetrics, TrendData } from '@/types'

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

    // ── Último snapshot (métricas actuales) ──────────────────────
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
      isLostBudget:             (snapshot as any).isLostBudget ?? null,
      isLostRank:               (snapshot as any).isLostRank   ?? null,
      topImpressionPct:         null,
      absoluteTopImpressionPct: null,
      targetRoas:               snapshot.targetRoas,
      realRoas:                 snapshot.realRoas,
      recommendation:           { level: 'ok', message: '', parts: [] },
    }

    // ── Tendencia histórica (últimos 10 snapshots) ────────────────
    const history = await prisma.campaignSnapshot.findMany({
      where:   { userId, campaignId: params.campaignId },
      orderBy: { capturedAt: 'asc' },
      take:    10,
      select:  { capturedAt: true, avgCpc: true, isActual: true },
    })

    let trend: TrendData | null = null

    if (history.length >= 3) {
      const first = history[0]
      const last  = history[history.length - 1]

      const cpcChangePct = first.avgCpc > 0
        ? Math.round(((last.avgCpc - first.avgCpc) / first.avgCpc) * 1000) / 10
        : 0
      const cpcDirection: TrendData['direction'] =
        Math.abs(cpcChangePct) < 5 ? 'stable' : cpcChangePct > 0 ? 'up' : 'down'

      let isDirection: TrendData['isDirection'] = null
      let isChangePct: number | null = null

      if (first.isActual !== null && last.isActual !== null && first.isActual > 0) {
        const rawChange = ((last.isActual - first.isActual) / first.isActual) * 100
        isChangePct  = Math.round(rawChange * 10) / 10
        isDirection  = Math.abs(isChangePct) < 5 ? 'stable' : isChangePct > 0 ? 'up' : 'down'
      }

      const periodDays = Math.max(
        Math.round(
          (new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime()) /
          (1000 * 60 * 60 * 24)
        ),
        1
      )

      trend = {
        direction:    cpcDirection,
        cpcChangePct,
        isDirection,
        isChangePct,
        dataPoints:   history.length,
        periodDays,
      }
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
      console.warn('[expert-recommendation] No se pudo obtener distribución:', e)
    }

    // ── Calcular recomendación ────────────────────────────────────
    const recommendation = computeOptimalCeiling({ metrics, distribution, trend })

    return Response.json({
      recommendation,
      metrics,
      distributionAvailable: distribution !== null,
      trend,
    })
  } catch (error) {
    console.error('[expert-recommendation]', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
