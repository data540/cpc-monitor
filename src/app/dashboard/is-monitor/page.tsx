import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ISMonitorClient } from '@/components/dashboard/ISMonitorClient'

export default async function ISMonitorPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <ISMonitorClient user={session.user as any} />
}
