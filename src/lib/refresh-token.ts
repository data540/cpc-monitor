// ── Refresco automático del access token de Google ───────────
// NextAuth con database strategy no refresca tokens automáticamente.
// Esta función lo hace cuando el token está caducado.

import { prisma } from './prisma'

export async function getValidAccessToken(userId: string): Promise<string> {
  // Buscar primero el token específico de Google Ads, luego el de login general
  const account =
    (await prisma.account.findFirst({ where: { userId, provider: 'google-ads' } })) ??
    (await prisma.account.findFirst({ where: { userId, provider: 'google' }, orderBy: { expires_at: 'desc' } }))

  if (!account?.access_token) {
    throw new Error('Token de Google no encontrado. Vuelve a hacer login.')
  }

  // Si el token no ha caducado (con 60s de margen), devolver directamente
  const nowSecs = Math.floor(Date.now() / 1000)
  if (account.expires_at && account.expires_at > nowSecs + 60) {
    return account.access_token
  }

  // Token caducado — usar refresh_token para obtener uno nuevo
  if (!account.refresh_token) {
    throw new Error('Sesión caducada y sin refresh token. Vuelve a hacer login.')
  }

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

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'unknown' }))

    // Si el refresh_token fue revocado o expiró, eliminarlo de la BD para
    // forzar que el usuario vuelva a autorizarse desde cero.
    if (errBody.error === 'invalid_grant') {
      await prisma.account.update({
        where: { id: account.id },
        data: { refresh_token: null, access_token: null, expires_at: null },
      })
      const reauthError = new Error('REAUTH_REQUIRED')
      reauthError.name = 'REAUTH_REQUIRED'
      throw reauthError
    }

    throw new Error(`Error al refrescar token: ${JSON.stringify(errBody)}. Vuelve a hacer login.`)
  }

  const tokens = await res.json()
  const newExpiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600)

  // Guardar el nuevo token en BD
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
