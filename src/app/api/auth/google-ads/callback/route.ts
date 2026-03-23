// ── Callback OAuth de Google Ads ─────────────────────────────
// Google redirige aquí tras autorizar el scope de adwords.
// Intercambia el code por tokens y los guarda en BD.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/auth/google-ads/callback`

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/login`)
  }

  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?ads_error=${error ?? 'no_code'}`
    )
  }

  // Intercambiar code por tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('[google-ads/callback] Error intercambiando code:', err)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?ads_error=token_exchange`
    )
  }

  const tokens = await tokenRes.json()
  const userId = (session.user as any).id
  const expiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600)

  // Guardar/actualizar token de Google Ads en BD
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider:          'google-ads',
        providerAccountId: userId,
      },
    },
    update: {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      expires_at:    expiresAt,
      scope:         tokens.scope,
    },
    create: {
      userId,
      type:              'oauth',
      provider:          'google-ads',
      providerAccountId: userId,
      access_token:      tokens.access_token,
      refresh_token:     tokens.refresh_token,
      expires_at:        expiresAt,
      token_type:        tokens.token_type,
      scope:             tokens.scope,
    },
  })

  return NextResponse.redirect(
    `${process.env.NEXTAUTH_URL}/dashboard?ads_connected=1`
  )
}
