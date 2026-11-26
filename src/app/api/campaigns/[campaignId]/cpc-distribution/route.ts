import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getCpcDistribution } from '@/lib/google-ads'
import { getValidAccessToken } from '@/lib/refresh-token'
import { resolveLoginCustomerId, AccountAccessError } from '@/lib/account-access'
import { customerIdSchema, campaignIdSchema } from '@/lib/validators'

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
    const customerIdRaw = searchParams.get('customerId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Validar customerId
    const customerIdResult = customerIdSchema.safeParse(customerIdRaw)
    if (!customerIdResult.success) {
      return Response.json(
        { error: 'customerId inválido: debe tener 10 dígitos' },
        { status: 400 }
      )
    }
    const customerId = customerIdResult.data

    // Validar campaignId
    const campaignIdResult = campaignIdSchema.safeParse(params.campaignId)
    if (!campaignIdResult.success) {
      return Response.json(
        { error: 'campaignId inválido: debe ser numérico' },
        { status: 400 }
      )
    }

    // Obtener access token (con refresco automático si es necesario)
    const accessToken = await getValidAccessToken(userId)

    // Leer developer token y MCC del ambiente
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    // Solo cuentas a las que el usuario tiene acceso; login-customer-id según la cuenta
    let mccCustomerId: string
    try {
      mccCustomerId = await resolveLoginCustomerId(userId, accessToken, customerId)
    } catch (e) {
      if (e instanceof AccountAccessError) {
        return Response.json({ error: e.message }, { status: 403 })
      }
      throw e
    }

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
