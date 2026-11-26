// GET /api/cpa/overview?customerId=&days=&campaignIds=&refresh=1
// CPA Analysis · solo lectura de Google Ads, con caché de 10 min por usuario.
import { NextResponse } from 'next/server'
import { collectOverview } from '@/lib/cpa/collect'
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
    const data = await cached(`${r.userId}:ov:${q.customerId}:${q.days}`, q.refresh === '1', async () => {
      const d = await collectOverview(r.ctx, q.days)
      // Sin campañas no hay análisis: error (y no se guarda en caché)
      if (d.unavailable.includes('Campañas')) throw Object.assign(new Error(`No se pudieron leer las campañas de ${r.ctx.accountName}`), { status: 502 })
      return d
    })
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[api/cpa/overview]', e)
    return NextResponse.json({ error: e?.message ?? 'Error al descargar los datos' }, { status: e?.status ?? 500 })
  }
}
