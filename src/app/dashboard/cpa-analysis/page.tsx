import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CpaAnalysisClient } from '@/components/dashboard/CpaAnalysisClient'

export default async function CpaAnalysisPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <CpaAnalysisClient />
}
