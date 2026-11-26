// ── Cuentas de Google Ads accesibles por cada usuario ─────────
// Cada usuario solo ve las cuentas a las que su propia cuenta de Google
// tiene acceso en Google Ads (directo o a través de una MCC).
// Para cada cuenta se guarda el login-customer-id con el que hay que
// consultarla (la MCC por la que se llega, o la propia cuenta).
// Solo servidor: no importar desde componentes cliente.

import { GoogleAdsAccount } from '@/types'
import { getConfigById } from '@/lib/accounts-data'

const ADS_API_BASE = 'https://googleads.googleapis.com/v23'
const CACHE_TTL_MS = 10 * 60 * 1000
const CONCURRENCY  = 6

export interface AccessibleAccount extends GoogleAdsAccount {
  loginCustomerId: string
}

interface CacheEntry { at: number; accounts: AccessibleAccount[] }

// Caché en memoria por usuario (se pierde en cada cold start, es aceptable)
const g = globalThis as unknown as { __adsAccessCache?: Map<string, CacheEntry> }
const cache = (g.__adsAccessCache ??= new Map())

function headers(accessToken: string, developerToken: string, loginCustomerId?: string) {
  return {
    'Authorization':   `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type':    'application/json',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  }
}

async function listAccessibleRoots(accessToken: string, developerToken: string): Promise<string[]> {
  const res = await fetch(`${ADS_API_BASE}/customers:listAccessibleCustomers`, {
    headers: headers(accessToken, developerToken),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Ads listAccessibleCustomers ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  return (data.resourceNames ?? []).map((rn: string) => rn.replace('customers/', ''))
}

interface ClientRow { id: string; name: string; currency: string; manager: boolean; level: number }

// Jerarquía completa bajo una cuenta raíz (si es cuenta normal, devuelve solo ella)
async function getHierarchy(rootId: string, accessToken: string, developerToken: string): Promise<ClientRow[]> {
  const query = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.manager,
      customer_client.level
    FROM customer_client
    WHERE customer_client.status = 'ENABLED'
  `
  const res = await fetch(`${ADS_API_BASE}/customers/${rootId}/googleAds:search`, {
    method:  'POST',
    headers: headers(accessToken, developerToken, rootId),
    body:    JSON.stringify({ query }),
    cache:   'no-store',
  })
  if (!res.ok) return [] // cuenta cancelada/suspendida o sin permiso: se ignora
  const data = await res.json()
  return (data.results ?? []).map((r: any) => ({
    id:       String(r.customerClient?.id ?? ''),
    name:     String(r.customerClient?.descriptiveName ?? r.customerClient?.id ?? ''),
    currency: String(r.customerClient?.currencyCode ?? 'EUR'),
    manager:  !!r.customerClient?.manager,
    level:    Number(r.customerClient?.level ?? 0),
  })).filter((r: ClientRow) => r.id)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

async function discover(accessToken: string, developerToken: string): Promise<AccessibleAccount[]> {
  const roots = await listAccessibleRoots(accessToken, developerToken)
  const hierarchies = await mapLimit(roots, CONCURRENCY, root =>
    getHierarchy(root, accessToken, developerToken).then(rows => ({ root, rows })))

  const preferredMcc = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID?.replace(/-/g, '')
  const byId = new Map<string, AccessibleAccount & { rank: number }>()

  for (const { root, rows } of hierarchies) {
    const rootIsManager = rows.some(r => r.id === root && r.manager)
    // Preferencia del login-customer-id: MCC configurada > otra MCC > la propia cuenta.
    // (Las estrategias de cartera de una MCC solo se leen entrando por esa MCC.)
    const rank = root === preferredMcc ? 0 : rootIsManager ? 1 : 2
    for (const r of rows) {
      if (r.manager) continue
      const prev = byId.get(r.id)
      if (prev && prev.rank <= rank) continue
      const cfg = getConfigById(r.id)
      byId.set(r.id, {
        id:              r.id,
        name:            r.name,
        currency:        r.currency,
        country:         cfg?.country,
        region:          cfg?.region,
        loginCustomerId: root,
        rank,
      })
    }
  }

  return [...byId.values()]
    .map(({ rank, ...a }) => a)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
}

export async function getUserAdsAccounts(
  userId: string,
  accessToken: string,
  opts: { force?: boolean } = {},
): Promise<AccessibleAccount[]> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) throw new Error('Missing GOOGLE_ADS_DEVELOPER_TOKEN')

  const hit = cache.get(userId)
  const age = hit ? Date.now() - hit.at : Infinity
  // force respeta un mínimo de 60 s para no martillear la API
  if (hit && (age < (opts.force ? 60_000 : CACHE_TTL_MS))) return hit.accounts

  const accounts = await discover(accessToken, developerToken)
  cache.set(userId, { at: Date.now(), accounts })
  return accounts
}

export class AccountAccessError extends Error {
  constructor() {
    super('No tienes acceso a esta cuenta de Google Ads')
    this.name = 'ACCOUNT_FORBIDDEN'
  }
}

// Devuelve el login-customer-id para consultar la cuenta, o lanza
// AccountAccessError si el usuario no tiene acceso a ella.
export async function resolveLoginCustomerId(
  userId: string,
  accessToken: string,
  customerId: string,
): Promise<string> {
  const id = customerId.replace(/-/g, '')
  let accounts = await getUserAdsAccounts(userId, accessToken)
  let match = accounts.find(a => a.id === id)
  if (!match) {
    // Puede ser un acceso concedido hace poco: reintentar sin caché
    accounts = await getUserAdsAccounts(userId, accessToken, { force: true })
    match = accounts.find(a => a.id === id)
  }
  if (!match) throw new AccountAccessError()
  return match.loginCustomerId
}
