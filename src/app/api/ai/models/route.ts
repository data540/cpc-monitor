// GET /api/ai/models  → modelos disponibles (última versión de cada familia en OpenRouter)
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DEFAULT_FAMILY, getModelOptions } from '@/lib/ai/models'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const force = new URL(request.url).searchParams.get('refresh') === '1'
  const models = await getModelOptions(force)
  return NextResponse.json({ models, defaultFamily: DEFAULT_FAMILY })
}
