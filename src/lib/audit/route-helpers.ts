// Utilidades comunes de las rutas /api/audit/*
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getValidAccessToken } from '@/lib/refresh-token'

export type AuthOk = { userId: string; accessToken: string }

// Sesión + token de Google válidos, o la respuesta de error lista para devolver
export async function requireAdsSession(): Promise<AuthOk | NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = (session.user as any).id as string
  try {
    return { userId, accessToken: await getValidAccessToken(userId) }
  } catch (e: any) {
    if (e?.name === 'REAUTH_REQUIRED') {
      return NextResponse.json({ error: 'Sesión de Google expirada. Vuelve a iniciar sesión.', reauth: true }, { status: 401 })
    }
    return NextResponse.json({ error: e?.message ?? 'Error de autenticación' }, { status: 401 })
  }
}
