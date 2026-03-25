import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ReportsClient } from '@/components/dashboard/ReportsClient'

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <ReportsClient user={session.user as any} />
}
