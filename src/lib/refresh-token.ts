// ── Refresco automático del access token de Google ───────────
// NextAuth con database strategy no refresca tokens automáticamente.
// Esta función lo hace cuando el token está caducado.

import { prisma } from './prisma'

async function refreshAccount(account: { id: string; access_token: string | null; refresh_token: string | null; expires_at: number | null }): Promise<string | null> {
  const nowSecs = Math.floor(Date.now() / 1000)

  // Token aún válido
  if (account.access_token && account.expires_at && account.expires_at > nowSecs + 60) {
    return account.access_token
  }

  if (!account.refresh_token) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) return null  // token revocado o inválido → probar siguiente

  const tokens = await res.json()
  const newExpiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600)

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      expires_at:   newExpiresAt,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    },
  })

  return tokens.access_token
}

export async function getValidAccessToken(userId: string): Promise<string> {
  // Intentar primero con el token específico de Google Ads
  const adsAccount = await prisma.account.findFirst({ where: { userId, provider: 'google-ads' } })
  if (adsAccount) {
    const token = await refreshAccount(adsAccount)
    if (token) return token
    // Si falló (token revocado), caer al login general
    console.warn('[refresh-token] google-ads token inválido, intentando con google')
  }

  // Fallback: token del login general con Google
  const googleAccount = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
    orderBy: { expires_at: 'desc' },
  })

  const nowSecs = Math.floor(Date.now() / 1000)
  console.log('[refresh-token] google account:', {
    found: !!googleAccount,
    hasAccessToken: !!googleAccount?.access_token,
    hasRefreshToken: !!googleAccount?.refresh_token,
    expiresAt: googleAccount?.expires_at,
    expiresIn: googleAccount?.expires_at ? googleAccount.expires_at - nowSecs : null,
  })

  if (!googleAccount?.access_token) {
    throw new Error('Token de Google no encontrado. Vuelve a hacer login.')
  }

  const token = await refreshAccount(googleAccount)
  if (!token) {
    throw new Error('Sesión caducada. Vuelve a hacer login.')
  }

  return token
}
