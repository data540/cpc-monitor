// ── OAuth separado para Google Ads API ───────────────────────
// El login principal usa solo scopes básicos (email, profile).
// Este endpoint gestiona el OAuth específico para Google Ads,
// guardando el token de Ads en la tabla Account como proveedor "google-ads".

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'
const REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/auth/google-ads/callback`

// ── GET /api/auth/google-ads → inicia el flujo OAuth para Ads ─
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         GOOGLE_ADS_SCOPE,
    access_type:   'offline',
    prompt:        'consent',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
