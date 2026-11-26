// GET /api/cpa/waste?customerId=&days=&campaignIds=&refresh=1
// CPA Analysis · solo lectura de Google Ads, con caché de 10 min por usuario.
import { NextResponse } from 'next/server'
import { collectWaste } from '@/lib/cpa/collect'
import { cached, parseQuery, resolveCtx } from '@/lib/cpa/route-helpers'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120 // periodos largos (hasta 365 días)

export async function GET(request: Request) {
  const parsed = parseQuery(request)
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  const q = parsed.data
  const r = await resolveCtx(q.customerId)
  if (r instanceof NextResponse) return r
  try {
    const data = await cached(`${r.userId}:waste:${q.customerId}:${q.days}:${q.campaignIds?.join(",") ?? ""}`, q.refresh === '1', () => collectWaste(r.ctx, q.days, q.campaignIds))
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[api/cpa/waste]', e)
    return NextResponse.json({ error: e?.message ?? 'Error al descargar los datos' }, { status: 500 })
  }
}
