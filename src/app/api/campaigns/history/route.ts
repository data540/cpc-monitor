import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// Genera N puntos de historial mock para una campaña
function buildMockHistory(campaignName: string, days: number) {
  const ceilingMap: Record<string, number | null> = {
    'Brand - Exact':          0.80,
    'Competencia - BMM':      1.20,
    'Genérico - Amplia':      0.60,
    'Remarketing - Dinámico': null,
    'Shopping - Max ROAS':    1.50,
  }
  const baseCpcMap: Record<string, number> = {
    'Brand - Exact':          0.58,
    'Competencia - BMM':      1.05,
    'Genérico - Amplia':      0.35,
    'Remarketing - Dinámico': 0.27,
    'Shopping - Max ROAS':    1.40,
  }
  const ceiling = ceilingMap[campaignName] ?? null
  const base    = baseCpcMap[campaignName] ?? 0.50

  return Array.from({ length: days }, (_, i) => {
    const capturedAt = new Date()
    capturedAt.setDate(capturedAt.getDate() - (days - 1 - i))
    // pequeña oscilación aleatoria determinista por índice
    const noise  = Math.sin(i * 0.8) * 0.08 + Math.cos(i * 1.3) * 0.05
    const avgCpc = Math.max(0.01, Math.round((base + noise) * 100) / 100)
    return {
      capturedAt,
      avgCpc,
      cpcCeiling:  ceiling,
      cpcUsagePct: ceiling ? Math.round((avgCpc / ceiling) * 1000) / 10 : null,
      clicks:      Math.round(30 + Math.sin(i * 0.5) * 15 + i * 0.3),
      isActual:    Math.round((0.6 + Math.sin(i * 0.4) * 0.15) * 100) / 100,
    }
  })
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const campaignName = searchParams.get('campaignName') ?? ''
  const days = Number(searchParams.get('days') ?? 30)

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.json({ history: buildMockHistory(campaignName, days) })
  }

  const since = new Date()
  since.setDate(since.getDate() - days)

  const snapshots = await prisma.campaignSnapshot.findMany({
    where: {
      userId,
      campaignName,
      capturedAt: { gte: since },
    },
    orderBy: { capturedAt: 'asc' },
    select: {
      capturedAt:  true,
      avgCpc:      true,
      cpcCeiling:  true,
      cpcUsagePct: true,
      clicks:      true,
      isActual:    true,
    },
  })

  return NextResponse.json({ history: snapshots })
}
