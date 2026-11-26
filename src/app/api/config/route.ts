import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cpcConfigSchema, campaignNameSchema } from '@/lib/validators'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const userId = (session.user as any).id
  const configs = await prisma.cpcConfig.findMany({ where: { userId } })
  return NextResponse.json({ configs })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const userId = (session.user as any).id
  const body = await request.json()

  // Validar input
  const result = cpcConfigSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { campaignName, cpcCeiling } = result.data

  const config = await prisma.cpcConfig.upsert({
    where:  { userId_campaignName: { userId, campaignName } },
    update: { cpcCeiling },
    create: { userId, campaignName, cpcCeiling },
  })

  return NextResponse.json({ config })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const userId = (session.user as any).id
  const { searchParams } = new URL(request.url)
  const campaignNameRaw = searchParams.get('campaignName')

  // Validar nombre de campaña
  const result = campaignNameSchema.safeParse(campaignNameRaw)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Nombre de campaña inválido' },
      { status: 400 }
    )
  }

  await prisma.cpcConfig.deleteMany({ where: { userId, campaignName: result.data } })
  return NextResponse.json({ ok: true })
}
