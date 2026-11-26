// Utilidades de las rutas /api/cpa/*: sesión, acceso a la cuenta y caché corta
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { customerIdSchema } from '@/lib/validators'
import { getUserAdsAccounts } from '@/lib/account-access'
import { requireAdsSession } from '@/lib/audit/route-helpers'
import type { CollectCtx } from './collect'

export const periodSchema = z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90), z.literal(180), z.literal(365)])

export const baseQuerySchema = z.object({
  customerId:  customerIdSchema,
  days:        z.coerce.number().pipe(periodSchema).default(30),
  campaignIds: z.string().optional()
    .transform(s => (s ? s.split(',').filter(x => /^\d+$/.test(x)).slice(0, 300) : undefined)),
  refresh:     z.string().optional(),
})

// Sesión + cuenta permitida para el usuario → contexto de recogida
export async function resolveCtx(customerId: string): Promise<{ userId: string; ctx: CollectCtx } | NextResponse> {
  const auth = await requireAdsSession()
  if (auth instanceof NextResponse) return auth
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) return NextResponse.json({ error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' }, { status: 500 })
  let account
  try {
    account = (await getUserAdsAccounts(auth.userId, auth.accessToken)).find(a => a.id === customerId)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudieron obtener las cuentas' }, { status: 502 })
  }
  if (!account) return NextResponse.json({ error: 'No tienes acceso a esta cuenta de Google Ads' }, { status: 403 })
  return {
    userId: auth.userId,
    ctx: {
      accessToken: auth.accessToken, developerToken, customerId,
      loginCustomerId: account.loginCustomerId, accountName: account.name, currency: account.currency,
    },
  }
}

// Caché en memoria por usuario (10 min). En Vercel vive mientras la instancia siga caliente.
const TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 300
const g = globalThis as unknown as { __cpaCache?: Map<string, { at: number; value: unknown }> }
const cache = (g.__cpaCache ??= new Map())

export async function cached<T>(key: string, force: boolean, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await load()
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(key, { at: Date.now(), value })
  return value
}

export function parseQuery(request: Request) {
  const sp = new URL(request.url).searchParams
  return baseQuerySchema.safeParse(Object.fromEntries(sp.entries()))
}
