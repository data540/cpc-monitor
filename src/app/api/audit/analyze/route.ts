// POST /api/audit/analyze  { data, kpis, findings }
// Análisis experto (OpenAI) de UNA cuenta ya descargada con /api/audit/collect.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { customerIdSchema } from '@/lib/validators'
import { resolveLoginCustomerId, AccountAccessError } from '@/lib/account-access'
import { analyzeAccount, describeOpenAIError } from '@/lib/audit/analyze'
import { requireAdsSession } from '@/lib/audit/route-helpers'
import { modelSchema } from '@/lib/ai/models'
import type { AccountAuditData, AccountKpis, Finding } from '@/lib/audit/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300 // Fluid compute (plan Hobby: máx. 300 s)

const MAX_BODY = 1_500_000 // ~1.5 MB

const bodySchema = z.object({
  data:     z.object({ customerId: customerIdSchema }).passthrough(),
  kpis:     z.object({ cost: z.number() }).passthrough(),
  findings: z.array(z.object({ id: z.string(), severity: z.string(), title: z.string() }).passthrough()),
  model:    modelSchema,
})

export async function POST(request: Request) {
  const auth = await requireAdsSession()
  if (auth instanceof NextResponse) return auth

  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'Datos demasiado grandes' }, { status: 413 })
  let json: unknown
  try { json = JSON.parse(raw) } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  // Solo cuentas a las que el usuario tiene acceso
  try {
    await resolveLoginCustomerId(auth.userId, auth.accessToken, parsed.data.data.customerId)
  } catch (e) {
    if (e instanceof AccountAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  try {
    const { analysis, model, usage } = await analyzeAccount(
      parsed.data.data as unknown as AccountAuditData,
      parsed.data.kpis as unknown as AccountKpis,
      parsed.data.findings as unknown as Finding[],
      parsed.data.model,
    )
    return NextResponse.json({ analysis, model, usage })
  } catch (e) {
    console.error('[api/audit/analyze]', e)
    return NextResponse.json({ error: describeOpenAIError(e) }, { status: 502 })
  }
}
