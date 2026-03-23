import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getCpcDistribution } from '@/lib/google-ads'
import { getValidAccessToken } from '@/lib/refresh-token'

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

    // Parámetros de query
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!customerId) {
      return Response.json(
        { error: 'customerId parameter required' },
        { status: 400 }
      )
    }

    // Obtener access token (con refresco automático si es necesario)
    const accessToken = await getValidAccessToken(userId)

    // Leer developer token y MCC del ambiente
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const mccCustomerId = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID

    if (!developerToken) {
      return Response.json(
        { error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' },
        { status: 500 }
      )
    }

    // Calcular rango de fechas (default: últimos 30 días)
    let dateRangeStart: string
    let dateRangeEnd: string

    if (startDate && endDate) {
      dateRangeStart = startDate
      dateRangeEnd = endDate
    } else {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      const fmt = (d: Date) => d.toISOString().split('T')[0]
      dateRangeStart = fmt(start)
      dateRangeEnd = fmt(end)
    }

    // Obtener distribución de CPC
    const distribution = await getCpcDistribution(
      {
        accessToken,
        customerId,
        mccCustomerId,
        developerToken,
      },
      params.campaignId,
      {
        start: dateRangeStart,
        end: dateRangeEnd,
      }
    )

    return Response.json(distribution)
  } catch (error) {
    console.error('[cpc-distribution]', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json(
      { error: message },
      { status: 500 }
    )
  }
}
