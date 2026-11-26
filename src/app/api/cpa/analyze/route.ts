// POST /api/cpa/analyze  { customerId, mode, overview, segments?, waste?, simulations? }
// Análisis experto (IA) de UNA cuenta con los datos ya cargados en la pantalla.
// Las alertas se recalculan aquí con las reglas fijas.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { customerIdSchema } from '@/lib/validators'
import { describeOpenAIError } from '@/lib/audit/analyze'
import { analyzeCpa, buildPayload } from '@/lib/cpa/analyze'
import { referenceCpa } from '@/lib/cpa/metrics'
import { resolveCtx } from '@/lib/cpa/route-helpers'
import { modelSchema } from '@/lib/ai/models'
import { runOverviewRules, runSegmentRules, runWasteRules, sortAlerts } from '@/lib/cpa/rules'
import type { CpaOverview, CpaSegments, CpaSimulations, CpaWaste } from '@/lib/cpa/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300 // Fluid compute (plan Hobby: máx. 300 s)

const MAX_BODY = 2_000_000 // ~2 MB

const bodySchema = z.object({
  customerId:  customerIdSchema,
  mode:        z.enum(['primary', 'all']).default('primary'),
  model:       modelSchema,
  overview:    z.object({
    customerId: customerIdSchema, name: z.string(), currency: z.string(),
    campaigns: z.array(z.object({ id: z.string(), cost: z.number() }).passthrough()),
    daily: z.array(z.unknown()), changes: z.array(z.unknown()), conversionActions: z.array(z.unknown()),
  }).passthrough(),
  segments:    z.object({ customerId: customerIdSchema }).passthrough().nullish(),
  waste:       z.object({ customerId: customerIdSchema }).passthrough().nullish(),
  simulations: z.object({ customerId: customerIdSchema }).passthrough().nullish(),
})

export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'Datos demasiado grandes' }, { status: 413 })
  let json: unknown
  try { json = JSON.parse(raw) } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const b = parsed.data

  // Todos los bloques deben ser de la misma cuenta, y el usuario debe tener acceso a ella
  for (const part of [b.overview, b.segments, b.waste, b.simulations]) {
    if (part && part.customerId !== b.customerId) return NextResponse.json({ error: 'Datos de otra cuenta' }, { status: 400 })
  }
  const r = await resolveCtx(b.customerId)
  if (r instanceof NextResponse) return r

  const overview = b.overview as unknown as CpaOverview
  const segments = (b.segments ?? null) as CpaSegments | null
  const waste = (b.waste ?? null) as CpaWaste | null
  const sims = (b.simulations ?? null) as CpaSimulations | null

  try {
    const ref = referenceCpa(overview, b.mode)
    const alerts = sortAlerts([
      ...runOverviewRules(overview, b.mode),
      ...(segments ? runSegmentRules(segments, ref, overview.currency, overview.name, b.mode) : []),
      ...(waste ? runWasteRules(waste, ref, overview.currency, overview.name) : []),
    ])
    const { analysis, model, usage } = await analyzeCpa(buildPayload(overview, b.mode, alerts, segments, waste, sims), b.model)
    return NextResponse.json({ analysis, model, usage, alerts })
  } catch (e) {
    console.error('[api/cpa/analyze]', e)
    return NextResponse.json({ error: describeOpenAIError(e) }, { status: 502 })
  }
}
