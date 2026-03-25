import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CpcAnalysisClient } from '@/components/dashboard/CpcAnalysisClient'

export default async function CpcAnalysisPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <CpcAnalysisClient user={session.user as any} />
}
