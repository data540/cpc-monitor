import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

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
  const body   = await request.json()
  const { campaignName, cpcCeiling } = body

  if (!campaignName || typeof cpcCeiling !== 'number') {
    return NextResponse.json({ error: 'campaignName y cpcCeiling son requeridos' }, { status: 400 })
  }

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
  const campaignName = searchParams.get('campaignName') ?? ''

  await prisma.cpcConfig.deleteMany({ where: { userId, campaignName } })
  return NextResponse.json({ ok: true })
}
