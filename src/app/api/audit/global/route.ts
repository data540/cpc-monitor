// POST /api/audit/global  { accounts: [{ name, kpis, analysis }] }
// Visión global (OpenAI) cuando se auditan varias cuentas.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { analyzeGlobal, describeOpenAIError } from '@/lib/audit/analyze'
import { requireAdsSession } from '@/lib/audit/route-helpers'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  accounts: z.array(z.object({
    name:     z.string().max(255),
    kpis:     z.object({ cost: z.number(), roas: z.number().nullable(), cpa: z.number().nullable() }).passthrough(),
    analysis: z.object({
      score:   z.number(),
      summary: z.string(),
      issues:  z.array(z.object({ title: z.string(), severity: z.string() }).passthrough()),
      recommendations: z.array(z.object({ title: z.string(), priority: z.string() }).passthrough()),
    }).passthrough(),
  })).min(2).max(60),
})

export async function POST(request: Request) {
  const auth = await requireAdsSession()
  if (auth instanceof NextResponse) return auth

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  try {
    const global = await analyzeGlobal(parsed.data.accounts as any)
    return NextResponse.json({ global })
  } catch (e) {
    console.error('[api/audit/global]', e)
    return NextResponse.json({ error: describeOpenAIError(e) }, { status: 502 })
  }
}
